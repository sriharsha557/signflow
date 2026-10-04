# SignFlow — self-hosted e-signatures

> **Proprietary and confidential.** See [LICENSE](LICENSE). Do not share this code outside your organisation.

SignFlow is a self-hosted electronic signature platform: upload a PDF, place signature fields, email signing links, and get back a signed PDF with a certificate of completion. It runs on Node.js and stores everything in SQLite, so you can run it on any server you control.

## Features

- **Dashboard**: shows documents awaiting others, completed, drafts and declined/expired; documents waiting for *your* signature; anything expiring soon; and an activity feed.
- **Document editor**: drag-and-drop fields (signature, initials, full name, email, date signed, company, job title, text, checkbox), with color-coded recipients. Fields can be moved and resized.
- **Recipients**: signers, approvers and CC viewers, signing in a set order or all at once, with a configurable expiry.
- **Signing page**: no account needed and works on phones. Signers can type, draw or upload a signature. It also has guided "Next field" navigation, an e-sign consent step and a decline-with-reason option.
- **Signed output**: field values are written into the PDF, and a **certificate of completion** page is added. That page lists the recipients, IP addresses, timestamps, the full audit trail and the SHA-256 of the original file.
- **Verify page** (`/verify`): upload a signed PDF to check that it came from this server and hasn't been changed since.
- **Document templates**: 5 built-in templates (Mutual NDA, Offer Letter, Rental Agreement, Freelance Service Agreement, Media Consent). You can also upload your own, save any document as a template, or duplicate and edit the built-in ones.
- **Email templates**: you can edit the subject, body and button text for signature requests, reminders, completed, declined and viewer copies. There are placeholders and a live preview.
- **UI themes**: Ocean, Emerald, Sunset, Royal, Rose, Graphite and Midnight (dark). The theme applies to the app, the signing pages, emails and the certificate.
- **Admin**: rename/rebrand the product, set up SMTP, view the outbox (copy signing links even without SMTP), manage users, and turn sign-ups on or off.
- **Document actions**: reminders, recall, duplicate, delete and download.

## Quick start on your computer (Node.js 22+)

```bash
npm install
COOKIE_SECURE=0 npm start          # local only; production settings are in .env (see DEPLOY.md)
```

Open `http://localhost:3000` for the public site and `http://localhost:3000/app` for the app. **The first account you register becomes the platform owner** (an Enterprise workspace that is never billed).

> Without SMTP configured, emails are not delivered. They are logged under **Settings → Outbox**, where you can copy each signing link, so you can try everything right away.

## Deploy to your own cloud

**Full guide: [DEPLOY.md](DEPLOY.md).** It covers choosing a provider and region, DNS, the one-command installer, email, payments, backups, upgrades, monitoring, hardening and a go-live checklist.

On a fresh Ubuntu 22.04/24.04 server with your domain pointed at it:

```bash
unzip signflow.zip && cd signflow
sudo bash deploy/install-ubuntu.sh --domain sign.yourcompany.com --email you@yourcompany.com
```

This installs Docker and starts SignFlow behind Caddy with automatic HTTPS. It also sets up the firewall and daily backups, and generates your encryption key. Then open `https://sign.yourcompany.com/app` and create the platform-owner account.

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage build; runs as a non-root user with a health check |
| `docker-compose.yml` | App + Caddy (HTTPS). The app's root file system is read-only, with log rotation. |
| `deploy/install-ubuntu.sh` | One-command install and upgrade |
| `deploy/update.sh` | Back up, rebuild, restart, health-check |
| `deploy/offsite-backup.sh` | Copy backups to S3/R2/B2/GCS/Azure with rclone |
| `deploy/signflow.service`, `deploy/nginx.conf` | Running without Docker (systemd + nginx) |
| `scripts/backup.js`, `scripts/restore.js` | Online backup and restore |
| `scripts/admin.js` | Server-side recovery: reset password, turn off 2FA, unlock, clear an IP allowlist, stats |
| `/healthz` | Health endpoint for monitors and load balancers |

See also [ARCHITECTURE.md](ARCHITECTURE.md) for the technical design and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for open-source licences.

## Private platform (for your own organisation only)

Turn this on to run SignFlow just for your team instead of selling it publicly. Use **Platform → Private access** in the app, or set it in `.env` so it can't be switched off from the browser.

