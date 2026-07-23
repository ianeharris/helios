import { describe, expect, it, vi } from 'vitest';
import type { Answer } from 'dns-packet';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { candidateAddressesForBridge, discoverHueBridgesWithRetries, parseHueAdvertisements, resolveBridges } from '../discovery.js';
import type { HueBridgeAdvertisement } from '../bonjour.js';

describe('parseHueAdvertisements', () => {
  it('uses the Hue bridgeid TXT record rather than the service label', () => {
    const records: Answer[] = [
      {
        name: 'Hue Bridge - 2CA569._hue._tcp.local',
        type: 'TXT',
        data: ['bridgeid=ecb5fafffe2ca569', 'modelid=BSB002'],
      },
      {
        name: 'Hue Bridge - 2CA569._hue._tcp.local',
        type: 'SRV',
        data: { target: 'ecb5fa2ca569.local', port: 443, priority: 0, weight: 0 },
      },
      { name: 'ecb5fa2ca569.local', type: 'A', data: '192.168.86.199' },
      { name: 'ecb5fa2ca569.local', type: 'AAAA', data: 'fe80::eeb5:faff:fe2c:a569' },
    ];

    expect(parseHueAdvertisements(records)).toEqual([
      { id: 'ECB5FAFFFE2CA569', address: '192.168.86.199' },
    ]);
  });

  it('keeps the mDNS hostname when no address record is included', () => {
    const records: Answer[] = [
      {
        name: 'Hue Bridge - BE1854._hue._tcp.local',
        type: 'TXT',
        data: ['bridgeid=ecb5fafffebe1854'],
      },
      {
        name: 'Hue Bridge - BE1854._hue._tcp.local',
        type: 'SRV',
        data: { target: 'ecb5fabe1854.local', port: 443, priority: 0, weight: 0 },
      },
    ];

    expect(parseHueAdvertisements(records)).toEqual([
      { id: 'ECB5FAFFFEBE1854', address: 'ecb5fabe1854.local' },
    ]);
  });

  it('falls back to a configured address when container mDNS returns nothing', () => {
    expect(
      candidateAddressesForBridge(
        {
          id: 'ECB5FAFFFE2CA569',
          name: 'Bradgate',
          appKey: 'test-key',
          address: '192.168.86.199',
        },
        [],
        {},
      ),
    ).toEqual(['192.168.86.199']);
  });

  it('prefers discovered and cached addresses before configured fallback', () => {
    expect(
      candidateAddressesForBridge(
        {
          id: 'ECB5FAFFFE2CA569',
          name: 'Bradgate',
          appKey: 'test-key',
          address: '192.168.86.199',
        },
        [{ id: 'ecb5fafffe2ca569', address: '192.168.86.200' }],
        { ECB5FAFFFE2CA569: '192.168.86.201' },
      ),
    ).toEqual(['192.168.86.200', '192.168.86.201', '192.168.86.199']);
  });

  it('retries Bonjour discovery until every configured bridge is present', async (): Promise<void> => {
    const discover = vi.fn<(timeoutMs: number) => Promise<HueBridgeAdvertisement[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'ECB5FAFFFE2CA569', address: 'ecb5fa2ca569.local' }]);
    const delay = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined);

    await expect(discoverHueBridgesWithRetries(1, 3, ['ECB5FAFFFE2CA569'], 1, discover, delay)).resolves.toEqual([
      { id: 'ECB5FAFFFE2CA569', address: 'ecb5fa2ca569.local' },
    ]);
    expect(discover).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledOnce();
  });

  it('retries bridge probes before failing a resolved address', async (): Promise<void> => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'helios-hue-discovery-'));
    const probe = vi.fn<(address: string, appKey: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('connect EHOSTUNREACH'))
      .mockResolvedValueOnce(undefined);
    const delay = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined);

    await expect(resolveBridges(
      [{ id: 'ECB5FAFFFE2CA569', name: 'Bradgate', appKey: 'test-key', address: '192.168.86.199' }],
      1,
      join(cacheDir, 'bridges.json'),
      2,
      1,
      probe,
      delay,
    )).resolves.toEqual([
      { id: 'ECB5FAFFFE2CA569', name: 'Bradgate', appKey: 'test-key', address: '192.168.86.199' },
    ]);

    expect(probe).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledOnce();
  });

  it('resolves both configured Bradgate bridges independently', async (): Promise<void> => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'helios-hue-discovery-'));
    const probe = vi.fn<(address: string, appKey: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('connect EHOSTUNREACH'))
      .mockResolvedValue(undefined);
    const delay = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined);

    await expect(resolveBridges(
      [
        { id: 'ECB5FAFFFE2CA569', name: 'Bradgate', appKey: 'primary-key', address: '192.168.86.199' },
        { id: 'ECB5FAFFFEBE1854', name: 'Bradgate 2', appKey: 'secondary-key', address: '192.168.86.248' },
      ],
      1,
      join(cacheDir, 'bridges.json'),
      2,
      1,
      probe,
      delay,
    )).resolves.toEqual([
      { id: 'ECB5FAFFFE2CA569', name: 'Bradgate', appKey: 'primary-key', address: '192.168.86.199' },
      { id: 'ECB5FAFFFEBE1854', name: 'Bradgate 2', appKey: 'secondary-key', address: '192.168.86.248' },
    ]);

    expect(probe).toHaveBeenCalledWith('192.168.86.199', 'primary-key');
    expect(probe).toHaveBeenCalledWith('192.168.86.248', 'secondary-key');
  });
});
