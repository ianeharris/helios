import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchRates } from '../api.js';
import type { OctopusRateResult } from '../types.js';

const recordedRates = JSON.parse(
  readFileSync(new URL('./fixtures/rates.json', import.meta.url), 'utf8'),
) as { count: number; next: string | null; results: OctopusRateResult[] };

describe('fetchRates', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('parses the recorded tariff response and requests the requested page size', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(recordedRates), { status: 200 }));

    const rates = await fetchRates('test-product', 'test-tariff', 50);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.octopus.energy/v1/products/test-product/electricity-tariffs/test-tariff/standard-unit-rates/?page_size=50',
      { headers: {} },
    );
    expect(rates).toHaveLength(3);
    expect(rates[0]).toMatchObject({ value_inc_vat: 5.2, valid_to: '2026-07-10T00:30:00Z' });
  });
});
