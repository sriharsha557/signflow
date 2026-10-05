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

test('each theme block declares its own --text and --border tokens', () => {
  // scan.resolveThemes() deliberately merges :root declarations into every
  // theme's result, so it cannot be used to tell "declared by this theme"
  // apart from "inherited from :root". This test inspects each theme
  // selector's own block body in the source instead.
  const css = fs.readFileSync(path.join(ROOT, 'public/css/app.css'), 'utf8');
  const stripped = scan.stripComments(css);
  const blockRe = /([^{}]+)\{([^{}]*)\}/g;
  const bodiesByKey = {};
  for (const key of KEYS) bodiesByKey[key] = [];
  let m;
  while ((m = blockRe.exec(stripped)) !== null) {
    const [, selectorPart, body] = m;
    const selectors = selectorPart.split(',').map((s) => s.trim());
    for (const key of KEYS) {
      if (selectors.includes(`[data-theme="${key}"]`)) bodiesByKey[key].push(body);
    }
  }
  for (const key of KEYS) {
    assert.ok(bodiesByKey[key].length > 0, `no [data-theme="${key}"] block found`);
    const body = bodiesByKey[key].join('\n');
    // Anchored on a preceding `{`, `;`, or whitespace (including the start
    // of the block body) so `--primary-text:` / `--sidebar-border:` etc.
    // cannot satisfy this check.
    assert.match(body, /(?:^|[{;\s])--text\s*:/, `theme ${key} must declare its own --text (not inherit from :root)`);
    assert.match(body, /(?:^|[{;\s])--border\s*:/, `theme ${key} must declare its own --border (not inherit from :root)`);
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
