import { readFileSync } from 'fs';
import type { ConfiguredBridge } from './types.js';

// HUE_BRIDGES is a JSON array of {id, name} objects. Addresses are discovered
// with local mDNS and only cached after a successful bridge probe.
// App keys come from Docker secrets files.
const readSecret = (path: string): string => {
  try {
    return readFileSync(path, 'utf-8').trim();
  } catch {
    return '';
  }
};

const parseBridges = (): ConfiguredBridge[] => {
  const raw = process.env['HUE_BRIDGES'];
  if (!raw) throw new Error('HUE_BRIDGES environment variable is required');

  const bridges = JSON.parse(raw) as Array<{ id?: unknown; name?: unknown }>;
  if (!Array.isArray(bridges) || bridges.length === 0) {
    throw new Error('HUE_BRIDGES must be a non-empty JSON array');
  }

  return bridges.map((b) => {
    if (typeof b.id !== 'string' || !b.id.trim() || typeof b.name !== 'string' || !b.name.trim()) {
      throw new Error('Each HUE_BRIDGES entry must contain non-empty id and name strings');
    }
    // Secret file path: /run/secrets/hue_app_key_<name_lowercased_nospaces>
    const secretName = `hue_app_key_${b.name.toLowerCase().replace(/\s+/g, '')}`;
    const appKey = readSecret(`/run/secrets/${secretName}`);
    if (!appKey) {
      throw new Error(`Missing app key for Hue bridge "${b.name}" (secret: ${secretName})`);
    }
    return { id: b.id, name: b.name, appKey };
  });
};

export interface Config {
  bridges: ConfiguredBridge[];
  mqttUrl: string;
  reconnectDelayMs: number;
  sseTimeoutMs: number;
  discoveryTimeoutMs: number;
  discoveryCachePath: string;
}

export const loadConfig = (): Config => ({
  bridges: parseBridges(),
  mqttUrl: process.env['MQTT_URL'] ?? 'mqtt://mosquitto:1883',
  reconnectDelayMs: Number(process.env['HUE_RECONNECT_DELAY_MS'] ?? 5000),
  sseTimeoutMs: Number(process.env['HUE_SSE_TIMEOUT_MS'] ?? 120_000),
  discoveryTimeoutMs: Number(process.env['HUE_DISCOVERY_TIMEOUT_MS'] ?? 3000),
  discoveryCachePath: process.env['HUE_DISCOVERY_CACHE_PATH'] ?? '/var/lib/helios/hue-bridges.json',
});
