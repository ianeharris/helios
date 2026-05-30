import type { OctopusRateResult, OctopusRatesResponse } from './types.js';

const BASE = 'https://api.octopus.energy/v1';

async function fetchRates(product: string, tariff: string, pageSize = 20): Promise<OctopusRateResult[]> {
  const url = `${BASE}/products/${product}/electricity-tariffs/${tariff}/standard-unit-rates/?page_size=${pageSize}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Octopus API ${res.status} for ${url}`);
  const body = (await res.json()) as OctopusRatesResponse;
  return body.results;
}

export async function fetchImportRates(product: string, tariff: string): Promise<OctopusRateResult[]> {
  // page_size=20 covers ~10 days of Intelligent Go slots (2 slots/day)
  return fetchRates(product, tariff, 20);
}

export async function fetchExportRate(product: string, tariff: string): Promise<OctopusRateResult | null> {
  const results = await fetchRates(product, tariff, 1);
  return results[0] ?? null;
}
