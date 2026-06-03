/**
 * Helios Fox ESS adapter.
 *
 * Topics published:
 *   helios/energy/foxess/live  (retained)  FoxEssLive — current PV, battery, grid readings
 *
 * Schedule:
 *   Every 5 min — real-time data poll (stays within 10 req/min API rate limit)
 */

import { readFileSync } from 'node:fs';
import mqtt from 'mqtt';
import { fetchDeviceSN, fetchRealTime } from './api.js';
import type { FoxEssLive } from '@helios/shared';

const TOPIC_LIVE = 'helios/energy/foxess/live';
const POLL_INTERVAL_MS = 5 * 60 * 1000;

function loadApiKey(): string {
  try {
    return readFileSync('/run/secrets/foxess_api_key', 'utf8').trim();
  } catch {
    const key = process.env['FOXESS_API_KEY'];
    if (!key) throw new Error('No Fox ESS API key: provide /run/secrets/foxess_api_key or FOXESS_API_KEY env var');
    return key;
  }
}

const run = async (): Promise<void> => {
  const apiKey = loadApiKey();
  const mqttUrl = process.env['MQTT_URL'] ?? 'mqtt://mosquitto:1883';

  console.log('[foxess] connecting to MQTT');
  const mqttClient = await mqtt.connectAsync(mqttUrl, {
    clientId: `helios-adapter-foxess-${process.pid}`,
    clean: true,
    reconnectPeriod: 5000,
  });
  mqttClient.on('error', (err) => console.error('[foxess] MQTT error:', err));
  console.log('[foxess] MQTT connected');

  let deviceSN: string | null = null;
  try {
    deviceSN = await fetchDeviceSN(apiKey);
    console.log(`[foxess] device SN: ${deviceSN}`);
  } catch (err) {
    console.error('[foxess] initial device SN fetch failed — will retry on first poll:', err);
  }

  const poll = async (): Promise<void> => {
    if (!deviceSN) {
      try {
        deviceSN = await fetchDeviceSN(apiKey);
        console.log(`[foxess] device SN resolved: ${deviceSN}`);
      } catch (err) {
        console.error('[foxess] device SN retry failed:', err);
        return;
      }
    }

    try {
      const data = await fetchRealTime(apiKey, deviceSN);
      const live: FoxEssLive = {
        deviceSN,
        pvPower: data.pvPower,
        batSoc: data.batSoc,
        batPower: data.batPower,
        // positive = importing, negative = exporting
        gridPower: data.gridConsumptionPower - data.feedinPower,
        loadsPower: data.loadsPower,
        updatedAt: new Date().toISOString(),
      };
      await mqttClient.publishAsync(TOPIC_LIVE, JSON.stringify(live), { retain: true, qos: 1 });
      console.log(
        `[foxess] pv=${live.pvPower.toFixed(2)}kW bat=${live.batSoc.toFixed(0)}% ` +
        `grid=${live.gridPower.toFixed(2)}kW load=${live.loadsPower.toFixed(2)}kW`,
      );
    } catch (err) {
      console.error('[foxess] poll error:', err);
    }
  };

  await poll();
  const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);

  const shutdown = (): void => {
    console.log('[foxess] shutting down');
    clearInterval(timer);
    void mqttClient.endAsync();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

run().catch((err) => {
  console.error('[foxess] fatal:', err);
  process.exit(1);
});
