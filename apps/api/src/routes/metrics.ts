import type { FastifyInstance } from 'fastify';
import { collectDefaultMetrics, register } from 'prom-client';

collectDefaultMetrics({ prefix: 'helios_api_' });

export const metricsRoutes = (app: FastifyInstance, _opts: unknown, done: () => void): void => {
  app.get('/metrics', async (_req, reply) => {
    reply.header('content-type', register.contentType);
    return register.metrics();
  });

  done();
};
