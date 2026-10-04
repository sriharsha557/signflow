// Load .env (simple KEY=VALUE parser, no dependency)
(() => {
  const f = require('path').join(__dirname, '..', '.env');
  if (!require('fs').existsSync(f)) return;
  for (const line of require('fs').readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
})();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const { PDFDocument } = require('pdf-lib');

const { db, FILES_DIR, DATA_DIR, getSettings, setSetting, audit, verifyAuditChain } = require('./db');
const vault = require('./security/vault');
const seal = require('./security/seal');
const { securityHeaders, rateLimit } = require('./security/http');
const C = require('./compliance/rules');
vault.init(DATA_DIR);
require('./db').encryptLegacySettings();
seal.init(DATA_DIR, getSettings().brand_name);
const { finalizeDocument, sha256 } = require('./pdf');
const { sendEmail, renderEmail, THEME_ACCENTS } = require('./mail');
const { seedBuiltinTemplates, renderTemplateForUse, COLORS, byKey: LIB } = require('./builtin-templates');
const billing = require('./saas/billing');
billing.migrateUsers();

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, '..', 'public');
const app = express();
const TP = process.env.TRUST_PROXY || 'loopback';
app.set('trust proxy', /^\d+$/.test(TP) ? Number(TP) : TP === 'true' ? true : TP);
app.disable('x-powered-by');
app.use(securityHeaders);
// Private-platform gate (noindex + platform IP allowlist); assigned once the access module is loaded below.
let privateGate = (req, res, next) => next();
app.use((req, res, next) => privateGate(req, res, next));
// Payment webhooks need the raw body for signature verification, so they come before the JSON parser.
app.post('/api/billing/webhooks/razorpay', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  try { billing.razorpayWebhook(req.body, req.get('x-razorpay-signature')); res.json({ ok: true }); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});
app.post('/api/billing/webhooks/stripe', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  try { billing.stripeWebhook(req.body, req.get('stripe-signature')); res.json({ received: true }); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});
app.use(express.json({ limit: '15mb' }));
app.use((req, res, next) => {
  // Reject cross-site state-changing requests (defence in depth on top of SameSite=Strict cookies).
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !req.path.startsWith('/api/')) return next();
  const origin = req.get('origin');
  if (origin) { try { if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Cross-site request blocked' }); } catch { return res.status(403).json({ error: 'Bad origin' }); } }
  next();
});
app.use(cookieParser());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const rid = (n = 24) => crypto.randomBytes(n).toString('hex');
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const filePath = (name) => path.join(FILES_DIR, path.basename(name));
const ACTIONABLE = ['signer', 'approver'];
const FIELD_TYPES = ['signature', 'initials', 'fullname', 'email', 'date', 'text', 'checkbox', 'company', 'title'];

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function baseUrl(req) {
  const s = getSettings();
  return (s.app_url || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}
function ipOf(req) { return (req.ip || '').replace('::ffff:', ''); }

async function validatePdf(file) {
  if (!file) throw new HttpError(400, 'Please upload a PDF file');
  if (file.buffer.slice(0, 5).toString() !== '%PDF-') throw new HttpError(400, 'Only PDF files are supported');
  try {
    const pdf = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
    return pdf.getPageCount();
  } catch { throw new HttpError(400, 'This PDF could not be read (it may be corrupted or password-protected)'); }
}

// ---------------------------------------------------------------- authentication, sessions & access control
const access = require('./security/access');
const priv = require('./security/private')({ db, getSettings, access, ipOf });
privateGate = priv.gate;
const QRCode = require('qrcode');
access.migrateRoles();

const RESTRICTED_OK = ['/api/auth/me', '/api/auth/logout', '/api/account', '/api/account/password', '/api/account/2fa/setup', '/api/account/2fa/enable', '/api/public-config'];
function orgPolicy(orgId) { return db.prepare('SELECT require_2fa, ip_allowlist, password_min, session_hours FROM organizations WHERE id = ?').get(orgId) || {}; }
function needs2fa(user, policy) {
  if (policy.require_2fa === 'all') return true;
  if (policy.require_2fa === 'admins') return ['owner', 'admin'].includes(access.roleOf(user).key) || access.can(user, 'team.manage') || access.can(user, 'security.manage');
  return false;
}
function auth(req, res, next) {
  const token = req.cookies.sf_session;
  const key = token && vault.hmac(token);
  const row = key && db.prepare('SELECT s.token AS s_token, s.sid AS s_sid, s.created_at AS s_created, s.last_seen AS s_seen, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(key);
  if (!row) return res.status(401).json({ error: 'Not signed in' });
  if (row.status !== 'active') { db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.id); return res.status(401).json({ error: 'This account has been disabled. Contact your workspace admin.' }); }
  const policy = orgPolicy(row.org_id);
  const idleHours = Math.min(Number(getSettings().session_idle_hours) || 12, Number(policy.session_hours) || 12);
  const seen = new Date((row.s_seen || row.s_created).replace(' ', 'T') + 'Z').getTime();
  if (Date.now() - seen > idleHours * 3600e3) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(key);
    return res.status(401).json({ error: 'Your session expired. Please sign in again.' });
  }
  if (!access.ipAllowed(ipOf(req), policy.ip_allowlist)) {
    access.logEvent({ orgId: row.org_id, userId: row.id, actor: row.email, action: 'access.blocked_ip', details: `Request from ${ipOf(req)} outside the IP allowlist`, req });
    return res.status(403).json({ error: `Access from your network (${ipOf(req)}) isn't allowed by your workspace's IP allowlist.` });
  }
  if (Date.now() - seen > 60e3) db.prepare('UPDATE sessions SET last_seen = ?, ip = ? WHERE token = ?').run(now(), ipOf(req), key);
  req.user = row;
  req.sessionKey = key;
  req.role = access.roleOf(row);
  req.restricted = row.must_change_password ? 'password_change_required' : needs2fa(row, policy) && !row.totp_enabled ? 'mfa_setup_required' : null;
  if (req.restricted && !RESTRICTED_OK.includes(req.path)) {
    return res.status(403).json({ error: req.restricted === 'password_change_required' ? 'Please set a new password first.' : 'Your workspace requires two-factor authentication. Set it up to continue.', code: req.restricted });
  }
  Object.defineProperty(req, 'org', { get() { return (this._org ||= billing.orgState(row.org_id)); } });
  next();
}
const perm = (...perms) => (req, res, next) => {
  if (perms.every((p) => req.role.permissions.includes(p))) return next();
  res.status(403).json({ error: `Your role (${req.role.name}) doesn't allow this. Ask a workspace admin for access.`, code: 'forbidden' });
};
function adminOnly(req, res, next) {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Platform owner only' });
  next();
}
function startSession(req, res, user) {
  const token = rid(32);
  db.prepare('INSERT INTO sessions (token, user_id, last_seen, sid, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)').run(vault.hmac(token), user.id, now(), rid(9), ipOf(req), String(req.get('user-agent') || '').slice(0, 160));
  db.prepare('UPDATE users SET last_login_at = ?, last_login_ip = ?, failed_logins = 0, locked_until = NULL WHERE id = ?').run(now(), ipOf(req), user.id);
  res.cookie('sf_session', token, { httpOnly: true, sameSite: 'strict', maxAge: 30 * 864e5, secure: process.env.COOKIE_SECURE === '1' });
}
const publicUser = (u) => {
  const r = access.roleOf(u);
  return { id: u.id, name: u.name, email: u.email, is_admin: !!u.is_admin, org_role: r.key || 'custom', role: { id: r.id, name: r.name, key: r.key }, permissions: r.permissions, totp_enabled: !!u.totp_enabled };
};
function orgSummary(st) {
  if (!st) return null;
  return { id: st.org.id, name: st.org.name, status: st.status, plan: { id: st.plan.id, name: st.plan.name, features: st.plan.features }, trialDaysLeft: st.trialDaysLeft,
    periodEnd: st.periodEnd, usage: st.usage, comped: !!st.org.comped };
}
function passwordCheck(pw, user, orgId) {
  const min = Math.max(10, Number(orgPolicy(orgId).password_min) || 10);
  const p = access.passwordProblem(pw, { min, email: user?.email, name: user?.name });
  if (p) throw new HttpError(400, p);
}
const evt = (req, action, target, details, user) => access.logEvent({ orgId: (user || req.user)?.org_id, userId: (user || req.user)?.id, actor: (req.user || user)?.email, action, target, details, req });

app.get('/api/public-config', (req, res) => {
  const s = getSettings();
  const users = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  res.json({ brand_name: s.brand_name, theme: s.theme, allow_signup: users === 0 || (s.allow_signup === '1' && !priv.isPrivate()), first_run: users === 0, private: priv.isPrivate() });
});

app.post('/api/auth/register', rateLimit('register', 10, 3600e3), wrap(async (req, res) => {
  const { name, email, password, company } = req.body || {};
  const count = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (count > 0 && priv.isPrivate()) throw new HttpError(403, 'This is a private platform. Ask your administrator for an invitation.');
  if (count > 0 && getSettings().allow_signup !== '1') throw new HttpError(403, 'Sign-ups are disabled. Ask an administrator.');
  priv.assertEmailAllowed(email, HttpError);
  if (!name || !email || !password) throw new HttpError(400, 'Name, email and password are required');
  const em = String(email).trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(em)) throw new HttpError(400, 'Enter a valid email address');
  const pp = access.passwordProblem(password, { email: em, name });
  if (pp) throw new HttpError(400, pp);
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(em)) throw new HttpError(400, 'An account with this email already exists');
  const info = db.prepare('INSERT INTO users (name, email, password_hash, is_admin, password_changed_at) VALUES (?, ?, ?, ?, ?)')
    .run(String(name).trim(), em, bcrypt.hashSync(password, 12), count === 0 ? 1 : 0, now());
  billing.createOrg({ name: String(company || '').trim() || `${String(name).trim()}'s workspace`, ownerId: info.lastInsertRowid, platformOwner: count === 0, email: em });
  access.migrateRoles();
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  startSession(req, res, u);
  evt(req, 'account.created', em, 'Workspace created', u);
  res.json({ user: publicUser(u) });
}));

const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 12);
const mfaChallenges = new Map(); // token -> { uid, exp, tries }
setInterval(() => { const t = Date.now(); for (const [k, v] of mfaChallenges) if (v.exp < t) mfaChallenges.delete(k); }, 60e3).unref();

