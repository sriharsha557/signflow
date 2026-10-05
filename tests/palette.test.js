'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const EDITOR_JS = path.join(ROOT, 'public/js/editor.js');
const BUILTIN_TEMPLATES_JS = path.join(ROOT, 'src/builtin-templates.js');

// Same regex as src/pdf.js's hexToRgb(). A miss here silently falls back to a
// single default blue for every recipient when rendering the signed PDF.
const PDF_HEX_RE = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

function extractColorArray(filePath, varName) {
  const src = fs.readFileSync(filePath, 'utf8');
  const re = new RegExp(`${varName}\\s*=\\s*\\[([^\\]]*)\\]`);
  const m = re.exec(src);
  assert.ok(m, `could not find "${varName} = [...]" array literal in ${filePath}`);
  return m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^['"]/, '').replace(/['"]$/, ''));
}

const editorColors = extractColorArray(EDITOR_JS, 'COLORS');
const builtinColors = extractColorArray(BUILTIN_TEMPLATES_JS, 'COLORS');

test('both palette arrays are non-empty and the same length', () => {
  assert.ok(editorColors.length > 0, `public/js/editor.js COLORS must not be empty`);
  assert.ok(builtinColors.length > 0, `src/builtin-templates.js COLORS must not be empty`);
  assert.equal(
    editorColors.length,
    builtinColors.length,
    `public/js/editor.js COLORS (${editorColors.length} entries) and src/builtin-templates.js COLORS (${builtinColors.length} entries) must have the same length`
  );
});

test('public/js/editor.js COLORS and src/builtin-templates.js COLORS are identical in value and order', () => {
  assert.deepEqual(
    editorColors,
    builtinColors,
    `Palette mismatch between public/js/editor.js (${JSON.stringify(editorColors)}) and src/builtin-templates.js (${JSON.stringify(builtinColors)}) - these must be kept in sync`
  );
});

test('every value in public/js/editor.js COLORS survives src/pdf.js hexToRgb parsing', () => {
  for (const c of editorColors) {
    assert.match(c, PDF_HEX_RE, `public/js/editor.js value "${c}" does not match src/pdf.js hexToRgb's regex and would silently fall back to default blue`);
  }
});

test('every value in src/builtin-templates.js COLORS survives src/pdf.js hexToRgb parsing', () => {
  for (const c of builtinColors) {
    assert.match(c, PDF_HEX_RE, `src/builtin-templates.js value "${c}" does not match src/pdf.js hexToRgb's regex and would silently fall back to default blue`);
  }
});

test('a CSS custom property is rejected by the src/pdf.js hexToRgb regex', () => {
  assert.doesNotMatch(
    'var(--rc-1)',
    PDF_HEX_RE,
    'var(--rc-1) must NOT match the hex regex - this is why a custom-property palette would silently degrade to default blue in signed PDFs'
  );
});
