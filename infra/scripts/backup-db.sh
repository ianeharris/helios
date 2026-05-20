#!/usr/bin/env bash
# Nightly Postgres dump to NAS via SSH pipe.
# Schedule via launchd on the Mac mini (see infra/launchd/com.helios.backup.plist).
#
# Target: ian@192.168.86.4:/volume1/helios/db-backup/
# Retention: 30 days

set -euo pipefail

NAS_USER="ian"
NAS_HOST="192.168.86.4"
NAS_KEY="/Users/ian/.ssh/id_nas"
NAS_BACKUP_DIR="/volume1/helios/db-backup"
TIMESTAMP=$(date +%Y%m%dT%H%M%S)
REMOTE_FILE="$NAS_BACKUP_DIR/helios-$TIMESTAMP.dump"
RETAIN_DAYS=30

SSH="/usr/bin/ssh -i $NAS_KEY -o StrictHostKeyChecking=no -o BatchMode=yes"

# Pipe pg_dump directly to NAS over SSH - avoids SMB and temp file complexity
/usr/local/bin/docker exec helios-db-1 \
  pg_dump \
    --username helios \
    --format custom \
    --compress 9 \
    helios \
  | $SSH "$NAS_USER@$NAS_HOST" "cat > $REMOTE_FILE"

echo "Backup written: $REMOTE_FILE"

# Prune backups older than RETAIN_DAYS on the NAS
$SSH "$NAS_USER@$NAS_HOST" \
  "find $NAS_BACKUP_DIR -name 'helios-*.dump' -mtime +$RETAIN_DAYS -delete && echo 'Pruned backups older than ${RETAIN_DAYS} days.'"
