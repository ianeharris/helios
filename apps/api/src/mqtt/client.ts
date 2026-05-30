import mqtt from 'mqtt';
import { mqttSet } from './cache.js';

// Topics the API subscribes to for caching retained state
const RETAINED_TOPICS = [
  'helios/energy/tariff/state',
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
  client.on('message', (topic, payload) => mqttSet(topic, payload));
};

export const getMqtt = (): mqtt.MqttClient => {
  if (!client) throw new Error('MQTT not connected');
  return client;
};
