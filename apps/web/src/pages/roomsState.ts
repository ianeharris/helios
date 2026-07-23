export type RoomDevice = {
  id: string;
  vendor: string;
  kind: string;
  name: string;
  roomId: string | null;
  reachable: boolean;
  role: string | null;
  tags: string[];
  rawState: Record<string, unknown> | null;
  updatedAt: string;
};

export type RoomRecord = {
  id: string;
  name: string;
  floor: number | null;
  icon: string | null;
  rawState: Record<string, unknown> | null;
};

export type HueLightState = {
  on?: boolean;
  brightness?: number;
  reachable?: boolean;
};

export type HueRoomState = {
  anyOn?: boolean;
  allOn?: boolean;
  brightness?: number;
};

const hueLightTopic = /^helios\/(hue\/[^/]+\/light\/[^/]+)$/;
const hueRoomTopic = /^helios\/hue\/([^/]+)\/room\/([^/]+)$/;

export const applyHueLightState = (
  devices: RoomDevice[],
  topic: string,
  payload: unknown,
  updatedAt: string,
): RoomDevice[] => {
  const match = hueLightTopic.exec(topic);
  if (!match || !isHueLightState(payload)) return devices;

  const id = match[1];
  return devices.map((device) => {
    if (device.id !== id) return device;
    return {
      ...device,
      reachable: payload.reachable ?? device.reachable,
      rawState: { ...(device.rawState ?? {}), ...payload },
      updatedAt,
    };
  });
};

export const applyLightCommandState = (
  devices: RoomDevice[],
  id: string,
  command: HueLightState,
): RoomDevice[] =>
  devices.map((device) => {
    if (device.id !== id) return device;
    return {
      ...device,
      rawState: { ...(device.rawState ?? {}), ...command },
      updatedAt: new Date().toISOString(),
    };
  });

export const applyHueRoomState = (
  rooms: RoomRecord[],
  topic: string,
  payload: unknown,
): RoomRecord[] => {
  const match = hueRoomTopic.exec(topic);
  if (!match || !isHueRoomState(payload)) return rooms;

  const [, bridgeId, groupedLightId] = match;
  return rooms.map((room) => {
    const rawState = room.rawState ?? {};
    if (rawState['bridgeId'] !== bridgeId || rawState['groupedLightId'] !== groupedLightId) return room;
    return { ...room, rawState: { ...rawState, ...payload } };
  });
};

export const applyRoomCommandState = (
  rooms: RoomRecord[],
  id: string,
  command: { on?: boolean; brightness?: number },
): RoomRecord[] =>
  rooms.map((room) => {
    if (room.id !== id) return room;
    const rawState = room.rawState ?? {};
    return {
      ...room,
      rawState: {
        ...rawState,
        ...command,
        ...(command.on === undefined ? {} : { anyOn: command.on, allOn: command.on }),
      },
    };
  });

const isHueLightState = (value: unknown): value is HueLightState =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isHueRoomState = (value: unknown): value is HueRoomState =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
