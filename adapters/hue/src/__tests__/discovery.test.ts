import { describe, expect, it } from 'vitest';
import type { Answer } from 'dns-packet';
import { candidateAddressesForBridge, parseHueAdvertisements } from '../discovery.js';

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
});
