// Hue CLIP API v2 resource shapes (subset needed by Helios).
// Full schema: https://developers.meethue.com/develop/hue-api-v2/

export interface ConfiguredBridge {
  id: string;         // ECB5FAFFFE... - the bridge hardware ID
  name: string;       // Human label, e.g. "Bradgate"
  appKey: string;     // hue-application-key header value
  address?: string;   // Optional fallback for runtimes that cannot receive mDNS multicast
}

export interface BridgeConfig extends ConfiguredBridge {
  address: string;    // Discovered LAN address, e.g. 192.168.86.199
}

// ── Resource types returned by /clip/v2/resource/* ───────────────────────────

export interface HueColor {
  xy: { x: number; y: number };
  gamut_type: 'A' | 'B' | 'C';
}

export interface HueDimming {
  brightness: number;  // 0–100
  min_dim_level?: number;
}

export interface HueColorTemperature {
  mirek: number | null;          // null when light is off or out of gamut
  mirek_valid: boolean;
  mirek_schema?: { mirek_minimum: number; mirek_maximum: number };
}

export interface HueLightOn {
  on: boolean;
}

export interface HueLightResource {
  id: string;
  id_v1?: string;
  type: 'light';
  owner: { rid: string; rtype: string };
  metadata: { name: string; archetype: string };
  on: HueLightOn;
  dimming?: HueDimming;
  color_temperature?: HueColorTemperature;
  color?: HueColor;
}

export interface HueRoomResource {
  id: string;
  type: 'room';
  metadata: { name: string; archetype: string };
  children: Array<{ rid: string; rtype: string }>;
  services: Array<{ rid: string; rtype: string }>;
}

export interface HueZoneResource {
  id: string;
  type: 'zone';
  metadata: { name: string; archetype: string };
  children: Array<{ rid: string; rtype: string }>;
  services: Array<{ rid: string; rtype: string }>;
}

export type HueAreaResource = HueRoomResource | HueZoneResource;

export interface HueGroupedLightResource {
  id: string;
  type: 'grouped_light';
  owner: { rid: string; rtype: string };
  on: HueLightOn;
  dimming?: Pick<HueDimming, 'brightness'>;
}

export interface HueSceneResource {
  id: string;
  type: 'scene';
  metadata: { name: string };
  group: { rid: string; rtype: string };
}

// ── EventStream event shapes ──────────────────────────────────────────────────

export interface HueEventData {
  id: string;
  type: string;
  on?: HueLightOn;
  dimming?: Pick<HueDimming, 'brightness'>;
  color_temperature?: Pick<HueColorTemperature, 'mirek' | 'mirek_valid'>;
  color?: Pick<HueColor, 'xy'>;
}

export interface HueStreamEvent {
  creationtime: string;
  data: HueEventData[];
  id: string;
  type: 'update' | 'add' | 'delete' | 'error';
}

// ── Helios-internal MQTT payloads ─────────────────────────────────────────────

export interface HueLightState {
  bridgeId: string;
  resourceId: string;
  name: string;
  on: boolean;
  brightness?: number;  // 0–100
  colorTemp?: number;   // mirek
  xy?: { x: number; y: number };
  reachable: boolean;
}

export interface HueRoomState {
  bridgeId: string;
  resourceId: string;
  name: string;
  anyOn: boolean;
  allOn: boolean;
  brightness?: number;
}