| Setting | `.env` | Effect |
|---|---|---|
| Private platform | `PRIVATE_MODE=1` | The public website, pricing, sitemap and contact form are off. `/` shows a sign-in card, search engines are told not to index, and sign-up is closed: people join only by invitation. |
| Allowed email domains | `ALLOWED_EMAIL_DOMAINS=yourcompany.com` | Only addresses at these domains (and their sub-domains) can be invited or create accounts. |
| Office / VPN only | `PLATFORM_IP_ALLOWLIST=203.0.113.0/24` | The app and API answer only from these IPs. |

Signing links, the verify page, payment webhooks and the health check stay reachable, so people outside your company can still sign what you send them. When you set the IP allowlist in the app, it refuses a list that would lock you out. If you get locked out anyway, run `node scripts/admin.js platform-open` on the server.

Install it private from the start:

```bash
sudo bash deploy/install-ubuntu.sh --domain sign.yourcompany.com --email you@yourcompany.com --private --allowed-domains yourcompany.com
```

## Run it as your own subscription business

SignFlow is multi-tenant. Each sign-up gets its own **workspace** with a free trial, and the first account on the server is the **platform owner**.

**Customer side**
- **Plan & billing** (`/app#/billing`): current plan, usage meters (documents this period, seats, custom templates), plan cards with monthly/yearly and INR/USD, checkout, billing details with GSTIN, and downloadable invoices.
- **Users & access** (`/app#/access`): invite users up to the plan's seat limit and give each one a role (see below).
- **Limits are enforced on the server**: documents per period, seats, custom templates, and paid features such as one-time codes, ID checks and qualified signatures. Going over a limit returns HTTP 402 and the app shows an upgrade prompt.

**Platform owner side** (`/app#/platform`)
- **Overview:** MRR, paying customers, trials, lapsed accounts, 30-day revenue, documents sent and workspaces per plan.
- **Customers:** change a workspace's plan or status, extend its paid period, or mark it complimentary.
- **Plans & pricing:** edit names, INR/USD monthly and yearly prices, limits and features. Changes show on the pricing page immediately.
- **Payments & tax:** Razorpay and Stripe keys and webhook secrets, test mode, trial length and plan, GST rate, invoice prefix and SAC, and your legal entity and GSTIN for invoices.
- **Invoices:** every invoice across all customers.

**Public website** (what customers see before they subscribe). Pages are rendered on the server, so search engines can read them. They use your brand, theme and live plans:

| Page | What it shows |
|---|---|
| `/` Home | Hero, how it works, feature highlights, industries, security, templates, countries, pricing, why us, FAQ |
| `/features` | Every feature in 9 groups: sending, templates, signing, signed output, compliance, team and access, branding, tracking, billing |
| `/solutions` and `/solutions/<industry>` | 10 industries (HR, staffing, sales, real estate, healthcare, lending, CAs/CSs, education, international, enterprise), each with the problem, workflow, templates and recommended plan |
| `/templates` and `/templates/<key>` | All 19 templates, each with a full preview, the details to fill in and who signs |
| `/security` | How documents, signatures and accounts are protected |
| `/compliance` | Rules for all 30 countries: law, approach, record-keeping, excluded documents, extra requirements |
| `/pricing` | Plans (INR/USD, monthly/yearly), a full comparison table and billing FAQ |
| `/contact` | Enquiry form (book a demo, sales, enterprise, partner) and your contact details |
| `/terms`, `/privacy` | Draft terms and privacy policy you can edit |

Plus `/sitemap.xml`, `/robots.txt` and a friendly 404 page. The sign-in and sign-up screens list the main features and link back to these pages.

**Platform → Website & enquiries** shows enquiries from the contact form; you can update their status, add notes, reply or export to CSV. A notification email also goes to your contact email. The same tab is where you set the contact details shown on the site and edit the Terms and Privacy text. The contact form is rate-limited, has a hidden spam trap, and never emails the visitor, so it can't be used to send spam. The Terms and Privacy pages start as a general draft: have a lawyer review them before you take payments.

The app lives at `/app`.

**Payments**

| Gateway | Used for | Setup |
|---|---|---|
| Razorpay | INR (UPI, cards, net banking) | Add the key ID, key secret and webhook secret. Webhook URL: `https://YOUR_DOMAIN/api/billing/webhooks/razorpay` (events `payment.captured`, `order.paid`). Payments are verified with Razorpay's HMAC signature. |
| Stripe | USD and international cards | Add the secret key and webhook signing secret. Webhook URL: `https://YOUR_DOMAIN/api/billing/webhooks/stripe` (event `checkout.session.completed`). Signatures are verified and stale events rejected. |
| Test mode | Demos and staging | When no gateway is set up, payments are simulated, still producing invoices marked "test". |

