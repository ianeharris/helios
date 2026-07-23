import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/client.js';
import { publishMqtt } from '../mqtt/client.js';
import { mqttGet } from '../mqtt/cache.js';

type RoomRow = {
  id: string;
  name: string;
  floor: number | null;
  icon: string | null;
  raw_state: unknown;
};

export const roomRoutes = (app: FastifyInstance, _opts: unknown, done: () => void): void => {
  app.get('/rooms', async (_req, reply) => {
    const { rows } = await getDb().query<RoomRow>(
      'SELECT id, name, floor, icon, raw_state FROM rooms ORDER BY floor, name',
    );
    return reply.send(rows.map(roomResponse));
  });

  app.post('/rooms/:id/command', async (req, reply) => {
    const id = (req.params as Record<string, string>)['id'];
    const room = await findRoom(id);
    if (!room) return reply.status(404).send({ error: 'unknown room' });

    const resolution = resolveRoomCommand(room, req.body);
    if (!resolution) return reply.status(422).send({ error: 'commands are not supported for this room' });

    await publishMqtt(resolution.topic, resolution.payload);
    return reply.send({ ok: true, roomId: room.id, topic: resolution.topic });
  });

  done();
};

const findRoom = async (id: string | undefined): Promise<RoomRow | null> => {
  if (!id) return null;
  const { rows } = await getDb().query<RoomRow>(
    'SELECT id, name, floor, icon, raw_state FROM rooms WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
};

const resolveRoomCommand = (room: RoomRow, body: unknown): { topic: string; payload: unknown } | null => {
  const rawState = objectBody(room.raw_state);
  const bridgeId = stringValue(rawState['bridgeId']);
  const groupedLightId = stringValue(rawState['groupedLightId']);
  if (!bridgeId || !groupedLightId) return null;

  return {
    topic: `helios/hue/${bridgeId}/room/${groupedLightId}/set`,
    payload: objectBody(body),
  };
};

const roomResponse = (room: RoomRow): Record<string, unknown> => ({
  id: room.id,
  name: room.name,
  floor: room.floor,
  icon: room.icon,
  rawState: currentRawState(room),
});

const currentRawState = (room: RoomRow): unknown => {
  const rawState = objectBody(room.raw_state);
  const bridgeId = stringValue(rawState['bridgeId']);
  const groupedLightId = stringValue(rawState['groupedLightId']);
  if (!bridgeId || !groupedLightId) return room.raw_state;

  const liveState = mqttGet<Record<string, unknown>>(`helios/hue/${bridgeId}/room/${groupedLightId}`);
  return liveState ? { ...rawState, ...liveState } : room.raw_state;
};

const objectBody = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;
