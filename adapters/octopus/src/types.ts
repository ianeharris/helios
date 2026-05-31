import { z } from 'zod';

// ── Tariff state (existing, retained) ────────────────────────────────────────

export type SlotType = 'cheap' | 'standard';

export interface TariffSlot {
  start: string;
  end: string | null;
  type: SlotType;
  ratePenceIncVat: number;
}

export interface TariffState {
  currentType: SlotType;
  currentRatePenceIncVat: number;
  validTo: string | null;
  exportRatePenceIncVat: number;
  slots: TariffSlot[];
  updatedAt: string;
}

// ── Tariff transition event ───────────────────────────────────────────────────

export interface TariffTransitionEvent {
  from_rate: SlotType;
  to_rate: SlotType;
  dispatched: boolean;
  slot_end_utc: string | null;
  rate_p_per_kwh: number;
  timestamp: string;
}

// ── Dispatch schedule ─────────────────────────────────────────────────────────

export interface DispatchSlot {
  start_utc: string;
  end_utc: string;
  delta_kwh: number;
  source: string;
}

export interface DispatchScheduleMessage {
  account: string;
  fetched_at: string;
  slots: DispatchSlot[];
}

// ── Saving sessions ───────────────────────────────────────────────────────────

export interface SavingSessionEvent {
  id: string;
  start_at: string;
  end_at: string;
  duration_minutes: number;
  reward_octopoints_per_kwh: number;
  joined: boolean;
}

export interface SavingSessionMessage {
  active: boolean;
  events: SavingSessionEvent[];
  fetched_at: string;
}

// ── Consumption ───────────────────────────────────────────────────────────────

export interface ConsumptionInterval {
  start: string;
  end: string;
  kwh: number;
}

export interface ConsumptionBatch {
  mpan: string;
  type: 'import' | 'export';
  date: string;
  fetched_at: string;
  intervals: ConsumptionInterval[];
}

// ── Zod schemas for Octopus REST API responses ────────────────────────────────

export const OctopusRateResultSchema = z.object({
  value_exc_vat: z.number(),
  value_inc_vat: z.number(),
  valid_from: z.string(),
  valid_to: z.string().nullable(),
  payment_method: z.string().nullable().optional(),
});

export type OctopusRateResult = z.infer<typeof OctopusRateResultSchema>;

export const OctopusRatesResponseSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  results: z.array(OctopusRateResultSchema),
});

export const MeterSchema = z.object({
  serial_number: z.string(),
  is_export: z.boolean().optional(),
});

export const MeterPointSchema = z.object({
  mpan: z.string(),
  meters: z.array(MeterSchema),
});

export const AccountSchema = z.object({
  number: z.string(),
  properties: z.array(
    z.object({
      electricity_meter_points: z.array(MeterPointSchema),
    }),
  ),
});

export const OctopusConsumptionResultSchema = z.object({
  consumption: z.number(),
  interval_start: z.string(),
  interval_end: z.string(),
});

export const OctopusConsumptionResponseSchema = z.object({
  count: z.number(),
  results: z.array(OctopusConsumptionResultSchema),
});
