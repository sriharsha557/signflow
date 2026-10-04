/*
 * Access control and account security:
 *  - granular permissions, built-in + custom roles per workspace
 *  - TOTP two-factor authentication (RFC 6238) with recovery codes
 *  - workspace security policy (require 2FA, IP allowlist, password rules, session timeout)
 *  - security activity log
 */
const crypto = require('crypto');
const net = require('net');
const { db } = require('../db');

// ---------------------------------------------------------------- permissions & roles
const PERMISSIONS = {
  'documents.send': { group: 'Documents', label: 'Create and send documents', hint: 'Upload, prepare and send their own documents.' },
  'documents.view_all': { group: 'Documents', label: 'View all workspace documents', hint: 'See documents sent by anyone in the workspace.' },
  'documents.manage_all': { group: 'Documents', label: 'Manage others’ documents', hint: 'Remind, recall and edit drafts owned by colleagues.' },
  'documents.download': { group: 'Documents', label: 'Download documents', hint: 'Download originals and signed copies they can see.' },
  'documents.delete': { group: 'Documents', label: 'Delete documents', hint: 'Delete documents they can manage (signed records stay under retention hold).' },
  'templates.use': { group: 'Templates', label: 'Use templates', hint: 'Create documents from templates.' },
  'templates.manage': { group: 'Templates', label: 'Create and edit templates', hint: 'Upload, edit and delete workspace templates.' },
  'compliance.view': { group: 'Compliance', label: 'View compliance rules', hint: 'Open the country rules and risk calculator.' },
  'team.view': { group: 'People', label: 'View team members', hint: 'See who is in the workspace.' },
  'team.manage': { group: 'People', label: 'Manage users', hint: 'Invite, disable, reset and remove users; change their role.' },
  'roles.manage': { group: 'People', label: 'Manage roles', hint: 'Create custom roles and change permissions.' },
  'billing.view': { group: 'Billing', label: 'View plan and invoices', hint: 'See usage, plan and invoices.' },
  'billing.manage': { group: 'Billing', label: 'Manage subscription', hint: 'Upgrade, pay and change billing details.' },
  'security.manage': { group: 'Security', label: 'Manage security policy', hint: 'Require 2FA, set IP allowlist, password and session rules.' },
  'audit.view': { group: 'Security', label: 'View activity log', hint: 'See sign-ins, permission changes and other security events.' },
};
const ALL = Object.keys(PERMISSIONS);
const SYSTEM_ROLES = [
  { key: 'owner', name: 'Owner', description: 'Full control, including billing and security. One per workspace.', permissions: ALL },
  { key: 'admin', name: 'Admin', description: 'Manages users, roles, security and billing.', permissions: ALL },
  { key: 'manager', name: 'Manager', description: 'Runs day-to-day signing for the team and reviews activity.', permissions: ['documents.send', 'documents.view_all', 'documents.manage_all', 'documents.download', 'documents.delete', 'templates.use', 'templates.manage', 'compliance.view', 'team.view', 'audit.view'] },
  { key: 'member', name: 'Member', description: 'Sends and manages their own documents.', permissions: ['documents.send', 'documents.download', 'documents.delete', 'templates.use', 'compliance.view', 'team.view'] },
  { key: 'viewer', name: 'Viewer', description: 'Read-only access to all workspace documents, e.g. auditors.', permissions: ['documents.view_all', 'documents.download', 'compliance.view', 'team.view'] },
  { key: 'billing', name: 'Billing', description: 'Handles the subscription and invoices only.', permissions: ['billing.view', 'billing.manage', 'team.view'] },
];

