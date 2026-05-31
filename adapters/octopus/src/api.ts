import { z } from 'zod';
import {
  OctopusRatesResponseSchema,
  OctopusConsumptionResponseSchema,
  AccountSchema,
  type OctopusRateResult,
  type ConsumptionInterval,
} from './types.js';

const BASE = 'https://api.octopus.energy/v1';

function authHeaders(apiKey: string): Record<string, string> {
  const encoded = Buffer.from(`${apiKey}:`).toString('base64');
  return { Authorization: `Basic ${encoded}` };
}

async function get<T>(url: string, schema: z.ZodType<T>, apiKey?: string): Promise<T> {
  const headers = apiKey ? authHeaders(apiKey) : {};
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Octopus API ${res.status} ${res.statusText}: ${url}`);
  const body = await res.json();
  return schema.parse(body);
}

export async function fetchRates(product: string, tariff: string, pageSize = 20): Promise<OctopusRateResult[]> {
  const url = `${BASE}/products/${product}/electricity-tariffs/${tariff}/standard-unit-rates/?page_size=${pageSize}`;
  const data = await get(url, OctopusRatesResponseSchema);
  return data.results;
}

export async function fetchAccountDetails(
  apiKey: string,
  accountNumber: string,
): Promise<z.infer<typeof AccountSchema>> {
  return get(`${BASE}/accounts/${accountNumber}/`, AccountSchema, apiKey);
}

export async function fetchConsumption(
  apiKey: string,
  mpan: string,
  serial: string,
  periodFrom: string,
  periodTo: string,
): Promise<ConsumptionInterval[]> {
  const params = new URLSearchParams({
    period_from: periodFrom,
    period_to: periodTo,
    page_size: '100',
    order_by: 'period',
  });
  const url = `${BASE}/electricity-meter-points/${mpan}/meters/${serial}/consumption/?${params.toString()}`;
  const data = await get(url, OctopusConsumptionResponseSchema, apiKey);
  return data.results.map((r) => ({
    start: r.interval_start,
    end: r.interval_end,
    kwh: r.consumption,
  }));
}
