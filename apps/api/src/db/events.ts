import { randomUUID } from 'node:crypto';
import { getDb } from './client.js';
import type { EventKind, VendorId } from '@helios/shared';

type EventInput = {
  vendor: VendorId;
  kind: EventKind;
  deviceId: string | null;
  payload: unknown;
};

export const insertEvent = async ({ vendor, kind, deviceId, payload }: EventInput): Promise<void> => {
  await getDb().query(
    `INSERT INTO events (occurred_at, id, vendor, kind, device_id, payload)
     VALUES (now(), $1, $2, $3, $4, $5::jsonb)`,
    [randomUUID(), vendor, kind, deviceId, JSON.stringify(payload ?? {})],
  );
};
