import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/client.js';
import { publishMqtt } from '../mqtt/client.js';

type DeviceRow = {
  id: string;
  vendor: string;
  kind: string;
  name: string;
  room_id: string | null;
  reachable: boolean;
  role: string | null;
  tags: string[];
  raw_state: unknown;
  updated_at: Date;
};

type SceneRow = {
  id: string;
  name: string;
  room_id: string | null;
  icon: string | null;
  definition: unknown;
};

type CommandResolution = {
  topic: string;
  payload: unknown;
};

type SceneAction = {
  deviceId?: unknown;
  state?: unknown;
  command?: unknown;
  topic?: unknown;
  payload?: unknown;
};

export const deviceRoutes = (app: FastifyInstance, _opts: unknown, done: () => void): void => {
  app.get('/devices', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const params: unknown[] = [];
    const clauses: string[] = [];

    if (query['roomId']) {
      params.push(query['roomId']);
      clauses.push(`room_id = $${params.length}`);
    }
    if (query['vendor']) {
      params.push(query['vendor']);
      clauses.push(`vendor = $${params.length}`);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await getDb().query<DeviceRow>(
      `SELECT id, vendor, kind, name, room_id, reachable, role, tags, raw_state, updated_at
         FROM devices
         ${where}
        ORDER BY vendor, name`,
      params,
    );

    return reply.send(rows.map(deviceResponse));
  });

  app.patch('/devices/:id', async (req, reply) => {
    const id = (req.params as Record<string, string>)['id'];
    const body = objectBody(req.body);
    const fields: string[] = [];
    const params: unknown[] = [];

    addOptionalUpdate(fields, params, 'name', body['name']);
    addOptionalUpdate(fields, params, 'room_id', body['roomId']);
    addOptionalUpdate(fields, params, 'role', body['role']);
    if (Array.isArray(body['tags'])) {
      params.push(body['tags'].filter((tag): tag is string => typeof tag === 'string'));
      fields.push(`tags = $${params.length}`);
    }

    if (fields.length === 0) {
      return reply.status(400).send({ error: 'no supported fields provided' });
    }

    params.push(id);
    const { rows } = await getDb().query<DeviceRow>(
      `UPDATE devices
          SET ${fields.join(', ')}, updated_at = now()
        WHERE id = $${params.length}
        RETURNING id, vendor, kind, name, room_id, reachable, role, tags, raw_state, updated_at`,
      params,
    );

    const updated = rows[0];
    if (!updated) return reply.status(404).send({ error: 'unknown device' });
    return reply.send(deviceResponse(updated));
  });

  app.post('/devices/:id/command', async (req, reply) => {
    const id = (req.params as Record<string, string>)['id'];
    const device = await findDevice(id);
    if (!device) return reply.status(404).send({ error: 'unknown device' });

    const resolution = resolveDeviceCommand(device, req.body);
    if (!resolution) {
      return reply.status(422).send({ error: `commands are not supported for ${device.vendor}/${device.kind}` });
    }

    await publishMqtt(resolution.topic, resolution.payload);
    return reply.send({ ok: true, deviceId: device.id, topic: resolution.topic });
  });

  app.post('/rooms/:id/scene', async (req, reply) => {
    const roomId = (req.params as Record<string, string>)['id'];
    const body = objectBody(req.body);
    const sceneId = stringValue(body['sceneId']);
    const sceneName = stringValue(body['sceneName'] ?? body['name']);

    if (!sceneId && !sceneName) {
      return reply.status(400).send({ error: 'sceneId or sceneName is required' });
    }

    const scene = await findScene(roomId, sceneId, sceneName);
    if (!scene) return reply.status(404).send({ error: 'unknown scene' });

    const actions = Array.isArray(scene.definition) ? scene.definition as SceneAction[] : [];
    const published: CommandResolution[] = [];

    for (const action of actions) {
      const directTopic = stringValue(action.topic);
      if (directTopic) {
        const payload = action.payload ?? action.command ?? action.state ?? {};
        await publishMqtt(directTopic, payload);
        published.push({ topic: directTopic, payload });
        continue;
      }

      const deviceId = stringValue(action.deviceId);
      if (!deviceId) {
        return reply.status(422).send({ error: `scene ${scene.id} contains an action without a deviceId or topic` });
      }

      const device = await findDevice(deviceId);
      if (!device) return reply.status(422).send({ error: `scene ${scene.id} references unknown device ${deviceId}` });

      const resolution = resolveDeviceCommand(device, action.command ?? action.state ?? action);
      if (!resolution) {
        return reply.status(422).send({ error: `scene ${scene.id} references unsupported device ${deviceId}` });
      }

      await publishMqtt(resolution.topic, resolution.payload);
      published.push(resolution);
    }

    return reply.send({ ok: true, roomId, sceneId: scene.id, sceneName: scene.name, commands: published.length });
  });

  done();
};

