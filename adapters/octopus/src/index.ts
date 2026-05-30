/**
 * Helios Octopus Energy adapter.
 *
 * Polls the public Octopus tariff API and publishes rate data to MQTT.
 * No vendor authentication required for tariff rate data.
 *
 * Topics published (all retained):
 *   helios/energy/tariff/state  — TariffState: current type, rate, next transition, export rate
 *
 * Environment:
 *   MQTT_URL               Internal broker (default: mqtt://mosquitto:1883)
 *   OCTOPUS_IMPORT_PRODUCT Octopus product code for import tariff
 *   OCTOPUS_IMPORT_TARIFF  Octopus tariff code for import
 *   OCTOPUS_EXPORT_PRODUCT Octopus product code for export tariff
 *   OCTOPUS_EXPORT_TARIFF  Octopus tariff code for export
 *   OCTOPUS_POLL_INTERVAL  Poll interval in ms (default: 1800000 = 30 min)
 *   OCTOPUS_CHEAP_THRESHOLD_PENCE  Rate below which a slot is "cheap" (default: 15)
 */

import mqtt from 'mqtt';
import { fetchImportRates, fetchExportRate } from './api.js';
import type { TariffSlot, TariffState, OctopusRateResult } from './types.js';

// ── Config ────────────────────────────────────────────────────────────────────

const MQTT_URL = process.env['MQTT_URL'] ?? 'mqtt://mosquitto:1883';
const IMPORT_PRODUCT = process.env['OCTOPUS_IMPORT_PRODUCT'] ?? 'INTELLI-VAR-24-10-29';
const IMPORT_TARIFF = process.env['OCTOPUS_IMPORT_TARIFF'] ?? 'E-1R-INTELLI-VAR-24-10-29-A';
const EXPORT_PRODUCT = process.env['OCTOPUS_EXPORT_PRODUCT'] ?? 'OUTGOING-VAR-24-10-26';
const EXPORT_TARIFF = process.env['OCTOPUS_EXPORT_TARIFF'] ?? 'E-1R-OUTGOING-VAR-24-10-26-A';
const POLL_INTERVAL_MS = parseInt(process.env['OCTOPUS_POLL_INTERVAL'] ?? '1800000', 10);
const CHEAP_THRESHOLD_PENCE = parseFloat(process.env['OCTOPUS_CHEAP_THRESHOLD_PENCE'] ?? '15');

const TOPIC_TARIFF_STATE = 'helios/energy/tariff/state';

// ── Rate processing ───────────────────────────────────────────────────────────

function classifySlot(ratePence: number): 'cheap' | 'standard' {
  return ratePence < CHEAP_THRESHOLD_PENCE ? 'cheap' : 'standard';
}

function toSlots(rates: OctopusRateResult[]): TariffSlot[] {
  return rates.map((r) => ({
    start: r.valid_from,
    end: r.valid_to,
    type: classifySlot(r.value_inc_vat),
    ratePenceIncVat: Math.round(r.value_inc_vat * 100) / 100,
  }));
}

function buildState(
  importRates: OctopusRateResult[],
  exportRatePence: number,
): TariffState {
  const now = Date.now();
  const horizon = now + 48 * 60 * 60 * 1000; // 48 hours from now

  // Find the currently active slot (valid_from <= now, and valid_to > now or null)
  const active = importRates.find((r) => {
    const from = new Date(r.valid_from).getTime();
    const to = r.valid_to ? new Date(r.valid_to).getTime() : Infinity;
    return from <= now && now < to;
  });

  const currentRate = active?.value_inc_vat ?? importRates[0]?.value_inc_vat ?? 0;

  // Upcoming slots: valid_to is in the future and start is within 48h horizon
  const upcomingSlots = importRates
    .filter((r) => {
      const to = r.valid_to ? new Date(r.valid_to).getTime() : Infinity;
      const from = new Date(r.valid_from).getTime();
      return to > now && from < horizon;
    })
    .sort((a, b) => new Date(a.valid_from).getTime() - new Date(b.valid_from).getTime());

  return {
    currentType: classifySlot(currentRate),
    currentRatePenceIncVat: Math.round(currentRate * 100) / 100,
    validTo: active?.valid_to ?? null,
    exportRatePenceIncVat: Math.round(exportRatePence * 100) / 100,
    slots: toSlots(upcomingSlots),
    updatedAt: new Date().toISOString(),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const run = async (): Promise<void> => {
  console.log(`[octopus] connecting to MQTT at ${MQTT_URL}`);
  const mqttClient = await mqtt.connectAsync(MQTT_URL, {
    clientId: `helios-adapter-octopus-${process.pid}`,
    clean: true,
    reconnectPeriod: 5000,
  });
  mqttClient.on('error', (err) => console.error('[octopus] MQTT error:', err));
  console.log('[octopus] MQTT connected');

  // Fetch export rate once at startup — changes infrequently (monthly)
  let exportRatePence = 0;
  try {
    const exportRate = await fetchExportRate(EXPORT_PRODUCT, EXPORT_TARIFF);
    exportRatePence = exportRate?.value_inc_vat ?? 0;
    console.log(`[octopus] export rate: ${exportRatePence}p/kWh`);
  } catch (err) {
    console.error('[octopus] failed to fetch export rate:', err);
  }

  const poll = async (): Promise<void> => {
    try {
      const importRates = await fetchImportRates(IMPORT_PRODUCT, IMPORT_TARIFF);
      const state = buildState(importRates, exportRatePence);

      await mqttClient.publishAsync(TOPIC_TARIFF_STATE, JSON.stringify(state), { retain: true, qos: 1 });

      console.log(
        `[octopus] published state: ${state.currentType} @ ${state.currentRatePenceIncVat}p/kWh` +
        (state.validTo ? ` until ${state.validTo}` : '') +
        `, export ${state.exportRatePenceIncVat}p/kWh, ${state.slots.length} upcoming slots`,
      );
    } catch (err) {
      console.error('[octopus] poll error:', err);
    }
  };

  // Initial poll then on interval
  await poll();
  const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);

  const shutdown = (): void => {
    console.log('[octopus] shutting down');
    clearInterval(timer);
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
