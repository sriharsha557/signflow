'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const scan = require('../scripts/ui-check/scan.js');

const ROOT = path.join(__dirname, '..');
const KEYS = ['ocean', 'emerald', 'sunset', 'royal', 'rose', 'graphite', 'midnight'];

test('app.css defines all seven themes', () => {
  const css = fs.readFileSync(path.join(ROOT, 'public/css/app.css'), 'utf8');
  const themes = scan.resolveThemes(css);
  for (const key of KEYS) {
    assert.ok(themes[key], `missing [data-theme="${key}"]`);
    assert.ok(themes[key]['--primary'], `theme ${key} must define --primary`);
  }
});

test('app.js THEMES lists exactly the same seven keys, names only', () => {
  const js = fs.readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
  const block = js.match(/const THEMES\s*=\s*\{([\s\S]*?)\n\};/);
  assert.ok(block, 'THEMES object not found');
  const body = block[1];
  for (const key of KEYS) assert.match(body, new RegExp(`\\b${key}\\s*:`), `THEMES missing ${key}`);
  assert.ok(!/#[0-9a-fA-F]{3,8}/.test(body), 'THEMES must not contain hex colours');
});
