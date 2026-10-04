const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILES_DIR = path.join(DATA_DIR, 'files');
fs.mkdirSync(FILES_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'signflow.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  file_name TEXT NOT NULL,
  signed_name TEXT,
  original_hash TEXT,
  final_hash TEXT,
  message TEXT DEFAULT '',
  sequential INTEGER DEFAULT 1,
  expiry_days INTEGER DEFAULT 15,
  expires_at TEXT,
  template_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  sent_at TEXT,
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'signer',
  order_index INTEGER DEFAULT 0,
  color TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  token TEXT UNIQUE,
  sent_at TEXT,
  viewed_at TEXT,
  signed_at TEXT,
  decline_reason TEXT,
  ip TEXT
);
CREATE TABLE IF NOT EXISTS fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  recipient_id INTEGER REFERENCES recipients(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  page INTEGER NOT NULL,
  x REAL, y REAL, w REAL, h REAL,
  required INTEGER DEFAULT 1,
  label TEXT,
  value TEXT
);
CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT 'General',
  file_name TEXT NOT NULL,
  message TEXT DEFAULT '',
  sequential INTEGER DEFAULT 1,
  builtin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS template_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'signer',
  order_index INTEGER DEFAULT 0,
  color TEXT
);
CREATE TABLE IF NOT EXISTS template_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  role_index INTEGER NOT NULL,
  type TEXT NOT NULL,
  page INTEGER NOT NULL,
  x REAL, y REAL, w REAL, h REAL,
  required INTEGER DEFAULT 1,
  label TEXT
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor TEXT,
  ip TEXT,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS email_templates (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  button TEXT
);
CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT, subject TEXT, html TEXT, link TEXT,
  status TEXT, error TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

