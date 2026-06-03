import type { FastifyInstance } from 'fastify';
import { mqttGet } from '../mqtt/cache.js';
import { getDb } from '../db/client.js';
import type { TariffState, DispatchSchedule, SavingSessionState, FoxEssLive, EnergyHistory, EnergyHistoryPoint, EnergyPeriod } from '@helios/shared';

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

  app.get('/energy/foxess', (_req, reply) => {
    const state = mqttGet<FoxEssLive>('helios/energy/foxess/live');
    if (!state) return reply.status(503).send({ error: 'Fox ESS data not yet available' });
    return reply.send(state);
  });

  app.get('/energy/history', async (req, reply) => {
    const period = (req.query as Record<string, string>)['period'] as EnergyPeriod | undefined;
    if (!period || !['day', 'week', 'month'].includes(period)) {
      return reply.status(400).send({ error: 'period must be day, week, or month' });
    }

    const bucket = period === 'day' ? '5 minutes' : period === 'week' ? '1 hour' : '1 day';
    const interval = period === 'day' ? '24 hours' : period === 'week' ? '7 days' : '30 days';

    const db = getDb();
    const { rows } = await db.query<{
      time: Date;
      pv_watts: string | null;
      batt_soc_pct: string | null;
      batt_watts: string | null;
      grid_watts: string | null;
      load_watts: string | null;
    }>(
      `SELECT
         time_bucket($1::interval, occurred_at) AS time,
         AVG(pv_watts)        AS pv_watts,
         AVG(battery_soc_pct) AS batt_soc_pct,
         AVG(battery_watts)   AS batt_watts,
         AVG(grid_watts)      AS grid_watts,
         AVG(load_watts)      AS load_watts
       FROM energy_readings
       WHERE occurred_at > NOW() - $2::interval
       GROUP BY time
       ORDER BY time`,
      [bucket, interval],
    );

    const points: EnergyHistoryPoint[] = rows.map((r) => ({
      time: r.time.toISOString(),
      pvWatts: r.pv_watts !== null ? parseFloat(r.pv_watts) : null,
      battSocPct: r.batt_soc_pct !== null ? parseFloat(r.batt_soc_pct) : null,
      battWatts: r.batt_watts !== null ? parseFloat(r.batt_watts) : null,
      gridWatts: r.grid_watts !== null ? parseFloat(r.grid_watts) : null,
      loadWatts: r.load_watts !== null ? parseFloat(r.load_watts) : null,
    }));

    const result: EnergyHistory = { period, points };
    return reply.send(result);
  });

  done();
};
