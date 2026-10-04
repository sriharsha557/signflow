#!/usr/bin/env node
/*
 * Online backup of SignFlow data. Safe to run while the server is running.
 *
 *   node scripts/backup.js                 -> DATA_DIR/backups/signflow-YYYYMMDD-HHMMSS.tar.gz
 *   node scripts/backup.js --out /mnt/backups --keep 30
 *   node scripts/backup.js --include-keys  -> also packs keys/ (master.key, seal.p12). Store such archives
 *                                             somewhere safer than ordinary backups.
 *
 * Contents: a consistent snapshot of signflow.db (SQLite online backup API) and files/ (encrypted PDFs).
 * By default the encryption key is NOT included: keep it separately (password manager / secrets vault),
 * because anyone holding both the backup and the key can read every document.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const Database = require('better-sqlite3');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const OUT = path.resolve(opt('--out', process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups')));
const KEEP = Number(opt('--keep', process.env.BACKUP_KEEP_DAYS || 14));
const withKeys = args.includes('--include-keys');

(async () => {
  const dbFile = path.join(DATA_DIR, 'signflow.db');
  if (!fs.existsSync(dbFile)) throw new Error(`No database at ${dbFile}. Set DATA_DIR.`);
  fs.mkdirSync(OUT, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-backup-'));
  try {
    const db = new Database(dbFile, { readonly: true, fileMustExist: true });
    await db.backup(path.join(tmp, 'signflow.db'));
    db.close();
    const check = new Database(path.join(tmp, 'signflow.db'), { readonly: true });
    const ok = check.pragma('integrity_check', { simple: true });
    check.close();
    if (ok !== 'ok') throw new Error(`Snapshot failed integrity check: ${ok}`);
    fs.writeFileSync(path.join(tmp, 'BACKUP-INFO.txt'), `SignFlow backup\nCreated: ${new Date().toISOString()}\nHost: ${os.hostname()}\nIncludes keys: ${withKeys ? 'YES - protect this file' : 'no (restore needs your MASTER_KEY or keys/master.key)'}\n`);
    const archive = path.join(OUT, `signflow-${stamp}${withKeys ? '-with-keys' : ''}.tar.gz`);
    const items = ['-C', tmp, 'signflow.db', 'BACKUP-INFO.txt'];
    if (fs.existsSync(path.join(DATA_DIR, 'files'))) items.push('-C', DATA_DIR, 'files');
    if (withKeys && fs.existsSync(path.join(DATA_DIR, 'keys'))) items.push('-C', DATA_DIR, 'keys');
    execFileSync('tar', ['-czf', archive, ...items]);
    fs.chmodSync(archive, 0o600);
    const size = (fs.statSync(archive).size / 1048576).toFixed(1);
    console.log(`Backup written: ${archive} (${size} MB)`);
    // Retention: delete our own archives older than KEEP days.
    if (KEEP > 0) {
      const cutoff = Date.now() - KEEP * 864e5;
      for (const f of fs.readdirSync(OUT)) {
        if (!/^signflow-\d{8}-\d{6}(-with-keys)?\.tar\.gz$/.test(f)) continue;
        const p = path.join(OUT, f);
        if (fs.statSync(p).mtimeMs < cutoff) { fs.unlinkSync(p); console.log(`Removed old backup ${f}`); }
      }
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch((e) => { console.error('Backup failed:', e.message); process.exit(1); });
