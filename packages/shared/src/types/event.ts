import type { VendorId } from './device.js';

export type EventKind =
  | 'device_state_changed'
  | 'alarm_triggered'
  | 'alarm_armed'
  | 'alarm_disarmed'
  | 'motion_detected'
  | 'energy_reading'
  | 'registry_discovery'
  | 'adapter_error'
  | 'adapter_reconnected';

export interface HeliosEvent {
  id: string;
  vendor: VendorId;
  kind: EventKind;
  deviceId: string | null;
  payload: Record<string, unknown>;
  occurredAt: Date;
}
