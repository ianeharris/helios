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

import { fetchLights, fetchRooms, fetchGroupedLights, fetchScenes } from './api.js';
import { HueSseConnection } from './sse.js';
import type {
  BridgeConfig,
  HueLightResource,
  HueRoomResource,
  HueGroupedLightResource,
  HueSceneResource,
  HueStreamEvent,
  HueLightState,
  HueRoomState,
} from './types.js';

const topic = (bridgeId: string, kind: string, id: string): string =>
  `helios/hue/${bridgeId}/${kind}/${id}`;

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
  room: HueRoomResource | undefined,
): HueRoomState => ({
  bridgeId: bridge.id,
  resourceId: gl.id,
  name: room?.metadata.name ?? gl.id,
  anyOn: gl.on.on,
  allOn: gl.on.on,
  ...(gl.dimming !== undefined && { brightness: gl.dimming.brightness }),
});

type StatePublisher = (topic: string, payload: unknown) => Promise<void>;

export class BridgeManager {
  private lights = new Map<string, HueLightResource>();
  private rooms = new Map<string, HueRoomResource>();
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
    const [lights, rooms, groupedLights, scenes] = await Promise.all([
      fetchLights(this.bridge),
      fetchRooms(this.bridge),
      fetchGroupedLights(this.bridge),
      fetchScenes(this.bridge),
    ]);

    for (const l of lights) this.lights.set(l.id, l);
    for (const r of rooms) this.rooms.set(r.id, r);
    for (const g of groupedLights) this.groupedLights.set(g.id, g);
    for (const s of scenes) this.scenes.set(s.id, s);

    console.log(
      `[hue/${this.bridge.name}] snapshot: ${lights.length} lights, ${rooms.length} rooms, ${scenes.length} scenes`,
    );

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
      const room = [...this.rooms.values()].find((r) =>
        r.services.some((s) => s.rid === id && s.rtype === 'grouped_light'),
      );
      await this.publish(topic(this.bridge.id, 'room', id), groupedLightToState(this.bridge, gl, room));
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
          const room = [...this.rooms.values()].find((r) =>
            r.services.some((s) => s.rid === delta.id && s.rtype === 'grouped_light'),
          );
          void this.publish(topic(this.bridge.id, 'room', delta.id), groupedLightToState(this.bridge, existing, room)).catch((err) =>
            console.error(`[hue/${this.bridge.name}] room publish error:`, err),
          );
        }
      }
    }
  }
}
