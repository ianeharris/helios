import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/client.js';

export const roomRoutes = (app: FastifyInstance, _opts: unknown, done: () => void): void => {
  app.get('/rooms', async (_req, reply) => {
    const { rows } = await getDb().query(
      'SELECT id, name, floor, icon FROM rooms ORDER BY floor, name',
    );
    return reply.send(rows);
  });
  done();
};
