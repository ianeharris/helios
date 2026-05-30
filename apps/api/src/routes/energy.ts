import type { FastifyInstance } from 'fastify';
import { mqttGet } from '../mqtt/cache.js';
import type { TariffState } from '@helios/shared';

export const energyRoutes = (app: FastifyInstance, _opts: unknown, done: () => void): void => {
  app.get('/energy/tariff', (_req, reply) => {
    const state = mqttGet<TariffState>('helios/energy/tariff/state');
    if (!state) return reply.status(503).send({ error: 'tariff data not yet available' });
    return reply.send(state);
  });
  done();
};
