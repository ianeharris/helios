import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HueLightResource, HueRoomResource, HueGroupedLightResource, HueSceneResource, HueLightState, HueRoomState } from '../types.js';

// We test the BridgeManager's SSE event handling in isolation by mocking
// the API calls and SSE connection, then feeding synthetic events.

vi.mock('../api.js', () => ({
  fetchLights: vi.fn(),
  fetchRooms: vi.fn(),
  fetchGroupedLights: vi.fn(),
  fetchScenes: vi.fn(),
}));

vi.mock('../sse.js', () => ({
  HueSseConnection: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

import { fetchLights, fetchRooms, fetchGroupedLights, fetchScenes } from '../api.js';
import { BridgeManager } from '../bridge.js';

const bridge = { id: 'ECB5FAFFFE2CA569', ip: '192.168.86.199', name: 'Bradgate', appKey: 'test-key' };

const makeLight = (overrides: Partial<HueLightResource> = {}): HueLightResource => ({
  id: 'light-1',
  type: 'light',
  owner: { rid: 'device-1', rtype: 'device' },
  metadata: { name: 'Lounge Main', archetype: 'sultan_bulb' },
  on: { on: false },
  dimming: { brightness: 50 },
  color_temperature: { mirek: 366, mirek_valid: true },
  ...overrides,
});

const makeRoom = (overrides: Partial<HueRoomResource> = {}): HueRoomResource => ({
  id: 'room-1',
  type: 'room',
  metadata: { name: 'Lounge', archetype: 'living_room' },
  children: [{ rid: 'device-1', rtype: 'device' }],
  services: [{ rid: 'gl-1', rtype: 'grouped_light' }],
  ...overrides,
});

const makeGroupedLight = (overrides: Partial<HueGroupedLightResource> = {}): HueGroupedLightResource => ({
  id: 'gl-1',
  type: 'grouped_light',
  owner: { rid: 'room-1', rtype: 'room' },
  on: { on: false },
  dimming: { brightness: 50 },
  ...overrides,
});

let publishedMessages: Array<{ topic: string; payload: string }> = [];
const publishState = vi.fn((topic: string, payload: unknown): Promise<void> => {
  publishedMessages.push({ topic, payload: JSON.stringify(payload) });
  return Promise.resolve();
});

beforeEach(() => {
  publishedMessages = [];
  publishState.mockClear();
  vi.mocked(fetchLights).mockResolvedValue([makeLight()]);
  vi.mocked(fetchRooms).mockResolvedValue([makeRoom()]);
  vi.mocked(fetchGroupedLights).mockResolvedValue([makeGroupedLight()]);
  vi.mocked(fetchScenes).mockResolvedValue([] as HueSceneResource[]);
});

describe('BridgeManager', () => {
  it('publishes initial light state on start', async () => {
    const manager = new BridgeManager(bridge, publishState, 120_000, 5_000);
    await manager.start();

    const lightMsg = publishedMessages.find((m) =>
      m.topic === `helios/hue/${bridge.id}/light/light-1`,
    );
    expect(lightMsg).toBeDefined();
    const state = JSON.parse(lightMsg!.payload) as HueLightState;
    expect(state.on).toBe(false);
    expect(state.brightness).toBe(50);
    expect(state.name).toBe('Lounge Main');
  });

  it('publishes initial room state on start', async () => {
    const manager = new BridgeManager(bridge, publishState, 120_000, 5_000);
    await manager.start();

    const roomMsg = publishedMessages.find((m) =>
      m.topic === `helios/hue/${bridge.id}/room/gl-1`,
    );
    expect(roomMsg).toBeDefined();
    const state = JSON.parse(roomMsg!.payload) as HueRoomState;
    expect(state.name).toBe('Lounge');
    expect(state.anyOn).toBe(false);
  });

  it('topics are namespaced by bridgeId', async () => {
    const manager = new BridgeManager(bridge, publishState, 120_000, 5_000);
    await manager.start();

    const topics = publishedMessages.map((m) => m.topic);
    expect(topics.every((t) => t.startsWith(`helios/hue/${bridge.id}/`) || t === `helios/registry/hue/${bridge.id}/discovery`)).toBe(true);
  });

  it('publishes a registry discovery snapshot on start', async () => {
    const manager = new BridgeManager(bridge, publishState, 120_000, 5_000);
    await manager.start();

    const discoveryMsg = publishedMessages.find((m) =>
      m.topic === `helios/registry/hue/${bridge.id}/discovery`,
    );
    expect(discoveryMsg).toBeDefined();
    const discovery = JSON.parse(discoveryMsg!.payload) as {
      adapter: string;
      rooms: Array<{ id: string; name: string }>;
      devices: Array<{ id: string; roomId: string | null; rawState: { bridgeId: string; resourceId: string } }>;
    };
    expect(discovery.adapter).toBe('hue');
    expect(discovery.rooms[0]).toMatchObject({
      id: `hue/${bridge.id}/room/room-1`,
      name: 'Lounge',
    });
    expect(discovery.devices[0]).toMatchObject({
      id: `hue/${bridge.id}/light/light-1`,
      roomId: `hue/${bridge.id}/room/room-1`,
    });
    expect(discovery.devices[0]!.rawState).toMatchObject({
      bridgeId: bridge.id,
      resourceId: 'light-1',
    });
  });
});
