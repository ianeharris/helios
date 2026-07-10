import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDeviceSN, fetchRealTime, signRequest } from '../api.js';

const deviceListFixture: unknown = JSON.parse(
  readFileSync(new URL('./fixtures/device-list.json', import.meta.url), 'utf8'),
);
const realTimeFixture: unknown = JSON.parse(
  readFileSync(new URL('./fixtures/real-time.json', import.meta.url), 'utf8'),
);

describe('Fox ESS API contract', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('uses the documented literal separator sequence when signing requests', () => {
    expect(signRequest('test-token', '1720000000000', '/op/v0/device/real/query'))
      .toBe('70774c03e50f7e574357e10cc64a2d02');
  });

  it('parses a recorded device list response', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(deviceListFixture), { status: 200 }));

    await expect(fetchDeviceSN('test-token')).resolves.toBe('H1-TEST-001');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.foxesscloud.com/op/v0/device/list',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('normalises a recorded real-time response using the import/export sign convention', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(realTimeFixture), { status: 200 }));

    await expect(fetchRealTime('test-token', 'H1-TEST-001')).resolves.toEqual({
      pvPower: 3.42,
      batSoc: 71,
      batPower: 0.6000000000000001,
      gridConsumptionPower: 1.1,
      feedinPower: 0.3,
      loadsPower: 3.2,
    });
  });
});
