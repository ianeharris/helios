import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/client.js';

export const healthRoutes = (app: FastifyInstance, _opts: unknown, done: () => void): void => {
  app.get('/health', async (_req, reply) => {
    try {
      await getDb().query('SELECT 1');
      return reply.send({ status: 'ok', db: 'ok' });
    } catch {
      return reply.status(503).send({ status: 'error', db: 'unreachable' });
    }
  });
  done();
};
