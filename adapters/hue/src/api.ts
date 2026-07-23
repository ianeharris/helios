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
  HueZoneResource,
} from './types.js';
import type { BridgeConfig } from './types.js';

const agent = new https.Agent({ rejectUnauthorized: false });

interface HueApiResponse<T> {
  data: T;
  errors?: unknown[];
}

interface HueRequestOptions {
  method?: 'GET' | 'PUT';
  body?: Record<string, unknown>;
}

// Node's global fetch ignores node:https Agent instances. Use https.request so
// the Hue bridge's self-signed certificate is accepted only for these LAN calls.
const requestHueApi = <T>(
  address: string,
  appKey: string,
  path: string,
  options: HueRequestOptions = {},
): Promise<{ statusCode: number; body: HueApiResponse<T> }> =>
  new Promise((resolve, reject) => {
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    const request = https.request({
      hostname: address,
      port: 443,
      path: `/clip/v2/${path}`,
      method: options.method ?? 'GET',
      headers: {
        'hue-application-key': appKey,
        ...(body === undefined ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }),
      },
      agent,
    }, (response) => {
      let payload = '';
      response.setEncoding('utf-8');
      response.on('data', (chunk: string) => { payload += chunk; });
      response.once('error', reject);
      response.once('end', () => {
        try {
          resolve({
            statusCode: response.statusCode ?? 0,
            body: JSON.parse(payload) as HueApiResponse<T>,
          });
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });

    request.once('error', reject);
    if (body !== undefined) request.write(body);
    request.end();
  });

const clip = async <T>(bridge: BridgeConfig, path: string): Promise<T> => {
  const res = await requestHueApi<T>(bridge.address, bridge.appKey, path);
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`Hue API ${bridge.name} ${path}: HTTP ${res.statusCode}`);
  }
  if (res.body.errors?.length) {
    throw new Error(`Hue API errors: ${JSON.stringify(res.body.errors)}`);
  }
  return res.body.data;
};

export const probeBridge = async (address: string, appKey: string): Promise<void> => {
  const res = await requestHueApi<unknown>(address, appKey, 'resource/bridge');
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`Hue bridge probe at ${address}: HTTP ${res.statusCode}`);
  }
  if (res.body.errors?.length) throw new Error(`Hue bridge probe at ${address} returned API errors`);
};

export const fetchLights = (bridge: BridgeConfig): Promise<HueLightResource[]> =>
  clip<HueLightResource[]>(bridge, 'resource/light');

export const fetchRooms = (bridge: BridgeConfig): Promise<HueRoomResource[]> =>
  clip<HueRoomResource[]>(bridge, 'resource/room');

export const fetchZones = (bridge: BridgeConfig): Promise<HueZoneResource[]> =>
  clip<HueZoneResource[]>(bridge, 'resource/zone');

export const fetchGroupedLights = (bridge: BridgeConfig): Promise<HueGroupedLightResource[]> =>
  clip<HueGroupedLightResource[]>(bridge, 'resource/grouped_light');

export const fetchScenes = (bridge: BridgeConfig): Promise<HueSceneResource[]> =>
  clip<HueSceneResource[]>(bridge, 'resource/scene');

export const setLightState = async (
  bridge: BridgeConfig,
  lightId: string,
  state: { on?: boolean; brightness?: number; colorTemp?: number },
): Promise<void> => {
  await setResourceState(bridge, 'light', lightId, state);
};

export const setGroupedLightState = async (
  bridge: BridgeConfig,
  groupedLightId: string,
  state: { on?: boolean; brightness?: number },
): Promise<void> => {
  await setResourceState(bridge, 'grouped_light', groupedLightId, state);
};

const setResourceState = async (
  bridge: BridgeConfig,
  resourceType: 'light' | 'grouped_light',
  resourceId: string,
  state: { on?: boolean; brightness?: number; colorTemp?: number },
): Promise<void> => {
  const body: Record<string, unknown> = {};
  if (state.on !== undefined) body['on'] = { on: state.on };
  if (state.brightness !== undefined) body['dimming'] = { brightness: state.brightness };
  if (state.colorTemp !== undefined) body['color_temperature'] = { mirek: state.colorTemp };

  const res = await requestHueApi<unknown>(bridge.address, bridge.appKey, `resource/${resourceType}/${resourceId}`, {
    method: 'PUT',
    body,
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`Set ${resourceType} ${resourceId} failed: HTTP ${res.statusCode}`);
  }
};

export const recallScene = async (bridge: BridgeConfig, sceneId: string): Promise<void> => {
  const res = await requestHueApi<unknown>(bridge.address, bridge.appKey, `resource/scene/${sceneId}`, {
    method: 'PUT',
    body: { recall: { action: 'active' } },
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`Recall scene ${sceneId} failed: HTTP ${res.statusCode}`);
  }
};
