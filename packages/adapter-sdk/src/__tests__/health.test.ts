import { describe, expect, it } from 'vitest';
import { adapterHealth } from '../index.js';

describe('adapter readiness health', () => {
  it('does not report ready merely because MQTT is connected', () => {
    expect(adapterHealth('hue', true, false)).toEqual({
      status: 'starting',
      adapter: 'hue',
      mqtt: 'ok',
      ready: false,
    });
  });

  it('reports ready only after both broker and adapter startup are complete', () => {
    expect(adapterHealth('hue', true, true)).toEqual({
      status: 'ok',
      adapter: 'hue',
      mqtt: 'ok',
      ready: true,
    });
  });

  it('reports degraded while MQTT is unavailable', () => {
    expect(adapterHealth('hue', false, true)).toMatchObject({
      status: 'degraded',
      mqtt: 'down',
    });
});
  });
