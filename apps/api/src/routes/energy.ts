import type { FastifyInstance } from 'fastify';
import { mqttGet } from '../mqtt/cache.js';
import type { TariffState, DispatchSchedule, SavingSessionState } from '@helios/shared';

export const energyRoutes = (app: FastifyInstance, _opts: unknown, done: () => void): void => {
  app.get('/energy/tariff', (_req, reply) => {
    const state = mqttGet<TariffState>('helios/energy/tariff/state');
    if (!state) return reply.status(503).send({ error: 'tariff data not yet available' });
    return reply.send(state);
  });

  app.get('/energy/dispatch', (_req, reply) => {
    const state = mqttGet<DispatchSchedule>('helios/energy/octopus/dispatch_schedule');
    if (!state) return reply.status(503).send({ error: 'dispatch schedule not yet available' });
    return reply.send(state);
  });

  app.get('/energy/saving-sessions', (_req, reply) => {
    const state = mqttGet<SavingSessionState>('helios/energy/octopus/saving_session');
    if (!state) return reply.status(503).send({ error: 'saving session data not yet available' });
    return reply.send(state);
  });

  done();
};
