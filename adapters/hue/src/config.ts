import { readFileSync } from 'fs';
import { join } from 'path';
import type { ConfiguredBridge } from './types.js';

// HUE_BRIDGES is a JSON array of {id, name, address?} objects. Addresses are
// discovered with local mDNS first, with address only used as a runtime fallback.
// App keys come from Docker secrets by default, or a host-managed directory
// when this adapter is running as a native LAN edge agent.
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

  const bridges = JSON.parse(raw) as Array<{ id?: unknown; name?: unknown; address?: unknown }>;
  if (!Array.isArray(bridges) || bridges.length === 0) {
    throw new Error('HUE_BRIDGES must be a non-empty JSON array');
  }

  const secretsDir = process.env['HUE_SECRETS_DIR'] ?? '/run/secrets';

  return bridges.map((b) => {
    if (typeof b.id !== 'string' || !b.id.trim() || typeof b.name !== 'string' || !b.name.trim()) {
      throw new Error('Each HUE_BRIDGES entry must contain non-empty id and name strings');
    }
    // Secret file name: hue_app_key_<name_lowercased_nospaces>
    const secretName = `hue_app_key_${b.name.toLowerCase().replace(/\s+/g, '')}`;
    const appKey = readSecret(join(secretsDir, secretName))
      || readSecret(join(secretsDir, `${secretName}.txt`));
    if (!appKey) {
      throw new Error(`Missing app key for Hue bridge "${b.name}" (secret: ${secretName})`);
    }
    if (b.address !== undefined && (typeof b.address !== 'string' || !b.address.trim())) {
      throw new Error('HUE_BRIDGES address values must be non-empty strings when provided');
    }
    return { id: b.id, name: b.name, appKey, ...(typeof b.address === 'string' ? { address: b.address } : {}) };
  });
};

export interface Config {
  bridges: ConfiguredBridge[];
  mqttUrl: string;
  reconnectDelayMs: number;
  sseTimeoutMs: number;
  discoveryTimeoutMs: number;
  discoveryAttempts: number;
  discoveryRetryDelayMs: number;
  discoveryCachePath: string;
}

export const loadConfig = (): Config => ({
  bridges: parseBridges(),
  mqttUrl: process.env['MQTT_URL'] ?? 'mqtt://mosquitto:1883',
  reconnectDelayMs: Number(process.env['HUE_RECONNECT_DELAY_MS'] ?? 5000),
  sseTimeoutMs: Number(process.env['HUE_SSE_TIMEOUT_MS'] ?? 120_000),
  discoveryTimeoutMs: Number(process.env['HUE_DISCOVERY_TIMEOUT_MS'] ?? 3000),
  discoveryAttempts: Number(process.env['HUE_DISCOVERY_ATTEMPTS'] ?? 12),
  discoveryRetryDelayMs: Number(process.env['HUE_DISCOVERY_RETRY_DELAY_MS'] ?? 5000),
  discoveryCachePath: process.env['HUE_DISCOVERY_CACHE_PATH'] ?? '/var/lib/helios/hue-bridges.json',
});
