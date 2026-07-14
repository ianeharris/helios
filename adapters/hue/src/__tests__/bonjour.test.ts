import { describe, expect, it } from 'vitest';
import { parseBonjourBrowse, parseBonjourLookup } from '../bonjour.js';

describe('macOS Bonjour discovery', () => {
  it('extracts Hue service names from the system browser output', () => {
    expect(parseBonjourBrowse([
      '14:01:15.016  Add        3   6 local.               _hue._tcp.           Hue Bridge - 2CA569',
      '14:01:15.016  Add        2   6 local.               _hue._tcp.           Hue Bridge - BE1854',
    ].join('\n'))).toEqual(['Hue Bridge - 2CA569', 'Hue Bridge - BE1854']);
  });

  it('extracts the bridge identity and Bonjour hostname from a lookup', () => {
    expect(parseBonjourLookup([
      'Hue\\032Bridge\\032-\\0322CA569._hue._tcp.local. can be reached at ecb5fa2ca569.local.:443 (interface 6)',
      ' bridgeid=ecb5fafffe2ca569 modelid=BSB002',
    ].join('\n'))).toEqual({
      id: 'ECB5FAFFFE2CA569',
      address: 'ecb5fa2ca569.local',
    });
  });
});