app.post('/api/auth/login', rateLimit('login', 20, 15 * 60e3), (req, res) => {
  const { email, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase());
  if (u?.locked_until && u.locked_until > now()) { evt(req, 'login.blocked', u.email, 'Account locked after repeated failures', u); return res.status(423).json({ error: 'Too many failed sign-ins. This account is locked for 15 minutes.' }); }
  const ok = bcrypt.compareSync(password || '', u ? u.password_hash : DUMMY_HASH);
  if (!u || !ok) {
    if (u) {
      const fails = (u.failed_logins || 0) + 1;
      const lock = fails >= 5 ? new Date(Date.now() + 15 * 60e3).toISOString().replace('T', ' ').slice(0, 19) : null;
      db.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?').run(lock ? 0 : fails, lock, u.id);
      evt(req, lock ? 'login.locked' : 'login.failed', u.email, lock ? 'Locked for 15 minutes after 5 failed attempts' : `Wrong password (attempt ${fails})`, u);
    }
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (u.status !== 'active') { evt(req, 'login.blocked', u.email, 'Disabled account tried to sign in', u); return res.status(403).json({ error: 'This account has been disabled. Contact your workspace admin.' }); }
  if (!access.ipAllowed(ipOf(req), orgPolicy(u.org_id).ip_allowlist)) { evt(req, 'login.blocked', u.email, `Sign-in from ${ipOf(req)} outside the IP allowlist`, u); return res.status(403).json({ error: `Sign-in from your network (${ipOf(req)}) isn't allowed by your workspace's IP allowlist.` }); }
  if (u.totp_enabled) {
    const t = rid(24);
    mfaChallenges.set(t, { uid: u.id, exp: Date.now() + 5 * 60e3, tries: 0 });
    return res.json({ mfa_required: true, mfa_token: t });
  }
  startSession(req, res, u);
  evt(req, 'login.success', u.email, 'Signed in with password', u);
  res.json({ user: publicUser(u) });
});
app.post('/api/auth/login/mfa', rateLimit('login-mfa', 30, 15 * 60e3), (req, res) => {
  const { mfa_token, code, recovery_code } = req.body || {};
  const ch = mfaChallenges.get(String(mfa_token || ''));
  if (!ch || ch.exp < Date.now()) throw new HttpError(401, 'Your sign-in timed out. Enter your password again.');
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(ch.uid);
  if (++ch.tries > 5) { mfaChallenges.delete(mfa_token); evt(req, 'mfa.failed', u.email, 'Too many wrong codes', u); throw new HttpError(429, 'Too many wrong codes. Start again.'); }
  let how;
  if (recovery_code) {
    const codes = JSON.parse(u.recovery_codes || '[]'); const h = access.hashCode(recovery_code);
    if (!codes.includes(h)) { evt(req, 'mfa.failed', u.email, 'Wrong recovery code', u); throw new HttpError(400, "That recovery code isn't valid"); }
    db.prepare('UPDATE users SET recovery_codes = ? WHERE id = ?').run(JSON.stringify(codes.filter((c) => c !== h)), u.id);
    how = `recovery code (${codes.length - 1} left)`;
  } else {
    const step = access.verifyTotp(vault.decStr(u.totp_secret), code, u.totp_last_step);
    if (step == null) { evt(req, 'mfa.failed', u.email, 'Wrong authenticator code', u); throw new HttpError(400, "That code isn't right. Check your authenticator app's clock and try again."); }
    db.prepare('UPDATE users SET totp_last_step = ? WHERE id = ?').run(step, u.id);
    how = 'authenticator app';
  }
  mfaChallenges.delete(mfa_token);
  startSession(req, res, u);
  evt(req, 'login.success', u.email, `Signed in with password + ${how}`, u);
  res.json({ user: publicUser(u) });
});
app.post('/api/auth/logout', (req, res) => {
  if (req.cookies.sf_session) db.prepare('DELETE FROM sessions WHERE token = ?').run(vault.hmac(req.cookies.sf_session));
  res.clearCookie('sf_session');
  res.json({ ok: true });
});
app.get('/api/auth/me', auth, (req, res) => res.json({ user: publicUser(req.user), org: orgSummary(req.org), restricted: req.restricted }));
app.put('/api/auth/me', auth, (req, res) => {
  const { name } = req.body || {};
  if (name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(String(name).trim().slice(0, 80), req.user.id);
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
});

// Invitation / reset links: set a password with a one-time token.
app.get('/api/auth/invite/:token', rateLimit('invite', 30, 15 * 60e3), (req, res) => {
  const u = db.prepare('SELECT u.name, u.email, o.name AS org FROM users u LEFT JOIN organizations o ON o.id = u.org_id WHERE invite_token = ? AND invite_expires > ?').get(vault.hmac(req.params.token), now());
  if (!u) throw new HttpError(404, 'This link has expired or was already used. Ask your admin for a new one.');
  res.json(u);
});
app.post('/api/auth/invite/:token', rateLimit('invite', 30, 15 * 60e3), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE invite_token = ? AND invite_expires > ?').get(vault.hmac(req.params.token), now());
  if (!u) throw new HttpError(404, 'This link has expired or was already used. Ask your admin for a new one.');
  passwordCheck(req.body?.password, u, u.org_id);
  db.prepare('UPDATE users SET password_hash = ?, invite_token = NULL, invite_expires = NULL, must_change_password = 0, password_changed_at = ?, status = ? WHERE id = ?')
    .run(bcrypt.hashSync(req.body.password, 12), now(), u.status === 'invited' ? 'active' : u.status, u.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
  if (fresh.status !== 'active') throw new HttpError(403, 'This account is disabled.');
  startSession(req, res, fresh);
  evt(req, 'password.set', u.email, 'Password set from invitation or reset link', fresh);
  res.json({ user: publicUser(fresh) });
});

// ---------------------------------------------------------------- my account: password, 2FA, sessions
app.get('/api/account', auth, (req, res) => {
  const u = req.user;
  res.json({
    user: publicUser(u), restricted: req.restricted, policy: orgPolicy(u.org_id), mfaRequired: needs2fa(u, orgPolicy(u.org_id)),
    recovery_left: JSON.parse(u.recovery_codes || '[]').length, password_changed_at: u.password_changed_at, last_login_at: u.last_login_at,
    sessions: db.prepare('SELECT sid, created_at, last_seen, ip, user_agent, token FROM sessions WHERE user_id = ? ORDER BY last_seen DESC').all(u.id)
      .map((s) => ({ sid: s.sid, created_at: s.created_at, last_seen: s.last_seen, ip: s.ip, user_agent: s.user_agent, current: s.token === req.sessionKey })),
  });
});
app.post('/api/account/password', auth, rateLimit('pw', 10, 15 * 60e3), (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!bcrypt.compareSync(current_password || '', req.user.password_hash)) throw new HttpError(400, 'Current password is incorrect');
  if (bcrypt.compareSync(new_password || '', req.user.password_hash)) throw new HttpError(400, 'Choose a password you have not used here before');
  passwordCheck(new_password, req.user, req.user.org_id);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, password_changed_at = ? WHERE id = ?').run(bcrypt.hashSync(new_password, 12), now(), req.user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(req.user.id, req.sessionKey);
  evt(req, 'password.changed', req.user.email, 'Changed password; other sessions signed out');
  res.json({ ok: true });
});
app.post('/api/account/2fa/setup', auth, wrap(async (req, res) => {
  if (req.user.totp_enabled) throw new HttpError(400, 'Two-factor authentication is already on');
  const secret = access.newTotpSecret();
  db.prepare('UPDATE users SET totp_pending = ? WHERE id = ?').run(vault.encStr(secret), req.user.id);
  const uri = access.otpauthUri(secret, req.user.email, getSettings().brand_name);
  res.json({ secret: secret.match(/.{1,4}/g).join(' '), uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) });
}));
app.post('/api/account/2fa/enable', auth, rateLimit('mfa-enable', 20, 15 * 60e3), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!u.totp_pending) throw new HttpError(400, 'Start the setup first');
  const secret = vault.decStr(u.totp_pending);
  const step = access.verifyTotp(secret, req.body?.code, null);
  if (step == null) throw new HttpError(400, "That code isn't right. Make sure your phone's time is set automatically.");
  const codes = access.newRecoveryCodes();
  db.prepare('UPDATE users SET totp_secret = ?, totp_pending = NULL, totp_enabled = 1, totp_last_step = ?, recovery_codes = ? WHERE id = ?').run(vault.encStr(secret), step, JSON.stringify(codes.map(access.hashCode)), u.id);
  evt(req, 'mfa.enabled', u.email, 'Turned on two-factor authentication');
  res.json({ ok: true, recovery_codes: codes });
});
app.post('/api/account/2fa/disable', auth, rateLimit('mfa-disable', 10, 15 * 60e3), (req, res) => {
  const u = req.user;
  if (needs2fa(u, orgPolicy(u.org_id))) throw new HttpError(400, 'Your workspace requires two-factor authentication, so it can’t be turned off.');
  if (!bcrypt.compareSync(req.body?.password || '', u.password_hash)) throw new HttpError(400, 'Password is incorrect');
  if (access.verifyTotp(vault.decStr(u.totp_secret), req.body?.code, null) == null) throw new HttpError(400, "That code isn't right");
  db.prepare('UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_last_step = NULL, recovery_codes = NULL WHERE id = ?').run(u.id);
  evt(req, 'mfa.disabled', u.email, 'Turned off two-factor authentication');
  res.json({ ok: true });
});
app.post('/api/account/2fa/recovery-codes', auth, (req, res) => {
  const u = req.user;
  if (!u.totp_enabled) throw new HttpError(400, 'Turn on two-factor authentication first');
  if (access.verifyTotp(vault.decStr(u.totp_secret), req.body?.code, null) == null) throw new HttpError(400, "That code isn't right");
  const codes = access.newRecoveryCodes();
  db.prepare('UPDATE users SET recovery_codes = ? WHERE id = ?').run(JSON.stringify(codes.map(access.hashCode)), u.id);
  evt(req, 'mfa.recovery_regenerated', u.email, 'Generated new recovery codes');
  res.json({ recovery_codes: codes });
});
app.delete('/api/account/sessions/:sid', auth, (req, res) => {
  const r = db.prepare('DELETE FROM sessions WHERE user_id = ? AND sid = ? AND token != ?').run(req.user.id, req.params.sid, req.sessionKey);
  if (r.changes) evt(req, 'session.revoked', req.user.email, 'Signed out another device');
  res.json({ ok: true });
});
app.post('/api/account/sessions/revoke-others', auth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(req.user.id, req.sessionKey);
  evt(req, 'session.revoked', req.user.email, 'Signed out all other devices');
  res.json({ ok: true });
});

// ---------------------------------------------------------------- workflow
/** Load a document the user may access. mode: view | modify | delete | download. */
function getDoc(id, user, mode = 'view') {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  if (!doc) throw new HttpError(404, 'Document not found');
  const P = access.roleOf(user).permissions;
  const mine = doc.owner_id === user.id;
  const sameOrg = !mine && db.prepare('SELECT org_id FROM users WHERE id = ?').get(doc.owner_id)?.org_id === user.org_id;
  if (!mine && !(sameOrg && P.includes('documents.view_all'))) throw new HttpError(404, 'Document not found');
  const deny = () => { throw new HttpError(403, "Your role doesn't allow this on this document. Ask a workspace admin for access."); };
  if (mode === 'modify' && !((mine && P.includes('documents.send')) || (sameOrg && P.includes('documents.manage_all')))) deny();
  if (mode === 'delete' && !(P.includes('documents.delete') && (mine || P.includes('documents.manage_all')))) deny();
  if (mode === 'download' && !P.includes('documents.download')) deny();
  return doc;
}
const recipientsOf = (docId) => db.prepare('SELECT * FROM recipients WHERE document_id = ? ORDER BY order_index, id').all(docId);
const fieldsOf = (docId) => db.prepare('SELECT * FROM fields WHERE document_id = ? ORDER BY page, y, x').all(docId).map((f) => ({ ...f, value: vault.decStr(f.value) }));
const parseJson = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const docControls = (doc) => parseJson(doc.controls, ['email']);
const docJurisdictions = (doc) => (doc.jurisdictions || '').split(',').filter(Boolean);
function sendPdf(res, name, downloadAs) {
  res.type('application/pdf');
  if (downloadAs) res.setHeader('Content-Disposition', `attachment; filename="${downloadAs.replace(/[^\w\- ().]+/g, '')}"`);
  res.send(vault.readFile(filePath(name)));
}
const ownerOf = (doc) => db.prepare('SELECT * FROM users WHERE id = ?').get(doc.owner_id);

function fmtExpiry(doc) {
  if (!doc.expires_at) return 'no expiry';
  return new Date(doc.expires_at.replace(' ', 'T') + 'Z').toDateString();
}

/** Which actionable recipients may act right now. */
function currentTurn(doc, recips) {
  const open = recips.filter((r) => ACTIONABLE.includes(r.role) && !['signed', 'declined'].includes(r.status));
  if (!doc.sequential) return open;
  if (!open.length) return [];
  const minOrder = Math.min(...open.map((r) => r.order_index));
  return open.filter((r) => r.order_index === minOrder);
}

async function dispatch(doc, base) {
  const recips = recipientsOf(doc.id);
  const owner = ownerOf(doc);
  for (const r of currentTurn(doc, recips)) {
    if (r.status !== 'pending') continue;
    db.prepare("UPDATE recipients SET status = 'sent', sent_at = ? WHERE id = ?").run(now(), r.id);
    await sendEmail(r.email, 'sign_request', {
      recipient_name: r.name, sender_name: owner.name, sender_email: owner.email, document_title: doc.title,
      message: doc.message || '', expires_at: fmtExpiry(doc), action_link: `${base}/sign/${r.token}`,
    });
    audit(doc.id, 'Sent', owner.email, null, `Signing request emailed to ${r.name} <${r.email}>`);
  }
}

async function completeDocument(doc, base) {
  db.prepare("UPDATE documents SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?").run(now(), now(), doc.id);
  audit(doc.id, 'Completed', null, null, 'All recipients have completed the document');
  doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(doc.id);
  const s = getSettings();
  const { bytes, hash } = await finalizeDocument({
    originalBytes: vault.readFile(filePath(doc.file_name)), doc,
    recipients: recipientsOf(doc.id), fields: fieldsOf(doc.id),
    auditRows: db.prepare('SELECT * FROM audit WHERE document_id = ? ORDER BY id').all(doc.id),
    brandName: s.brand_name, accent: THEME_ACCENTS[s.theme] || THEME_ACCENTS.ocean,
    compliance: parseJson(doc.compliance_json, null), jurisdictions: docJurisdictions(doc).map((c) => C.byCode[c]?.name || c),
    chainHead: verifyAuditChain(doc.id).head, seal,
  });
  const signedName = `signed-${doc.uid}.pdf`;
  vault.writeFile(filePath(signedName), bytes);
  const years = parseJson(doc.compliance_json, {}).retentionYears || 7;
  const retain = new Date(Date.now() + years * 365.25 * 864e5).toISOString().replace('T', ' ').slice(0, 19);
  db.prepare('UPDATE documents SET signed_name = ?, final_hash = ?, sealed = 1, retain_until = ? WHERE id = ?').run(signedName, hash, retain, doc.id);
  audit(doc.id, 'Sealed', null, null, `Signed PDF sealed with certificate ${seal.info().fingerprint.slice(0, 23)}…; SHA-256 ${hash.slice(0, 16)}…; retained until ${retain.slice(0, 10)}`);

  const owner = ownerOf(doc);
  const vars = { sender_name: owner.name, document_title: doc.title };
  await sendEmail(owner.email, 'completed', { ...vars, recipient_name: owner.name, action_link: `${base}/app#/documents/${doc.id}` });
  for (const r of recipientsOf(doc.id)) {
    await sendEmail(r.email, r.role === 'viewer' ? 'viewer_copy' : 'completed', { ...vars, recipient_name: r.name, action_link: `${base}/sign/${r.token}` });
  }
}

