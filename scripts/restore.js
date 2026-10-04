#!/usr/bin/env node
/*
 * Restore a backup made by scripts/backup.js.  STOP THE SERVER FIRST.
 *
 *   node scripts/restore.js /path/to/signflow-YYYYMMDD-HHMMSS.tar.gz [--yes]
 *
 * The current database and files are moved to DATA_DIR/before-restore-<time>/ so nothing is lost. keys/ is kept as it is unless the archive contains keys.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { execFileSync } = require('child_process');
const Database = require('better-sqlite3');

const [archive] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const yes = process.argv.includes('--yes');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));

(async () => {
  if (!archive || !fs.existsSync(archive)) throw new Error('Usage: node scripts/restore.js <backup.tar.gz> [--yes]');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-restore-'));
  try {
    execFileSync('tar', ['-xzf', path.resolve(archive), '-C', tmp]);
    const dbFile = path.join(tmp, 'signflow.db');
    if (!fs.existsSync(dbFile)) throw new Error('This archive has no signflow.db; is it a SignFlow backup?');
    const d = new Database(dbFile, { readonly: true });
    const ok = d.pragma('integrity_check', { simple: true });
    const users = d.prepare('SELECT COUNT(*) c FROM users').get().c, docs = d.prepare('SELECT COUNT(*) c FROM documents').get().c;
    d.close();
    if (ok !== 'ok') throw new Error(`Backup database failed integrity check: ${ok}`);
    console.log(`Backup contains ${users} user(s) and ${docs} document(s).${fs.existsSync(path.join(tmp, 'keys')) ? ' It includes keys.' : ''}`);
    if (!yes) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const a = await new Promise((r) => rl.question(`Replace the data in ${DATA_DIR}? The server must be stopped. Type "restore": `, r));
      rl.close();
      if (a.trim() !== 'restore') { console.log('Cancelled.'); return; }
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const keep = path.join(DATA_DIR, `before-restore-${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)}`);
    fs.mkdirSync(keep, { recursive: true });
    for (const f of ['signflow.db', 'signflow.db-wal', 'signflow.db-shm', 'files']) if (fs.existsSync(path.join(DATA_DIR, f))) fs.renameSync(path.join(DATA_DIR, f), path.join(keep, f));
    fs.copyFileSync(dbFile, path.join(DATA_DIR, 'signflow.db'));
    if (fs.existsSync(path.join(tmp, 'files'))) fs.cpSync(path.join(tmp, 'files'), path.join(DATA_DIR, 'files'), { recursive: true });
    else fs.mkdirSync(path.join(DATA_DIR, 'files'), { recursive: true });
    if (fs.existsSync(path.join(tmp, 'keys'))) {
      if (fs.existsSync(path.join(DATA_DIR, 'keys'))) fs.renameSync(path.join(DATA_DIR, 'keys'), path.join(keep, 'keys'));
      fs.cpSync(path.join(tmp, 'keys'), path.join(DATA_DIR, 'keys'), { recursive: true });
    }
    console.log(`Restored. Previous data moved to ${keep}.`);
    if (!process.env.MASTER_KEY && !fs.existsSync(path.join(DATA_DIR, 'keys', 'master.key'))) console.warn('WARNING: no MASTER_KEY and no keys/master.key. Documents cannot be decrypted until you restore the original key.');
    console.log('Start the server again.');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch((e) => { console.error('Restore failed:', e.message); process.exit(1); });
