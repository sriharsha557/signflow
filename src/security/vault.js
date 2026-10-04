/*
 * Encryption at rest (AES-256-GCM) for PDFs, signature images and field values.
 * Key source, in order: MASTER_KEY env (base64, 32 bytes) -> DATA_DIR/keys/master.key (auto-created, 0600).
 * File format: "SFE1" | 12-byte IV | 16-byte auth tag | ciphertext. Unencrypted legacy files are still readable.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAGIC = Buffer.from('SFE1');
let KEY = null;
let KEY_SOURCE = null;

function init(dataDir) {
  if (process.env.MASTER_KEY) {
    const k = Buffer.from(process.env.MASTER_KEY, 'base64');
    if (k.length !== 32) throw new Error('MASTER_KEY must be 32 bytes, base64-encoded (generate with: openssl rand -base64 32)');
    KEY = k; KEY_SOURCE = 'environment (MASTER_KEY)';
    return;
  }
  const dir = path.join(dataDir, 'keys');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const f = path.join(dir, 'master.key');
  if (!fs.existsSync(f)) {
    fs.writeFileSync(f, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
    console.warn('[security] Generated a new master encryption key at', f, '- back it up separately from the database, or set MASTER_KEY.');
  }
  KEY = Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'base64');
  KEY_SOURCE = 'key file (data/keys/master.key)';
}

function encrypt(buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), ct]);
}
function decrypt(buf) {
  if (!isEncrypted(buf)) return buf;
  const iv = buf.subarray(4, 16), tag = buf.subarray(16, 32), ct = buf.subarray(32);
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]); // throws if tampered
}
const isEncrypted = (buf) => buf.length > 32 && buf.subarray(0, 4).equals(MAGIC);

function writeFile(file, buf) { fs.writeFileSync(file, encrypt(buf), { mode: 0o600 }); }
function readFile(file) { return decrypt(fs.readFileSync(file)); }

// Strings (field values, signature images) stored in the database.
function encStr(s) { if (s == null || s === '') return s; return 'enc:' + encrypt(Buffer.from(String(s), 'utf8')).toString('base64'); }
function decStr(s) { if (typeof s !== 'string' || !s.startsWith('enc:')) return s; return decrypt(Buffer.from(s.slice(4), 'base64')).toString('utf8'); }

// Keyed hash for secrets we only need to compare (OTPs, access codes, session tokens).
function hmac(s) { return crypto.createHmac('sha256', KEY).update(String(s)).digest('hex'); }
function safeEqual(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }

module.exports = { init, encrypt, decrypt, writeFile, readFile, encStr, decStr, hmac, safeEqual, isEncrypted, keySource: () => KEY_SOURCE };
