# Deploying SignFlow on your own cloud

This guide takes you from an empty cloud account to a live, paid SignFlow service on your own domain. Plan on about an hour, most of it waiting for DNS and email approval.

**Contents**

1. [What you are deploying](#1-what-you-are-deploying)
2. [Choose a cloud and server size](#2-choose-a-cloud-and-server-size)
3. [Create the server](#3-create-the-server)
4. [Point your domain at it](#4-point-your-domain-at-it)
5. [Install SignFlow (one command)](#5-install-signflow-one-command)
6. [First sign-in and set-up](#6-first-sign-in-and-set-up)
7. [Email delivery](#7-email-delivery)
8. [Taking payments](#8-taking-payments)
9. [Backups and restore](#9-backups-and-restore)
10. [Upgrades](#10-upgrades)
11. [Monitoring and logs](#11-monitoring-and-logs)
12. [Security hardening checklist](#12-security-hardening-checklist)
13. [Go-live checklist for selling](#13-go-live-checklist-for-selling)
14. [Scaling](#14-scaling)
15. [Other ways to run it](#15-other-ways-to-run-it)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. What you are deploying

```
 Customers / signers ──HTTPS──▶  Caddy (ports 80/443)  ──▶  SignFlow app (Node.js, port 3000, internal only)
                                 automatic certificates          │
                                                                 ├── /data/signflow.db   SQLite database
                                                                 ├── /data/files/        encrypted PDFs
                                                                 └── /data/keys/         seal certificate (+ key file if no MASTER_KEY)
                                                       /opt/signflow/backups/  daily backup archives
```

* One server, two containers (`docker-compose.yml`): **Caddy** terminates HTTPS and gets/renews Let's Encrypt certificates automatically. **SignFlow** runs as a non-root user on a read-only file system, with only `/data` and `/backups` writable.
* Everything (public website, customer app, signing pages, payments webhooks, platform admin) is served from one domain, for example `sign.yourcompany.com`.
* Outbound connections the server needs: your SMTP provider, Razorpay/Stripe APIs, and Docker Hub / npm during installs and upgrades.

## 2. Choose a cloud and server size

Any provider that gives you an Ubuntu virtual machine with a public IP works. For customers in India, pick an Indian region so documents stay in the country:

| Provider | Indian regions | Good starting option |
|---|---|---|
| AWS | Mumbai (`ap-south-1`), Hyderabad (`ap-south-2`) | Lightsail instance or EC2 `t3.small`/`t4g.small`, gp3 disk |
| Microsoft Azure | Central India (Pune), South India (Chennai), West India (Mumbai) | B-series VM (B2s) |
| Google Cloud | Mumbai (`asia-south1`), Delhi (`asia-south2`) | `e2-small` or `e2-medium` |
| DigitalOcean | Bangalore (`BLR1`) | Basic Droplet, 2 GB RAM |
| Others (Hetzner, Linode/Akamai, OVH, Vultr) | Mostly Singapore/Europe; Akamai and Vultr have Indian locations | 2 vCPU / 2–4 GB |

**Size:** start with **2 vCPU, 2–4 GB RAM, 40 GB SSD**. That comfortably serves hundreds of workspaces and thousands of documents a month. PDFs are typically 0.1–2 MB each, so watch disk use and grow it when it passes 70%.

**OS:** Ubuntu Server **24.04 LTS** (22.04 also works).

Turn on the provider's **disk encryption** (on by default on most clouds) and **automatic snapshots** if offered; they complement SignFlow's own backups.

## 3. Create the server

1. Create the VM with Ubuntu 24.04, your chosen size and region.
2. Add your **SSH key** during creation (don't use password login).
3. In the provider's firewall / security group, allow inbound **22** (ideally only from your own IP), **80** and **443**. Block everything else.
4. Reserve a **static / elastic IP** and attach it, so the address doesn't change when the VM restarts.
5. Connect: `ssh ubuntu@YOUR_SERVER_IP`.

## 4. Point your domain at it

In your domain's DNS (GoDaddy, Cloudflare, Route 53, etc.) create:

| Type | Name | Value |
|---|---|---|
| A | `sign` (or `@` for the bare domain) | your server's static IP |
| A (optional) | `www.sign` | same IP (it redirects to the main name) |

Wait until `nslookup sign.yourcompany.com` returns your server's IP. If you use **Cloudflare**, set the record to **DNS only (grey cloud)** at first so certificates can be issued. If you later turn on the orange-cloud proxy, set `TRUST_PROXY=2` in `.env` so signer IP addresses in the audit trail stay correct.

## 5. Install SignFlow (one command)

Copy the release zip to the server and run the installer:

```bash
# from your computer
scp signflow.zip ubuntu@YOUR_SERVER_IP:~

# on the server
sudo apt-get update && sudo apt-get install -y unzip
unzip signflow.zip && cd signflow
sudo bash deploy/install-ubuntu.sh --domain sign.yourcompany.com --email you@yourcompany.com
```

The installer:

* installs Docker from Docker's official repository, turns on the `ufw` firewall (SSH, HTTP, HTTPS) and automatic security updates;
* copies the app to **`/opt/signflow`** and creates **`/opt/signflow/.env`** with a freshly generated **`MASTER_KEY`**;
* builds and starts SignFlow behind Caddy, waits until the health check passes, and gets your HTTPS certificate;
* schedules a **daily backup at 02:30** (kept 14 days) in `/opt/signflow/backups`.

> **Save the `MASTER_KEY` it prints in your password manager now.** It encrypts every document. Without it, neither the server nor any backup can be decrypted, and nobody (including us) can recover it.

**Running it only for your own organisation?** Add `--private --allowed-domains yourcompany.com`. This hides the public website and pricing, closes sign-up (invitation only) and limits accounts to your email domain. See *Private platform* in README.md. You can also switch it on later in **Platform → Private access**.

Prefer to do it by hand? It's three steps: install Docker, `cp .env.example .env` and fill in `DOMAIN`, `ACME_EMAIL`, `APP_URL` and `MASTER_KEY` (`openssl rand -base64 32`), then `docker compose up -d --build`.

## 6. First sign-in and set-up

1. Open `https://sign.yourcompany.com/app` **immediately** and create your account. **The first account becomes the platform owner.**
2. **Settings → My account:** turn on two-factor login.
3. **Settings → Branding & themes:** set your product name and theme. It appears on the website, emails, signing pages and certificates.
4. **Settings → Email delivery:** set the public URL (`https://sign.yourcompany.com`) and SMTP (next section), then send a test email.
5. **Platform → Plans & pricing:** set your plan names, INR/USD prices and limits.
6. **Platform → Payments & tax:** your legal entity name, GSTIN, address, invoice prefix and SAC code, GST rate, trial length. Then connect Razorpay/Stripe (section 8) and turn **test mode off**.
7. **Platform → Website & enquiries:** contact email, phone, WhatsApp, address. Review the Terms and Privacy drafts.
8. **Settings → Platform security:** check that encryption, the seal and the audit trail all show green.
9. Visit `https://sign.yourcompany.com` and click through the public website as a customer would.

## 7. Email delivery

Signing links, reminders, one-time codes, invoices and enquiry alerts are sent by email, so reliable delivery matters.

| Provider | Host | Port | Notes |
|---|---|---|---|
| Amazon SES (Mumbai) | `email-smtp.ap-south-1.amazonaws.com` | 587 | Verify your domain, create SMTP credentials, and request production access (new accounts start in a sandbox that only sends to verified addresses). |
| Zoho Mail (India) | `smtp.zoho.in` | 587 | Use an app-specific password. Suited to modest volume. |
| Google Workspace | `smtp.gmail.com` | 587 | App password needed; daily sending limits apply. |
| Postmark, Mailgun, SendGrid, Brevo | see provider | 587 | Transactional providers with good deliverability. |

Set these in **Settings → Email delivery** or in `.env` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`).

Add **SPF**, **DKIM** and **DMARC** DNS records for your sending domain as your provider instructs; without them signing emails often land in spam. Until SMTP works, every email is still recorded in **Settings → Outbox**, where you can copy signing links.

## 8. Taking payments

**Razorpay (INR: UPI, cards, net banking)**

1. Complete Razorpay account activation (KYC) for your business.
2. Dashboard → *Account & Settings → API Keys*: generate **live** keys.
3. Dashboard → *Webhooks*: add `https://sign.yourcompany.com/api/billing/webhooks/razorpay` with events **payment.captured** and **order.paid**, and set a webhook secret.
4. In SignFlow **Platform → Payments & tax**, enter the key ID, key secret and webhook secret, and switch test mode **off**.
5. Buy the cheapest plan yourself with a real card/UPI and check that the invoice appears and the plan activates. Refund it from Razorpay afterwards.

**Stripe (USD / international cards)**

1. Activate your Stripe account (check Stripe's current availability and rules for Indian businesses accepting international payments).
2. Add the webhook endpoint `https://sign.yourcompany.com/api/billing/webhooks/stripe` for **checkout.session.completed** and copy its signing secret.
3. Enter the secret key and webhook secret in **Platform → Payments & tax**.

Payment secrets are stored encrypted and never shown again in the browser. Webhooks are signature-verified, and stale Stripe events are rejected.

## 9. Backups and restore

**What is backed up:** a consistent snapshot of the database and the encrypted files, taken while the app runs (`scripts/backup.js`). The encryption key is **not** included by default, so a stolen backup is unreadable on its own. Keep the key in your password manager.

```bash
cd /opt/signflow
docker compose exec signflow node scripts/backup.js                  # backup now -> ./backups/
docker compose exec signflow node scripts/backup.js --include-keys   # also packs keys/ (store very safely)
ls -lh backups/
```

**Copy backups off the server.** A backup on the same disk doesn't survive losing the server. Use `deploy/offsite-backup.sh` with [rclone](https://rclone.org) to copy to S3, Cloudflare R2, Backblaze B2, Google Cloud Storage or Azure Blob:

```bash
sudo apt-get install -y rclone && rclone config                       # create a remote called "offsite"
echo '0 3 * * * root bash /opt/signflow/deploy/offsite-backup.sh offsite:your-bucket/signflow >> /var/log/signflow-backup.log 2>&1' | sudo tee -a /etc/cron.d/signflow-backup
```

Turn on versioning or object lock on the bucket so backups can't be silently deleted.

**Restore** (to the same server or a new one with the same `.env`):

```bash
cd /opt/signflow
docker compose stop signflow
docker compose run --rm --no-deps signflow node scripts/restore.js /backups/signflow-YYYYMMDD-HHMMSS.tar.gz --yes
docker compose start signflow
```

The previous data is moved aside, not deleted. **Practise a restore on a spare server once before you go live**, and again every few months.

## 10. Upgrades

When you receive a new SignFlow release:

```bash
scp signflow.zip ubuntu@YOUR_SERVER_IP:~
ssh ubuntu@YOUR_SERVER_IP
unzip -o signflow.zip && cd signflow
sudo bash deploy/install-ubuntu.sh --domain sign.yourcompany.com --email you@yourcompany.com
```

The installer takes a backup, keeps your `.env`, data and backups, rebuilds and restarts, and waits for the health check. Database changes are applied automatically at start-up. To rebuild only the current code (for example after editing a template), run `sudo bash deploy/update.sh` in `/opt/signflow`.

## 11. Monitoring and logs

* **Health check:** `https://sign.yourcompany.com/healthz` returns `{"ok":true}`. Add it to a free uptime monitor (UptimeRobot, Better Stack, Uptime Kuma) to get an alert if it goes down.
* **Logs:** `cd /opt/signflow && docker compose logs -f signflow` (app) and `docker compose logs -f caddy` (HTTPS/proxy). Logs rotate automatically (5 × 10 MB per container).
* **Status:** `docker compose ps` shows whether containers are healthy. `docker compose exec signflow node scripts/admin.js stats` shows users, workspaces, documents and database size.
* **Disk:** `df -h /` and `du -sh /var/lib/docker/volumes/signflow_signflow-data`.
* **Business view:** Platform → Overview (MRR, paying customers, trials, revenue).

## 12. Security hardening checklist

Server

- [ ] SSH with keys only. In `/etc/ssh/sshd_config` set `PasswordAuthentication no`, then `sudo systemctl restart ssh`.
- [ ] Port 22 limited to your IP in the cloud firewall. Ports 80/443 open, everything else closed.
- [ ] Automatic security updates on (the installer does this). Reboot monthly for kernel updates: `sudo reboot`.
- [ ] Cloud disk encryption and snapshots on.

Application

- [ ] `MASTER_KEY` set in `.env` and saved in a password manager. `.env` is readable by root only (`chmod 600`).
- [ ] `COOKIE_SECURE=1` and `APP_URL` is your `https://` address.
- [ ] Your own account has two-factor login. **Users & access → Security policy** requires 2FA for owners and admins.
- [ ] "Allow anyone to create an account" is on only if you sell self-serve; otherwise off. For internal use, turn on **Platform → Private access** (private mode, allowed email domains, optional office/VPN IP list).
- [ ] Payment test mode off, live keys entered, webhooks verified with a real test payment.
- [ ] Optional: a CA-issued **document-signing certificate** (`SEAL_P12_PATH`). Without one, Adobe shows "signature valid, issuer unknown"; with one from an Adobe AATL-listed provider it shows as trusted.

Data

- [ ] Daily backups running (`ls /opt/signflow/backups`), off-site copy configured, restore tested once.
- [ ] Recovery tools known: `docker compose exec signflow node scripts/admin.js` (reset a password, turn off 2FA, unlock, clear an IP allowlist).

## 13. Go-live checklist for selling

This is a practical list, not legal or tax advice. Confirm the details with your chartered accountant and a lawyer.

- [ ] A business entity (proprietorship, LLP or private limited) and a bank account in its name.
- [ ] GST registration if required for your turnover or for selling to businesses; seller GSTIN and SAC code entered in Platform → Payments & tax.
- [ ] Razorpay (and/or Stripe) activated in your business's name, with live keys.
- [ ] Terms of service and privacy policy reviewed by a lawyer and published (Platform → Website & enquiries). The privacy policy should reflect India's Digital Personal Data Protection Act, 2023 and the countries you sell to, and name a contact for data requests and grievances.
- [ ] A support email that you actually read, shown on the website.
- [ ] Pricing, trial length and plan limits final in Platform → Plans & pricing.
- [ ] The compliance rules in `src/compliance/rules.js` reviewed for the countries you sell into.
- [ ] A short internal runbook: who restores backups, who rotates keys, who answers security reports.

## 14. Scaling

SignFlow uses **SQLite** on local disk: simple, fast, and safe with the online backups above. One server handles a large business:

* **Grow vertically first.** More vCPU/RAM and a bigger disk handle most growth. Moving to a 4 vCPU / 8 GB server is a 10-minute job: snapshot, resize, start.
* **Run one instance.** Don't run two SignFlow containers against the same data volume.
* **Signs you need the next step:** sustained CPU over 70%, tens of thousands of documents a month, or a requirement for zero-downtime failover. At that point the usual path is moving the database to PostgreSQL and files to object storage (S3/R2) behind several app instances. That is a development project, not a configuration change.
* **Separate servers per enterprise customer** (private deployments) are easy: install the same package on their server or cloud account with their own domain and keys.

## 15. Other ways to run it

**Without Docker (systemd + nginx).** Install Node.js 22, copy the code to `/opt/signflow`, `npm ci --omit=dev`, then use `deploy/signflow.service` (hardened systemd unit) and `deploy/nginx.conf` with certbot for HTTPS. Instructions are at the top of each file.

**Managed container platforms** (AWS App Runner/ECS, Azure Container Apps, Google Cloud Run). These work only with a **persistent volume** mounted at `/data`, a single instance, and an always-on (not scale-to-zero) setting. SQLite must not live on network file shares (NFS/SMB/EFS/Azure Files). A plain VM is simpler and cheaper for this app.

**Kubernetes.** Possible as a single-replica StatefulSet with a ReadWriteOnce volume at `/data`, the same environment variables and `/healthz` as the probe. Not needed until you are much larger.

## 16. Troubleshooting

| Problem | Fix |
|---|---|
| Browser shows a certificate error | DNS doesn't point at the server yet, or ports 80/443 are blocked. Check `docker compose logs caddy`. Certificates are issued automatically once the domain resolves. |
| `ACME_EMAIL` / `DOMAIN` error on start | Fill both in `/opt/signflow/.env`. |
| App container keeps restarting | `docker compose logs signflow`. An invalid `MASTER_KEY` (must be 32 bytes, base64) is the usual cause. |
| Emails not arriving | Settings → Email delivery → *Send test email*, then Settings → Outbox for the error. Check SPF/DKIM, and SES sandbox status. |
| Payment succeeded but plan not active | Check the webhook URL and secret in Razorpay/Stripe, and the webhook delivery log on their dashboard. |
| Locked out (lost phone, forgotten password, IP allowlist) | `docker compose exec signflow node scripts/admin.js disable-2fa you@x.com`, `reset-password`, `unlock` or `clear-ip-allowlist`. |
| Signer IP shows as a private address | You added a proxy/CDN in front of Caddy: set `TRUST_PROXY` to the number of proxies (Cloudflare + Caddy = `2`) and restart. |
| "Documents cannot be decrypted" after a move | Restore the original `MASTER_KEY` in `.env` (or `keys/master.key` in the data volume). |
