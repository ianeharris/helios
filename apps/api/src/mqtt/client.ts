import mqtt from 'mqtt';
import { mqttSet } from './cache.js';
import { insertEnergyReading } from '../db/energy.js';
import type { FoxEssLive } from '@helios/shared';

// Topics the API subscribes to for caching retained state
const RETAINED_TOPICS = [
  'helios/energy/tariff/state',
  'helios/energy/octopus/dispatch_schedule',
  'helios/energy/octopus/saving_session',
  'helios/energy/foxess/live',
];

let client: mqtt.MqttClient | null = null;

export const connectMqtt = async (): Promise<void> => {
  const url = process.env['MQTT_URL'] ?? 'mqtt://localhost:1883';
  client = await mqtt.connectAsync(url, {
    clientId: `helios-api-${process.pid}`,
    clean: true,
    reconnectPeriod: 5000,
  });
  client.on('error', (err) => console.error('[mqtt]', err));

  await client.subscribeAsync(RETAINED_TOPICS);
  client.on('message', (topic, payload) => {
    mqttSet(topic, payload);
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
