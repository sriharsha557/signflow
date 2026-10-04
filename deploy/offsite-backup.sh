#!/usr/bin/env bash
# Copy backups off the server (run from cron after the daily backup).
# Uses rclone, which supports S3, Cloudflare R2, Backblaze B2, Google Cloud Storage, Azure Blob, Wasabi and more.
#   1. apt-get install -y rclone && rclone config      (create a remote, e.g. "offsite")
#   2. Add to /etc/cron.d/signflow-backup:
#      0 3 * * * root bash /opt/signflow/deploy/offsite-backup.sh offsite:my-bucket/signflow >> /var/log/signflow-backup.log 2>&1
set -euo pipefail
DEST="${1:?Usage: offsite-backup.sh <rclone-remote:bucket/path>}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/backups"
rclone copy "$SRC" "$DEST" --include 'signflow-*.tar.gz' --exclude '*-with-keys*' --transfers 2
echo "$(date -Is) copied backups to $DEST"
