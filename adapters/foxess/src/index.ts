/**
 * Helios Fox ESS adapter.
 *
 * Topics published:
 *   helios/energy/foxess/live  (retained)  FoxEssLive — current PV, battery, grid readings
 *
 * Schedule:
 *   Every 1 min — real-time data poll (stays within Fox ESS daily API limit)
 */

import { connect, loadSecret } from '@helios/adapter-sdk';
import { fetchDeviceSN, fetchRealTime } from './api.js';
import type { FoxEssLive } from '@helios/shared';

const TOPIC_LIVE = 'helios/energy/foxess/live';
const POLL_INTERVAL_MS = 60 * 1000;

const run = async (): Promise<void> => {
  const apiKey = loadSecret('foxess_api_key', 'FOXESS_API_KEY');
  const runtime = await connect('foxess');

  let deviceSN: string | null = null;
  try {
    deviceSN = await fetchDeviceSN(apiKey);
    console.log(`[foxess] device SN: ${deviceSN}`);
  } catch (err) {
    runtime.markError();
    console.error('[foxess] initial device SN fetch failed — will retry on first poll:', err);
  }

  const poll = async (): Promise<void> => {
    if (!deviceSN) {
      try {
        deviceSN = await fetchDeviceSN(apiKey);
        console.log(`[foxess] device SN resolved: ${deviceSN}`);
      } catch (err) {
        runtime.markError();
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
      await runtime.publishState(TOPIC_LIVE, live);
      console.log(
        `[foxess] pv=${live.pvPower.toFixed(2)}kW bat=${live.batSoc.toFixed(0)}% ` +
        `grid=${live.gridPower.toFixed(2)}kW load=${live.loadsPower.toFixed(2)}kW`,
      );
    } catch (err) {
      runtime.markError();
      console.error('[foxess] poll error:', err);
    }
  };

  await poll();
  const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
  runtime.onShutdown(() => clearInterval(timer));
};

run().catch((err) => {
  console.error('[foxess] fatal:', err);
  process.exit(1);
});
