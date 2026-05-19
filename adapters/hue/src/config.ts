import { readFileSync } from 'fs';
import type { BridgeConfig } from './types.js';

// HUE_BRIDGES is a JSON array of {id, ip, name} objects.
// App keys come from Docker secrets files.
const readSecret = (path: string): string => {
  try {
    return readFileSync(path, 'utf-8').trim();
  } catch {
    return '';
  }
};

const parseBridges = (): BridgeConfig[] => {
  const raw = process.env['HUE_BRIDGES'];
  if (!raw) throw new Error('HUE_BRIDGES environment variable is required');

  const bridges = JSON.parse(raw) as Array<{ id: string; ip: string; name: string }>;
  if (!Array.isArray(bridges) || bridges.length === 0) {
    throw new Error('HUE_BRIDGES must be a non-empty JSON array');
  }

  return bridges.map((b) => {
    // Secret file path: /run/secrets/hue_app_key_<name_lowercased_nospaces>
    const secretName = `hue_app_key_${b.name.toLowerCase().replace(/\s+/g, '')}`;
    const appKey = readSecret(`/run/secrets/${secretName}`);
    if (!appKey) {
      throw new Error(`Missing app key for Hue bridge "${b.name}" (secret: ${secretName})`);
    }
    return { id: b.id, ip: b.ip, name: b.name, appKey };
  });
};

export interface Config {
  bridges: BridgeConfig[];
  mqttUrl: string;
  reconnectDelayMs: number;
  sseTimeoutMs: number;
}

export const loadConfig = (): Config => ({
  bridges: parseBridges(),
  mqttUrl: process.env['MQTT_URL'] ?? 'mqtt://mosquitto:1883',
  reconnectDelayMs: Number(process.env['HUE_RECONNECT_DELAY_MS'] ?? 5000),
  sseTimeoutMs: Number(process.env['HUE_SSE_TIMEOUT_MS'] ?? 120_000),
});
