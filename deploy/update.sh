#!/usr/bin/env bash
# Upgrade SignFlow in place: back up, rebuild, restart, check health.
#   cd /opt/signflow && sudo bash deploy/update.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
echo "==> Backing up"; docker compose exec -T signflow node scripts/backup.js
echo "==> Rebuilding"; docker compose up -d --build --remove-orphans
for _ in $(seq 1 60); do [[ "$(docker inspect -f '{{.State.Health.Status}}' signflow)" == healthy ]] && { echo "==> Healthy"; exit 0; }; sleep 3; done
docker compose logs --tail 80 signflow; echo "SignFlow is not healthy. Restore with: docker compose exec signflow node scripts/restore.js /backups/<file>" >&2; exit 1
