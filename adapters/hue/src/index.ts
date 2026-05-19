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
 *   HUE_BRIDGES   JSON array of {id, ip, name} - see config.ts
 *   MQTT_URL      Internal broker (default: mqtt://mosquitto:1883)
 *
 * Secrets (Docker secrets):
 *   hue_app_key_<name_lowercased_nospaces>  - one per bridge
 */

import mqtt from 'mqtt';
import { loadConfig } from './config.js';
import { BridgeManager } from './bridge.js';
import { setLightState, recallScene } from './api.js';

const run = async (): Promise<void> => {
  const config = loadConfig();

  console.log(`[hue] connecting to MQTT at ${config.mqttUrl}`);
  const mqttClient = await mqtt.connectAsync(config.mqttUrl, {
    clientId: `helios-adapter-hue-${process.pid}`,
    clean: true,
    reconnectPeriod: 5000,
  });
  mqttClient.on('error', (err) => console.error('[hue] MQTT error:', err));
  console.log('[hue] MQTT connected');

  // Subscribe to command topics for all bridges
  for (const bridge of config.bridges) {
    await mqttClient.subscribeAsync([
      `helios/hue/${bridge.id}/light/+/set`,
      `helios/hue/${bridge.id}/scene/+/recall`,
    ]);
  }

  mqttClient.on('message', (topic, payload) => {
    const parts = topic.split('/');
    // helios / hue / <bridgeId> / <kind> / <resourceId> / <command>
    if (parts.length < 6) return;
    const [, , bridgeId, kind, resourceId, command] = parts;

    const bridge = config.bridges.find((b) => b.id === bridgeId);
    if (!bridge) return;

    if (kind === 'light' && command === 'set') {
      try {
        const state = JSON.parse(payload.toString()) as {
          on?: boolean;
          brightness?: number;
          colorTemp?: number;
        };
        void setLightState(bridge, resourceId!, state).catch((e) =>
          console.error(`[hue/${bridge.name}] setLightState error:`, e),
        );
      } catch {
        console.error('[hue] invalid JSON in light set command');
      }
    } else if (kind === 'scene' && command === 'recall') {
      void recallScene(bridge, resourceId!).catch((e) =>
        console.error(`[hue/${bridge.name}] recallScene error:`, e),
      );
    }
  });

  // Start all bridge managers concurrently
  const managers = config.bridges.map(
    (bridge) =>
      new BridgeManager(bridge, mqttClient, config.sseTimeoutMs, config.reconnectDelayMs),
  );

  await Promise.all(managers.map((m) => m.start()));
  console.log(`[hue] all ${managers.length} bridge(s) running`);

  const shutdown = (): void => {
    console.log('[hue] shutting down');
    managers.forEach((m) => m.stop());
    void mqttClient.endAsync();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

run().catch((err) => {
  console.error('[hue] fatal:', err);
  process.exit(1);
});
