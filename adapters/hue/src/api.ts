/**
 * Hue CLIP API v2 HTTP client.
 *
 * Bridge v2 uses a self-signed TLS cert. We disable cert verification on the
 * private LAN - acceptable risk given the traffic never leaves the /24.
 */

import https from 'https';
import type {
  HueLightResource,
  HueRoomResource,
  HueGroupedLightResource,
  HueSceneResource,
} from './types.js';
import type { BridgeConfig } from './types.js';

const agent = new https.Agent({ rejectUnauthorized: false });

const clip = async <T>(bridge: BridgeConfig, path: string): Promise<T> => {
  const url = `https://${bridge.ip}/clip/v2/${path}`;
  const res = await fetch(url, {
    headers: { 'hue-application-key': bridge.appKey },
    // @ts-expect-error: undici agent not in global fetch types, works at runtime on Node.js
    agent,
  });
  if (!res.ok) {
    throw new Error(`Hue API ${bridge.name} ${path}: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { data: T; errors: unknown[] };
  if (body.errors?.length) {
    throw new Error(`Hue API errors: ${JSON.stringify(body.errors)}`);
  }
  return body.data;
};

export const fetchLights = (bridge: BridgeConfig): Promise<HueLightResource[]> =>
  clip<HueLightResource[]>(bridge, 'resource/light');

export const fetchRooms = (bridge: BridgeConfig): Promise<HueRoomResource[]> =>
  clip<HueRoomResource[]>(bridge, 'resource/room');

export const fetchGroupedLights = (bridge: BridgeConfig): Promise<HueGroupedLightResource[]> =>
  clip<HueGroupedLightResource[]>(bridge, 'resource/grouped_light');

export const fetchScenes = (bridge: BridgeConfig): Promise<HueSceneResource[]> =>
  clip<HueSceneResource[]>(bridge, 'resource/scene');

export const setLightState = async (
  bridge: BridgeConfig,
  lightId: string,
  state: { on?: boolean; brightness?: number; colorTemp?: number },
): Promise<void> => {
  const body: Record<string, unknown> = {};
  if (state.on !== undefined) body['on'] = { on: state.on };
  if (state.brightness !== undefined) body['dimming'] = { brightness: state.brightness };
  if (state.colorTemp !== undefined) body['color_temperature'] = { mirek: state.colorTemp };

  const url = `https://${bridge.ip}/clip/v2/resource/light/${lightId}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'hue-application-key': bridge.appKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    // @ts-expect-error: undici agent not in global fetch types, works at runtime on Node.js
    agent,
  });
  if (!res.ok) throw new Error(`Set light ${lightId} failed: HTTP ${res.status}`);
};

export const recallScene = async (bridge: BridgeConfig, sceneId: string): Promise<void> => {
  const url = `https://${bridge.ip}/clip/v2/resource/scene/${sceneId}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'hue-application-key': bridge.appKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recall: { action: 'active' } }),
    // @ts-expect-error: undici agent not in global fetch types, works at runtime on Node.js
    agent,
  });
  if (!res.ok) throw new Error(`Recall scene ${sceneId} failed: HTTP ${res.status}`);
};
