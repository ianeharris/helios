import { describe, expect, it } from 'vitest';
import { applyHueLightState, applyHueRoomState, type RoomDevice, type RoomRecord } from './roomsState.js';

const device: RoomDevice = {
  id: 'hue/bridge-a/light/light-a',
  vendor: 'hue',
  kind: 'light',
  name: 'Office Bloom',
  roomId: 'hue/bridge-a/room/office',
  reachable: true,
  role: null,
  tags: ['lighting'],
  rawState: { bridgeId: 'bridge-a', resourceId: 'light-a', on: false },
  updatedAt: '2026-07-15T10:00:00.000Z',
};

const room: RoomRecord = {
  id: 'hue/bridge-a/room/office',
  name: 'Office',
  floor: null,
  icon: null,
  rawState: { bridgeId: 'bridge-a', resourceId: 'office', groupedLightId: 'group-a', anyOn: false },
};

describe('applyHueLightState', () => {
  it('updates the matching bridge-namespaced light from a state event', () => {
    const updated = applyHueLightState(
      [device],
      'helios/hue/bridge-a/light/light-a',
      { on: true, brightness: 65, reachable: true },
      '2026-07-15T10:01:00.000Z',
    );

    expect(updated[0]).toMatchObject({
      rawState: { bridgeId: 'bridge-a', resourceId: 'light-a', on: true, brightness: 65 },
      updatedAt: '2026-07-15T10:01:00.000Z',
    });
  });

  it('does not apply a state event from another bridge or resource', () => {
    const updated = applyHueLightState(
      [device],
      'helios/hue/bridge-b/light/light-a',
      { on: true },
      '2026-07-15T10:01:00.000Z',
    );

    expect(updated).toEqual([device]);
  });

  it('ignores commands and other non-state Hue topics', () => {
    const updated = applyHueLightState(
      [device],
      'helios/hue/bridge-a/light/light-a/set',
      { on: true },
      '2026-07-15T10:01:00.000Z',
    );

    expect(updated).toEqual([device]);
  });
});

describe('applyHueRoomState', () => {
  it('updates the area represented by the grouped-light state topic', () => {
    const updated = applyHueRoomState(
      [room],
      'helios/hue/bridge-a/room/group-a',
      { anyOn: true, allOn: true, brightness: 80 },
    );

    expect(updated[0]?.rawState).toMatchObject({ anyOn: true, allOn: true, brightness: 80 });
  });
});
