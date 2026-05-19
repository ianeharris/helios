export type VendorId = 'hue' | 'sonos' | 'hikvision' | 'foxess' | 'texecom' | 'hive';

export type DeviceKind =
  | 'light'
  | 'switch'
  | 'speaker'
  | 'camera'
  | 'alarm_zone'
  | 'alarm_panel'
  | 'thermostat'
  | 'energy_meter'
  | 'battery';

export interface Device {
  id: string;
  vendor: VendorId;
  kind: DeviceKind;
  name: string;
  roomId: string | null;
  reachable: boolean;
  updatedAt: Date;
}
