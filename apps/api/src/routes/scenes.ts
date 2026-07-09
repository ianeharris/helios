import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/client.js';

type SceneRow = {
  id: string;
  name: string;
  room_id: string | null;
  icon: string | null;
  definition: unknown;
};

export const sceneRoutes = (app: FastifyInstance, _opts: unknown, done: () => void): void => {
  app.get('/scenes', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const params: unknown[] = [];
    const where = query['roomId'] ? 'WHERE room_id = $1' : '';
    if (query['roomId']) params.push(query['roomId']);

    const { rows } = await getDb().query<SceneRow>(
      `SELECT id, name, room_id, icon, definition
         FROM scenes
         ${where}
        ORDER BY room_id, name`,
      params,
    );

    return reply.send(rows.map(sceneResponse));
  });

  app.get('/rooms/:id/scenes', async (req, reply) => {
    const roomId = (req.params as Record<string, string>)['id'];
    const { rows } = await getDb().query<SceneRow>(
      `SELECT id, name, room_id, icon, definition
         FROM scenes
        WHERE room_id = $1
        ORDER BY name`,
      [roomId],
    );

    return reply.send(rows.map(sceneResponse));
  });

  done();
};

const sceneResponse = (row: SceneRow): Record<string, unknown> => ({
  id: row.id,
  name: row.name,
  roomId: row.room_id,
  icon: row.icon,
  definition: row.definition,
});
