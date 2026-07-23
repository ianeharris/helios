import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HueLightResource, HueRoomResource, HueGroupedLightResource, HueSceneResource, HueLightState, HueRoomState, HueZoneResource } from '../types.js';

// We test the BridgeManager's SSE event handling in isolation by mocking
// the API calls and SSE connection, then feeding synthetic events.

vi.mock('../api.js', () => ({
  fetchLights: vi.fn(),
  fetchRooms: vi.fn(),
  fetchZones: vi.fn(),
  fetchGroupedLights: vi.fn(),
  fetchScenes: vi.fn(),
}));

vi.mock('../sse.js', () => ({
  HueSseConnection: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

import { fetchLights, fetchRooms, fetchZones, fetchGroupedLights, fetchScenes } from '../api.js';
import { BridgeManager } from '../bridge.js';

const bridge = { id: 'ECB5FAFFFE2CA569', address: '192.168.86.199', name: 'Bradgate', appKey: 'test-key' };

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

const makeZone = (overrides: Partial<HueZoneResource> = {}): HueZoneResource => ({
  id: 'zone-1',
  type: 'zone',
  metadata: { name: 'Downstairs', archetype: 'living_room' },
  children: [{ rid: 'device-1', rtype: 'device' }],
  services: [{ rid: 'gl-zone-1', rtype: 'grouped_light' }],
  ...overrides,
});

const makeScene = (overrides: Partial<HueSceneResource> = {}): HueSceneResource => ({
  id: 'scene-1',
  type: 'scene',
  metadata: { name: 'Relax' },
  group: { rid: 'room-1', rtype: 'room' },
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
  vi.mocked(fetchZones).mockResolvedValue([] as HueZoneResource[]);
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
      areaIds: [`hue/${bridge.id}/room/room-1`],
    });
  });

  it('discovers Hue zones as independently controllable areas', async () => {
    vi.mocked(fetchZones).mockResolvedValue([makeZone()]);

    const manager = new BridgeManager(bridge, publishState, 120_000, 5_000);
    await manager.start();

    const discoveryMsg = publishedMessages.find((m) =>
      m.topic === `helios/registry/hue/${bridge.id}/discovery`,
    );
    const discovery = JSON.parse(discoveryMsg!.payload) as {
      rooms: Array<{ id: string; rawState: { areaType: string; groupedLightId: string } }>;
      devices: Array<{ rawState: { areaIds: string[] } }>;
    };
    expect(discovery.rooms).toContainEqual(expect.objectContaining({
      id: `hue/${bridge.id}/zone/zone-1`,
      rawState: expect.objectContaining({ areaType: 'zone', groupedLightId: 'gl-zone-1' }),
    }));
    expect(discovery.devices[0]?.rawState.areaIds).toContain(`hue/${bridge.id}/zone/zone-1`);
  });

  it('maps Hue scenes that point directly at zones into registry area IDs', async () => {
    vi.mocked(fetchZones).mockResolvedValue([makeZone()]);
    vi.mocked(fetchScenes).mockResolvedValue([makeScene({ group: { rid: 'zone-1', rtype: 'zone' } })]);

    const manager = new BridgeManager(bridge, publishState, 120_000, 5_000);
    await manager.start();

    const discoveryMsg = publishedMessages.find((m) =>
      m.topic === `helios/registry/hue/${bridge.id}/discovery`,
    );
    const discovery = JSON.parse(discoveryMsg!.payload) as {
      scenes: Array<{ roomId: string | null }>;
    };
    expect(discovery.scenes[0]?.roomId).toBe(`hue/${bridge.id}/zone/zone-1`);
  });

  it('maps Hue scene groups that point directly at rooms into registry room IDs', async () => {
    vi.mocked(fetchScenes).mockResolvedValue([makeScene()]);

    const manager = new BridgeManager(bridge, publishState, 120_000, 5_000);
    await manager.start();

    const discoveryMsg = publishedMessages.find((m) =>
      m.topic === `helios/registry/hue/${bridge.id}/discovery`,
    );
    expect(discoveryMsg).toBeDefined();
    const discovery = JSON.parse(discoveryMsg!.payload) as {
      scenes: Array<{ id: string; roomId: string | null }>;
    };
    expect(discovery.scenes[0]).toMatchObject({
      id: `hue/${bridge.id}/scene/scene-1`,
      roomId: `hue/${bridge.id}/room/room-1`,
    });
  });
});
