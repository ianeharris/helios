import { createHash } from 'node:crypto';
import { DeviceListResultSchema, RealDataResultSchema, foxResponse } from './types.js';
import type { z } from 'zod';

const BASE_URL = 'https://openapi.fox-ess.com';

const REAL_TIME_VARIABLES = [
  'pvPower',
  'batSoc',
  'batPower',
  'gridConsumptionPower',
  'feedinPower',
  'loadsPower',
];

function sign(apiKey: string, timestamp: string, path: string): string {
  return createHash('md5')
    .update(`${apiKey}\r\n${timestamp}\r\n${path}`)
    .digest('hex');
}

async function foxRequest<T>(
  apiKey: string,
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  const timestamp = Date.now().toString();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      token: apiKey,
      timestamp,
      signature: sign(apiKey, timestamp, path),
      lang: 'en',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Fox ESS HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const json: unknown = await res.json();
  const wrapper = foxResponse(schema).parse(json);
  if (wrapper.errno !== 0) {
    throw new Error(`Fox ESS API error ${wrapper.errno}: ${wrapper.msg ?? 'unknown'}`);
  }
  if (wrapper.result === undefined) throw new Error('Fox ESS response missing result');
  return wrapper.result;
}

export async function fetchDeviceSN(apiKey: string): Promise<string> {
  const result = await foxRequest(
    apiKey,
    '/op/v0/device/list',
    { pageSize: 10, currentPage: 1 },
    DeviceListResultSchema,
  );
  const device = result.data[0];
  if (!device) throw new Error('No Fox ESS devices found on this account');
  return device.deviceSN;
}

export interface RealTimeData {
  pvPower: number;
  batSoc: number;
  batPower: number;
  gridConsumptionPower: number;
  feedinPower: number;
  loadsPower: number;
}

export async function fetchRealTime(apiKey: string, deviceSN: string): Promise<RealTimeData> {
  const result = await foxRequest(
    apiKey,
    '/op/v0/device/real/query',
    { sn: deviceSN, variables: REAL_TIME_VARIABLES },
    RealDataResultSchema,
  );

  const byVar: Record<string, number> = {};
  for (const d of result.datas) {
    const val = typeof d.value === 'number' ? d.value : parseFloat(String(d.value ?? '0'));
    byVar[d.variable] = isNaN(val) ? 0 : val;
  }

  return {
    pvPower: byVar['pvPower'] ?? 0,
    batSoc: byVar['batSoc'] ?? 0,
    batPower: byVar['batPower'] ?? 0,
    gridConsumptionPower: byVar['gridConsumptionPower'] ?? 0,
    feedinPower: byVar['feedinPower'] ?? 0,
    loadsPower: byVar['loadsPower'] ?? 0,
  };
}
