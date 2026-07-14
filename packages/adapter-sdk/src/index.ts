import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import mqtt, { type IClientOptions, type MqttClient } from 'mqtt';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Registry,
} from 'prom-client';

type ShutdownHandler = () => void | Promise<void>;

export type AdapterRuntime = {
  name: string;
  mqtt: MqttClient;
  setReady: (ready?: boolean) => void;
  publishState: (topic: string, payload: unknown) => Promise<void>;
  publishEvent: (topic: string, payload: unknown) => Promise<void>;
  markError: () => void;
  onShutdown: (handler: ShutdownHandler) => void;
  shutdown: () => Promise<void>;
};

export type AdapterConnectOptions = {
  mqttUrl?: string;
  clientId?: string;
  healthPort?: number;
  mqttOptions?: IClientOptions;
  initiallyReady?: boolean;
};

const DEFAULT_HEALTH_PORT = 9100;

const toEnvName = (name: string): string =>
  name.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();

export const loadSecret = (name: string, envName = toEnvName(name)): string => {
  try {
    return readFileSync(`/run/secrets/${name}`, 'utf8').trim();
  } catch {
    const value = process.env[envName];
    if (!value) {
      throw new Error(`No secret ${name}: provide /run/secrets/${name} or ${envName}`);
    }
    return value;
  }
};

export const connect = async (
  name: string,
  options: AdapterConnectOptions = {},
): Promise<AdapterRuntime> => {
  const mqttUrl = options.mqttUrl ?? process.env['MQTT_URL'] ?? 'mqtt://mosquitto:1883';
  const clientId = options.clientId ?? `helios-adapter-${name}-${process.pid}`;
  const healthPort = options.healthPort ?? Number(process.env['ADAPTER_HEALTH_PORT'] ?? DEFAULT_HEALTH_PORT);

  const registry = new Registry();
  collectDefaultMetrics({ prefix: `${name.replace(/-/g, '_')}_`, register: registry });

  const brokerConnected = new Gauge({
    name: 'helios_adapter_broker_connected',
    help: 'Whether the adapter is currently connected to MQTT',
    labelNames: ['adapter'],
    registers: [registry],
  });
  const lastPublish = new Gauge({
    name: 'helios_adapter_last_publish_timestamp_ms',
    help: 'Unix timestamp in milliseconds of the last successful MQTT publish',
    labelNames: ['adapter'],
    registers: [registry],
  });
  const errors = new Counter({
    name: 'helios_adapter_errors_total',
    help: 'Total adapter errors recorded by the adapter runtime',
    labelNames: ['adapter'],
    registers: [registry],
  });

  brokerConnected.set({ adapter: name }, 0);
  lastPublish.set({ adapter: name }, 0);

  console.log(`[${name}] connecting to MQTT at ${mqttUrl}`);
  const mqttClient = await mqtt.connectAsync(mqttUrl, {
    clientId,
    clean: true,
    reconnectPeriod: 5000,
    ...options.mqttOptions,
  });
  console.log(`[${name}] MQTT connected`);

  brokerConnected.set({ adapter: name }, mqttClient.connected ? 1 : 0);
  mqttClient.on('connect', () => brokerConnected.set({ adapter: name }, 1));
  mqttClient.on('reconnect', () => brokerConnected.set({ adapter: name }, 0));
  mqttClient.on('close', () => brokerConnected.set({ adapter: name }, 0));
  mqttClient.on('offline', () => brokerConnected.set({ adapter: name }, 0));
  mqttClient.on('error', (err) => {
    errors.inc({ adapter: name });
    console.error(`[${name}] MQTT error:`, err);
  });

  let ready = options.initiallyReady ?? true;
  const adapterReady = new Gauge({
    name: 'helios_adapter_ready',
    help: 'Whether the adapter has completed its vendor-specific startup work',
    labelNames: ['adapter'],
    registers: [registry],
  });
  adapterReady.set({ adapter: name }, ready ? 1 : 0);

  const server = createHealthServer(name, registry, () => mqttClient.connected, () => ready);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(healthPort, '0.0.0.0', () => {
      server.off('error', reject);
      console.log(`[${name}] health server listening on :${healthPort}`);
      resolve();
    });
  });

  const shutdownHandlers: ShutdownHandler[] = [];
  let stopping = false;

  const publish = async (topic: string, payload: unknown, retain: boolean): Promise<void> => {
    await mqttClient.publishAsync(topic, JSON.stringify(payload), { retain, qos: 1 });
    lastPublish.set({ adapter: name }, Date.now());
  };

  const runtime: AdapterRuntime = {
    name,
    setReady: (nextReady = true) => {
      ready = nextReady;
      adapterReady.set({ adapter: name }, ready ? 1 : 0);
    },
    mqtt: mqttClient,
    publishState: (topic, payload) => publish(topic, payload, true),
    publishEvent: (topic, payload) => publish(topic, payload, false),
    markError: () => errors.inc({ adapter: name }),
    onShutdown: (handler) => {
      shutdownHandlers.push(handler);
    },
    shutdown: async () => {
      if (stopping) return;
      stopping = true;
      console.log(`[${name}] shutting down`);
      for (const handler of shutdownHandlers) {
        await handler();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await mqttClient.endAsync();
    },
  };

  const signalShutdown = (signal: NodeJS.Signals): void => {
    runtime.shutdown()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error(`[${name}] shutdown error after ${signal}:`, err);
        process.exit(1);
      });
  };
  process.once('SIGTERM', signalShutdown);
  process.once('SIGINT', signalShutdown);

  return runtime;
};

export type AdapterHealth = {
  status: 'ok' | 'starting' | 'degraded';
  adapter: string;
  mqtt: 'ok' | 'down';
  ready: boolean;
};

export const adapterHealth = (name: string, mqttConnected: boolean, ready: boolean): AdapterHealth => ({
  status: mqttConnected && ready ? 'ok' : (mqttConnected ? 'starting' : 'degraded'),
  adapter: name,
  mqtt: mqttConnected ? 'ok' : 'down',
  ready,
});

const createHealthServer = (
  name: string,
  registry: Registry,
  isBrokerConnected: () => boolean,
  isReady: () => boolean,
): Server =>
  createServer((req, res) => {
    if (req.url === '/health') {
      const health = adapterHealth(name, isBrokerConnected(), isReady());
      res.writeHead(health.status === 'ok' ? 200 : 503, { 'content-type': 'application/json' });
      res.end(JSON.stringify(health));
      return;
    }

    if (req.url === '/metrics') {
      registry.metrics()
        .then((metrics) => {
          res.writeHead(200, { 'content-type': registry.contentType });
          res.end(metrics);
        })
        .catch((err: unknown) => {
          console.error(`[${name}] metrics error:`, err);
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'metrics unavailable' }));
        });
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
