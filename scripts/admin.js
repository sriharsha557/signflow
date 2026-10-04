#!/usr/bin/env node
/*
 * Server-side recovery tools for the platform owner (run on the server, not over the web).
 *
 *   node scripts/admin.js owners                    list platform owners and workspace owners
 *   node scripts/admin.js reset-password <email>    set a temporary password (must be changed at next sign-in)
 *   node scripts/admin.js disable-2fa <email>       turn off two-factor login (for a lost phone)
 *   node scripts/admin.js unlock <email>            clear a sign-in lockout
 *   node scripts/admin.js signout <email>           end all of the user's sessions
 *   node scripts/admin.js clear-ip-allowlist <email> remove the IP allowlist of that user's workspace
 *   node scripts/admin.js stats                     counts of users, workspaces, documents, invoices
 *   node scripts/admin.js platform-open             remove the platform-wide IP allowlist (if it locked you out)
 *   node scripts/admin.js private on|off            switch private platform mode
 *
 * In Docker:  docker compose exec signflow node scripts/admin.js <command> ...
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const file = path.join(DATA_DIR, 'signflow.db');
if (!fs.existsSync(file)) { console.error(`No database at ${file}. Set DATA_DIR.`); process.exit(1); }
const db = new Database(file);
const [cmd, arg] = process.argv.slice(2);
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const user = () => {
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(String(arg || '').trim().toLowerCase());
  if (!u) { console.error(`No user with email "${arg || ''}"`); process.exit(1); }
  return u;
};
const has = (t, c) => db.prepare(`PRAGMA table_info(${t})`).all().some((x) => x.name === c);
const log = (u, action, details) => {
  try { db.prepare('INSERT INTO security_events (org_id, user_id, actor, action, target, details, ip) VALUES (?, ?, ?, ?, ?, ?, ?)').run(u.org_id || null, u.id, 'server console', action, u.email, details, 'localhost'); } catch { /* older database without the table */ }
};

switch (cmd) {
  case 'owners': {
    const rows = db.prepare(`SELECT u.email, u.name, u.is_admin, o.name AS org FROM users u LEFT JOIN organizations o ON o.id = u.org_id
      WHERE u.is_admin = 1 OR u.org_role = 'owner' ORDER BY u.is_admin DESC, u.id`).all();
    for (const r of rows) console.log(`${r.is_admin ? '[PLATFORM OWNER] ' : ''}${r.email}  ${r.name}  (${r.org || 'no workspace'})`);
    break;
  }
  case 'reset-password': {
    const u = user();
    const temp = crypto.randomBytes(9).toString('base64url') + '7a';
    db.prepare(`UPDATE users SET password_hash = ?${has('users', 'must_change_password') ? ', must_change_password = 1' : ''}${has('users', 'locked_until') ? ', locked_until = NULL, failed_logins = 0' : ''} WHERE id = ?`).run(bcrypt.hashSync(temp, 12), u.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    log(u, 'password.reset_console', 'Temporary password set from the server console');
    console.log(`Temporary password for ${u.email}: ${temp}\nThey must choose a new password after signing in. Share it privately.`);
    break;
  }
  case 'disable-2fa': {
    const u = user();
    if (!has('users', 'totp_enabled')) { console.log('This database has no two-factor columns.'); break; }
    db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_pending = NULL, recovery_codes = NULL WHERE id = ?').run(u.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    log(u, 'mfa.reset_console', 'Two-factor turned off from the server console');
    console.log(`Two-factor login turned off for ${u.email}. If the workspace requires 2FA they will be asked to set it up again.`);
    break;
  }
  case 'unlock': {
    const u = user();
    db.prepare('UPDATE users SET locked_until = NULL, failed_logins = 0 WHERE id = ?').run(u.id);
    log(u, 'login.unlocked_console', 'Lockout cleared from the server console');
    console.log(`Unlocked ${u.email}.`);
    break;
  }
  case 'signout': {
    const u = user();
    const n = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id).changes;
    log(u, 'sessions.revoked_console', `${n} session(s) ended from the server console`);
    console.log(`Ended ${n} session(s) for ${u.email}.`);
    break;
  }
  case 'clear-ip-allowlist': {
    const u = user();
    db.prepare("UPDATE organizations SET ip_allowlist = '' WHERE id = ?").run(u.org_id);
    log(u, 'policy.ip_allowlist_cleared_console', 'IP allowlist removed from the server console');
    console.log(`IP allowlist removed for ${u.email}'s workspace.`);
    break;
  }
  case 'platform-open': {
    db.prepare("UPDATE settings SET value = '' WHERE key = 'platform_ip_allowlist'").run();
    console.log('Platform IP allowlist removed. (If PLATFORM_IP_ALLOWLIST is set in .env, remove it there and restart.)');
    break;
  }
  case 'private': {
    if (!['on', 'off'].includes(arg)) { console.error('Usage: node scripts/admin.js private on|off'); process.exit(1); }
    db.prepare("INSERT INTO settings (key, value) VALUES ('private_mode', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(arg === 'on' ? '1' : '0');
    if (arg === 'on') db.prepare("UPDATE settings SET value = '0' WHERE key = 'allow_signup'").run();
    console.log(`Private mode ${arg}. (PRIVATE_MODE=1 in .env always wins.)`);
    break;
  }
  case 'stats': {
    const c = (sql) => { try { return db.prepare(sql).get().c; } catch { return '-'; } };
    console.log(`Users: ${c('SELECT COUNT(*) c FROM users')}\nWorkspaces: ${c('SELECT COUNT(*) c FROM organizations')}\nDocuments: ${c('SELECT COUNT(*) c FROM documents')} (completed ${c("SELECT COUNT(*) c FROM documents WHERE status = 'completed'")})\nInvoices: ${c('SELECT COUNT(*) c FROM invoices')}\nEnquiries: ${c('SELECT COUNT(*) c FROM leads')}\nDatabase: ${(fs.statSync(file).size / 1048576).toFixed(1)} MB`);
    break;
  }
  default:
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\n?/, '').replace(/^ \* ?/gm, ''));
    process.exit(cmd ? 1 : 0);
}
db.close();
