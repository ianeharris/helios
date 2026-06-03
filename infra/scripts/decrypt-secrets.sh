#!/usr/bin/env bash
# Decrypt SOPS secrets into the compose secrets/ directory before docker compose up.
# Runs on the Mac mini at deploy time. Requires age key at ~/helios/age.key

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SECRETS_DIR="$SCRIPT_DIR/../compose/secrets"
SOPS_FILE="$SCRIPT_DIR/../secrets/secrets.yaml"
AGE_KEY="${HELIOS_AGE_KEY_FILE:-$HOME/helios/age.key}"

if [[ ! -f "$AGE_KEY" ]]; then
  echo "ERROR: age key not found at $AGE_KEY" >&2
  exit 1
fi

if [[ ! -f "$SOPS_FILE" ]]; then
  echo "ERROR: encrypted secrets file not found at $SOPS_FILE" >&2
  exit 1
fi

export SOPS_AGE_KEY_FILE="$AGE_KEY"

mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

# Extract each secret into its own file (Docker secrets format)
sops --decrypt --extract '["db_password"]'             "$SOPS_FILE" > "$SECRETS_DIR/db_password.txt"
sops --decrypt --extract '["authelia_jwt_secret"]'     "$SOPS_FILE" > "$SECRETS_DIR/authelia_jwt_secret.txt"
sops --decrypt --extract '["authelia_session_secret"]' "$SOPS_FILE" > "$SECRETS_DIR/authelia_session_secret.txt"
sops --decrypt --extract '["authelia_storage_key"]'    "$SOPS_FILE" > "$SECRETS_DIR/authelia_storage_key.txt"
sops --decrypt --extract '["grafana_admin_password"]'  "$SOPS_FILE" > "$SECRETS_DIR/grafana_admin_password.txt"

# Phase 1+ adapter secrets (only extracted if present in secrets.yaml)
sops --decrypt --extract '["octopus_api_key"]' "$SOPS_FILE" > "$SECRETS_DIR/octopus_api_key.txt" 2>/dev/null || true

# MQTT credentials — generate Mosquitto password file via container
MQTT_PASSWD="$SCRIPT_DIR/../compose/mosquitto/passwd"
> "$MQTT_PASSWD"
chmod 600 "$MQTT_PASSWD"
MQTT_CMD="touch /passwd"
for user in octopus hue sonos api foxess hikvision texecom hive; do
  pass=$(sops --decrypt --extract "[\"mqtt_password_${user}\"]" "$SOPS_FILE" 2>/dev/null || true)
  if [[ -n "$pass" ]]; then
    MQTT_CMD="$MQTT_CMD && mosquitto_passwd -b /passwd $(printf '%q' "$user") $(printf '%q' "$pass")"
  fi
done
docker run --rm \
  -v "$MQTT_PASSWD:/passwd" \
  eclipse-mosquitto:2 \
  sh -c "$MQTT_CMD"

chmod 600 "$SECRETS_DIR"/*.txt

# Write .env for docker compose variable substitution
DB_PASSWORD=$(sops --decrypt --extract '["db_password"]' "$SOPS_FILE")
printf 'DB_PASSWORD=%s\n' "$DB_PASSWORD" > "$SCRIPT_DIR/../compose/.env"
chmod 600 "$SCRIPT_DIR/../compose/.env"

# Append MQTT credentials to .env for docker compose substitution
for user in octopus hue sonos api foxess hikvision texecom hive; do
  pass=$(sops --decrypt --extract "[\"mqtt_password_${user}\"]" "$SOPS_FILE" 2>/dev/null || true)
  if [[ -n "$pass" ]]; then
    printf 'MQTT_PASSWORD_%s=%s\n' "$(echo "$user" | tr '[:lower:]' '[:upper:]')" "$pass" >> "$SCRIPT_DIR/../compose/.env"
  fi
done

echo "Secrets decrypted OK."
