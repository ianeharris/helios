/**
 * Single-bridge state manager.
 *
 * On startup:
 *   1. Fetch full snapshot of lights, rooms, grouped_lights and scenes via REST.
 *   2. Publish everything to MQTT.
 *   3. Open SSE connection for push updates.
 *
 * On SSE event: apply delta to in-memory state, publish only the changed resource.
 */

import { fetchLights, fetchRooms, fetchGroupedLights, fetchScenes, fetchZones } from './api.js';
import type { AdapterDiscoveryMessage } from '@helios/shared';
import { HueSseConnection } from './sse.js';
import type {
  BridgeConfig,
  HueLightResource,
  HueRoomResource,
  HueAreaResource,
  HueGroupedLightResource,
  HueSceneResource,
  HueZoneResource,
  HueStreamEvent,
  HueLightState,
  HueRoomState,
} from './types.js';

const topic = (bridgeId: string, kind: string, id: string): string =>
  `helios/hue/${bridgeId}/${kind}/${id}`;

const registryTopic = (bridgeId: string): string =>
  `helios/registry/hue/${bridgeId}/discovery`;

const roomId = (bridgeId: string, id: string): string =>
  `hue/${bridgeId}/room/${id}`;

const zoneId = (bridgeId: string, id: string): string =>
  `hue/${bridgeId}/zone/${id}`;

const lightId = (bridgeId: string, id: string): string =>
  `hue/${bridgeId}/light/${id}`;

const sceneId = (bridgeId: string, id: string): string =>
  `hue/${bridgeId}/scene/${id}`;

const lightToState = (bridge: BridgeConfig, r: HueLightResource): HueLightState => ({
  bridgeId: bridge.id,
  resourceId: r.id,
  name: r.metadata.name,
  on: r.on.on,
  ...(r.dimming !== undefined && { brightness: r.dimming.brightness }),
  ...(r.color_temperature?.mirek_valid && r.color_temperature.mirek !== null
    ? { colorTemp: r.color_temperature.mirek }
    : {}),
  ...(r.color?.xy !== undefined && { xy: r.color.xy }),
  reachable: true,
});

const groupedLightToState = (
  bridge: BridgeConfig,
  gl: HueGroupedLightResource,
  area: HueAreaResource | undefined,
): HueRoomState => ({
  bridgeId: bridge.id,
  resourceId: gl.id,
  name: area?.metadata.name ?? gl.id,
  anyOn: gl.on.on,
  allOn: gl.on.on,
  ...(gl.dimming !== undefined && { brightness: gl.dimming.brightness }),
});

type StatePublisher = (topic: string, payload: unknown) => Promise<void>;

export class BridgeManager {
  private lights = new Map<string, HueLightResource>();
  private rooms = new Map<string, HueRoomResource>();
  private zones = new Map<string, HueZoneResource>();
  private groupedLights = new Map<string, HueGroupedLightResource>();
  private scenes = new Map<string, HueSceneResource>();
  private sse: HueSseConnection;

  constructor(
    private readonly bridge: BridgeConfig,
    private readonly publishState: StatePublisher,
    private readonly sseTimeoutMs: number,
    private readonly reconnectDelayMs: number,
  ) {
    this.sse = new HueSseConnection(bridge, this.handleSseEvents.bind(this), sseTimeoutMs, reconnectDelayMs);
  }

  async start(): Promise<void> {
    console.log(`[hue/${this.bridge.name}] fetching initial state`);
    const [lights, rooms, zones, groupedLights, scenes] = await Promise.all([
      fetchLights(this.bridge),
      fetchRooms(this.bridge),
      fetchZones(this.bridge),
      fetchGroupedLights(this.bridge),
      fetchScenes(this.bridge),
    ]);

    for (const l of lights) this.lights.set(l.id, l);
    for (const r of rooms) this.rooms.set(r.id, r);
    for (const z of zones) this.zones.set(z.id, z);
    for (const g of groupedLights) this.groupedLights.set(g.id, g);
    for (const s of scenes) this.scenes.set(s.id, s);

    console.log(
      `[hue/${this.bridge.name}] snapshot: ${lights.length} lights, ${rooms.length} rooms, ${zones.length} zones, ${scenes.length} scenes`,
    );

    await this.publishDiscovery();
    await this.publishAll();
    this.sse.start();
  }

  stop(): void {
    this.sse.stop();
  }

  private async publish(t: string, payload: unknown): Promise<void> {
    await this.publishState(t, payload);
  }

  private async publishAll(): Promise<void> {
    for (const [id, light] of this.lights) {
      await this.publish(topic(this.bridge.id, 'light', id), lightToState(this.bridge, light));
    }
    for (const [id, gl] of this.groupedLights) {
      const area = this.areaForGroupedLight(id);
      await this.publish(topic(this.bridge.id, 'room', id), groupedLightToState(this.bridge, gl, area));
    }
    for (const [id, scene] of this.scenes) {
      await this.publish(topic(this.bridge.id, 'scene', id), {
        bridgeId: this.bridge.id,
        resourceId: id,
        name: scene.metadata.name,
        groupId: scene.group.rid,
      });
    }
  }

