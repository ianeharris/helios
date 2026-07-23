import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
vi.mock('../../db/client.js', () => ({
  getDb: () => ({ query: queryMock }),
}));

const publishMqttMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../mqtt/client.js', () => ({
  publishMqtt: publishMqttMock,
}));

const { deviceRoutes } = await import('../devices.js');
const { mqttSet } = await import('../../mqtt/cache.js');

const hueLight = {
  id: 'hue/BRIDGE1/light/light-1',
  vendor: 'hue',
  kind: 'light',
  name: 'Office Bloom',
  room_id: 'hue/BRIDGE1/room/room-1',
  reachable: true,
  role: null,
  tags: ['lighting'],
  raw_state: { bridgeId: 'BRIDGE1', resourceId: 'light-1', on: false },
  updated_at: new Date('2026-07-15T10:00:00.000Z'),
};

const sonosZone = {
  id: 'sonos/zone-1',
  vendor: 'sonos',
  kind: 'audio_zone',
  name: 'Lounge',
  room_id: 'hue/BRIDGE1/room/room-1',
  reachable: true,
  role: null,
  tags: ['audio'],
  raw_state: { playing: false },
  updated_at: new Date('2026-07-15T10:00:00.000Z'),
};

const buildApp = (): FastifyInstance => {
  const app = Fastify();
  app.register(deviceRoutes);
  return app;
};

beforeEach(() => {
  queryMock.mockReset();
  publishMqttMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /devices - live state merge', () => {
  it('merges retained MQTT state on top of the DB row for a Hue light', async () => {
    mqttSet(`helios/${hueLight.id}`, Buffer.from(JSON.stringify({ on: true, brightness: 45 })));
    queryMock.mockResolvedValueOnce({ rows: [hueLight] });
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/devices' });

    expect(response.json()).toEqual([
      expect.objectContaining({
        id: hueLight.id,
        rawState: { bridgeId: 'BRIDGE1', resourceId: 'light-1', on: true, brightness: 45 },
      }),
    ]);
  });

  it('falls back to DB raw_state for a Hue light with no cached MQTT state', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ ...hueLight, id: 'hue/BRIDGE1/light/light-2' }] });
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/devices' });

    expect(response.json()).toEqual([
      expect.objectContaining({ rawState: hueLight.raw_state }),
    ]);
  });

  it('does not attempt a live merge for a non-Hue-light device, even if a coincidentally matching topic is cached', async () => {
    mqttSet(`helios/${sonosZone.id}`, Buffer.from(JSON.stringify({ playing: true })));
    queryMock.mockResolvedValueOnce({ rows: [sonosZone] });
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/devices' });

    expect(response.json()).toEqual([
      expect.objectContaining({ rawState: sonosZone.raw_state }),
    ]);
  });
});

describe('POST /devices/:id/command', () => {
  it('returns 404 for an unknown device id', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/devices/does-not-exist/command',
      payload: { on: true },
    });

    expect(response.statusCode).toBe(404);
    expect(publishMqttMock).not.toHaveBeenCalled();
  });

  it('publishes a light command to the correct bridge-namespaced set topic', async () => {
    queryMock.mockResolvedValueOnce({ rows: [hueLight] });
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: `/devices/${encodeURIComponent(hueLight.id)}/command`,
      payload: { on: true },
    });

    expect(response.statusCode).toBe(200);
    expect(publishMqttMock).toHaveBeenCalledWith('helios/hue/BRIDGE1/light/light-1/set', { on: true });
  });
});