function expireDocuments() {
  const rows = db.prepare("SELECT id FROM documents WHERE status = 'in_progress' AND expires_at IS NOT NULL AND expires_at < ?").all(now());
  for (const r of rows) {
    db.prepare("UPDATE documents SET status = 'expired', updated_at = ? WHERE id = ?").run(now(), r.id);
    audit(r.id, 'Expired', null, null, 'The signing deadline passed');
  }
}
setInterval(expireDocuments, 10 * 60 * 1000);

// ---------------------------------------------------------------- dashboard
app.get('/api/stats', auth, (req, res) => {
  expireDocuments();
  const uid = req.user.id;
  const counts = Object.fromEntries(db.prepare('SELECT status, COUNT(*) c FROM documents WHERE owner_id = ? GROUP BY status').all(uid).map((r) => [r.status, r.c]));
  const soon = new Date(Date.now() + 3 * 864e5).toISOString().replace('T', ' ').slice(0, 19);
  const expiring = db.prepare("SELECT id, title, expires_at FROM documents WHERE owner_id = ? AND status = 'in_progress' AND expires_at < ? ORDER BY expires_at").all(uid, soon);
  const waitingForMe = db.prepare(`SELECT r.token, d.title, d.sent_at, u.name AS sender FROM recipients r JOIN documents d ON d.id = r.document_id JOIN users u ON u.id = d.owner_id
    WHERE r.email = ? AND d.status = 'in_progress' AND r.status IN ('sent','viewed') ORDER BY d.sent_at DESC`).all(req.user.email);
  const recent = db.prepare('SELECT d.id, d.title, d.status, d.updated_at, (SELECT COUNT(*) FROM recipients WHERE document_id = d.id) AS recipients FROM documents d WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 8').all(uid);
  const activity = db.prepare('SELECT a.*, d.title FROM audit a JOIN documents d ON d.id = a.document_id WHERE d.owner_id = ? ORDER BY a.id DESC LIMIT 12').all(uid);
  const month = db.prepare("SELECT COUNT(*) c FROM documents WHERE owner_id = ? AND status = 'completed' AND completed_at >= date('now','start of month')").get(uid).c;
  res.json({ counts, expiring, waitingForMe, recent, activity, completedThisMonth: month });
});

// ---------------------------------------------------------------- documents
app.get('/api/documents', auth, (req, res) => {
  expireDocuments();
  const { status, q } = req.query;
  let sql = `SELECT d.*, (SELECT COUNT(*) FROM recipients WHERE document_id = d.id) AS recipient_count,
    (SELECT COUNT(*) FROM recipients WHERE document_id = d.id AND status = 'signed') AS signed_count,
    (SELECT group_concat(name, ', ') FROM recipients WHERE document_id = d.id) AS recipient_names,
    (SELECT name FROM users WHERE id = d.owner_id) AS owner_name
    FROM documents d WHERE ${req.role.permissions.includes('documents.view_all') && req.query.scope !== 'mine' ? 'owner_id IN (SELECT id FROM users WHERE org_id = ?)' : 'owner_id = ?'}`;
  const args = [req.role.permissions.includes('documents.view_all') && req.query.scope !== 'mine' ? req.user.org_id : req.user.id];
  if (status && status !== 'all') {
    if (status === 'closed') sql += " AND status IN ('declined','expired','recalled')";
    else { sql += ' AND status = ?'; args.push(status); }
  }
  if (q) { sql += ' AND title LIKE ?'; args.push(`%${q}%`); }
  res.json(db.prepare(sql + ' ORDER BY updated_at DESC').all(...args));
});

