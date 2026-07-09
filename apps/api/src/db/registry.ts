import { getDb } from './client.js';
import type { AdapterDiscoveryMessage } from '@helios/shared';

export const upsertDiscovery = async (discovery: AdapterDiscoveryMessage): Promise<void> => {
  const db = getDb();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    for (const room of discovery.rooms ?? []) {
      await client.query(
        `INSERT INTO rooms (id, name, floor, icon)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           floor = EXCLUDED.floor,
           icon = EXCLUDED.icon`,
        [room.id, room.name, room.floor ?? null, room.icon ?? null],
      );
    }

    for (const device of discovery.devices ?? []) {
      await client.query(
        `INSERT INTO devices (id, vendor, kind, name, room_id, reachable, raw_state, role, tags, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, now())
         ON CONFLICT (id) DO UPDATE SET
           vendor = EXCLUDED.vendor,
           kind = EXCLUDED.kind,
           name = EXCLUDED.name,
           room_id = EXCLUDED.room_id,
           reachable = EXCLUDED.reachable,
           raw_state = EXCLUDED.raw_state,
           role = COALESCE(devices.role, EXCLUDED.role),
           tags = CASE WHEN array_length(devices.tags, 1) IS NULL THEN EXCLUDED.tags ELSE devices.tags END,
           updated_at = now()`,
        [
          device.id,
          device.vendor,
          device.kind,
          device.name,
          device.roomId ?? null,
          device.reachable ?? true,
          JSON.stringify(device.rawState ?? {}),
          device.role ?? null,
          device.tags ?? [],
        ],
      );
    }

    for (const scene of discovery.scenes ?? []) {
      await client.query(
        `INSERT INTO scenes (id, name, room_id, icon, definition)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           room_id = EXCLUDED.room_id,
           icon = EXCLUDED.icon,
           definition = EXCLUDED.definition`,
        [
          scene.id,
          scene.name,
          scene.roomId ?? null,
          scene.icon ?? null,
          JSON.stringify(scene.definition ?? []),
        ],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