const DEFAULT_SETTINGS = {
  brand_name: 'SignFlow',
  theme: 'ocean',
  app_url: process.env.APP_URL || '',
  allow_signup: '1',
  default_expiry_days: '15',
  smtp_host: process.env.SMTP_HOST || '',
  smtp_port: process.env.SMTP_PORT || '587',
  smtp_secure: process.env.SMTP_SECURE || '0',
  smtp_user: process.env.SMTP_USER || '',
  smtp_pass: process.env.SMTP_PASS || '',
  smtp_from: process.env.SMTP_FROM || '',
  // security policies
  session_idle_hours: '12',
  min_controls: '["email"]',
  default_jurisdictions: 'IN',
  allow_recipient_download: '1',
  data_region: process.env.DATA_REGION || 'Self-hosted (your server)',
  enforce_compliance: '1',
};
// ---- migrations for security & compliance (safe to re-run) ----
const addCol = (table, def) => { try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${def}`); } catch (e) { if (!/duplicate column/.test(e.message)) throw e; } };
[
  ['documents', 'jurisdictions TEXT'], ['documents', 'category TEXT'], ['documents', 'value_band TEXT'],
  ['documents', "controls TEXT DEFAULT '[\"email\"]'"], ['documents', 'access_code_hash TEXT'], ['documents', 'risk_score INTEGER'],
  ['documents', 'risk_level TEXT'], ['documents', 'required_level TEXT'], ['documents', 'compliance_json TEXT'], ['documents', 'retain_until TEXT'],
  ['documents', 'sealed INTEGER DEFAULT 0'],
  ['recipients', 'country TEXT'], ['recipients', 'phone TEXT'], ['recipients', 'otp_hash TEXT'], ['recipients', 'otp_expires TEXT'],
  ['recipients', 'otp_attempts INTEGER DEFAULT 0'], ['recipients', 'otp_sends INTEGER DEFAULT 0'], ['recipients', 'otp_last_sent TEXT'],
  ['recipients', 'code_attempts INTEGER DEFAULT 0'], ['recipients', 'auth_session TEXT'], ['recipients', 'verified_json TEXT'],
  ['audit', 'prev_hash TEXT'], ['audit', 'hash TEXT'],
  ['users', 'failed_logins INTEGER DEFAULT 0'], ['users', 'locked_until TEXT'],
  ['sessions', 'last_seen TEXT'],
].forEach(([t, d]) => addCol(t, d));

const insSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insSetting.run(k, v);

const DEFAULT_EMAILS = [
  {
    key: 'sign_request', name: 'Signature request', button: 'Review & Sign',
    subject: '{{sender_name}} sent you "{{document_title}}" to sign',
    body: 'Hi {{recipient_name}},\n\n{{sender_name}} has requested your signature on "{{document_title}}".\n\n{{message}}\n\nThis request expires on {{expires_at}}.',
  },
  {
    key: 'reminder', name: 'Reminder', button: 'Sign now',
    subject: 'Reminder: "{{document_title}}" is waiting for your signature',
    body: 'Hi {{recipient_name}},\n\nThis is a friendly reminder that {{sender_name}} is still waiting for you to sign "{{document_title}}".\n\nThis request expires on {{expires_at}}.',
  },
  {
    key: 'completed', name: 'Document completed', button: 'Download signed copy',
    subject: '"{{document_title}}" has been signed by everyone',
    body: 'Hi {{recipient_name}},\n\nAll parties have completed "{{document_title}}". The signed document with its certificate of completion is ready to download.',
  },
  {
    key: 'declined', name: 'Document declined', button: 'View document',
    subject: '"{{document_title}}" was declined',
    body: 'Hi {{recipient_name}},\n\n{{actor_name}} declined to sign "{{document_title}}".\n\nReason: {{decline_reason}}',
  },
  {
    key: 'otp', name: 'Signer verification code', button: '',
    subject: 'Your verification code for "{{document_title}}": {{otp_code}}',
    body: 'Hi {{recipient_name}},\n\nUse this code to open "{{document_title}}": {{otp_code}}\n\nIt expires in 10 minutes. If you did not request it, ignore this email and tell {{sender_name}}.',
  },
  {
    key: 'new_lead', name: 'New website enquiry (to you)', button: 'Open enquiries',
    subject: 'New enquiry: {{lead_name}} ({{lead_topic}})',
    body: 'You have a new enquiry from your website.\n\nName: {{lead_name}}\nEmail: {{lead_email}}\nCompany: {{lead_company}}\nPhone: {{lead_phone}}\nTopic: {{lead_topic}}\nTeam size: {{lead_size}}\n\n{{lead_message}}',
  },
  {
    key: 'payment_receipt', name: 'Payment receipt', button: 'View billing',
    subject: 'Payment received — {{plan_name}} plan ({{invoice_number}})',
    body: 'Hi {{recipient_name}},\n\nThank you! We received {{amount}} for the {{plan_name}} plan. Your subscription is active until {{period_end}}.\n\nYour invoice {{invoice_number}} is available on the billing page.',
  },
  {
    key: 'renewal_reminder', name: 'Renewal reminder', button: 'Renew now',
    subject: 'Your {{brand_name}} subscription renews soon',
    body: 'Hi {{recipient_name}},\n\nYour {{plan_name}} plan ends on {{period_end}}. Renew before then to keep sending documents without interruption.',
  },
  {
    key: 'team_invite', name: 'Team invitation', button: 'Accept invitation',
    subject: '{{sender_name}} invited you to {{org_name}} on {{brand_name}}',
    body: 'Hi {{recipient_name}},\n\n{{sender_name}} added you to {{org_name}} as {{role_name}}.\n\nSet your password using the button below. The link works once and expires in 72 hours.',
  },
  {
    key: 'password_reset', name: 'Password reset', button: 'Set a new password',
    subject: 'Reset your {{brand_name}} password',
    body: 'Hi {{recipient_name}},\n\n{{sender_name}} reset your password. Choose a new one using the button below. The link works once and expires in 72 hours.\n\nIf you did not expect this, contact your workspace admin.',
  },
  {
    key: 'viewer_copy', name: 'Copy for viewers (CC)', button: 'View document',
    subject: 'You received a copy of "{{document_title}}"',
    body: 'Hi {{recipient_name}},\n\n{{sender_name}} shared the completed document "{{document_title}}" with you for your records.',
  },
];
const insEmail = db.prepare('INSERT OR IGNORE INTO email_templates (key, name, subject, body, button) VALUES (@key, @name, @subject, @body, @button)');
for (const e of DEFAULT_EMAILS) insEmail.run(e);

// Secrets in settings are encrypted at rest with the master key (vault is initialised by the server first).
const SENSITIVE_SETTINGS = new Set(['smtp_pass', 'razorpay_key_secret', 'razorpay_webhook_secret', 'stripe_secret_key', 'stripe_webhook_secret']);
const vaultLib = () => require('./security/vault');
function getSettings() {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM settings').all()) {
    let v = r.value;
    if (SENSITIVE_SETTINGS.has(r.key) && typeof v === 'string' && v.startsWith('enc:')) {
      try { v = vaultLib().decStr(v); } catch { v = ''; console.error(`[security] Could not decrypt setting "${r.key}" (wrong MASTER_KEY?). Re-enter it in the admin settings.`); }
    }
    out[r.key] = v;
  }
  return out;
}
function setSetting(k, v) {
  let val = String(v ?? '');
  if (SENSITIVE_SETTINGS.has(k) && val) val = vaultLib().encStr(val);
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, val);
}
/** Encrypt any secrets that were stored before encryption was added (runs at start-up). */
function encryptLegacySettings() {
  for (const r of db.prepare('SELECT key, value FROM settings').all()) {
    if (SENSITIVE_SETTINGS.has(r.key) && r.value && !r.value.startsWith('enc:')) setSetting(r.key, r.value);
  }
}
// Hash-chained, append-only audit trail: each entry commits to the previous one, so any edit,
// deletion or reordering breaks the chain and is reported by verifyAuditChain().
const crypto = require('crypto');
const auditHash = (prev, e) => crypto.createHash('sha256').update([prev || 'GENESIS', e.document_id, e.action, e.actor || '', e.ip || '', e.details || '', e.created_at].join('|')).digest('hex');
function audit(documentId, action, actor, ip, details) {
  const prev = db.prepare('SELECT hash FROM audit WHERE document_id = ? ORDER BY id DESC LIMIT 1').get(documentId)?.hash || null;
  const e = { document_id: documentId, action, actor: actor || null, ip: ip || null, details: details || null, created_at: new Date().toISOString().replace('T', ' ').slice(0, 23) };
  db.prepare('INSERT INTO audit (document_id, action, actor, ip, details, created_at, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(documentId, e.action, e.actor, e.ip, e.details, e.created_at, prev, auditHash(prev, e));
}
function verifyAuditChain(documentId) {
  const rows = db.prepare('SELECT * FROM audit WHERE document_id = ? ORDER BY id').all(documentId);
  let prev = null;
  for (const [i, r] of rows.entries()) {
    if (!r.hash) { prev = null; continue; } // entries written before chaining was enabled
    if (r.prev_hash !== prev || r.hash !== auditHash(prev, r)) return { valid: false, entries: rows.length, brokenAt: i + 1, head: null };
    prev = r.hash;
  }
  return { valid: true, entries: rows.length, head: prev };
}
db.exec(`CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'audit trail is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit WHEN EXISTS (SELECT 1 FROM documents WHERE id = OLD.document_id)
BEGIN SELECT RAISE(ABORT, 'audit entries can only be removed together with their document'); END;`);

module.exports = { encryptLegacySettings, db, DATA_DIR, FILES_DIR, getSettings, setSetting, audit, verifyAuditChain, DEFAULT_EMAILS };
