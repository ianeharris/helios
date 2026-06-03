/**
 * Helios Octopus Energy adapter.
 *
 * Topics published:
 *   helios/energy/tariff/state                (retained) TariffState — current rate, upcoming slots
 *   helios/energy/octopus/tariff_transition   (event)    TariffTransitionEvent — on every rate change
 *   helios/energy/octopus/dispatch_schedule   (retained) DispatchScheduleMessage — tonight's Intelligent slots
 *   helios/energy/octopus/saving_session      (retained) SavingSessionMessage — announced/active sessions
 *   helios/energy/octopus/consumption/import  (retained) ConsumptionBatch — yesterday's import half-hours
 *   helios/energy/octopus/consumption/export  (retained) ConsumptionBatch — yesterday's export half-hours
 *
 * Schedule:
 *   Every 30 min  — tariff state + transition detection
 *   02:00 daily   — yesterday's smart meter consumption
 *   05:00 daily   — live rate refresh from API
 *   09:00 daily   — saving sessions check
 *   20:00 daily   — Intelligent dispatch schedule for tonight
 */

import mqtt from 'mqtt';
import { loadConfig, type Config } from './config.js';
import { fetchRates, fetchConsumption } from './api.js';
import { obtainKrakenToken, fetchDeviceIds, fetchDispatchSchedule, fetchSavingSessions } from './kraken.js';
import { buildState, detectTransition } from './tariff.js';
import type { TariffState, DispatchSlot, ConsumptionBatch } from './types.js';

const TOPIC_TARIFF_STATE = 'helios/energy/tariff/state';
const TOPIC_TARIFF_TRANSITION = 'helios/energy/octopus/tariff_transition';
const TOPIC_DISPATCH_SCHEDULE = 'helios/energy/octopus/dispatch_schedule';
const TOPIC_SAVING_SESSION = 'helios/energy/octopus/saving_session';
const TOPIC_CONSUMPTION_IMPORT = 'helios/energy/octopus/consumption/import';
const TOPIC_CONSUMPTION_EXPORT = 'helios/energy/octopus/consumption/export';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function isCurrentlyDispatched(slots: DispatchSlot[]): boolean {
  const now = new Date().toISOString();
  return slots.some((s) => s.start_utc <= now && s.end_utc > now);
}

