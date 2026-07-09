import mqtt from 'mqtt';
import { mqttGet, mqttSet } from './cache.js';
import { insertEnergyReading } from '../db/energy.js';
import { insertEvent } from '../db/events.js';
import { upsertDiscovery } from '../db/registry.js';
import type { AdapterDiscoveryMessage, FoxEssLive } from '@helios/shared';

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
    const previous = mqttGet<unknown>(topic);
    const event = toEvent(topic, payload);
    mqttSet(topic, payload);

    for (const listener of listeners) listener(event);

    if (isDiscoveryTopic(topic)) {
      upsertDiscovery(event.payload as AdapterDiscoveryMessage)
        .catch((err) => console.error('[mqtt] registry upsert error:', err));
      return;
    }

    if (topic === 'helios/energy/foxess/live') {
      try {
        const live = event.payload as FoxEssLive;
        insertEnergyReading(live).catch((err) => console.error('[mqtt] energy insert error:', err));
      } catch {
        // malformed payload — skip
      }
    }

    if (previous !== null && hasChanged(previous, event.payload)) {
      const eventInput = eventForTopic(topic, event.payload);
      if (eventInput) {
        insertEvent(eventInput).catch((err) => console.error('[mqtt] event insert error:', err));
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

const isDiscoveryTopic = (topic: string): boolean =>
  /^helios\/registry\/.+\/discovery$/.test(topic);

const hasChanged = (previous: unknown, next: unknown): boolean =>
  JSON.stringify(previous) !== JSON.stringify(next);

type EventInput = Parameters<typeof insertEvent>[0];

const eventForTopic = (topic: string, payload: unknown): EventInput | null => {
  const hueMatch = /^helios\/hue\/([^/]+)\/(light|room)\/([^/]+)$/.exec(topic);
  if (hueMatch) {
    return {
      vendor: 'hue',
      kind: 'device_state_changed',
      deviceId: `hue/${hueMatch[1]}/${hueMatch[2]}/${hueMatch[3]}`,
      payload,
    };
  }

  if (topic === 'helios/energy/foxess/live') {
    return {
      vendor: 'foxess',
      kind: 'energy_reading',
      deviceId: 'foxess/live',
      payload,
    };
  }

  return null;
};