app.post('/api/documents', auth, perm('documents.send'), upload.single('file'), wrap(async (req, res) => {
  const pages = await validatePdf(req.file);
  const uid = rid(8).toUpperCase();
  const fileName = `doc-${uid}.pdf`;
  vault.writeFile(filePath(fileName), req.file.buffer);
  const s0 = getSettings();
  const title = (req.body.title || req.file.originalname.replace(/\.pdf$/i, '')).slice(0, 200);
  const info = db.prepare('INSERT INTO documents (uid, owner_id, title, file_name, original_hash, expiry_days, jurisdictions, category, value_band, controls) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(uid, req.user.id, title, fileName, sha256(req.file.buffer), Number(s0.default_expiry_days) || 15, s0.default_jurisdictions || 'IN', 'commercial', 'lt10k', s0.min_controls || '["email"]');
  audit(info.lastInsertRowid, 'Created', req.user.email, ipOf(req), `Uploaded "${req.file.originalname}" (${pages} pages)`);
  res.json({ id: info.lastInsertRowid });
}));

app.get('/api/documents/:id', auth, (req, res) => {
  const doc = getDoc(req.params.id, req.user);
  res.json({
    ...doc,
    recipients: recipientsOf(doc.id).map(({ token, ...r }) => ({ ...r, has_token: !!token })),
    fields: fieldsOf(doc.id),
    audit: db.prepare('SELECT * FROM audit WHERE document_id = ? ORDER BY id DESC').all(doc.id),
    access_code_hash: undefined, has_access_code: !!doc.access_code_hash,
    jurisdictions: docJurisdictions(doc), controls: docControls(doc), compliance: parseJson(doc.compliance_json, null),
    assessment: assessDoc(doc),
  });
});

app.get('/api/documents/:id/file', auth, (req, res) => {
  const doc = getDoc(req.params.id, req.user, 'view');
  sendPdf(res, doc.file_name);
});
app.get('/api/documents/:id/signed-file', auth, (req, res) => {
  const doc = getDoc(req.params.id, req.user, 'view');
  if (!doc.signed_name) throw new HttpError(404, 'Not completed yet');
  sendPdf(res, doc.signed_name);
});
app.get('/api/documents/:id/download', auth, (req, res) => {
  const doc = getDoc(req.params.id, req.user, 'download');
  const name = doc.signed_name || doc.file_name;
  evt(req, 'document.downloaded', doc.title, `#${doc.uid}${doc.signed_name ? ' (signed copy)' : ''}`);
  sendPdf(res, name, `${doc.title}${doc.signed_name ? ' (signed)' : ''}.pdf`);
});

function writeRecipientsAndFields(table, parentCol, parentId, recipients, fields) {
  // used for documents only
  db.prepare('DELETE FROM fields WHERE document_id = ?').run(parentId);
  db.prepare('DELETE FROM recipients WHERE document_id = ?').run(parentId);
  const ids = recipients.map((r, i) => db.prepare('INSERT INTO recipients (document_id, name, email, role, order_index, color) VALUES (?, ?, ?, ?, ?, ?)')
    .run(parentId, String(r.name || '').trim(), String(r.email || '').trim().toLowerCase(), ['signer', 'approver', 'viewer'].includes(r.role) ? r.role : 'signer', Number(r.order_index ?? i), r.color || COLORS[i % COLORS.length]).lastInsertRowid);
  const ins = db.prepare('INSERT INTO fields (document_id, recipient_id, type, page, x, y, w, h, required, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const f of fields) {
    if (!FIELD_TYPES.includes(f.type) || ids[f.assignee] === undefined) continue;
    ins.run(parentId, ids[f.assignee], f.type, f.page, f.x, f.y, f.w, f.h, f.required ? 1 : 0, f.label || null);
  }
}

app.put('/api/documents/:id', auth, (req, res) => {
  const doc = getDoc(req.params.id, req.user, 'modify');
  if (doc.status !== 'draft') throw new HttpError(400, 'Only drafts can be edited');
  const b = req.body || {};
  db.transaction(() => {
    db.prepare('UPDATE documents SET title = ?, message = ?, sequential = ?, expiry_days = ?, updated_at = ? WHERE id = ?')
      .run(String(b.title || doc.title).slice(0, 200), b.message || '', b.sequential ? 1 : 0, Math.max(1, Number(b.expiry_days) || 15), now(), doc.id);
    if (Array.isArray(b.recipients)) writeRecipientsAndFields('documents', 'document_id', doc.id, b.recipients, b.fields || []);
    if (Array.isArray(b.jurisdictions)) {
      const js = b.jurisdictions.filter((c) => C.byCode[c]).slice(0, 10);
      const controls = (Array.isArray(b.controls) ? b.controls : ['email']).filter((c) => C.CONTROLS[c] || c === 'access_code');
      if (!controls.includes('email')) controls.unshift('email');
      db.prepare('UPDATE documents SET jurisdictions = ?, category = ?, value_band = ?, controls = ? WHERE id = ?')
        .run(js.join(','), C.CATEGORIES[b.category] ? b.category : 'commercial', C.VALUE_BANDS.some((v) => v.id === b.value_band) ? b.value_band : 'lt10k', JSON.stringify(controls), doc.id);
    }
    if (typeof b.access_code === 'string' && b.access_code.trim()) {
      if (b.access_code.trim().length < 4) throw new HttpError(400, 'The access code must be at least 4 characters');
      db.prepare('UPDATE documents SET access_code_hash = ? WHERE id = ?').run(vault.hmac(b.access_code.trim()), doc.id);
    }
  })();
  res.json({ ok: true, assessment: assessDoc(db.prepare('SELECT * FROM documents WHERE id = ?').get(doc.id)) });
});

app.post('/api/documents/:id/send', auth, wrap(async (req, res) => {
  const doc = getDoc(req.params.id, req.user, 'modify');
  if (doc.status !== 'draft') throw new HttpError(400, 'This document has already been sent');
  const recips = recipientsOf(doc.id);
  const fields = fieldsOf(doc.id);
  if (!recips.some((r) => ACTIONABLE.includes(r.role))) throw new HttpError(400, 'Add at least one signer or approver');
  for (const r of recips) {
    if (!r.name || !/^\S+@\S+\.\S+$/.test(r.email)) throw new HttpError(400, `Recipient "${r.name || r.email}" needs a valid name and email`);
    if (r.role === 'signer' && !fields.some((f) => f.recipient_id === r.id && f.type === 'signature'))
      throw new HttpError(400, `Add a signature field for ${r.name}`);
  }
  // ---- plan limits, compliance & risk gate
  const a = assessDoc(doc);
  const controls = docControls(doc);
  billing.assertCan(req.org, 'send', controls);
  const st = getSettings();
  const orgMin = parseJson(st.min_controls, ['email']).filter((c) => !controls.includes(c));
  if (orgMin.length) throw new HttpError(400, `Your organisation requires: ${orgMin.map((c) => C.CONTROLS[c]?.label || c).join(', ')}`);
  if (controls.includes('access_code') && !doc.access_code_hash) throw new HttpError(400, 'Set the access code you will share with recipients');
  if (controls.includes('qes') && !st.qes_provider) throw new HttpError(400, 'Qualified signatures need a connected trust service provider (Settings › Security). Remove the qualified-signature control or connect a provider.');
  if (st.enforce_compliance === '1') {
    if (a.blocked) throw new HttpError(400, `This document can't be sent for electronic signature. ${a.reasons.join(' ')}`);
    if (!a.canSend) throw new HttpError(400, `Risk policy: ${a.reasons.join(' ')}`);
  }
  const expires = new Date(Date.now() + doc.expiry_days * 864e5).toISOString().replace('T', ' ').slice(0, 19);
  db.transaction(() => {
    for (const r of recips) db.prepare('UPDATE recipients SET token = ? WHERE id = ?').run(rid(24), r.id);
    db.prepare("UPDATE documents SET status = 'in_progress', sent_at = ?, expires_at = ?, updated_at = ?, risk_score = ?, risk_level = ?, required_level = ?, compliance_json = ? WHERE id = ?")
      .run(now(), expires, now(), a.score, a.level, a.requiredLevel, JSON.stringify(a), doc.id);
  })();
  audit(doc.id, 'Compliance check', req.user.email, ipOf(req), `Jurisdictions ${docJurisdictions(doc).join(', ') || '—'}; ${C.CATEGORIES[doc.category]?.label || 'Commercial'}; risk ${a.score}/100 (${a.level}); required ${a.requiredLevel}; controls ${controls.join(', ')}${a.formalities.length ? '; formalities: ' + a.formalities.map((f) => f.text).join(' | ') : ''}`);
  audit(doc.id, 'Submitted', req.user.email, ipOf(req), `Sent for signature to ${recips.length} recipient(s)${doc.sequential ? ' in order' : ' in parallel'}`);
  await dispatch(db.prepare('SELECT * FROM documents WHERE id = ?').get(doc.id), baseUrl(req));
  res.json({ ok: true });
}));

app.post('/api/documents/:id/remind', auth, wrap(async (req, res) => {
  const doc = getDoc(req.params.id, req.user, 'modify');
  if (doc.status !== 'in_progress') throw new HttpError(400, 'Only in-progress documents can be reminded');
  const base = baseUrl(req);
  let n = 0;
  for (const r of currentTurn(doc, recipientsOf(doc.id))) {
    if (!['sent', 'viewed'].includes(r.status)) continue;
    await sendEmail(r.email, 'reminder', { recipient_name: r.name, sender_name: req.user.name, document_title: doc.title, expires_at: fmtExpiry(doc), action_link: `${base}/sign/${r.token}` });
    audit(doc.id, 'Reminder', req.user.email, ipOf(req), `Reminder sent to ${r.name} <${r.email}>`);
    n++;
  }
  res.json({ ok: true, reminded: n });
}));

app.post('/api/documents/:id/recall', auth, (req, res) => {
  const doc = getDoc(req.params.id, req.user, 'modify');
  if (doc.status !== 'in_progress') throw new HttpError(400, 'Only in-progress documents can be recalled');
  db.prepare("UPDATE documents SET status = 'recalled', updated_at = ? WHERE id = ?").run(now(), doc.id);
  audit(doc.id, 'Recalled', req.user.email, ipOf(req), req.body?.reason || 'Recalled by sender');
  res.json({ ok: true });
});

app.post('/api/documents/:id/duplicate', auth, perm('documents.send'), (req, res) => {
  const doc = getDoc(req.params.id, req.user);
  const uid = rid(8).toUpperCase();
  const fileName = `doc-${uid}.pdf`;
  fs.copyFileSync(filePath(doc.file_name), filePath(fileName));
  const id = db.transaction(() => {
    const newId = db.prepare('INSERT INTO documents (uid, owner_id, title, file_name, original_hash, message, sequential, expiry_days, template_id, jurisdictions, category, value_band, controls) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(uid, req.user.id, `${doc.title} (copy)`, fileName, doc.original_hash, doc.message, doc.sequential, doc.expiry_days, doc.template_id, doc.jurisdictions, doc.category, doc.value_band, doc.controls).lastInsertRowid;
    const recips = recipientsOf(doc.id);
    writeRecipientsAndFields(null, null, newId, recips, fieldsOf(doc.id).map((f) => ({ ...f, assignee: recips.findIndex((r) => r.id === f.recipient_id) })));
    return newId;
  })();
  audit(id, 'Created', req.user.email, ipOf(req), `Duplicated from document ${doc.uid}`);
  res.json({ id });
});

app.delete('/api/documents/:id', auth, (req, res) => {
  const doc = getDoc(req.params.id, req.user, 'delete');
  if (doc.retain_until && doc.retain_until > now()) throw new HttpError(423, `This signed document is under a retention hold until ${doc.retain_until.slice(0, 10)} (record-keeping rules for its jurisdiction). It can't be deleted before then.`);
  db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);
  for (const n of [doc.file_name, doc.signed_name]) if (n) fs.rmSync(filePath(n), { force: true });
  evt(req, 'document.deleted', doc.title, `#${doc.uid} (${doc.status})`);
  res.json({ ok: true });
});

app.post('/api/documents/:id/save-as-template', auth, perm('templates.manage'), (req, res) => {
  billing.assertCan(req.org, 'template');
  const doc = getDoc(req.params.id, req.user);
  const fileName = `tpl-${rid(8)}.pdf`;
  fs.copyFileSync(filePath(doc.file_name), filePath(fileName));
  const recips = recipientsOf(doc.id);
  const tid = db.transaction(() => {
    const t = db.prepare('INSERT INTO templates (owner_id, org_id, name, description, category, file_name, message, sequential) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.id, req.user.org_id, req.body?.name || doc.title, req.body?.description || '', req.body?.category || 'General', fileName, doc.message, doc.sequential).lastInsertRowid;
    recips.forEach((r, i) => db.prepare('INSERT INTO template_roles (template_id, name, role, order_index, color) VALUES (?, ?, ?, ?, ?)').run(t, r.role === 'viewer' ? `Viewer ${i + 1}` : `Signer ${i + 1}`, r.role, r.order_index, r.color));
    const ins = db.prepare('INSERT INTO template_fields (template_id, role_index, type, page, x, y, w, h, required, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const f of fieldsOf(doc.id)) ins.run(t, recips.findIndex((r) => r.id === f.recipient_id), f.type, f.page, f.x, f.y, f.w, f.h, f.required, f.label);
    return t;
  })();
  res.json({ id: tid });
});

function assessDoc(doc) {
  return C.assess({ jurisdictions: docJurisdictions(doc), category: doc.category || 'commercial', value: doc.value_band || 'lt10k', controls: docControls(doc) });
}

app.get('/api/documents/:id/integrity', auth, (req, res) => {
  const doc = getDoc(req.params.id, req.user);
  const chain = verifyAuditChain(doc.id);
  const out = { chain, encryptedAtRest: false, original: null, signed: null, sealed: !!doc.sealed, seal: doc.sealed ? seal.info() : null };
  try {
    const raw = fs.readFileSync(filePath(doc.file_name));
    out.encryptedAtRest = vault.isEncrypted(raw);
    out.original = { ok: sha256(vault.decrypt(raw)) === doc.original_hash };
  } catch { out.original = { ok: false, error: 'Stored file failed authentication (possible tampering)' }; }
  if (doc.signed_name) {
    try { out.signed = { ok: sha256(vault.readFile(filePath(doc.signed_name))) === doc.final_hash }; }
    catch { out.signed = { ok: false, error: 'Signed file failed authentication (possible tampering)' }; }
  }
  out.ok = chain.valid && out.original?.ok !== false && out.signed?.ok !== false;
  res.json(out);
});

app.get('/api/compliance', (req, res) => {
  res.json({ reviewed: C.RULES_REVIEWED, levels: C.LEVELS, categories: C.CATEGORIES, valueBands: C.VALUE_BANDS, controls: C.CONTROLS, jurisdictions: C.JURISDICTIONS });
});
app.post('/api/compliance/assess', auth, (req, res) => res.json(C.assess(req.body || {})));

app.get('/api/security', auth, adminOnly, (req, res) => {
  const files = fs.readdirSync(FILES_DIR).filter((f) => f.endsWith('.pdf'));
  const enc = files.filter((f) => { try { const fd = fs.openSync(filePath(f), 'r'); const b = Buffer.alloc(4); fs.readSync(fd, b, 0, 4, 0); fs.closeSync(fd); return b.toString() === 'SFE1'; } catch { return false; } }).length;
  const s = getSettings();
  res.json({
    encryption: { algorithm: 'AES-256-GCM', keySource: vault.keySource(), files: files.length, encrypted: enc },
    seal: seal.info(),
    sessions: db.prepare('SELECT COUNT(*) c FROM sessions').get().c,
    policies: { session_idle_hours: s.session_idle_hours, min_controls: parseJson(s.min_controls, ['email']), default_jurisdictions: s.default_jurisdictions, allow_recipient_download: s.allow_recipient_download, data_region: s.data_region, enforce_compliance: s.enforce_compliance, qes_provider: s.qes_provider || '', idv_provider: s.idv_provider || 'demo' },
  });
});
app.post('/api/security/encrypt-legacy', auth, adminOnly, (req, res) => {
  let n = 0;
  for (const f of fs.readdirSync(FILES_DIR).filter((x) => x.endsWith('.pdf'))) {
    const raw = fs.readFileSync(filePath(f));
    if (!vault.isEncrypted(raw)) { vault.writeFile(filePath(f), raw); n++; }
  }
  res.json({ encrypted: n });
});

// ---------------------------------------------------------------- templates
function getTemplate(id, user, write = false) {
  const t = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
  if (!t || (t.owner_id && t.owner_id !== user.id && t.org_id !== user.org_id)) throw new HttpError(404, 'Template not found');
  if (write && t.builtin && !user.is_admin) throw new HttpError(403, 'Only administrators can modify built-in templates');
  return t;
}

app.get('/api/templates', auth, (req, res) => {
  const rows = db.prepare(`SELECT t.*, (SELECT COUNT(*) FROM template_roles WHERE template_id = t.id) AS role_count,
    (SELECT COUNT(*) FROM template_fields WHERE template_id = t.id) AS field_count,
    (SELECT COUNT(*) FROM documents WHERE template_id = t.id) AS use_count
    FROM templates t WHERE owner_id IS NULL OR owner_id = ? OR org_id = ? ORDER BY builtin DESC, category, name`).all(req.user.id, req.user.org_id);
  res.json(rows.map((t) => ({ ...t, vars: LIB[t.builtin_key]?.vars?.map(([key, label, example]) => ({ key, label, example })) || [] })));
});
app.post('/api/templates', auth, perm('templates.manage'), upload.single('file'), wrap(async (req, res) => {
  billing.assertCan(req.org, 'template');
  await validatePdf(req.file);
  const fileName = `tpl-${rid(8)}.pdf`;
  vault.writeFile(filePath(fileName), req.file.buffer);
  const id = db.prepare('INSERT INTO templates (owner_id, org_id, name, description, category, file_name) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.id, req.user.org_id, (req.body.name || req.file.originalname.replace(/\.pdf$/i, '')).slice(0, 200), req.body.description || '', req.body.category || 'General', fileName).lastInsertRowid;
  db.prepare("INSERT INTO template_roles (template_id, name, role, order_index, color) VALUES (?, 'Signer 1', 'signer', 0, ?)").run(id, COLORS[0]);
  res.json({ id });
}));
app.get('/api/templates/:id', auth, (req, res) => {
  const t = getTemplate(req.params.id, req.user);
  res.json({
    ...t,
    roles: db.prepare('SELECT * FROM template_roles WHERE template_id = ? ORDER BY order_index, id').all(t.id),
    fields: db.prepare('SELECT * FROM template_fields WHERE template_id = ?').all(t.id),
    vars: LIB[t.builtin_key]?.vars?.map(([key, label, example]) => ({ key, label, example })) || [],
  });
});
app.get('/api/templates/:id/file', auth, (req, res) => {
  const t = getTemplate(req.params.id, req.user);
  sendPdf(res, t.file_name);
});
app.put('/api/templates/:id', auth, perm('templates.manage'), (req, res) => {
  const t = getTemplate(req.params.id, req.user, true);
  const b = req.body || {};
  db.transaction(() => {
    db.prepare('UPDATE templates SET name = ?, description = ?, category = ?, message = ?, sequential = ? WHERE id = ?')
      .run(String(b.name || t.name).slice(0, 200), b.description ?? t.description, b.category || t.category, b.message ?? '', b.sequential ? 1 : 0, t.id);
    if (Array.isArray(b.roles)) {
      db.prepare('DELETE FROM template_roles WHERE template_id = ?').run(t.id);
      db.prepare('DELETE FROM template_fields WHERE template_id = ?').run(t.id);
      b.roles.forEach((r, i) => db.prepare('INSERT INTO template_roles (template_id, name, role, order_index, color) VALUES (?, ?, ?, ?, ?)')
        .run(t.id, String(r.name || `Role ${i + 1}`), ['signer', 'approver', 'viewer'].includes(r.role) ? r.role : 'signer', Number(r.order_index ?? i), r.color || COLORS[i % COLORS.length]));
      const ins = db.prepare('INSERT INTO template_fields (template_id, role_index, type, page, x, y, w, h, required, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      for (const f of b.fields || []) if (FIELD_TYPES.includes(f.type) && b.roles[f.assignee]) ins.run(t.id, f.assignee, f.type, f.page, f.x, f.y, f.w, f.h, f.required ? 1 : 0, f.label || null);
    }
  })();
  res.json({ ok: true });
});
app.delete('/api/templates/:id', auth, perm('templates.manage'), (req, res) => {
  const t = getTemplate(req.params.id, req.user, true);
  db.prepare('DELETE FROM templates WHERE id = ?').run(t.id);
  fs.rmSync(filePath(t.file_name), { force: true });
  res.json({ ok: true });
});
app.post('/api/templates/:id/duplicate', auth, perm('templates.manage'), (req, res) => {
  billing.assertCan(req.org, 'template');
  const t = getTemplate(req.params.id, req.user);
  const fileName = `tpl-${rid(8)}.pdf`;
  fs.copyFileSync(filePath(t.file_name), filePath(fileName));
  const id = db.transaction(() => {
    const nid = db.prepare('INSERT INTO templates (owner_id, org_id, name, description, category, file_name, message, sequential) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.id, req.user.org_id, `${t.name} (my copy)`, t.description, t.category, fileName, t.message, t.sequential).lastInsertRowid;
    db.prepare('INSERT INTO template_roles (template_id, name, role, order_index, color) SELECT ?, name, role, order_index, color FROM template_roles WHERE template_id = ? ORDER BY order_index, id').run(nid, t.id);
    db.prepare('INSERT INTO template_fields (template_id, role_index, type, page, x, y, w, h, required, label) SELECT ?, role_index, type, page, x, y, w, h, required, label FROM template_fields WHERE template_id = ?').run(nid, t.id);
    return nid;
  })();
  res.json({ id });
});

app.post('/api/templates/:id/use', auth, perm('templates.use', 'documents.send'), wrap(async (req, res) => {
  const t = getTemplate(req.params.id, req.user);
  const roles = db.prepare('SELECT * FROM template_roles WHERE template_id = ? ORDER BY order_index, id').all(t.id);
  const people = req.body?.recipients || [];
  const uid = rid(8).toUpperCase();
  const fileName = `doc-${uid}.pdf`;
  const values = Object.fromEntries(Object.entries(req.body?.variables || {}).map(([k, v]) => [k, String(v).slice(0, 300)]));
  const rendered = await renderTemplateForUse(t, values, () => vault.readFile(filePath(t.file_name)));
  const buf = rendered.bytes;
  vault.writeFile(filePath(fileName), buf);
  const id = db.transaction(() => {
    const s0 = getSettings();
    const docId = db.prepare('INSERT INTO documents (uid, owner_id, title, file_name, original_hash, message, sequential, expiry_days, template_id, jurisdictions, category, value_band, controls) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(uid, req.user.id, String(req.body?.title || t.name).slice(0, 200), fileName, sha256(buf), t.message, t.sequential, Number(s0.default_expiry_days) || 15, t.id, s0.default_jurisdictions || 'IN', LIB[t.builtin_key]?.ccat || TEMPLATE_CATEGORY[t.category] || 'commercial', 'lt10k', s0.min_controls || '["email"]').lastInsertRowid;
    const recips = roles.map((r, i) => ({ name: people[i]?.name || '', email: people[i]?.email || '', role: r.role, order_index: r.order_index, color: r.color }));
    const fields = rendered.fields.map((f) => ({ ...f, assignee: f.role_index }));
    writeRecipientsAndFields(null, null, docId, recips, fields);
    return docId;
  })();
  audit(id, 'Created', req.user.email, ipOf(req), `Created from template "${t.name}"${Object.keys(values).length ? ` with ${Object.keys(values).length} filled-in details` : ''}`);
  res.json({ id });
}));

const TEMPLATE_CATEGORY = { Legal: 'nda', HR: 'hr_offer', 'Real Estate': 'lease', Sales: 'commercial', General: 'commercial', Finance: 'loan', Healthcare: 'healthcare', Corporate: 'corporate', Procurement: 'commercial' };

// ---------------------------------------------------------------- settings, email templates, outbox
app.get('/api/settings', auth, (req, res) => {
  const s = getSettings();
  if (!req.user.is_admin) return res.json({ brand_name: s.brand_name, theme: s.theme });
  const masked = Object.fromEntries(billing.SECRET_KEYS.map((k) => [k, s[k] ? '••••••••' : '']));
  res.json({ ...s, ...masked, smtp_pass: s.smtp_pass ? '••••••••' : '' });
});
app.put('/api/settings', auth, adminOnly, (req, res) => {
  const allowed = ['brand_name', 'theme', 'app_url', 'allow_signup', 'default_expiry_days', 'smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'smtp_from',
    'session_idle_hours', 'min_controls', 'default_jurisdictions', 'allow_recipient_download', 'data_region', 'enforce_compliance', 'qes_provider', 'idv_provider',
    'billing_test_mode', 'trial_days', 'trial_plan', 'default_currency', 'tax_rate_inr', 'invoice_prefix', 'invoice_sac', 'seller_name', 'seller_gstin', 'seller_address', 'seller_email',
    'razorpay_key_id', 'razorpay_key_secret', 'razorpay_webhook_secret', 'stripe_secret_key', 'stripe_webhook_secret'];
  for (const k of billing.SECRET_KEYS) if (req.body[k] === '••••••••') delete req.body[k];
  if ('min_controls' in req.body && Array.isArray(req.body.min_controls)) req.body.min_controls = JSON.stringify(['email', ...req.body.min_controls.filter((c) => C.CONTROLS[c] && c !== 'email')]);
  if ('session_idle_hours' in req.body) req.body.session_idle_hours = String(Math.min(168, Math.max(1, Number(req.body.session_idle_hours) || 12)));
  for (const k of allowed) {
    if (!(k in req.body)) continue;
    if (k === 'smtp_pass' && req.body[k] === '••••••••') continue;
    if (k === 'theme' && !THEME_ACCENTS[req.body[k]]) continue;
    setSetting(k, req.body[k]);
  }
  res.json({ ok: true });
});
app.post('/api/settings/test-email', auth, adminOnly, wrap(async (req, res) => {
  const status = await sendEmail(req.body?.to || req.user.email, 'sign_request', {
    recipient_name: req.user.name, sender_name: req.user.name, document_title: 'Test document', message: 'This is a test email from your e-signature server.', expires_at: 'never', action_link: baseUrl(req),
  });
  const last = db.prepare('SELECT error FROM emails ORDER BY id DESC LIMIT 1').get();
  res.json({ status, error: last?.error });
}));

app.get('/api/email-templates', auth, (req, res) => res.json(db.prepare('SELECT * FROM email_templates').all()));
app.put('/api/email-templates/:key', auth, adminOnly, (req, res) => {
  const { subject, body, button } = req.body || {};
  if (!subject || !body) throw new HttpError(400, 'Subject and body are required');
  db.prepare('UPDATE email_templates SET subject = ?, body = ?, button = ? WHERE key = ?').run(subject, body, button || '', req.params.key);
  res.json({ ok: true });
});
app.post('/api/email-templates/:key/reset', auth, adminOnly, (req, res) => {
  const d = require('./db').DEFAULT_EMAILS.find((e) => e.key === req.params.key);
  if (!d) throw new HttpError(404, 'Unknown template');
  db.prepare('UPDATE email_templates SET subject = ?, body = ?, button = ? WHERE key = ?').run(d.subject, d.body, d.button, d.key);
  res.json(d);
});
app.post('/api/email-templates/preview', auth, (req, res) => {
  const { subject, body, button } = req.body || {};
  const sample = {
    recipient_name: 'Priya Sharma', sender_name: req.user.name, sender_email: req.user.email, document_title: 'Mutual NDA - Acme Corp',
    message: 'Please review and sign at your earliest convenience.', expires_at: new Date(Date.now() + 15 * 864e5).toDateString(),
    decline_reason: 'Terms need revision', actor_name: 'Priya Sharma', action_link: `${baseUrl(req)}/sign/example`,
  };
  res.json(renderEmail(null, sample, { subject: subject || '', body: body || '', button }));
});
app.get('/api/outbox', auth, adminOnly, (req, res) => res.json(db.prepare('SELECT id, to_email, subject, link, status, error, created_at FROM emails ORDER BY id DESC LIMIT 100').all()));
app.get('/api/outbox/:id', auth, adminOnly, (req, res) => {
  const e = db.prepare('SELECT * FROM emails WHERE id = ?').get(req.params.id);
  if (!e) throw new HttpError(404, 'Not found');
  res.type('html').send(e.html);
});

// ---------------------------------------------------------------- workspace, team & billing
app.get('/api/public/plans', (req, res) => {
  if (priv.isPrivate()) throw new HttpError(404, 'Not found');
  const s = getSettings();
  res.json({ brand_name: s.brand_name, theme: s.theme, currency: s.default_currency || 'INR', taxLabel: s.tax_label_inr || 'GST', taxRate: Number(s.tax_rate_inr) || 0,
    trialDays: Number(s.trial_days) || 14, trialPlan: s.trial_plan, features: billing.FEATURES, plans: billing.listPlans() });
});
app.get('/api/org', auth, (req, res) => {
  const st = req.org;
  const s = getSettings();
  res.json({ ...orgSummary(st), details: { name: st.org.name, billing_email: st.org.billing_email, gstin: st.org.gstin, address: st.org.address, country: st.org.country, currency: st.org.currency },
    plans: billing.listPlans(), features: billing.FEATURES, providers: { INR: billing.providerFor('INR'), USD: billing.providerFor('USD') }, testMode: s.billing_test_mode === '1', taxRate: Number(s.tax_rate_inr) || 0 });
});
app.put('/api/org', auth, perm('billing.manage'), (req, res) => {
  const b = req.body || {};
  const gstin = String(b.gstin || '').trim().toUpperCase();
  if (gstin && !/^[0-9]{2}[A-Z0-9]{13}$/.test(gstin)) throw new HttpError(400, 'GSTIN should be 15 characters, for example 36ABCDE1234F1Z5');
  db.prepare('UPDATE organizations SET name = ?, billing_email = ?, gstin = ?, address = ?, country = ?, currency = ? WHERE id = ?')
    .run(String(b.name || req.org.org.name).slice(0, 120), String(b.billing_email || '').trim(), gstin, String(b.address || '').slice(0, 300), String(b.country || 'IN').slice(0, 2), b.currency === 'USD' ? 'USD' : 'INR', req.user.org_id);
  res.json({ ok: true });
});
// ---------------------------------------------------------------- users, roles & workspace security
const isOwner = (u) => access.roleOf(u).key === 'owner';
/** Prevent privilege escalation: you can only grant permissions you hold yourself (owners can grant anything). */
function assertGrantable(req, perms) {
  if (isOwner(req.user)) return;
  const extra = perms.filter((p) => !req.role.permissions.includes(p));
  if (extra.length) throw new HttpError(403, `You can't grant permissions you don't have: ${extra.map((p) => access.PERMISSIONS[p]?.label || p).join(', ')}`);
}
function roleForOrg(roleId, orgId) {
  const r = db.prepare('SELECT * FROM roles WHERE id = ? AND (system = 1 OR org_id = ?)').get(roleId, orgId);
  if (!r) throw new HttpError(400, 'Choose a valid role');
  return { ...r, permissions: JSON.parse(r.permissions) };
}
function orgUser(req) {
  const u = db.prepare('SELECT * FROM users WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!u) throw new HttpError(404, 'User not found');
  return u;
}
function guardTarget(req, u, { allowSelf = false } = {}) {
  if (!allowSelf && u.id === req.user.id) throw new HttpError(400, "You can't do this to your own account here. Use My account instead.");
  if (isOwner(u) && !isOwner(req.user)) throw new HttpError(403, 'Only the owner can change the owner account.');
  if (!isOwner(req.user)) assertGrantable(req, access.roleOf(u).permissions); // can't act on users more powerful than you
}
function issueInvite(u, base) {
  const token = rid(24);
  db.prepare('UPDATE users SET invite_token = ?, invite_expires = ? WHERE id = ?').run(vault.hmac(token), new Date(Date.now() + 72 * 3600e3).toISOString().replace('T', ' ').slice(0, 19), u.id);
  return `${base}/app#/invite/${token}`;
}
const userRow = (u) => {
  const r = access.roleOf(u);
  return { id: u.id, name: u.name, email: u.email, role: { id: r.id, name: r.name, key: r.key }, status: u.status, totp_enabled: !!u.totp_enabled, last_login_at: u.last_login_at, last_login_ip: u.last_login_ip,
    created_at: u.created_at, invite_pending: !!u.invite_token, documents: db.prepare('SELECT COUNT(*) c FROM documents WHERE owner_id = ?').get(u.id).c };
};

app.get('/api/org/users', auth, perm('team.view'), (req, res) => res.json(db.prepare('SELECT * FROM users WHERE org_id = ? ORDER BY id').all(req.user.org_id).map(userRow)));
app.post('/api/org/users', auth, perm('team.manage'), wrap(async (req, res) => {
  billing.assertCan(req.org, 'member');
  const { name, email, role_id } = req.body || {};
  if (!String(name || '').trim()) throw new HttpError(400, 'Enter a name');
  const em = String(email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(em)) throw new HttpError(400, 'Enter a valid email address');
  priv.assertEmailAllowed(em, HttpError);
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(em)) throw new HttpError(400, 'That email already has an account');
  const role = roleForOrg(role_id, req.user.org_id);
  if (role.key === 'owner') throw new HttpError(400, 'A workspace has one owner. Choose another role.');
  assertGrantable(req, role.permissions);
  const id = db.prepare("INSERT INTO users (name, email, password_hash, org_id, org_role, role_id, status) VALUES (?, ?, ?, ?, ?, ?, 'invited')")
    .run(String(name).trim().slice(0, 80), em, bcrypt.hashSync(access.strongTempSecret(), 12), req.user.org_id, role.key || 'member', role.id).lastInsertRowid;
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const link = issueInvite(u, baseUrl(req));
  await sendEmail(em, 'team_invite', { recipient_name: u.name, sender_name: req.user.name, org_name: req.org.org.name, role_name: role.name, action_link: link });
  evt(req, 'user.invited', em, `Invited as ${role.name}`);
  res.json({ ok: true, invite_link: link, user: userRow(u) });
}));
app.put('/api/org/users/:id', auth, perm('team.manage'), (req, res) => {
  const u = orgUser(req); guardTarget(req, u);
  const b = req.body || {};
  if (b.role_id && Number(b.role_id) !== u.role_id) {
    const role = roleForOrg(b.role_id, req.user.org_id);
    if (role.key === 'owner') throw new HttpError(400, 'A workspace has one owner.');
    assertGrantable(req, role.permissions);
    db.prepare('UPDATE users SET role_id = ?, org_role = ? WHERE id = ?').run(role.id, role.key || 'member', u.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id); // new permissions take effect at next sign-in
    evt(req, 'user.role_changed', u.email, `${access.roleOf(u).name} → ${role.name}`);
  }
  if (b.name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(String(b.name).trim().slice(0, 80), u.id);
  res.json({ ok: true });
});
app.post('/api/org/users/:id/:action', auth, perm('team.manage'), wrap(async (req, res) => {
  const u = orgUser(req); guardTarget(req, u);
  const a = req.params.action;
  if (a === 'disable') {
    db.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").run(u.id); db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    evt(req, 'user.disabled', u.email, 'Account disabled and signed out');
  } else if (a === 'enable') {
    db.prepare("UPDATE users SET status = CASE WHEN invite_token IS NOT NULL AND password_changed_at IS NULL THEN 'invited' ELSE 'active' END, failed_logins = 0, locked_until = NULL WHERE id = ?").run(u.id);
    evt(req, 'user.enabled', u.email, 'Account re-enabled');
  } else if (a === 'signout') {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    evt(req, 'user.signed_out', u.email, 'Signed out of all devices by an admin');
  } else if (a === 'reset-password') {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    const link = issueInvite(u, baseUrl(req));
    await sendEmail(u.email, 'password_reset', { recipient_name: u.name, sender_name: req.user.name, action_link: link });
    evt(req, 'user.password_reset', u.email, 'Reset link issued; sessions signed out');
    return res.json({ ok: true, invite_link: link });
  } else if (a === 'reset-2fa') {
    db.prepare('UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_enabled = 0, recovery_codes = NULL, totp_last_step = NULL WHERE id = ?').run(u.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    evt(req, 'user.mfa_reset', u.email, 'Two-factor authentication reset by an admin');
  } else if (a === 'resend-invite') {
    if (u.status !== 'invited') throw new HttpError(400, 'This user has already accepted their invitation');
    const link = issueInvite(u, baseUrl(req));
    await sendEmail(u.email, 'team_invite', { recipient_name: u.name, sender_name: req.user.name, org_name: req.org.org.name, role_name: access.roleOf(u).name, action_link: link });
    evt(req, 'user.invited', u.email, 'Invitation re-sent');
    return res.json({ ok: true, invite_link: link });
  } else throw new HttpError(404, 'Unknown action');
  res.json({ ok: true });
}));
app.delete('/api/org/users/:id', auth, perm('team.manage'), (req, res) => {
  const u = orgUser(req); guardTarget(req, u);
  if (isOwner(u)) throw new HttpError(400, "The owner can't be removed.");
  const docs = db.prepare('SELECT COUNT(*) c FROM documents WHERE owner_id = ?').get(u.id).c;
  if (docs) throw new HttpError(400, `${u.name} owns ${docs} document(s), which must be kept. Disable the account instead.`);
  db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  evt(req, 'user.removed', u.email, 'Account deleted');
  res.json({ ok: true });
});

app.get('/api/org/roles', auth, perm('team.view'), (req, res) => res.json({ roles: access.rolesForOrg(req.user.org_id), permissions: access.PERMISSIONS, mine: req.role.permissions, isOwner: isOwner(req.user) }));
function cleanRole(req) {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 40);
  if (!name) throw new HttpError(400, 'Give the role a name');
  const perms = [...new Set((b.permissions || []).filter((p) => access.PERMISSIONS[p]))];
  if (!perms.length) throw new HttpError(400, 'Choose at least one permission');
  assertGrantable(req, perms);
  return { name, description: String(b.description || '').slice(0, 160), perms };
}
app.post('/api/org/roles', auth, perm('roles.manage'), (req, res) => {
  const r = cleanRole(req);
  if (db.prepare('SELECT 1 FROM roles WHERE (system = 1 OR org_id = ?) AND lower(name) = lower(?)').get(req.user.org_id, r.name)) throw new HttpError(400, 'A role with that name already exists');
  const id = db.prepare('INSERT INTO roles (org_id, name, description, permissions, system) VALUES (?, ?, ?, ?, 0)').run(req.user.org_id, r.name, r.description, JSON.stringify(r.perms)).lastInsertRowid;
  evt(req, 'role.created', r.name, `Permissions: ${r.perms.join(', ')}`);
  res.json({ id });
});
app.put('/api/org/roles/:id', auth, perm('roles.manage'), (req, res) => {
  const role = db.prepare('SELECT * FROM roles WHERE id = ? AND org_id = ? AND system = 0').get(req.params.id, req.user.org_id);
  if (!role) throw new HttpError(404, 'Built-in roles can’t be edited. Create a custom role instead.');
  const r = cleanRole(req);
  db.prepare('UPDATE roles SET name = ?, description = ?, permissions = ? WHERE id = ?').run(r.name, r.description, JSON.stringify(r.perms), role.id);
  db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role_id = ?)').run(role.id);
  evt(req, 'role.updated', r.name, `Permissions: ${r.perms.join(', ')}`);
  res.json({ ok: true });
});
app.delete('/api/org/roles/:id', auth, perm('roles.manage'), (req, res) => {
  const role = db.prepare('SELECT * FROM roles WHERE id = ? AND org_id = ? AND system = 0').get(req.params.id, req.user.org_id);
  if (!role) throw new HttpError(404, 'Role not found');
  if (db.prepare('SELECT COUNT(*) c FROM users WHERE role_id = ?').get(role.id).c) throw new HttpError(400, 'Move everyone off this role before deleting it');
  db.prepare('DELETE FROM roles WHERE id = ?').run(role.id);
  evt(req, 'role.deleted', role.name, '');
  res.json({ ok: true });
});

app.get('/api/org/security', auth, perm('security.manage'), (req, res) => {
  const p = orgPolicy(req.user.org_id);
  const users = db.prepare("SELECT COUNT(*) c, SUM(totp_enabled) t FROM users WHERE org_id = ? AND status = 'active'").get(req.user.org_id);
  res.json({ ...p, your_ip: ipOf(req), users_total: users.c, users_with_2fa: users.t || 0 });
});
app.put('/api/org/security', auth, perm('security.manage'), (req, res) => {
  const b = req.body || {}; const cur = orgPolicy(req.user.org_id);
  const req2fa = ['off', 'admins', 'all'].includes(b.require_2fa) ? b.require_2fa : cur.require_2fa;
  const { list, errors } = access.parseAllowlist(b.ip_allowlist ?? cur.ip_allowlist);
  if (errors.length) throw new HttpError(400, `Not a valid IP address or range: ${errors.join(', ')}`);
  const text = list.map((x) => x.raw).join('\n');
  if (text && !access.ipAllowed(ipOf(req), text)) throw new HttpError(400, `This list would lock you out. Add your current address (${ipOf(req)}) first.`);
  const pmin = Math.min(64, Math.max(10, Number(b.password_min) || cur.password_min || 10));
  const sh = Math.min(168, Math.max(1, Number(b.session_hours) || cur.session_hours || 12));
  db.prepare('UPDATE organizations SET require_2fa = ?, ip_allowlist = ?, password_min = ?, session_hours = ? WHERE id = ?').run(req2fa, text, pmin, sh, req.user.org_id);
  const changes = [];
  if (req2fa !== cur.require_2fa) changes.push(`2FA: ${cur.require_2fa} → ${req2fa}`);
  if (text !== (cur.ip_allowlist || '')) changes.push(`IP allowlist: ${list.length ? list.map((x) => x.raw).join(', ') : 'any address'}`);
  if (pmin !== cur.password_min) changes.push(`minimum password length ${pmin}`);
  if (sh !== cur.session_hours) changes.push(`session timeout ${sh}h`);
  if (changes.length) evt(req, 'policy.updated', 'Security policy', changes.join('; '));
  res.json({ ok: true });
});

const activityQuery = (req) => {
  const q = `%${req.query.q || ''}%`;
  return db.prepare(`SELECT * FROM security_events WHERE org_id = ? AND (actor LIKE ? OR action LIKE ? OR target LIKE ? OR details LIKE ? OR ip LIKE ?) ORDER BY id DESC LIMIT ?`)
    .all(req.user.org_id, q, q, q, q, q, Math.min(5000, Number(req.query.limit) || 300));
};
app.get('/api/org/activity', auth, perm('audit.view'), (req, res) => res.json(activityQuery(req)));
app.get('/api/org/activity.csv', auth, perm('audit.view'), (req, res) => {
  const cell = (v) => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; }; // CSV-injection safe
  const rows = activityQuery({ ...req, query: { ...req.query, limit: 5000 } });
  res.type('text/csv').setHeader('Content-Disposition', 'attachment; filename="activity-log.csv"');
  res.send(['time,actor,action,target,details,ip', ...rows.map((r) => [r.created_at, r.actor, r.action, r.target, r.details, r.ip].map(cell).join(','))].join('\n'));
  evt(req, 'audit.exported', 'Activity log', `${rows.length} rows exported`);
});


app.post('/api/billing/checkout', auth, perm('billing.manage'), wrap(async (req, res) => {
  const { plan_id, interval, currency } = req.body || {};
  res.json(await billing.startCheckout({ state: req.org, user: req.user, planId: plan_id, interval, currency: currency || req.org.org.currency || 'INR', base: baseUrl(req) }));
}));
app.post('/api/billing/razorpay/verify', auth, perm('billing.manage'), (req, res) => {
  const inv = billing.verifyRazorpayPayment(req.body || {});
  res.json({ ok: true, invoice: inv?.number });
});
app.get('/billing/return', wrap(async (req, res) => {
  try { await billing.stripeReturn(String(req.query.session_id || '')); } catch (e) { console.error('[billing] stripe return:', e.message); }
  res.redirect('/app#/billing');
}));
app.get('/api/billing/invoices', auth, perm('billing.view'), (req, res) => res.json(db.prepare('SELECT id, number, plan_name, interval, currency, amount, tax, total, period_start, period_end, provider, created_at FROM invoices WHERE org_id = ? ORDER BY id DESC').all(req.user.org_id)));
app.get('/api/billing/invoices/:id/pdf', auth, perm('billing.view'), wrap(async (req, res) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!inv || (inv.org_id !== req.user.org_id && !req.user.is_admin)) throw new HttpError(404, 'Invoice not found');
  res.type('application/pdf').setHeader('Content-Disposition', `attachment; filename="${inv.number}.pdf"`);
  res.send(await billing.invoicePdf(inv));
}));

// Receipts and renewal reminders
billing.setActivationHook(async (inv) => {
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(inv.org_id);
  const owner = db.prepare("SELECT * FROM users WHERE org_id = ? AND org_role = 'owner'").get(org.id);
  const to = org.billing_email || owner?.email;
  if (to) await sendEmail(to, 'payment_receipt', { recipient_name: owner?.name || org.name, plan_name: inv.plan_name, amount: `${inv.currency} ${inv.total}`, invoice_number: inv.number, period_end: inv.period_end.slice(0, 10), action_link: `${getSettings().app_url || ''}/app#/billing` });
});
setInterval(async () => {
  for (const org of billing.dueReminders()) {
    const owner = db.prepare("SELECT * FROM users WHERE org_id = ? AND org_role = 'owner'").get(org.id);
    const to = org.billing_email || owner?.email;
    if (to) await sendEmail(to, 'renewal_reminder', { recipient_name: owner?.name || org.name, plan_name: org.plan_id, period_end: (org.current_period_end || '').slice(0, 10), action_link: `${getSettings().app_url || ''}/app#/billing` });
    db.prepare('UPDATE organizations SET reminded_at = ? WHERE id = ?').run(now(), org.id);
  }
}, 3600e3).unref();

// ---------------------------------------------------------------- platform owner console
// ---------------------------------------------------------------- private platform settings
app.get('/api/platform/privacy', auth, adminOnly, (req, res) => res.json(priv.status(req)));
app.put('/api/platform/privacy', auth, adminOnly, (req, res) => {
  const b = req.body || {};
  const st = priv.status(req);
  if ('allowed_email_domains' in b && !st.domains_locked) {
    const list = String(b.allowed_email_domains || '').split(/[\s,;]+/).map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
    const bad = list.filter((d) => !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d));
    if (bad.length) throw new HttpError(400, `Not a valid domain: ${bad.join(', ')}`);
    const mine = req.user.email.split('@')[1];
    if (list.length && !list.some((d) => mine === d || mine.endsWith(`.${d}`))) throw new HttpError(400, `Your own address (${req.user.email}) must be in an allowed domain, or you could not be re-invited.`);
    setSetting('allowed_email_domains', list.join(', '));
  }
  if ('platform_ip_allowlist' in b && !st.ip_locked) {
    const text = String(b.platform_ip_allowlist || '').trim();
    const { errors } = access.parseAllowlist(text);
    if (errors.length) throw new HttpError(400, `Not a valid IP address or range: ${errors.join(', ')}`);
    if (text && !access.ipAllowed(ipOf(req), text)) throw new HttpError(400, `Your current IP (${ipOf(req)}) is not in the list. Add it first so you don't lock yourself out.`);
    setSetting('platform_ip_allowlist', text);
  }
  if ('private_mode' in b && !st.private_locked) {
    const on = b.private_mode === true || b.private_mode === '1';
    setSetting('private_mode', on ? '1' : '0');
    if (on) setSetting('allow_signup', '0');
  }
  const after = priv.status(req);
  evt(req, 'platform.privacy_changed', 'platform', `Private mode ${after.private_mode ? 'on' : 'off'}; domains: ${after.allowed_email_domains || 'any'}; IP allowlist: ${after.platform_ip_allowlist ? 'set' : 'none'}`);
  res.json(after);
});
app.get('/api/platform/overview', auth, adminOnly, (req, res) => res.json(billing.platformOverview()));
app.get('/api/platform/orgs', auth, adminOnly, (req, res) => {
  const q = `%${req.query.q || ''}%`;
  const rows = db.prepare('SELECT id FROM organizations WHERE name LIKE ? OR billing_email LIKE ? ORDER BY id DESC LIMIT 500').all(q, q);
  res.json(rows.map((r) => { const st = billing.orgState(r.id); const owner = db.prepare("SELECT name, email FROM users WHERE org_id = ? AND org_role = 'owner'").get(r.id);
    return { ...orgSummary(st), owner, created_at: st.org.created_at, plan_id: st.org.plan_id, raw_status: st.org.status, current_period_end: st.org.current_period_end, trial_ends_at: st.org.trial_ends_at,
      revenue: db.prepare("SELECT currency, SUM(total) s FROM invoices WHERE org_id = ? AND provider != 'test' GROUP BY currency").all(r.id) }; }));
});
app.put('/api/platform/orgs/:id', auth, adminOnly, (req, res) => {
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(req.params.id);
  if (!org) throw new HttpError(404, 'Workspace not found');
  const b = req.body || {};
  if (b.plan_id && !db.prepare('SELECT 1 FROM plans WHERE id = ?').get(b.plan_id)) throw new HttpError(400, 'Unknown plan');
  const plan = b.plan_id || org.plan_id;
  let status = b.status || org.status, end = org.current_period_end, start = org.current_period_start;
  if (b.extend_days) {
    const base = end && new Date(end.replace(' ', 'T') + 'Z') > Date.now() ? new Date(end.replace(' ', 'T') + 'Z') : new Date();
    end = new Date(base.getTime() + Number(b.extend_days) * 864e5).toISOString().replace('T', ' ').slice(0, 19);
    start = start || now(); status = 'active';
  }
  if (!['active', 'trialing', 'suspended', 'canceled'].includes(status)) throw new HttpError(400, 'Unknown status');
  db.prepare('UPDATE organizations SET plan_id = ?, status = ?, current_period_start = ?, current_period_end = ?, comped = ?, notes = ? WHERE id = ?')
    .run(plan, status, start, end, b.comped === undefined ? org.comped : b.comped ? 1 : 0, b.notes ?? org.notes, org.id);
  res.json({ ok: true });
});
app.get('/api/platform/plans', auth, adminOnly, (req, res) => res.json({ plans: billing.listPlans(true), features: billing.FEATURES }));
app.put('/api/platform/plans/:id', auth, adminOnly, (req, res) => {
  const p = db.prepare('SELECT * FROM plans WHERE id = ?').get(req.params.id);
  if (!p) throw new HttpError(404, 'Plan not found');
  const b = req.body || {};
  const int = (v, d) => (v === undefined || v === '' ? d : Math.round(Number(v)));
  db.prepare(`UPDATE plans SET name = ?, tagline = ?, price_inr_month = ?, price_inr_year = ?, price_usd_month = ?, price_usd_year = ?, docs_per_month = ?, users = ?, templates = ?, features = ?, highlight = ?, active = ? WHERE id = ?`)
    .run(String(b.name || p.name).slice(0, 40), String(b.tagline ?? p.tagline).slice(0, 120), int(b.price_inr_month, p.price_inr_month), int(b.price_inr_year, p.price_inr_year), int(b.price_usd_month, p.price_usd_month), int(b.price_usd_year, p.price_usd_year),
      int(b.docs_per_month, p.docs_per_month), int(b.users, p.users), int(b.templates, p.templates), JSON.stringify((Array.isArray(b.features) ? b.features : JSON.parse(p.features)).filter((f) => billing.FEATURES[f])), b.highlight ? 1 : 0, b.active === false || b.active === 0 ? (p.id === 'free' ? 1 : 0) : 1, p.id);
  res.json({ ok: true });
});
app.get('/api/platform/invoices', auth, adminOnly, (req, res) => res.json(db.prepare('SELECT i.*, o.name AS org_name FROM invoices i JOIN organizations o ON o.id = i.org_id ORDER BY i.id DESC LIMIT 300').all()));

// ---------------------------------------------------------------- users (admin)
app.get('/api/users', auth, adminOnly, (req, res) => res.json(db.prepare('SELECT id, name, email, is_admin, created_at FROM users ORDER BY id').all()));
app.post('/api/users', auth, adminOnly, (req, res) => {
  const { name, email, password, is_admin } = req.body || {};
  if (!name || !email) throw new HttpError(400, 'Name and email are required');
  { const pp = access.passwordProblem(password, { email, name }); if (pp) throw new HttpError(400, pp); }
  const em = String(email).trim().toLowerCase();
  priv.assertEmailAllowed(em, HttpError);
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(em)) throw new HttpError(400, 'Email already in use');
  const uidNew = db.prepare('INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, ?)').run(name, em, bcrypt.hashSync(password, 10), is_admin ? 1 : 0).lastInsertRowid;
  billing.createOrg({ name: req.body.company || `${name}'s workspace`, ownerId: uidNew, platformOwner: false, email: em });
  access.migrateRoles();
  res.json({ ok: true });
});
app.delete('/api/users/:id', auth, adminOnly, (req, res) => {
  if (Number(req.params.id) === req.user.id) throw new HttpError(400, "You can't delete yourself");
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- public signing (with signer verification)
const VERIFY_STEPS = ['access_code', 'otp', 'id_check'];
function recipientByToken(token) {
  const r = token && /^[a-f0-9]{48}$/.test(token) && db.prepare('SELECT * FROM recipients WHERE token = ?').get(token);
  if (!r) throw new HttpError(404, 'This signing link is invalid or has been revoked');
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(r.document_id);
  return { r, doc };
}
/** Which verification steps this recipient must pass, and which are done in this browser session. */
function signerAuth(req, r, doc) {
  const required = VERIFY_STEPS.filter((s) => docControls(doc).includes(s));
  const cookie = req.cookies[`sfs_${r.id}`];
  const sessionOk = !!cookie && !!r.auth_session && vault.safeEqual(vault.hmac(cookie), r.auth_session);
  const verified = sessionOk ? parseJson(r.verified_json, {}) : {};
  const done = required.filter((s) => verified[s]);
  return { required, done, ok: done.length === required.length, sessionOk, verified };
}
function requireSignerAuth(req, r, doc) {
  const a = signerAuth(req, r, doc);
  if (!a.ok) throw new HttpError(401, 'Please verify your identity first');
  return a;
}
function ensureSignerSession(req, res, r) {
  const a = req.cookies[`sfs_${r.id}`];
  if (a && r.auth_session && vault.safeEqual(vault.hmac(a), r.auth_session)) return;
  const secret = rid(24);
  db.prepare('UPDATE recipients SET auth_session = ?, verified_json = ? WHERE id = ?').run(vault.hmac(secret), '{}', r.id);
  res.cookie(`sfs_${r.id}`, secret, { httpOnly: true, sameSite: 'strict', maxAge: 2 * 3600e3, secure: process.env.COOKIE_SECURE === '1', path: '/' });
  r.verified_json = '{}';
}
function markVerified(r, step, detail) {
  const v = parseJson(db.prepare('SELECT verified_json FROM recipients WHERE id = ?').get(r.id).verified_json, {});
  v[step] = { at: now(), ...(detail || {}) };
  db.prepare('UPDATE recipients SET verified_json = ? WHERE id = ?').run(JSON.stringify(v), r.id);
}
const maskEmail = (e) => e.replace(/^(.)(.*)(@.*)$/, (m, a, b, c) => a + '•'.repeat(Math.min(6, b.length)) + c);
const signLimiter = rateLimit('sign', 120, 15 * 60e3);
const verifyLimiter = rateLimit('sign-verify', 30, 15 * 60e3);

app.get('/api/sign/:token', signLimiter, (req, res) => {
  expireDocuments();
  let { r, doc } = recipientByToken(req.params.token);
  const s = getSettings();
  const owner = ownerOf(doc);
  const a = signerAuth(req, r, doc);
  const base = {
    brand_name: s.brand_name, theme: s.theme,
    document: { title: doc.title, uid: doc.uid, status: doc.status, expires_at: doc.expires_at, sender: owner.name, sender_email: owner.email },
    recipient: { name: r.name, email: maskEmail(r.email), role: r.role, status: r.status, color: r.color },
    verification: { required: a.required, done: a.done, ok: a.ok },
  };
  // Nothing about the document's contents is released until the signer is verified.
  if (!a.ok) return res.json({ ...base, locked: true });

  const recips = recipientsOf(doc.id);
  const turn = currentTurn(doc, recips).some((x) => x.id === r.id);
  if (doc.status === 'in_progress' && turn && !r.viewed_at) {
    db.prepare("UPDATE recipients SET viewed_at = ?, status = CASE WHEN status IN ('pending','sent') THEN 'viewed' ELSE status END, ip = ? WHERE id = ?").run(now(), ipOf(req), r.id);
    audit(doc.id, 'Viewed', `${r.name} <${r.email}>`, ipOf(req), `Opened the document${a.required.length ? ` after verifying with ${a.required.join(' + ')}` : ''}`);
    r = db.prepare('SELECT * FROM recipients WHERE id = ?').get(r.id);
  }
  const allFields = fieldsOf(doc.id);
  res.json({
    ...base,
    document: { ...base.document, message: doc.message },
    recipient: { ...base.recipient, name: r.name, email: r.email, status: r.status },
    canDownload: doc.status === 'completed' && s.allow_recipient_download === '1',
    canAct: doc.status === 'in_progress' && turn && ACTIONABLE.includes(r.role) && !['signed', 'declined'].includes(r.status),
    waitingOnOthers: doc.status === 'in_progress' && !turn && !['signed', 'declined'].includes(r.status),
    fields: allFields.filter((f) => f.recipient_id === r.id).map(({ value, ...f }) => f),
    otherFields: allFields.filter((f) => f.recipient_id !== r.id && f.value),
    recipients: recips.map((x) => ({ name: x.name, role: x.role, status: x.status, order_index: x.order_index, color: x.color, me: x.id === r.id })),
  });
});

app.post('/api/sign/:token/verify/access-code', verifyLimiter, (req, res) => {
  const { r, doc } = recipientByToken(req.params.token);
  if (!docControls(doc).includes('access_code')) throw new HttpError(400, 'No access code is needed');
  if ((r.code_attempts || 0) >= 5) throw new HttpError(423, 'Too many wrong codes. Ask the sender to resend the document.');
  ensureSignerSession(req, res, r);
  if (!doc.access_code_hash || !vault.safeEqual(vault.hmac(String(req.body?.code || '').trim()), doc.access_code_hash)) {
    db.prepare('UPDATE recipients SET code_attempts = code_attempts + 1 WHERE id = ?').run(r.id);
    audit(doc.id, 'Verification failed', `${r.name} <${r.email}>`, ipOf(req), 'Wrong access code');
    throw new HttpError(400, `That code isn't right. ${4 - (r.code_attempts || 0)} attempt(s) left.`);
  }
  markVerified(r, 'access_code');
  audit(doc.id, 'Verified', `${r.name} <${r.email}>`, ipOf(req), 'Entered the correct access code');
  res.json({ ok: true });
});

app.post('/api/sign/:token/verify/otp/send', verifyLimiter, wrap(async (req, res) => {
  const { r, doc } = recipientByToken(req.params.token);
  if (!docControls(doc).includes('otp')) throw new HttpError(400, 'No verification code is needed');
  if (r.otp_last_sent && Date.now() - new Date(r.otp_last_sent.replace(' ', 'T') + 'Z') < 45e3) throw new HttpError(429, 'Please wait a moment before requesting another code');
  if ((r.otp_sends || 0) >= 6) throw new HttpError(423, 'Too many codes requested. Ask the sender to resend the document.');
  ensureSignerSession(req, res, r);
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  const exp = new Date(Date.now() + 10 * 60e3).toISOString().replace('T', ' ').slice(0, 19);
  db.prepare('UPDATE recipients SET otp_hash = ?, otp_expires = ?, otp_attempts = 0, otp_sends = otp_sends + 1, otp_last_sent = ? WHERE id = ?').run(vault.hmac(code), exp, now(), r.id);
  await sendEmail(r.email, 'otp', { recipient_name: r.name, sender_name: ownerOf(doc).name, document_title: doc.title, otp_code: code });
  audit(doc.id, 'Verification code sent', `${r.name} <${r.email}>`, ipOf(req), `One-time code emailed to ${maskEmail(r.email)}`);
  res.json({ ok: true, sentTo: maskEmail(r.email) });
}));

app.post('/api/sign/:token/verify/otp', verifyLimiter, (req, res) => {
  const { r, doc } = recipientByToken(req.params.token);
  if (!r.otp_hash) throw new HttpError(400, 'Request a code first');
  if (r.otp_expires < now()) throw new HttpError(400, 'That code has expired. Request a new one.');
  if ((r.otp_attempts || 0) >= 5) throw new HttpError(423, 'Too many wrong codes. Request a new one.');
  ensureSignerSession(req, res, r);
  if (!vault.safeEqual(vault.hmac(String(req.body?.code || '').trim()), r.otp_hash)) {
    db.prepare('UPDATE recipients SET otp_attempts = otp_attempts + 1 WHERE id = ?').run(r.id);
    audit(doc.id, 'Verification failed', `${r.name} <${r.email}>`, ipOf(req), 'Wrong one-time code');
    throw new HttpError(400, "That code isn't right");
  }
  db.prepare('UPDATE recipients SET otp_hash = NULL WHERE id = ?').run(r.id); // single use
  markVerified(r, 'otp', { channel: 'email' });
  audit(doc.id, 'Verified', `${r.name} <${r.email}>`, ipOf(req), 'Confirmed control of their email with a one-time code');
  res.json({ ok: true });
});

/*
 * Identity verification. The "demo" provider checks the submitted name against the recipient and
 * records the document type. In production, replace verifyIdentity() with a call to your IDV vendor
 * (e.g. DigiLocker/Aadhaar offline KYC, Onfido, Veriff, Jumio, IDnow, an EUDI wallet) and store only
 * the vendor's reference and result, never the ID image.
 */
async function verifyIdentity({ provider, recipient, input }) {
  const norm = (x) => String(x || '').toLowerCase().normalize('NFKD').replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean).sort().join(' ');
  if (provider === 'demo') {
    if (!input.id_type || !/^[A-Za-z0-9]{4}$/.test(String(input.id_last4 || ''))) return { ok: false, reason: 'Choose your document type and enter the last 4 characters of its number' };
    if (norm(input.full_name) !== norm(recipient.name)) return { ok: false, reason: 'The name must match the name the sender used for you exactly' };
    return { ok: true, reference: `demo-${crypto.randomBytes(5).toString('hex')}`, method: `${input.id_type} (…${String(input.id_last4).toUpperCase()}), demo check` };
  }
  return { ok: false, reason: `Identity provider "${provider}" is not configured on this server` };
}
app.post('/api/sign/:token/verify/id', verifyLimiter, wrap(async (req, res) => {
  const { r, doc } = recipientByToken(req.params.token);
  if (!docControls(doc).includes('id_check')) throw new HttpError(400, 'No ID check is needed');
  ensureSignerSession(req, res, r);
  const result = await verifyIdentity({ provider: getSettings().idv_provider || 'demo', recipient: r, input: req.body || {} });
  if (!result.ok) { audit(doc.id, 'Verification failed', `${r.name} <${r.email}>`, ipOf(req), `ID check: ${result.reason}`); throw new HttpError(400, result.reason); }
  markVerified(r, 'id_check', { reference: result.reference, method: result.method });
  audit(doc.id, 'Verified', `${r.name} <${r.email}>`, ipOf(req), `Identity verified: ${result.method}; ref ${result.reference}`);
  res.json({ ok: true });
}));

app.get('/api/sign/:token/file', signLimiter, (req, res) => {
  const { r, doc } = recipientByToken(req.params.token);
  requireSignerAuth(req, r, doc);
  sendPdf(res, doc.file_name);
});
app.get('/api/sign/:token/download', signLimiter, (req, res) => {
  const { r, doc } = recipientByToken(req.params.token);
  requireSignerAuth(req, r, doc);
  if (doc.status !== 'completed' || !doc.signed_name) throw new HttpError(400, 'The document is not completed yet');
  if (getSettings().allow_recipient_download !== '1') throw new HttpError(403, 'Downloads are turned off by the sender. Ask them for a copy.');
  audit(doc.id, 'Downloaded', `${r.name} <${r.email}>`, ipOf(req), 'Downloaded the signed copy');
  sendPdf(res, doc.signed_name, `${doc.title} (signed).pdf`);
});

app.post('/api/sign/:token/submit', signLimiter, wrap(async (req, res) => {
  const { r, doc } = recipientByToken(req.params.token);
  const a = requireSignerAuth(req, r, doc);
  if (doc.status !== 'in_progress') throw new HttpError(400, `This document is ${doc.status.replace('_', ' ')}`);
  if (!ACTIONABLE.includes(r.role) || ['signed', 'declined'].includes(r.status)) throw new HttpError(400, 'You have already responded to this document');
  if (!currentTurn(doc, recipientsOf(doc.id)).some((x) => x.id === r.id)) throw new HttpError(400, "It isn't your turn to sign yet");
  if (!req.body?.consent) throw new HttpError(400, 'Please agree to sign electronically');
  const values = req.body?.values || {};
  const myFields = db.prepare('SELECT * FROM fields WHERE document_id = ? AND recipient_id = ?').all(doc.id, r.id);
  const updates = [];
  for (const f of myFields) {
    let v = values[f.id];
    if (f.type === 'checkbox') v = v === true || v === 'true' ? 'true' : '';
    if (f.type === 'date') v = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    v = v == null ? '' : String(v);
    if ((f.type === 'signature' || f.type === 'initials') && v && !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v)) throw new HttpError(400, 'Invalid signature image');
    if (v.length > 2_000_000) throw new HttpError(400, 'Field value too large');
    if (f.required && !v && f.type !== 'checkbox') throw new HttpError(400, `Please complete the "${f.label || f.type}" field`);
    if (f.required && f.type === 'checkbox' && v !== 'true') throw new HttpError(400, `Please tick the required checkbox${f.label ? ` "${f.label}"` : ''}`);
    updates.push([vault.encStr(v), f.id]);
  }
  // Bind the signature to the exact document: hash of the original file + this signer's values.
  const binding = sha256(doc.original_hash + '|' + r.id + '|' + JSON.stringify(myFields.map((f) => [f.id, values[f.id] ?? ''])));
  db.transaction(() => {
    for (const u of updates) db.prepare('UPDATE fields SET value = ? WHERE id = ?').run(...u);
    db.prepare("UPDATE recipients SET status = 'signed', signed_at = ?, ip = ? WHERE id = ?").run(now(), ipOf(req), r.id);
  })();
  const how = a.required.length ? `verified by ${a.required.map((x) => C.CONTROLS[x]?.label || x).join(' + ')}` : 'email link';
  audit(doc.id, r.role === 'approver' ? 'Approved' : 'Signed', `${r.name} <${r.email}>`, ipOf(req), `${r.role === 'approver' ? 'Approved' : 'Signed'} the document (${how}; signature binding ${binding.slice(0, 16)}…; ${req.get('user-agent')?.slice(0, 60) || 'unknown device'})`);
  db.prepare('UPDATE documents SET updated_at = ? WHERE id = ?').run(now(), doc.id);

  const base = baseUrl(req);
  const remaining = recipientsOf(doc.id).filter((x) => ACTIONABLE.includes(x.role) && x.status !== 'signed');
  if (!remaining.length) await completeDocument(doc, base);
  else await dispatch(doc, base);
  res.json({ ok: true, completed: !remaining.length });
}));

app.post('/api/sign/:token/decline', signLimiter, wrap(async (req, res) => {
  const { r, doc } = recipientByToken(req.params.token);
  requireSignerAuth(req, r, doc);
  if (doc.status !== 'in_progress') throw new HttpError(400, `This document is ${doc.status.replace('_', ' ')}`);
  if (['signed', 'declined'].includes(r.status) || !ACTIONABLE.includes(r.role)) throw new HttpError(400, 'You have already responded');
  const reason = String(req.body?.reason || 'No reason given').slice(0, 1000);
  db.prepare("UPDATE recipients SET status = 'declined', decline_reason = ?, signed_at = ?, ip = ? WHERE id = ?").run(reason, now(), ipOf(req), r.id);
  db.prepare("UPDATE documents SET status = 'declined', updated_at = ? WHERE id = ?").run(now(), doc.id);
  audit(doc.id, 'Declined', `${r.name} <${r.email}>`, ipOf(req), `Reason: ${reason}`);
  const owner = ownerOf(doc);
  await sendEmail(owner.email, 'declined', { recipient_name: owner.name, actor_name: r.name, document_title: doc.title, decline_reason: reason, action_link: `${baseUrl(req)}/app#/documents/${doc.id}` });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- verify
app.post('/api/verify', rateLimit('verify', 30, 15 * 60e3), upload.single('file'), (req, res) => {
  if (!req.file) throw new HttpError(400, 'Upload a PDF to verify');
  const hash = sha256(req.file.buffer);
  const doc = db.prepare('SELECT * FROM documents WHERE final_hash = ?').get(hash);
  if (!doc) return res.json({ valid: false, hash });
  const chain = verifyAuditChain(doc.id);
  res.json({
    valid: true, hash, title: doc.title, uid: doc.uid, completed_at: doc.completed_at, auditChainValid: chain.valid,
    seal: doc.sealed ? { subject: seal.info().subject, fingerprint: seal.info().fingerprint, selfSigned: seal.info().selfSigned } : null,
    signers: recipientsOf(doc.id).filter((r) => ACTIONABLE.includes(r.role)).map((r) => ({ name: r.name, email: maskEmail(r.email), signed_at: r.signed_at })),
  });
});

// Health check for load balancers, Docker and uptime monitors. Reveals nothing sensitive.
app.get('/healthz', (req, res) => {
  try { db.prepare('SELECT 1').get(); res.set('Cache-Control', 'no-store').json({ ok: true, uptime: Math.round(process.uptime()) }); }
  catch { res.status(503).json({ ok: false }); }
});

app.get('/js/compliance.js', (req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'compliance', 'rules.js')));

// ---------------------------------------------------------------- static
app.use('/vendor/fonts', express.static(path.join(__dirname, '..', 'node_modules', '@fontsource')));
app.use('/vendor/pdfjs', express.static(path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build')));
app.get('/sign/:token', (req, res) => res.sendFile(path.join(PUBLIC, 'sign.html')));
app.get('/verify', (req, res) => res.sendFile(path.join(PUBLIC, 'verify.html')));
app.get(['/app', '/app/'], (req, res) => res.sendFile(path.join(PUBLIC, 'app.html')));
app.get('/js/templates-library.js', (req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'templates-library.js')));
const website = require('./site/routes')(app, { db, getSettings, setSetting, billing, auth, adminOnly, rateLimit, sendEmail, HttpError, publicUrl: baseUrl, isPrivate: priv.isPrivate });
app.use(express.static(PUBLIC, { index: false }));
app.use(website.notFound);

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than 25 MB' : err.message });
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong on the server', upgrade: !!err.upgrade });
});

seedBuiltinTemplates().then(() => {
  const server = app.listen(PORT, () => console.log(`${getSettings().brand_name} running on http://localhost:${PORT}`));
  // Graceful shutdown: finish in-flight requests, then close the database cleanly (Docker/systemd send SIGTERM).
  let closing = false;
  const shutdown = (sig) => {
    if (closing) return; closing = true;
    console.log(`${sig} received, shutting down…`);
    server.close(() => { try { db.close(); } catch {} process.exit(0); });
    setTimeout(() => process.exit(0), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
});
