import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/client.js';
import { publishMqtt } from '../mqtt/client.js';

type DeviceRow = {
  id: string;
  vendor: string;
  kind: string;
  raw_state: unknown;
};

type SceneRow = {
  id: string;
  name: string;
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

  app.post('/api/rooms/:id/scene', async (req, reply) => {
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
    'SELECT id, vendor, kind, raw_state FROM devices WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
};

const findScene = async (roomId: string | undefined, sceneId?: string, sceneName?: string): Promise<SceneRow | null> => {
  if (!roomId) return null;
  const { rows } = await getDb().query<SceneRow>(
    `SELECT id, name, definition
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
  const bridgeId = stringValue(rawState['bridgeId']) ?? parseHueDeviceId(device.id).bridgeId;
  const resourceId = stringValue(rawState['resourceId']) ?? parseHueDeviceId(device.id).resourceId;
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

const objectBody = (value: unknown): Record<string, unknown> => {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;
