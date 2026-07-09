import type { DeviceKind, VendorId } from './device.js';

export interface AdapterRoomDiscovery {
  id: string;
  name: string;
  floor?: number | null;
  icon?: string | null;
  rawState?: Record<string, unknown>;
}

export interface AdapterDeviceDiscovery {
  id: string;
  vendor: VendorId;
  kind: DeviceKind;
  name: string;
  roomId?: string | null;
  reachable?: boolean;
  role?: string | null;
  tags?: string[];
  rawState?: Record<string, unknown>;
}

export interface AdapterSceneDiscovery {
  id: string;
  name: string;
  roomId?: string | null;
  icon?: string | null;
  definition?: Array<Record<string, unknown>>;
}

export interface AdapterDiscoveryMessage {
  adapter: VendorId;
  discoveredAt: string;
  rooms?: AdapterRoomDiscovery[];
  devices?: AdapterDeviceDiscovery[];
  scenes?: AdapterSceneDiscovery[];
}
