import type { TariffSlot, TariffState, TariffTransitionEvent, OctopusRateResult } from './types.js';

const CHEAP_THRESHOLD_PENCE = parseFloat(process.env['OCTOPUS_CHEAP_THRESHOLD_PENCE'] ?? '15');

export function classifySlot(ratePence: number): 'cheap' | 'standard' {
  return ratePence < CHEAP_THRESHOLD_PENCE ? 'cheap' : 'standard';
}

function toSlots(rates: OctopusRateResult[]): TariffSlot[] {
  return rates.map((r) => ({
    start: r.valid_from,
    end: r.valid_to,
    type: classifySlot(r.value_inc_vat),
    ratePenceIncVat: Math.round(r.value_inc_vat * 100) / 100,
  }));
}

export function buildState(importRates: OctopusRateResult[], exportRatePence: number): TariffState {
  const now = Date.now();
  const horizon = now + 48 * 60 * 60 * 1000;

  const active = importRates.find((r) => {
    const from = new Date(r.valid_from).getTime();
    const to = r.valid_to ? new Date(r.valid_to).getTime() : Infinity;
    return from <= now && now < to;
  });

  const currentRate = active?.value_inc_vat ?? importRates[0]?.value_inc_vat ?? 0;

  const upcomingSlots = importRates
    .filter((r) => {
      const to = r.valid_to ? new Date(r.valid_to).getTime() : Infinity;
      const from = new Date(r.valid_from).getTime();
      return to > now && from < horizon;
    })
    .sort((a, b) => new Date(a.valid_from).getTime() - new Date(b.valid_from).getTime());

  return {
    currentType: classifySlot(currentRate),
    currentRatePenceIncVat: Math.round(currentRate * 100) / 100,
    validTo: active?.valid_to ?? null,
    exportRatePenceIncVat: Math.round(exportRatePence * 100) / 100,
    slots: toSlots(upcomingSlots),
    updatedAt: new Date().toISOString(),
  };
}

export function detectTransition(
  prev: TariffState | null,
  next: TariffState,
): Omit<TariffTransitionEvent, 'dispatched'> | null {
  if (!prev || prev.currentType === next.currentType) return null;
  return {
    from_rate: prev.currentType,
    to_rate: next.currentType,
    slot_end_utc: next.validTo,
    rate_p_per_kwh: next.currentRatePenceIncVat,
    timestamp: new Date().toISOString(),
  };
}