db.exec(`
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER,
  key TEXT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  permissions TEXT NOT NULL DEFAULT '[]',
  system INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER, user_id INTEGER, actor TEXT, action TEXT NOT NULL, target TEXT, details TEXT, ip TEXT, user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_secev_org ON security_events(org_id, id);
`);
const addCol = (t, c) => { try { db.exec(`ALTER TABLE ${t} ADD COLUMN ${c}`); } catch (e) { if (!/duplicate column/.test(e.message)) throw e; } };
for (const c of ['role_id INTEGER', "status TEXT DEFAULT 'active'", 'totp_secret TEXT', 'totp_pending TEXT', 'totp_enabled INTEGER DEFAULT 0', 'totp_last_step INTEGER',
  'recovery_codes TEXT', 'must_change_password INTEGER DEFAULT 0', 'invite_token TEXT', 'invite_expires TEXT', 'last_login_at TEXT', 'last_login_ip TEXT', 'password_changed_at TEXT']) addCol('users', c);
for (const c of ['sid TEXT', 'ip TEXT', 'user_agent TEXT']) addCol('sessions', c);
for (const c of ["require_2fa TEXT DEFAULT 'off'", "ip_allowlist TEXT DEFAULT ''", 'password_min INTEGER DEFAULT 10', 'session_hours INTEGER DEFAULT 12']) addCol('organizations', c);

for (const r of SYSTEM_ROLES) {
  const ex = db.prepare('SELECT id FROM roles WHERE system = 1 AND key = ?').get(r.key);
  if (ex) db.prepare('UPDATE roles SET name = ?, description = ?, permissions = ? WHERE id = ?').run(r.name, r.description, JSON.stringify(r.permissions), ex.id);
  else db.prepare('INSERT INTO roles (org_id, key, name, description, permissions, system) VALUES (NULL, ?, ?, ?, ?, 1)').run(r.key, r.name, r.description, JSON.stringify(r.permissions));
}
const systemRoleId = (key) => db.prepare('SELECT id FROM roles WHERE system = 1 AND key = ?').get(key).id;
/** Give legacy users a role based on their old org_role. */
function migrateRoles() {
  for (const u of db.prepare('SELECT id, org_role FROM users WHERE role_id IS NULL').all()) db.prepare('UPDATE users SET role_id = ? WHERE id = ?').run(systemRoleId(['owner', 'admin'].includes(u.org_role) ? u.org_role : 'member'), u.id);
  db.prepare("UPDATE sessions SET sid = lower(hex(randomblob(9))) WHERE sid IS NULL").run();
}

const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
function roleOf(user) {
  const r = user.role_id && db.prepare('SELECT * FROM roles WHERE id = ?').get(user.role_id);
  const role = r || db.prepare("SELECT * FROM roles WHERE system = 1 AND key = 'member'").get();
  return { ...role, permissions: parse(role.permissions, []) };
}
const can = (user, perm) => roleOf(user).permissions.includes(perm);
function rolesForOrg(orgId) {
  return db.prepare('SELECT * FROM roles WHERE system = 1 OR org_id = ? ORDER BY system DESC, id').all(orgId).map((r) => ({
    ...r, permissions: parse(r.permissions, []),
    users: db.prepare("SELECT COUNT(*) c FROM users WHERE role_id = ? AND org_id = ?").get(r.id, orgId).c,
  }));
}

// ---------------------------------------------------------------- passwords
const COMMON = new Set(('password password1 password123 password@123 123456 12345678 123456789 1234567890 qwerty qwerty123 abc123 111111 123123 admin admin123 welcome welcome1 welcome123 letmein iloveyou ' +
  'monkey dragon sunshine princess football baseball master shadow superman trustno1 india123 india@123 changeme passw0rd p@ssw0rd p@ssword 1q2w3e4r zaq12wsx asdfghjkl qwertyuiop').split(' '));
function passwordProblem(pw, { min = 10, email = '', name = '' } = {}) {
  if (!pw || pw.length < min) return `Use at least ${min} characters.`;
  if (!/[a-z]/i.test(pw) || !/\d/.test(pw)) return 'Include both letters and numbers.';
  if (COMMON.has(pw.toLowerCase())) return 'That password is too common. Choose something less guessable.';
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 4 && pw.toLowerCase().includes(local)) return "Don't include your email address in your password.";
  if (name && name.length >= 4 && pw.toLowerCase().includes(name.toLowerCase().split(' ')[0])) return "Don't include your name in your password.";
  return null;
}
function strongTempSecret() { return crypto.randomBytes(24).toString('base64url'); }

