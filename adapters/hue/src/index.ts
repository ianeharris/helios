/**
 * Helios Hue adapter.
 *
 * Connects to the Hue Bridge v2 API and publishes device state changes to the
 * internal MQTT bus. Supports both polling (v1 bridge) and EventStream push
 * events (v2 square bridge). The bridge generation is detected at startup via
 * the /api/config endpoint; if the clip/v2 path is unavailable we fall back to
 * polling every 5 seconds.
 *
 * Environment variables:
 *   HUE_BRIDGE_IP   - LAN IP of the bridge (required)
 *   HUE_APP_KEY     - Hue application key (required, generated once via link button)
 *   MQTT_URL        - Internal broker (default: mqtt://mosquitto:1883)
 */

// Phase 1 implementation lives here. Stub only for Phase 0.
console.log('[hue] adapter stub - Phase 1 implementation pending');