  private async publishDiscovery(): Promise<void> {
    const discovery: AdapterDiscoveryMessage = {
      adapter: 'hue',
      discoveredAt: new Date().toISOString(),
      rooms: this.areas().map((area) => ({
        id: this.areaId(area),
        name: area.metadata.name,
        icon: area.metadata.archetype,
        rawState: this.areaDiscoveryState(area),
      })),
      devices: [...this.lights.values()].map((light) => ({
        id: lightId(this.bridge.id, light.id),
        vendor: 'hue',
        kind: 'light',
        name: light.metadata.name,
        roomId: this.areaIdsForDevice(light.owner.rid)[0] ?? null,
        reachable: true,
        tags: ['lighting'],
        rawState: {
          ...(lightToState(this.bridge, light) as unknown as Record<string, unknown>),
          areaIds: this.areaIdsForDevice(light.owner.rid),
        },
      })),
      scenes: [...this.scenes.values()].map((scene) => ({
        id: sceneId(this.bridge.id, scene.id),
        name: scene.metadata.name,
        roomId: this.roomIdForSceneGroup(scene.group),
        definition: [{
          topic: `helios/hue/${this.bridge.id}/scene/${scene.id}/recall`,
          payload: {},
        }],
      })),
    };

    await this.publish(registryTopic(this.bridge.id), discovery);
  }

  private areas(): HueAreaResource[] {
    return [...this.rooms.values(), ...this.zones.values()];
  }

  private areaId(area: HueAreaResource): string {
    return area.type === 'room' ? roomId(this.bridge.id, area.id) : zoneId(this.bridge.id, area.id);
  }

  private areaIdsForDevice(deviceId: string): string[] {
    return this.areas()
      .filter((area) => area.children.some((child) => child.rid === deviceId && child.rtype === 'device'))
      .map((area) => this.areaId(area));
  }

  private areaForGroupedLight(groupedLightId: string): HueAreaResource | undefined {
    return this.areas().find((candidate) =>
      candidate.services.some((service) => service.rid === groupedLightId && service.rtype === 'grouped_light'),
    );
  }

  private areaDiscoveryState(area: HueAreaResource): Record<string, unknown> {
    const groupedLightId = area.services.find((service) => service.rtype === 'grouped_light')?.rid;
    const groupedLight = groupedLightId ? this.groupedLights.get(groupedLightId) : undefined;
    return {
      bridgeId: this.bridge.id,
      resourceId: area.id,
      groupedLightId,
      areaType: area.type,
      archetype: area.metadata.archetype,
      ...(groupedLight ? groupedLightToState(this.bridge, groupedLight, area) : {}),
    };
  }

  private roomIdForSceneGroup(group: HueSceneResource['group']): string | null {
    if (group.rtype === 'room' && this.rooms.has(group.rid)) return roomId(this.bridge.id, group.rid);
    if (group.rtype === 'zone' && this.zones.has(group.rid)) return zoneId(this.bridge.id, group.rid);

    const area = this.areaForGroupedLight(group.rid);
    return area ? this.areaId(area) : null;
  }

  private handleSseEvents(events: HueStreamEvent[], _bridgeId: string): void {
    for (const event of events) {
      if (event.type !== 'update') continue;
      for (const delta of event.data) {
        if (delta.type === 'light') {
          const existing = this.lights.get(delta.id);
          if (!existing) continue;

          // Merge delta into in-memory resource
          if (delta.on !== undefined) existing.on = delta.on;
          if (delta.dimming !== undefined && existing.dimming) {
            existing.dimming.brightness = delta.dimming.brightness;
          }
          if (delta.color_temperature !== undefined && existing.color_temperature) {
            existing.color_temperature.mirek = delta.color_temperature.mirek;
            existing.color_temperature.mirek_valid = delta.color_temperature.mirek_valid;
          }
          if (delta.color?.xy !== undefined && existing.color) {
            existing.color.xy = delta.color.xy;
          }

          void this.publish(topic(this.bridge.id, 'light', delta.id), lightToState(this.bridge, existing)).catch((err) =>
            console.error(`[hue/${this.bridge.name}] light publish error:`, err),
          );
        } else if (delta.type === 'grouped_light') {
          const existing = this.groupedLights.get(delta.id);
          if (!existing) continue;
          if (delta.on !== undefined) existing.on = delta.on;
          if (delta.dimming !== undefined && existing.dimming) {
            existing.dimming.brightness = delta.dimming.brightness;
          }
          const area = this.areaForGroupedLight(delta.id);
          void this.publish(topic(this.bridge.id, 'room', delta.id), groupedLightToState(this.bridge, existing, area)).catch((err) =>
            console.error(`[hue/${this.bridge.name}] room publish error:`, err),
          );
        }
      }
    }
  }
}
