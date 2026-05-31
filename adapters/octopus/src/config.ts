import { readFileSync } from 'node:fs';
import { fetchAccountDetails } from './api.js';

export interface Config {
  mqttUrl: string;
  apiKey: string;
  accountNumber: string;
  importMpan: string;
  exportMpan: string;
  importMeterSerial: string | null;
  exportMeterSerial: string | null;
  importProduct: string;
  importTariff: string;
  exportProduct: string;
  exportTariff: string;
  pollIntervalMs: number;
}

function loadApiKey(): string {
  try {
    return readFileSync('/run/secrets/octopus_api_key', 'utf8').trim();
  } catch {
    const key = process.env['OCTOPUS_API_KEY'];
    if (!key) throw new Error('No Octopus API key: provide /run/secrets/octopus_api_key or OCTOPUS_API_KEY env var');
    return key;
  }
}

export async function loadConfig(): Promise<Config> {
  const apiKey = loadApiKey();
  const accountNumber = process.env['OCTOPUS_ACCOUNT'] ?? 'A-B240C957';
  const importMpan = process.env['OCTOPUS_IMPORT_MPAN'] ?? '';
  const exportMpan = process.env['OCTOPUS_EXPORT_MPAN'] ?? '';

  let importMeterSerial: string | null = null;
  let exportMeterSerial: string | null = null;

  try {
    const account = await fetchAccountDetails(apiKey, accountNumber);
    for (const property of account.properties) {
      for (const mp of property.electricity_meter_points) {
        const serial = mp.meters[0]?.serial_number ?? null;
        if (mp.mpan === importMpan) importMeterSerial = serial;
        if (mp.mpan === exportMpan) exportMeterSerial = serial;
      }
    }
    console.log(`[octopus] meter serials — import: ${importMeterSerial ?? 'not found'}, export: ${exportMeterSerial ?? 'not found'}`);
  } catch (err) {
    console.error('[octopus] failed to fetch meter serials (consumption data will be skipped):', err);
  }

  return {
    mqttUrl: process.env['MQTT_URL'] ?? 'mqtt://mosquitto:1883',
    apiKey,
    accountNumber,
    importMpan,
    exportMpan,
    importMeterSerial,
    exportMeterSerial,
    importProduct: process.env['OCTOPUS_IMPORT_PRODUCT'] ?? 'INTELLI-VAR-24-10-29',
    importTariff: process.env['OCTOPUS_IMPORT_TARIFF'] ?? 'E-1R-INTELLI-VAR-24-10-29-A',
    exportProduct: process.env['OCTOPUS_EXPORT_PRODUCT'] ?? 'OUTGOING-VAR-24-10-26',
    exportTariff: process.env['OCTOPUS_EXPORT_TARIFF'] ?? 'E-1R-OUTGOING-VAR-24-10-26-A',
    pollIntervalMs: parseInt(process.env['OCTOPUS_POLL_INTERVAL'] ?? '1800000', 10),
  };
}
