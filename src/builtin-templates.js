const path = require('path');
const crypto = require('crypto');
const { db, FILES_DIR } = require('./db');
const { buildContractPdf } = require('./pdf');
const vault = require('./security/vault');
const { LIBRARY, byKey } = require('./templates-library');

// Kept in sync with COLORS in public/js/editor.js; AA-verified against white (paper) background.
const COLORS = ['#15457e', '#046b50', '#b4440b', '#512aa8', '#a81436', '#0e7490'];

for (const col of ['builtin_key TEXT', 'page_count INTEGER', 'org_id INTEGER']) {
  try { db.exec(`ALTER TABLE templates ADD COLUMN ${col}`); } catch (e) { if (!/duplicate column/.test(e.message)) throw e; }
}

/** Insert any library template that isn't installed yet (matched by key, or by name for older installs). */
async function seedBuiltinTemplates() {
  let added = 0;
  for (const def of LIBRARY) {
    if (db.prepare('SELECT 1 FROM templates WHERE builtin = 1 AND builtin_key = ?').get(def.key)) continue;
    const { bytes, fields, pageCount } = await buildContractPdf(def, {});
    const fileName = `tpl-${crypto.randomBytes(8).toString('hex')}.pdf`;
    vault.writeFile(path.join(FILES_DIR, fileName), bytes);
    // Older installs: upgrade the same-named built-in in place to the new layout.
    const legacy = db.prepare('SELECT id, file_name FROM templates WHERE builtin = 1 AND builtin_key IS NULL AND name = ?').get(def.name);
    let tid;
    if (legacy) {
      tid = legacy.id;
      db.prepare('UPDATE templates SET description = ?, category = ?, file_name = ?, message = ?, builtin_key = ?, page_count = ? WHERE id = ?').run(def.description, def.category, fileName, def.message, def.key, pageCount, tid);
      db.prepare('DELETE FROM template_roles WHERE template_id = ?').run(tid);
      db.prepare('DELETE FROM template_fields WHERE template_id = ?').run(tid);
      require('fs').rmSync(path.join(FILES_DIR, path.basename(legacy.file_name)), { force: true });
    } else {
      tid = db.prepare('INSERT INTO templates (owner_id, name, description, category, file_name, message, sequential, builtin, builtin_key, page_count) VALUES (NULL, ?, ?, ?, ?, ?, 1, 1, ?, ?)')
        .run(def.name, def.description, def.category, fileName, def.message, def.key, pageCount).lastInsertRowid;
    }
    def.roles.forEach(([name], i) => db.prepare('INSERT INTO template_roles (template_id, name, role, order_index, color) VALUES (?, ?, ?, ?, ?)').run(tid, name, 'signer', i, COLORS[i % COLORS.length]));
    const ins = db.prepare('INSERT INTO template_fields (template_id, role_index, type, page, x, y, w, h, required, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const f of fields) ins.run(tid, f.role_index, f.type, f.page, f.x, f.y, f.w, f.h, f.required, f.label);
    added++;
  }
  if (added) console.log(`Installed ${added} built-in document template(s)`);
}

/**
 * Produce the PDF for a new document from a template. Built-in templates are re-rendered with the
 * sender's variable values; field positions on the final (signature) page move with the page count.
 */
async function renderTemplateForUse(t, values, readFile) {
  const def = t.builtin_key && byKey[t.builtin_key];
  const stored = db.prepare('SELECT * FROM template_fields WHERE template_id = ?').all(t.id);
  if (!def || !values || !Object.keys(values).length) return { bytes: readFile(), fields: stored };
  const { bytes, pageCount } = await buildContractPdf(def, values);
  const old = t.page_count || pageCount;
  const shift = pageCount - old;
  return { bytes, fields: stored.map((f) => ({ ...f, page: f.page === old ? f.page + shift : f.page })) };
}

module.exports = { seedBuiltinTemplates, renderTemplateForUse, COLORS, LIBRARY, byKey };