const run = async (): Promise<void> => {
  const config = await loadConfig();

  console.log(`[octopus] connecting to MQTT at ${config.mqttUrl}`);
  const mqttClient = await mqtt.connectAsync(config.mqttUrl, {
    clientId: `helios-adapter-octopus-${process.pid}`,
    clean: true,
    reconnectPeriod: 5000,
  });
  mqttClient.on('error', (err) => console.error('[octopus] MQTT error:', err));
  console.log('[octopus] MQTT connected');

  // ── Kraken token (non-fatal — degrades gracefully without Intelligent data) ──

  let krakenToken: string | null = null;
  let krakenDeviceIds: string[] = [];
  try {
    krakenToken = await obtainKrakenToken(config.apiKey);
    console.log('[octopus] Kraken token obtained');
    krakenDeviceIds = await fetchDeviceIds(krakenToken, config.accountNumber);
    console.log(`[octopus] ${krakenDeviceIds.length} Kraken device(s): ${krakenDeviceIds.join(', ')}`);
  } catch (err) {
    console.error('[octopus] Kraken token failed — dispatch schedule and saving sessions unavailable:', err);
  }

  // ── State ─────────────────────────────────────────────────────────────────────

  let prevState: TariffState | null = null;
  let currentDispatch: DispatchSlot[] = [];
  let exportRatePence = 0;

  // Daily task tracking: store the date string for each task last run
  const dailyRan: Record<string, string | null> = {
    rateRefresh: null,
    consumption: null,
    savingSessions: null,
    dispatch: null,
  };

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const publish = async (topic: string, payload: unknown, retain: boolean): Promise<void> => {
    await mqttClient.publishAsync(topic, JSON.stringify(payload), { retain, qos: 1 });
  };

  const refreshExportRate = async (cfg: Config): Promise<void> => {
    const rates = await fetchRates(cfg.exportProduct, cfg.exportTariff, 1);
    exportRatePence = rates[0]?.value_inc_vat ?? exportRatePence;
    console.log(`[octopus] export rate refreshed: ${exportRatePence}p/kWh`);
  };

  // ── Initial export rate ───────────────────────────────────────────────────────

  try {
    await refreshExportRate(config);
  } catch (err) {
    console.error('[octopus] initial export rate fetch failed:', err);
  }

  // ── Tariff poll ───────────────────────────────────────────────────────────────

  const pollTariff = async (): Promise<void> => {
    try {
      const importRates = await fetchRates(config.importProduct, config.importTariff);
      const state = buildState(importRates, exportRatePence);

      const transition = detectTransition(prevState, state);
      if (transition) {
        const event = { ...transition, dispatched: isCurrentlyDispatched(currentDispatch) };
        await publish(TOPIC_TARIFF_TRANSITION, event, false);
        console.log(`[octopus] transition: ${event.from_rate} → ${event.to_rate} dispatched=${event.dispatched}`);
      }

      await publish(TOPIC_TARIFF_STATE, state, true);
      prevState = state;
      console.log(
        `[octopus] tariff: ${state.currentType} @ ${state.currentRatePenceIncVat}p` +
        (state.validTo ? ` until ${new Date(state.validTo).toLocaleTimeString('en-GB')}` : '') +
        ` | ${state.slots.length} upcoming slots`,
      );
    } catch (err) {
      console.error('[octopus] tariff poll error:', err);
    }
  };

  // ── Daily: dispatch schedule (20:00) ──────────────────────────────────────────

  const runDispatchFetch = async (): Promise<void> => {
    if (!krakenToken || krakenDeviceIds.length === 0) return;
    try {
      const allSlots: DispatchSlot[] = [];
      for (const deviceId of krakenDeviceIds) {
        const slots = await fetchDispatchSchedule(krakenToken, deviceId);
        allSlots.push(...slots);
      }
      allSlots.sort((a, b) => a.start_utc.localeCompare(b.start_utc));
      currentDispatch = allSlots;
      await publish(TOPIC_DISPATCH_SCHEDULE, {
        account: config.accountNumber,
        fetched_at: new Date().toISOString(),
        slots: allSlots,
      }, true);
      console.log(`[octopus] dispatch schedule: ${allSlots.length} planned slots`);
    } catch (err) {
      console.error('[octopus] dispatch schedule error:', err);
      try {
        krakenToken = await obtainKrakenToken(config.apiKey);
        krakenDeviceIds = await fetchDeviceIds(krakenToken, config.accountNumber);
        console.log('[octopus] Kraken token refreshed after error');
      } catch { /* will retry at next scheduled run */ }
    }
  };

  // ── Daily: saving sessions (09:00) ───────────────────────────────────────────

  const runSavingSessions = async (): Promise<void> => {
    if (!krakenToken) return;
    try {
      const { events } = await fetchSavingSessions(krakenToken, config.accountNumber, config.importMpan);
      const now = new Date().toISOString();
      const active = events.filter((e) => e.start_at <= now && e.end_at > now);
      await publish(TOPIC_SAVING_SESSION, { active: active.length > 0, events, fetched_at: now }, true);
      console.log(`[octopus] saving sessions: ${events.length} events, ${active.length} active`);
    } catch (err) {
      console.error('[octopus] saving sessions error:', err);
      try {
        krakenToken = await obtainKrakenToken(config.apiKey);
        krakenDeviceIds = await fetchDeviceIds(krakenToken, config.accountNumber);
        console.log('[octopus] Kraken token refreshed after error');
      } catch { /* will retry at next scheduled run */ }
    }
  };

  // ── Daily: smart meter consumption (02:00) ────────────────────────────────────

  const runConsumption = async (): Promise<void> => {
    const date = yesterdayStr();
    const from = `${date}T00:00:00Z`;
    const to = `${date}T23:59:59Z`;

    const fetchAndPublish = async (
      mpan: string,
      serial: string,
      type: 'import' | 'export',
      topic: string,
    ): Promise<void> => {
      const intervals = await fetchConsumption(config.apiKey, mpan, serial, from, to);
      const batch: ConsumptionBatch = {
        mpan,
        type,
        date,
        fetched_at: new Date().toISOString(),
        intervals,
      };
      await publish(topic, batch, true);
      console.log(`[octopus] consumption ${type} ${date}: ${intervals.length} intervals`);
    };

    if (config.importMeterSerial) {
      try {
        await fetchAndPublish(config.importMpan, config.importMeterSerial, 'import', TOPIC_CONSUMPTION_IMPORT);
      } catch (err) {
        console.error('[octopus] import consumption error:', err);
      }
    }

    if (config.exportMeterSerial) {
      try {
        await fetchAndPublish(config.exportMpan, config.exportMeterSerial, 'export', TOPIC_CONSUMPTION_EXPORT);
      } catch (err) {
        console.error('[octopus] export consumption error:', err);
      }
    }
  };

  // ── Daily: live rate refresh (05:00) ─────────────────────────────────────────

  const runRateRefresh = async (): Promise<void> => {
    try {
      await refreshExportRate(config);
    } catch (err) {
      console.error('[octopus] rate refresh error:', err);
    }
  };

  // ── Scheduler ─────────────────────────────────────────────────────────────────

  const runDailyTasks = async (): Promise<void> => {
    const hour = new Date().getHours();
    const today = todayStr();

    if (hour === 2 && dailyRan['consumption'] !== today) {
      dailyRan['consumption'] = today;
      await runConsumption();
    }
    if (hour === 5 && dailyRan['rateRefresh'] !== today) {
      dailyRan['rateRefresh'] = today;
      await runRateRefresh();
    }
    if (hour === 9 && dailyRan['savingSessions'] !== today) {
      dailyRan['savingSessions'] = today;
      await runSavingSessions();
    }
    if (hour === 20 && dailyRan['dispatch'] !== today) {
      dailyRan['dispatch'] = today;
      await runDispatchFetch();
    }
  };

  // ── Startup ───────────────────────────────────────────────────────────────────

  await pollTariff();
  await runDispatchFetch();
  await runSavingSessions();

  const pollTimer = setInterval(() => void pollTariff(), config.pollIntervalMs);
  const dailyTimer = setInterval(() => void runDailyTasks(), 60_000);

  const shutdown = (): void => {
    console.log('[octopus] shutting down');
    clearInterval(pollTimer);
    clearInterval(dailyTimer);
    void mqttClient.endAsync();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

run().catch((err) => {
  console.error('[octopus] fatal:', err);
  process.exit(1);
});