const findDevice = async (id: string | undefined): Promise<DeviceRow | null> => {
  if (!id) return null;
  const { rows } = await getDb().query<DeviceRow>(
    'SELECT id, vendor, kind, name, room_id, reachable, role, tags, raw_state, updated_at FROM devices WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
};

const findScene = async (roomId: string | undefined, sceneId?: string, sceneName?: string): Promise<SceneRow | null> => {
  if (!roomId) return null;
  const { rows } = await getDb().query<SceneRow>(
    `SELECT id, name, room_id, icon, definition
       FROM scenes
      WHERE room_id = $1
        AND (($2::text IS NOT NULL AND id = $2) OR ($3::text IS NOT NULL AND name = $3))
      LIMIT 1`,
    [roomId, sceneId ?? null, sceneName ?? null],
  );
  return rows[0] ?? null;
};

const resolveDeviceCommand = (device: DeviceRow, body: unknown): CommandResolution | null => {
  if (device.vendor !== 'hue') return null;

  const rawState = objectBody(device.raw_state);
  const parsed = parseHueDeviceId(device.id);
  const bridgeId = stringValue(rawState['bridgeId']) ?? parsed.bridgeId;
  const resourceId = stringValue(rawState['resourceId']) ?? parsed.resourceId;
  if (!bridgeId || !resourceId) return null;

  const command = objectBody(body);
  const payload = command['state'] ?? command['command'] ?? command;

  if (device.kind === 'light' || device.kind === 'switch') {
    return { topic: `helios/hue/${bridgeId}/light/${resourceId}/set`, payload };
  }

  return null;
};

const parseHueDeviceId = (id: string): { bridgeId?: string; resourceId?: string } => {
  const slash = id.split('/');
  if (slash.length >= 4 && slash[0] === 'hue') {
    return definedHueParts(slash[1], slash[3]);
  }

  const colon = id.split(':');
  if (colon.length >= 4 && colon[0] === 'hue') {
    return definedHueParts(colon[1], colon[3]);
  }

  return {};
};

const definedHueParts = (bridgeId: string | undefined, resourceId: string | undefined): { bridgeId?: string; resourceId?: string } => {
  const result: { bridgeId?: string; resourceId?: string } = {};
  if (bridgeId) result.bridgeId = bridgeId;
  if (resourceId) result.resourceId = resourceId;
  return result;
};

const deviceResponse = (row: DeviceRow): Record<string, unknown> => ({
  id: row.id,
  vendor: row.vendor,
  kind: row.kind,
  name: row.name,
  roomId: row.room_id,
  reachable: row.reachable,
  role: row.role,
  tags: row.tags,
  rawState: row.raw_state,
  updatedAt: row.updated_at.toISOString(),
});

const addOptionalUpdate = (fields: string[], params: unknown[], column: string, value: unknown): void => {
  if (value === undefined) return;
  params.push(value);
  fields.push(`${column} = $${params.length}`);
};

const objectBody = (value: unknown): Record<string, unknown> => {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;
