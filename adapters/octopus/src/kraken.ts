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
  if (!res.ok) throw new Error(`Kraken HTTP ${res.status} ${res.statusText}`);
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

// ── Dispatch schedule ─────────────────────────────────────────────────────────

const PlannedDispatchSchema = z.object({
  plannedDispatches: z.array(
    z.object({
      startDt: z.string(),
      endDt: z.string(),
      deltaKwh: z.number().nullable().optional(),
      meta: z
        .object({
          source: z.string().optional(),
          location: z.string().optional(),
        })
        .optional(),
    }),
  ),
});

export async function fetchDispatchSchedule(
  token: string,
  accountNumber: string,
): Promise<DispatchSlot[]> {
  const query = `{
    plannedDispatches(accountNumber: "${accountNumber}") {
      startDt endDt deltaKwh meta { source location }
    }
  }`;
  const data = await gql({ query }, PlannedDispatchSchema, token);
  return data.plannedDispatches.map((d) => ({
    start_utc: d.startDt,
    end_utc: d.endDt,
    delta_kwh: d.deltaKwh ?? 0,
    source: d.meta?.source ?? 'octopus',
  }));
}

// ── Saving sessions ───────────────────────────────────────────────────────────

const SavingSessionsSchema = z.object({
  savingSessions: z.object({
    hasJoinedCampaign: z.boolean().optional(),
    events: z.array(
      z.object({
        id: z.string(),
        startAt: z.string(),
        endAt: z.string(),
        durationInMinutes: z.number(),
        rewardPerKwhInOctoPoints: z.number().optional(),
      }),
    ),
    joinedEvents: z
      .array(z.object({ eventId: z.string().optional(), id: z.string().optional() }))
      .optional(),
  }),
});

export async function fetchSavingSessions(
  token: string,
  accountNumber: string,
): Promise<{ events: SavingSessionEvent[] }> {
  const query = `{
    savingSessions(accountNumber: "${accountNumber}") {
      hasJoinedCampaign
      events { id startAt endAt durationInMinutes rewardPerKwhInOctoPoints }
      joinedEvents { eventId }
    }
  }`;
  const data = await gql({ query }, SavingSessionsSchema, token);
  const joined = new Set(
    (data.savingSessions.joinedEvents ?? []).map((e) => e.eventId ?? e.id ?? ''),
  );
  const events: SavingSessionEvent[] = data.savingSessions.events.map((e) => ({
    id: e.id,
    start_at: e.startAt,
    end_at: e.endAt,
    duration_minutes: e.durationInMinutes,
    reward_octopoints_per_kwh: e.rewardPerKwhInOctoPoints ?? 0,
    joined: joined.has(e.id),
  }));
  return { events };
}
