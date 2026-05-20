#!/usr/bin/env bash
# Nightly Postgres dump to NAS SMB share.
# Schedule via launchd on the Mac mini (see infra/launchd/helios-backup.plist).
#
# Target: smb://192.168.86.4/helios/db-backup
# Retention: 30 days

set -euo pipefail

NAS_MOUNT="/Volumes/helios-backup"
NAS_SHARE="//192.168.86.4/helios"
BACKUP_DIR="$NAS_MOUNT/db-backup"
RETAIN_DAYS=30
TIMESTAMP=$(date +%Y%m%dT%H%M%S)
DUMP_FILE="$BACKUP_DIR/helios-$TIMESTAMP.dump"

# Mount the NAS share if not already mounted
if ! mount | grep -q "$NAS_MOUNT"; then
  mkdir -p "$NAS_MOUNT"
  # Credentials come from macOS Keychain (set once manually):
  #   security add-internet-password -a helios -s 192.168.86.4 -w <password>
  mount_smbfs "$NAS_SHARE" "$NAS_MOUNT"
fi

mkdir -p "$BACKUP_DIR"

# Dump from the running db container using pg_dump
/usr/local/bin/docker exec helios-db-1 \
  pg_dump \
    --username helios \
    --format custom \
    --compress 9 \
    helios > "$DUMP_FILE"

echo "Backup written: $DUMP_FILE ($(du -sh "$DUMP_FILE" | cut -f1))"

# Prune backups older than RETAIN_DAYS
find "$BACKUP_DIR" -name "helios-*.dump" -mtime +"$RETAIN_DAYS" -delete
echo "Pruned backups older than ${RETAIN_DAYS} days."
