#!/bin/zsh
set -euo pipefail

readonly HELIOS_ROOT="/Users/ian/Solar"
readonly NODE_BIN="/opt/homebrew/opt/node@22/bin/node"
readonly ENV_FILE="$HELIOS_ROOT/infra/compose/.env"

if [[ ! -x "$NODE_BIN" ]]; then
  print -u2 "[hue] Node 22 is required at $NODE_BIN"
  exit 1
fi

if [[ ! -r "$ENV_FILE" ]]; then
  print -u2 "[hue] missing deployment environment file: $ENV_FILE"
  exit 1
fi

# Read only the broker password required by this process. Never evaluate the
# decrypted deployment file as shell code.
mqtt_password="$(/usr/bin/sed -n 's/^MQTT_PASSWORD_HUE=//p' "$ENV_FILE")"
if [[ -z "$mqtt_password" ]]; then
  print -u2 "[hue] MQTT_PASSWORD_HUE is missing from $ENV_FILE"
  exit 1
fi

export MQTT_URL="mqtt://hue:${mqtt_password}@127.0.0.1:1883"
unset mqtt_password

exec "$NODE_BIN" "$HELIOS_ROOT/adapters/hue/dist/index.js"
