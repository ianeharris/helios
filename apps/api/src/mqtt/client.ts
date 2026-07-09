import mqtt from 'mqtt';
import { mqttSet } from './cache.js';
import { insertEnergyReading } from '../db/energy.js';
import type { FoxEssLive } from '@helios/shared';

export type MqttEvent = {
  topic: string;
  payload: unknown;
  receivedAt: string;
};

type MqttEventHandler = (event: MqttEvent) => void;

let client: mqtt.MqttClient | null = null;
const listeners = new Set<MqttEventHandler>();

export const connectMqtt = async (): Promise<void> => {
  const url = process.env['MQTT_URL'] ?? 'mqtt://localhost:1883';
  client = await mqtt.connectAsync(url, {
    clientId: `helios-api-${process.pid}`,
    clean: true,
    reconnectPeriod: 5000,
  });
  client.on('error', (err) => console.error('[mqtt]', err));

  await client.subscribeAsync('helios/#');
  client.on('message', (topic, payload) => {
    mqttSet(topic, payload);
    const event = toEvent(topic, payload);
    for (const listener of listeners) listener(event);

    if (topic === 'helios/energy/foxess/live') {
      try {
        const live = JSON.parse(payload.toString()) as FoxEssLive;
        insertEnergyReading(live).catch((err) => console.error('[mqtt] energy insert error:', err));
      } catch {
        // malformed payload — skip
      }
    }
  });
};

export const getMqtt = (): mqtt.MqttClient => {
  if (!client) throw new Error('MQTT not connected');
  return client;
};

export const publishMqtt = async (topic: string, payload: unknown, retain = false): Promise<void> => {
  await getMqtt().publishAsync(topic, JSON.stringify(payload), { qos: 1, retain });
};

export const subscribeMqttEvents = (handler: MqttEventHandler): (() => void) => {
  listeners.add(handler);
  return () => listeners.delete(handler);
};

const toEvent = (topic: string, payload: Buffer): MqttEvent => ({
  topic,
  payload: parsePayload(payload),
  receivedAt: new Date().toISOString(),
});

const parsePayload = (payload: Buffer): unknown => {
  try {
    return JSON.parse(payload.toString());
  } catch {
    return payload.toString();
  }
};