// ---------------------------------------------------------------- TOTP (RFC 6238)
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) { let bits = 0, val = 0, out = ''; for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } if (bits > 0) out += B32[(val << (5 - bits)) & 31]; return out; }
function base32Decode(s) { let bits = 0, val = 0; const out = []; for (const c of s.replace(/=+$/, '').toUpperCase()) { const i = B32.indexOf(c); if (i < 0) continue; val = (val << 5) | i; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); }
function hotp(secretB32, counter) {
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', base32Decode(secretB32)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}
const newTotpSecret = () => base32Encode(crypto.randomBytes(20));
/** Returns the matched time step or null. Accepts ±1 step (30s) of clock drift. */
function verifyTotp(secretB32, code, lastStep) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const step = Math.floor(Date.now() / 30000);
  for (const s of [step, step - 1, step + 1]) {
    if (lastStep != null && s <= lastStep) continue; // no replay
    const x = hotp(secretB32, s);
    if (crypto.timingSafeEqual(Buffer.from(x), Buffer.from(c))) return s;
  }
  return null;
}
const otpauthUri = (secret, email, issuer) => `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
function newRecoveryCodes() { return Array.from({ length: 10 }, () => crypto.randomBytes(5).toString('hex').toUpperCase().replace(/(.{5})/, '$1-')); }
const hashCode = (c) => crypto.createHash('sha256').update(String(c).toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');

// ---------------------------------------------------------------- IP allowlist
function parseAllowlist(text) {
  const out = []; const errors = [];
  for (const raw of String(text || '').split(/[\s,]+/).filter(Boolean)) {
    const [ip, bitsS] = raw.split('/');
    const v = net.isIP(ip);
    const bits = bitsS === undefined ? (v === 4 ? 32 : 128) : Number(bitsS);
    if (!v || !Number.isInteger(bits) || bits < 0 || bits > (v === 4 ? 32 : 128)) { errors.push(raw); continue; }
    out.push({ ip, bits, v, raw });
  }
  return { list: out, errors };
}
function ipToBig(ip) {
  if (net.isIPv4(ip)) return { v: 4, n: ip.split('.').reduce((a, o) => (a << 8n) + BigInt(Number(o)), 0n) };
  let parts = ip.split('::'); const head = parts[0] ? parts[0].split(':') : []; const tail = parts[1] ? parts[1].split(':') : [];
  const groups = parts.length > 1 ? [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail] : head;
  return { v: 6, n: groups.reduce((a, g) => (a << 16n) + BigInt(parseInt(g || '0', 16)), 0n) };
}
function ipAllowed(ip, allowlistText) {
  const { list } = parseAllowlist(allowlistText);
  if (!list.length) return true;
  const clean = String(ip || '').replace(/^::ffff:/, '');
  if (!net.isIP(clean)) return false;
  const a = ipToBig(clean);
  return list.some((e) => {
    if (e.v !== a.v) return false;
    const width = e.v === 4 ? 32 : 128; const shift = BigInt(width - e.bits);
    return (ipToBig(e.ip).n >> shift) === (a.n >> shift);
  });
}

// ---------------------------------------------------------------- activity log
function logEvent({ orgId, userId, actor, action, target, details, req }) {
  db.prepare('INSERT INTO security_events (org_id, user_id, actor, action, target, details, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(orgId || null, userId || null, actor || null, action, target || null, details || null, req ? String(req.ip || '').replace('::ffff:', '') : null, req ? String(req.get('user-agent') || '').slice(0, 160) : null);
}

module.exports = {
  PERMISSIONS, SYSTEM_ROLES, systemRoleId, migrateRoles, roleOf, can, rolesForOrg, passwordProblem, strongTempSecret,
  newTotpSecret, verifyTotp, otpauthUri, newRecoveryCodes, hashCode, hotp, parseAllowlist, ipAllowed, logEvent,
};
