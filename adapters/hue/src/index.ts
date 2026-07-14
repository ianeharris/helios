/**
 * Helios Hue adapter - Phase 1 implementation.
 *
 * Connects to all configured Hue Bridge v2 units simultaneously using the
 * CLIP API v2. Publishes device state to the internal MQTT bus on topics:
 *
 *   helios/hue/<bridgeId>/light/<resourceId>   - HueLightState (retained)
 *   helios/hue/<bridgeId>/room/<resourceId>    - HueRoomState (retained)
 *   helios/hue/<bridgeId>/scene/<resourceId>   - scene metadata (retained)
 *
 * Subscribes to command topics:
 *
 *   helios/hue/<bridgeId>/light/<resourceId>/set  - { on?, brightness?, colorTemp? }
 *   helios/hue/<bridgeId>/scene/<resourceId>/recall
 *
 * Environment:
 *   HUE_BRIDGES   JSON array of {id, name}; addresses come from local mDNS
 *   MQTT_URL      Internal broker (default: mqtt://mosquitto:1883)
 *
 * Secrets (Docker secrets):
 *   hue_app_key_<name_lowercased_nospaces>  - one per bridge
 */

import { connect } from '@helios/adapter-sdk';
import { loadConfig } from './config.js';
import { resolveBridges } from './discovery.js';
import { BridgeManager } from './bridge.js';
import { setLightState, recallScene } from './api.js';

const run = async (): Promise<void> => {
  const config = loadConfig();
  const runtime = await connect('hue', { mqttUrl: config.mqttUrl });
  const bridges = await resolveBridges(
    config.bridges,
    config.discoveryTimeoutMs,
    config.discoveryCachePath,
    config.discoveryAttempts,
  );

  for (const bridge of bridges) {
    await runtime.mqtt.subscribeAsync([
      `helios/hue/${bridge.id}/light/+/set`,
      `helios/hue/${bridge.id}/scene/+/recall`,
    ]);
  }

  runtime.mqtt.on('message', (topic, payload) => {
    const parts = topic.split('/');
    // helios / hue / <bridgeId> / <kind> / <resourceId> / <command>
    if (parts.length < 6) return;
    const [, , bridgeId, kind, resourceId, command] = parts;

    const bridge = bridges.find((b) => b.id === bridgeId);
    if (!bridge || !resourceId) return;

    if (kind === 'light' && command === 'set') {
      try {
        const state = JSON.parse(payload.toString()) as {
          on?: boolean;
          brightness?: number;
          colorTemp?: number;
        };
        void setLightState(bridge, resourceId, state).catch((err) => {
          runtime.markError();
          console.error(`[hue/${bridge.name}] setLightState error:`, err);
        });
      } catch {
        runtime.markError();
        console.error('[hue] invalid JSON in light set command');
      }
    } else if (kind === 'scene' && command === 'recall') {
      void recallScene(bridge, resourceId).catch((err) => {
        runtime.markError();
        console.error(`[hue/${bridge.name}] recallScene error:`, err);
      });
    }
  });

  const managers = bridges.map(
    (bridge) =>
      new BridgeManager(bridge, runtime.publishState, config.sseTimeoutMs, config.reconnectDelayMs),
  );

  await Promise.all(managers.map((m) => m.start()));
  console.log(`[hue] all ${managers.length} bridge(s) running`);

  runtime.onShutdown(() => {
    managers.forEach((m) => m.stop());
  });
};

run().catch((err) => {
  console.error('[hue] fatal:', err);
  process.exit(1);
});
