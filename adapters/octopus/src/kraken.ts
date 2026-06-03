import { z } from 'zod';
import type { DispatchSlot, SavingSessionEvent } from './types.js';

const KRAKEN_URL = 'https://api.octopus.energy/v1/graphql/';

async function gql<T>(
  body: Record<string, unknown>,
  schema: z.ZodType<T>,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `JWT ${token}`;
  const res = await fetch(KRAKEN_URL, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Kraken HTTP ${res.status} ${res.statusText}: ${text.slice(0, 300)}`);
  }
  const json = await res.json() as { data?: unknown; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(`Kraken GraphQL: ${json.errors.map((e) => e.message).join(', ')}`);
  return schema.parse(json.data);
}

// ── Token ─────────────────────────────────────────────────────────────────────

const KrakenTokenSchema = z.object({
  obtainKrakenToken: z.object({ token: z.string() }),
});

export async function obtainKrakenToken(apiKey: string): Promise<string> {
  const data = await gql(
    { query: `mutation { obtainKrakenToken(input: { APIKey: "${apiKey}" }) { token } }` },
    KrakenTokenSchema,
  );
  return data.obtainKrakenToken.token;
}

// ── Devices ───────────────────────────────────────────────────────────────────

const DevicesSchema = z.object({
  devices: z.array(z.object({ id: z.string(), name: z.string().nullable() })),
});

export async function fetchDeviceIds(token: string, accountNumber: string): Promise<string[]> {
  const data = await gql(
    { query: `{ devices(accountNumber: "${accountNumber}") { id name } }` },
    DevicesSchema,
    token,
  );
  return data.devices.map((d) => d.id);
}

// ── Dispatch schedule ─────────────────────────────────────────────────────────

const FlexDispatchSchema = z.object({
  flexPlannedDispatches: z.array(
    z.object({
      start: z.string(),
      end: z.string(),
      type: z.string().nullable().optional(),
      energyAddedKwh: z.string().nullable().optional(),
    }),
  ),
});

export async function fetchDispatchSchedule(
  token: string,
  deviceId: string,
): Promise<DispatchSlot[]> {
  const query = `{
    flexPlannedDispatches(deviceId: "${deviceId}") {
      start end type energyAddedKwh
    }
  }`;
  const data = await gql({ query }, FlexDispatchSchema, token);
  return data.flexPlannedDispatches.map((d) => ({
    start_utc: d.start,
    end_utc: d.end,
    delta_kwh: parseFloat(d.energyAddedKwh ?? '0') || 0,
    source: d.type ?? 'smart-flex',
  }));
}

// ── Saving sessions (Customer Flexibility Campaign Events) ────────────────────

const CampaignEventsSchema = z.object({
  customerFlexibilityCampaignEvents: z.object({
    edges: z.array(
      z.object({
        node: z.object({
          name: z.string(),
          code: z.string(),
          startAt: z.string(),
          endAt: z.string(),
          isEventParticipant: z.boolean(),
        }),
      }),
    ),
  }),
});

const SAVING_SESSIONS_SLUG = 'saving-sessions';

export async function fetchSavingSessions(
  token: string,
  accountNumber: string,
  mpan: string,
): Promise<{ events: SavingSessionEvent[] }> {
  const query = `{
    customerFlexibilityCampaignEvents(
      accountNumber: "${accountNumber}"
      supplyPointIdentifier: "${mpan}"
      campaignSlug: "${SAVING_SESSIONS_SLUG}"
      first: 20
    ) {
      edges {
        node { name code startAt endAt isEventParticipant }
      }
    }
  }`;
  const data = await gql({ query }, CampaignEventsSchema, token);
  const events: SavingSessionEvent[] = data.customerFlexibilityCampaignEvents.edges.map((e) => ({
    id: e.node.code,
    name: e.node.name,
    start_at: e.node.startAt,
    end_at: e.node.endAt,
    joined: e.node.isEventParticipant,
  }));
  return { events };
}
