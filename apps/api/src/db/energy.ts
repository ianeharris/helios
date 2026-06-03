import { getDb } from './client.js';
import type { FoxEssLive } from '@helios/shared';

export async function insertEnergyReading(live: FoxEssLive): Promise<void> {
  const db = getDb();
  await db.query(
    `INSERT INTO energy_readings (occurred_at, pv_watts, battery_soc_pct, battery_watts, grid_watts, load_watts)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      new Date(live.updatedAt),
      live.pvPower * 1000,
      live.batSoc,
      live.batPower * 1000,
      live.gridPower * 1000,
      live.loadsPower * 1000,
    ],
  );
}