Plans are **prepaid** for a month or a year. Paying again for the same plan extends the period, and renewal reminder emails go out 7 days before it ends. If a plan lapses, the workspace falls back to Free limits after a 3-day grace period and keeps all its signed documents. Tax invoices include GST at the configured rate (18% by default) and the buyer's GSTIN when provided. Have your accountant confirm the correct GST treatment and SAC code for your business.

## Sample documents

19 ready-made templates with fill-in details (the sender types them once; they're written into the PDF):

| Category | Templates |
|---|---|
| Legal | Mutual NDA, One-way NDA, Memorandum of Understanding |
| HR | Offer Letter, Appointment Letter, Appraisal Letter, Promotion Letter, Internship Offer, Experience & Relieving Letter, Confidentiality & IP Assignment |
| Sales & procurement | Consulting Agreement, Freelance Service Agreement, Vendor Supply Agreement, Quotation Acceptance |
| Finance & property | Loan Agreement, Residential Rental Agreement |
| Corporate & consent | Board Resolution, Patient Consent Form, Photo & Media Consent |

Templates are defined in `src/templates-library.js`; add your own entries there and restart to install them. The samples are starting points. Have them reviewed for your jurisdiction before relying on them.

## Security and protection

| Layer | What it does |
|---|---|
| Encryption at rest | PDFs, signature images and field values are encrypted with AES-256-GCM (`src/security/vault.js`). Key from `MASTER_KEY` or `data/keys/master.key`. |
| Tamper-evident seal | When the last signer finishes, the PDF gets a PKCS#7 seal over the whole file (`src/security/seal.js`). Adobe Acrobat and other readers flag any later change. Use `SEAL_P12_PATH` for a CA-issued or qualified seal. |
| Hash-chained audit trail | Every event stores the SHA-256 of the previous one. SQLite triggers block edits and stand-alone deletes. **Run check** on a document verifies the chain and the file fingerprints. |
| Signer verification | Per document: access code (shared out of band), email one-time code (6 digits, 10 minutes, 5 tries), ID check (pluggable provider, `verifyIdentity()` in `src/server.js`). Nothing about the document is released until the signer passes. |
| Signature binding | Each signing event records a hash binding the original file to that signer's values. |
| Retention hold | Completed documents can't be deleted until the retention period for their jurisdiction ends. |
| Web hardening | Strict CSP, HSTS (when `COOKIE_SECURE=1`), no framing, hashed session tokens, idle timeout, rate limits, lockout after 5 failed sign-ins, stronger password rule. |

## Users, roles and security

Open **Users & access** in the app. What a person can see there depends on their own permissions.

**Users.** Invite someone by name, email and role. They get a one-time link (valid 72 hours, stored only as a hash) to set their own password; you never set or see it. For each user you can change the role, disable/enable, sign them out everywhere, send a password-reset link, reset their 2FA, resend an invite, or remove them (only once they own no documents; otherwise disable). The workspace owner can't be changed or removed by anyone else.

**Roles.** There are 15 permissions in 6 groups (documents, templates, compliance, people, billing, security):

| Role | Typical use |
|---|---|
| Owner | Everything, including billing and security policy. One per workspace. |
| Admin | Everything except transferring ownership. |
| Manager | Sends and manages all workspace documents and templates and reads the activity log, but has no user, billing or policy access. |
| Member | Sends and manages their own documents; uses templates. |
| Viewer | Read-only access to all documents (e.g. auditors). |
| Billing | Plan, payments and invoices only. |

Create **custom roles** with any mix of permissions. You can only grant permissions you hold yourself, and only the owner can grant role or security management. These rules are enforced on the server for every API call, not just hidden in the UI.

**Security policy** (per workspace):
- Require 2FA: off / owners & admins / everyone. Users without it are forced to set it up at next sign-in.
- IP allowlist: single IPs or CIDR ranges (IPv4 and IPv6). The save is refused if it would lock out your current IP.
- Minimum password length (8–64). Common and breached-style passwords, and ones containing the user's name or email, are rejected.
- Session length: idle sign-out after 1–720 hours.

**Two-factor authentication.** TOTP (RFC 6238) works with Google/Microsoft Authenticator, 1Password, Authy, etc. A used code can't be replayed. You get 10 single-use recovery codes. Secrets are encrypted at rest.

**Activity log.** Records sign-ins (including failures and 2FA challenges), invites, role and permission changes, disables, resets, policy changes and session revocations, with IP and time. It can be filtered and exported to CSV (protected against spreadsheet formula injection).

**Other hardening:** bcrypt cost 12; session tokens stored only as hashes; per-device session list with remote sign-out; changing a password signs out other devices; cross-site requests are blocked with an Origin check; rate limits and lockout after 5 failed sign-ins.

## Worldwide compliance and risk rules

`src/compliance/rules.js` holds rules for 30 jurisdictions (US, Canada, Mexico, Brazil, Argentina, Chile, UK, EU, Germany, France, Switzerland, Türkiye, Russia, UAE, Saudi Arabia, Israel, South Africa, Nigeria, Kenya, India, China, Japan, South Korea, Singapore, Malaysia, Indonesia, Philippines, Hong Kong, Australia, New Zealand): the governing law, signature model, privacy law, record-retention period, document types that can't be e-signed, and extra formalities (notary, witness, stamp duty, registration, minimum AES/QES).

Before a document is sent, the sender picks its jurisdictions, document type and value. The engine then:

1. Blocks the send if the document type is excluded from e-signature in any selected jurisdiction (e.g. wills everywhere; employment terminations in Germany; property transfers in Singapore).
2. Sets the minimum signature level (SES / AES / QES) from the strictest law.
3. Scores risk 0–100 from document type, value, legal model and cross-border signing. Medium risk needs a one-time code; high risk or an AES requirement also needs an ID check; QES needs a connected trust service provider.
4. Lists formalities to complete (stamp duty in India, notarisation in the US for deeds, etc.) and the retention period.

The server re-runs the assessment on **Send** and refuses if a rule isn't met (Settings → Security can switch enforcement off). The result is written to the audit trail and printed on the completion certificate. The **Compliance** page lists every jurisdiction's rules and has a risk calculator.

> The rules library is operational guidance reviewed on 2 Oct 2026, not legal advice. Have counsel confirm the rules for the countries you operate in and update `RULES_REVIEWED`.

**To reach AES/QES in production** connect an identity-verification vendor (DigiLocker/Aadhaar offline KYC, Onfido, Veriff, IDnow, an EUDI wallet) and, where QES is required, a qualified trust service provider (Aadhaar eSign ASP / licensed CA in India, an EU QTSP, ICP-Brasil, UAE Pass), then set its name in Settings → Security.

## Customising

| What | Where |
|---|---|
| Product name and theme | Settings → Branding & themes |
| Email wording | Settings → Email templates |
| Built-in document templates | `src/builtin-templates.js` (seeded on first run) |
| Website text, industries, FAQ | `src/site/site.js` (`FEATURE_GROUPS`, `SOLUTIONS`, `FAQ`) and `public/css/site.css` |
| Website contact details, Terms, Privacy | Platform → Website & enquiries |
| Colors and theme definitions | `public/css/app.css` (`[data-theme="…"]` blocks) |
| Field types | `FIELD_TYPES` in `public/js/common.js` and `src/server.js` |

## Project layout

```
src/server.js              Express API, signing workflow, auth
src/db.js                  SQLite schema, default settings and email templates
src/pdf.js                 Writes values into the PDF and builds the certificate (pdf-lib)
src/mail.js                Email rendering and SMTP delivery (nodemailer)
src/security/               Encryption at rest, PDF seal, HTTP hardening, roles/2FA/policy (access.js)
src/compliance/rules.js    Jurisdiction rules and risk engine (shared with the browser)
src/saas/billing.js        Workspaces, plans, limits, Razorpay/Stripe checkout, invoices
src/templates-library.js   The 19 built-in sample documents
scripts/                   Backup, restore and admin recovery tools
deploy/                    Installer, Caddyfile, systemd unit, nginx config, update and off-site backup scripts
src/site/                  Public website pages (site.js, shared with the prototype) and their routes
src/builtin-templates.js   Generates the built-in contract templates
public/                    Front end (no build step): app, editor, signing page, verify page
```

## Legal note

SignFlow records consent, IP addresses, timestamps and document hashes, which are the usual evidence for simple electronic signatures (e.g. under the US ESIGN Act, EU eIDAS "simple" signatures, and India's IT Act for most contract types). Some documents need certified/qualified digital signatures or wet ink. Check the rules for your jurisdiction and use case.
