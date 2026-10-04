# SignFlow architecture

A technical reference for developers and auditors: how the platform is built, where everything lives, and how to extend it.

## Technology stack

| Layer | Technology | Why |
|---|---|---|
| Runtime | Node.js 22 (LTS) | One language for server, shared rules and browser code |
| Web server | Express 5 | Small, well understood, async error handling |
| Database | SQLite (better-sqlite3), WAL mode | No separate database server; fast; online backups |
| PDF processing | pdf-lib (write values, certificates, contracts), pdf.js (render in the browser) | Pure JavaScript, no native PDF tools needed |
| Digital seal | @signpdf + node-forge (PKCS#7 / PAdES-style detached signature) | Tamper-evident signed PDFs readable by Adobe and others |
| Encryption | Node `crypto`: AES-256-GCM, HMAC-SHA-256, bcrypt (cost 12) | Standard primitives, no custom crypto |
| Email | Nodemailer (any SMTP) | Works with SES, Zoho, Google, Postmark, etc. |
| Payments | Razorpay Orders API + webhooks, Stripe Checkout + webhooks | INR (UPI/cards/net banking) and USD |
| Front end | Plain ES modules, no build step | Easy to customise; nothing to compile |
| Fonts | Fontsource (OFL/Apache) | Handwriting fonts for typed signatures, served locally |
| HTTPS / proxy | Caddy 2 (automatic Let's Encrypt) | Zero-maintenance certificates |
| Packaging | Docker (multi-stage, non-root, read-only root FS), Docker Compose | Same build on any cloud |

## High-level design

```
                        ┌──────────────────────────── one server ─────────────────────────────┐
 Browser ──HTTPS──▶ Caddy :443 ──▶ Express app :3000                                            │
   │                               ├─ Public website (server-rendered)  src/site/                │
   │                               ├─ Customer app (SPA, /app)          public/js/*.js           │
   │                               ├─ Signing pages (/sign/:token)      public/sign.html, sign.js│
   │                               ├─ Verify page (/verify)             public/verify.html       │
   │                               ├─ REST API (/api/*)                 src/server.js            │
   │                               │    ├─ auth, 2FA, sessions, RBAC    src/security/access.js   │
   │                               │    ├─ compliance & risk engine     src/compliance/rules.js  │
   │                               │    ├─ PDF finalise + certificate   src/pdf.js               │
   │                               │    ├─ seal                         src/security/seal.js     │
   │                               │    ├─ encryption at rest           src/security/vault.js    │
   │                               │    ├─ plans, limits, invoices      src/saas/billing.js      │
   │                               │    └─ email                        src/mail.js              │
   │                               └─ SQLite + encrypted files          /data                    │
 Razorpay / Stripe ──webhooks──▶ /api/billing/webhooks/*                                          │
 App ──SMTP──▶ your email provider                                                                │
                        └───────────────────────────────────────────────────────────────────────┘
```

The same `src/compliance/rules.js`, `src/templates-library.js` and `src/site/site.js` files run on the server and in the browser (UMD modules), so the risk score, templates and website look identical everywhere.

## Directory layout

```
src/
  server.js                 Express app: routes, auth middleware, signing workflow, admin APIs
  db.js                     Schema and migrations, settings (secrets encrypted), email templates, audit chain
  pdf.js                    Fill values, stamp footer, build certificate of completion, build contract PDFs
  mail.js                   Email rendering (branded HTML) and SMTP delivery, outbox log
  builtin-templates.js      Installs/upgrades the 19 built-in templates
  templates-library.js      Template definitions (text, variables, signer roles)        [shared with browser]
  compliance/rules.js       30 jurisdictions, signature levels, risk scoring            [shared with browser]
  security/vault.js         AES-256-GCM file/field encryption, HMAC, key management
  security/seal.js          PDF sealing with a PKCS#12 certificate (self-signed or CA-issued)
  security/access.js        Roles, permissions, TOTP 2FA, password rules, IP allowlist, security events
  security/http.js          Security headers (CSP, HSTS, frame-ancestors), rate limiting
  saas/billing.js           Workspaces, plans, usage limits, checkout, webhooks, GST invoices
  site/site.js              Public website pages                                        [shared with prototype]
  site/routes.js            Website routes, sitemap/robots, enquiries, website settings
public/
  app.html, js/app.js       Customer app shell and router
  js/editor.js              Drag-and-drop field editor
  js/sign.js, sign.html     Signer experience
  js/access-ui.js           Users & access, 2FA, sessions
  js/saas.js                Billing, platform owner console, website settings
  js/compliance-ui.js       Compliance pages and risk calculator
  css/app.css, css/site.css Styles and themes
scripts/                    backup.js, restore.js, admin.js (recovery CLI)
deploy/                     Caddyfile, install-ubuntu.sh, update.sh, offsite-backup.sh, systemd unit, nginx config
```

## Data model (SQLite)

| Table | Holds |
|---|---|
| `organizations` | Workspaces: plan, status, trial/period dates, billing details, security policy (2FA, IP allowlist, password, session length) |
| `users` | Accounts: bcrypt hash, workspace, role, status, encrypted TOTP secret, hashed recovery codes, lockout counters |
| `roles` | System roles and each workspace's custom roles (JSON permission list) |
| `sessions` | Hashed session tokens with device, IP and last-seen time |
| `security_events` | Sign-ins, invitations, role/policy changes, resets (the activity log) |
| `documents` | Uploaded documents: owner, status, hashes, compliance inputs and results, retention date, seal flag |
| `recipients` | Signers/approvers/CC with order, status, unguessable signing token (192-bit random), verification state, IP, times |
| `fields` | Field placement per recipient; values encrypted |
| `audit` | Hash-chained, append-only document events (SQLite triggers block UPDATE/DELETE) |
| `templates`, `template_roles`, `template_fields` | Built-in and custom templates |
| `plans`, `checkouts`, `invoices` | Pricing, payment attempts, GST invoices |
| `email_templates`, `emails` | Editable email wording and the outbox log |
| `settings` | Platform configuration (payment and SMTP secrets stored encrypted) |
| `leads` | Website enquiries |

Files live in `/data/files/` encrypted with AES-256-GCM (`SFE1` header + IV + tag + ciphertext). The database never stores PDF bytes.

## Key flows

**Sending a document**
1. Upload → SHA-256 of the original is recorded, file encrypted to disk.
2. Prepare → recipients, fields, countries, document type and value saved.
3. Send → plan limits checked (HTTP 402 if exceeded) → compliance engine re-runs on the server (blocks excluded documents, sets SES/AES/QES, required checks) → unguessable per-recipient signing links (192-bit random tokens) → emails.

**Signing**
1. Signer opens `/sign/:token` → required checks run first (access code, email OTP, ID check); nothing about the document is returned before they pass.
2. Consent → field values validated and encrypted → a signature binding hash (original hash + signer + values) is written to the audit chain.
3. Last signer → values written into the PDF, footer stamp and certificate of completion added → PDF sealed → final SHA-256 recorded → retention date set → copies emailed.

**Verification**: `/verify` hashes an uploaded PDF and looks it up; the seal can also be checked in any PDF reader. **Run check** on a document recomputes the audit chain and the file fingerprints.

**Billing**: checkout creates a Razorpay order / Stripe session → the browser callback (HMAC-verified) or the webhook (signature-verified, idempotent) activates the plan and issues an invoice → renewal reminders run daily.

## Security design (summary)

* **At rest:** AES-256-GCM for files, field values, signatures, TOTP secrets and payment/SMTP secrets. Key from `MASTER_KEY` (recommended) or `data/keys/master.key`.
* **Integrity:** SHA-256 fingerprints, hash-chained audit with DB triggers, PDF seal, signature binding.
* **Identity:** bcrypt passwords, session and invitation tokens stored only as HMACs, lockout, TOTP 2FA with replay protection and recovery codes, signer OTP/access code/ID checks, one-time hashed invitation/reset links.
* **Authorisation:** 15 permissions, server-side checks on every route, privilege-escalation guard, per-workspace data isolation, platform-owner-only admin APIs.
* **Transport and browser:** HTTPS (Caddy), HSTS, strict CSP (no inline scripts), `frame-ancestors 'none'`, Origin check on state-changing requests, `SameSite` cookies, rate limits.
* **Operations:** non-root container, read-only root file system, `no-new-privileges`, health check, graceful shutdown, consistent online backups without keys.

## Configuration reference (environment variables)

| Variable | Purpose | Default |
|---|---|---|
| `DOMAIN`, `ACME_EMAIL` | Used by Caddy for the site address and certificate notices | — (required with Docker Compose) |
| `APP_URL` | Public URL for links in emails | request host |
| `COOKIE_SECURE` | `1` = Secure cookies + HSTS (use with HTTPS) | `0` |
| `MASTER_KEY` | 32-byte base64 encryption key | generated key file |
| `SEAL_P12_PATH`, `SEAL_P12_PASSWORD` | CA-issued seal certificate | self-signed seal |
| `TRUST_PROXY` | Number of proxies in front (Caddy = 1) or Express trust value | `loopback` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Initial email settings (editable in the app) | — |
| `DATA_DIR` | Database and files location | `./data` (`/data` in Docker) |
| `BACKUP_DIR`, `BACKUP_KEEP_DAYS` | Backup location and retention | `DATA_DIR/backups`, 14 |
| `DATA_REGION` | Label shown in security settings | — |
| `PORT` | Listen port | 3000 |

## Extension points

| To add | Where |
|---|---|
| A real ID-verification provider (DigiLocker, Onfido, Veriff, IDnow…) | `verifyIdentity()` in `src/server.js`; set the provider name in Settings → Security |
| Qualified / Aadhaar eSign signatures | Integrate the trust service provider in the signing submit step; set `qes_provider` |
| Trusted (green tick) seals | Buy a document-signing certificate (Adobe AATL list) and set `SEAL_P12_PATH` |
| New templates | Add entries to `src/templates-library.js`; they install on restart |
| New countries or rule changes | `JURISDICTIONS` in `src/compliance/rules.js` (update `RULES_REVIEWED`) |
| Website text, industries, FAQ | `FEATURE_GROUPS`, `SOLUTIONS`, `FAQ` in `src/site/site.js` |
| New payment gateway | `src/saas/billing.js` (`providerFor`, checkout and webhook handlers) |
| Another language | UI strings live in `public/js/*.js` and `src/site/site.js` |

## Limits to know

* One application instance per data volume (SQLite). Scale up the server rather than out; see DEPLOY.md §14 for the path to PostgreSQL and object storage.
* Uploads up to 25 MB per PDF.
* The compliance library is operational guidance, not legal advice. Review it for your markets.
