#!/usr/bin/env bash
# =============================================================================
# SignFlow one-command installer for a fresh Ubuntu 22.04 / 24.04 server.
#
#   sudo bash deploy/install-ubuntu.sh --domain sign.example.com --email you@example.com
#   add  --private [--allowed-domains yourcompany.com]  to run it for your own organisation only
#
# Run it from the unzipped signflow folder. Safe to run again: it upgrades the app
# in place and keeps your data, .env and keys.
#
# What it does:
#   - installs Docker Engine + Compose from Docker's official apt repository
#   - turns on the firewall (SSH, HTTP, HTTPS only) and automatic security updates
#   - copies the app to /opt/signflow and creates /opt/signflow/.env with a new MASTER_KEY
#   - starts SignFlow behind Caddy (automatic HTTPS) and waits until it is healthy
#   - schedules a daily backup at 02:30 server time, kept for 14 days
# =============================================================================
set -euo pipefail

DOMAIN=""; EMAIL=""; DIR="/opt/signflow"; SKIP_FIREWALL=0; PRIVATE=0; DOMAINS=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --dir) DIR="$2"; shift 2 ;;
    --no-firewall) SKIP_FIREWALL=1; shift ;;
    --private) PRIVATE=1; shift ;;
    --allowed-domains) DOMAINS="$2"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33mWARNING: %s\033[0m\n' "$*"; }
die() { printf '\033[1;31mERROR: %s\033[0m\n' "$*"; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root: sudo bash $0 ..."
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ -f "$SRC/package.json" && -f "$SRC/src/server.js" ]] || die "Run this from inside the unzipped signflow folder."
. /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || warn "This script is tested on Ubuntu; you are on ${PRETTY_NAME:-unknown}."

if [[ -z "$DOMAIN" ]]; then read -rp "Domain for SignFlow (e.g. sign.example.com): " DOMAIN; fi
if [[ -z "$EMAIL" ]]; then read -rp "Email for HTTPS certificate notices: " EMAIL; fi
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "That doesn't look like a domain name: $DOMAIN"

say "Checking DNS for $DOMAIN"
PUBLIC_IP="$(curl -fsS --max-time 5 https://api.ipify.org || true)"
DNS_IP="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)"
if [[ -n "$PUBLIC_IP" && "$DNS_IP" != "$PUBLIC_IP" ]]; then
  warn "$DOMAIN resolves to '${DNS_IP:-nothing}', but this server's public IP is $PUBLIC_IP."
  warn "HTTPS will fail until the DNS A record points here. Continuing anyway."
else echo "OK: $DOMAIN -> ${DNS_IP:-?}"; fi

say "Installing system updates and Docker"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg rsync openssl ufw unattended-upgrades
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true

if [[ $SKIP_FIREWALL -eq 0 ]]; then
  say "Configuring firewall (SSH, HTTP, HTTPS)"
  ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 443/udp >/dev/null
  ufw --force enable >/dev/null && ufw status | head -n 8
fi

say "Copying SignFlow to $DIR"
mkdir -p "$DIR"
rsync -a --delete --exclude '.env' --exclude 'backups/' --exclude 'data/' --exclude 'node_modules/' "$SRC/" "$DIR/"
mkdir -p "$DIR/backups" && chown 1000:1000 "$DIR/backups" && chmod 700 "$DIR/backups"

if [[ ! -f "$DIR/.env" ]]; then
  say "Creating $DIR/.env"
  KEY="$(openssl rand -base64 32)"
  sed -e "s|^DOMAIN=.*|DOMAIN=$DOMAIN|" -e "s|^ACME_EMAIL=.*|ACME_EMAIL=$EMAIL|" -e "s|^APP_URL=.*|APP_URL=https://$DOMAIN|" \
      -e "s|^MASTER_KEY=.*|MASTER_KEY=$KEY|" -e "s|^COOKIE_SECURE=.*|COOKIE_SECURE=1|" "$DIR/.env.example" > "$DIR/.env"
  if [[ $PRIVATE -eq 1 ]]; then sed -i -e "s|^PRIVATE_MODE=.*|PRIVATE_MODE=1|" "$DIR/.env"; fi
  if [[ -n "$DOMAINS" ]]; then sed -i -e "s|^ALLOWED_EMAIL_DOMAINS=.*|ALLOWED_EMAIL_DOMAINS=$DOMAINS|" "$DIR/.env"; fi
  chmod 600 "$DIR/.env"
  NEW_KEY=1
else
  echo "Keeping existing $DIR/.env"
  grep -q '^MASTER_KEY=.\+' "$DIR/.env" || warn "MASTER_KEY is empty in .env: a key file inside the data volume will be used. Back it up."
  NEW_KEY=0
fi

say "Building and starting SignFlow (first build takes a few minutes)"
cd "$DIR"
if docker compose ps --status running 2>/dev/null | grep -q signflow; then
  docker compose exec -T signflow node scripts/backup.js >/dev/null 2>&1 && echo "Backup taken before upgrade." || true
fi
docker compose up -d --build --remove-orphans

printf 'Waiting for the app to become healthy'
for _ in $(seq 1 60); do
  st="$(docker inspect -f '{{.State.Health.Status}}' signflow 2>/dev/null || true)"
  [[ "$st" == "healthy" ]] && break; printf '.'; sleep 3
done; echo
[[ "$(docker inspect -f '{{.State.Health.Status}}' signflow)" == "healthy" ]] || { docker compose logs --tail 50 signflow; die "SignFlow did not become healthy."; }

say "Scheduling daily backups (02:30)"
cat > /etc/cron.d/signflow-backup <<CRON
# SignFlow daily backup (keeps BACKUP_KEEP_DAYS days in $DIR/backups). Copy these off the server too.
30 2 * * * root cd $DIR && /usr/bin/docker compose exec -T signflow node scripts/backup.js >> /var/log/signflow-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/signflow-backup

say "Done"
cat <<MSG
  SignFlow is running at:  https://$DOMAIN
  App sign-in:             https://$DOMAIN/app
  The FIRST account you create becomes the platform owner. Create it now, before anyone else can.

  Useful commands (run in $DIR):
    docker compose logs -f signflow                 live logs
    docker compose exec signflow node scripts/admin.js stats
    docker compose exec signflow node scripts/backup.js
    sudo bash deploy/install-ubuntu.sh --domain $DOMAIN --email $EMAIL   upgrade after replacing the files
MSG
if [[ $NEW_KEY -eq 1 ]]; then
  printf '\n\033[1;33mIMPORTANT: copy your encryption key into a password manager now:\033[0m\n  %s\n' "$(grep '^MASTER_KEY=' "$DIR/.env" | cut -d= -f2-)"
  echo "  Without it, documents in backups cannot be decrypted. It is stored in $DIR/.env (readable by root only)."
fi
