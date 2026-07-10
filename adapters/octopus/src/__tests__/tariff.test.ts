import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildState, detectTransition } from '../tariff.js';
import type { OctopusRateResult } from '../types.js';

const recordedRates = JSON.parse(
  readFileSync(new URL('./fixtures/rates.json', import.meta.url), 'utf8'),
) as { results: OctopusRateResult[] };

describe('tariff state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T00:15:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the active recorded rate and classifies all upcoming slots', () => {
    const state = buildState(recordedRates.results, 12);

    expect(state).toMatchObject({
      currentType: 'cheap',
      currentRatePenceIncVat: 5.2,
      validTo: '2026-07-10T00:30:00Z',
      exportRatePenceIncVat: 12,
    });
    expect(state.slots.map((slot) => slot.type)).toEqual(['cheap', 'standard', 'cheap']);
  });

  it('emits a transition only when the tariff class changes', () => {
    const cheap = buildState(recordedRates.results, 12);
    vi.setSystemTime(new Date('2026-07-10T00:45:00Z'));
    const standard = buildState(recordedRates.results, 12);

    expect(detectTransition(cheap, standard)).toMatchObject({
      from_rate: 'cheap',
      to_rate: 'standard',
      rate_p_per_kwh: 26.36,
    });
    expect(detectTransition(standard, standard)).toBeNull();
  });
});
