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

const { roomRoutes } = await import('../rooms.js');
const { mqttSet } = await import('../../mqtt/cache.js');

const hueRoom = {
  id: 'hue/BRIDGE1/room/room-1',
  name: 'Lounge',
  floor: 0,
  icon: 'living_room',
  raw_state: { bridgeId: 'BRIDGE1', groupedLightId: 'gl-room-1', anyOn: false },
};

const plainRoom = {
  id: 'no-hue-room',
  name: 'Shed',
  floor: 0,
  icon: null,
  raw_state: null,
};

const buildApp = (): FastifyInstance => {
  const app = Fastify();
  app.register(roomRoutes);
  return app;
};

beforeEach(() => {
  queryMock.mockReset();
  publishMqttMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /rooms', () => {
  it('returns DB raw_state when no live MQTT state is cached', async () => {
    queryMock.mockResolvedValueOnce({ rows: [hueRoom] });
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/rooms' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        id: hueRoom.id,
        name: hueRoom.name,
        floor: hueRoom.floor,
        icon: hueRoom.icon,
        rawState: hueRoom.raw_state,
      },
    ]);
  });

  it('merges retained MQTT state on top of the DB row for a Hue-backed room', async () => {
    mqttSet(`helios/hue/BRIDGE1/room/gl-room-1`, Buffer.from(JSON.stringify({ anyOn: true, brightness: 80 })));
    queryMock.mockResolvedValueOnce({ rows: [hueRoom] });
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/rooms' });

    expect(response.json()).toEqual([
      {
        id: hueRoom.id,
        name: hueRoom.name,
        floor: hueRoom.floor,
        icon: hueRoom.icon,
        rawState: { bridgeId: 'BRIDGE1', groupedLightId: 'gl-room-1', anyOn: true, brightness: 80 },
      },
    ]);
  });

  it('passes raw_state through unchanged for a room with no bridge/groupedLight identity', async () => {
    queryMock.mockResolvedValueOnce({ rows: [plainRoom] });
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/rooms' });

    expect(response.json()).toEqual([
      { id: plainRoom.id, name: plainRoom.name, floor: plainRoom.floor, icon: plainRoom.icon, rawState: null },
    ]);
  });
});

describe('POST /rooms/:id/command', () => {
  it('returns 404 for an unknown room id', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/rooms/does-not-exist/command',
      payload: { on: true },
    });

    expect(response.statusCode).toBe(404);
    expect(publishMqttMock).not.toHaveBeenCalled();
  });

  it('returns 422 when the room has no bridge/groupedLight identity to command', async () => {
    queryMock.mockResolvedValueOnce({ rows: [plainRoom] });
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: `/rooms/${plainRoom.id}/command`,
      payload: { on: true },
    });

    expect(response.statusCode).toBe(422);
    expect(publishMqttMock).not.toHaveBeenCalled();
  });

  it('publishes the command to the bridge-namespaced grouped-light set topic', async () => {
    queryMock.mockResolvedValueOnce({ rows: [hueRoom] });
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: `/rooms/${encodeURIComponent(hueRoom.id)}/command`,
      payload: { on: true, brightness: 60 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      roomId: hueRoom.id,
      topic: 'helios/hue/BRIDGE1/room/gl-room-1/set',
    });
    expect(publishMqttMock).toHaveBeenCalledWith(
      'helios/hue/BRIDGE1/room/gl-room-1/set',
      { on: true, brightness: 60 },
    );
  });
});
