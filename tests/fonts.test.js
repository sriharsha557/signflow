'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TOKENS = path.join(ROOT, 'public/css/tokens.css');

test('tokens.css exists', () => {
  assert.ok(fs.existsSync(TOKENS), 'public/css/tokens.css must exist');
});

test('every @font-face url resolves to a real file on disk', () => {
  const css = fs.readFileSync(TOKENS, 'utf8');
  const urls = [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1]);
  assert.ok(urls.length >= 6, `expected at least 6 font urls, got ${urls.length}`);
  for (const url of urls) {
    assert.ok(url.startsWith('/vendor/fonts/'), `font url must be self-hosted: ${url}`);
    const onDisk = path.join(ROOT, 'node_modules/@fontsource', url.replace('/vendor/fonts/', ''));
    assert.ok(fs.existsSync(onDisk), `missing font file: ${url}`);
  }
});

test('tokens.css defines every required token', () => {
  const css = fs.readFileSync(TOKENS, 'utf8');
  const required = [
    '--font-display', '--font-ui', '--font-data',
    '--t-xs', '--t-sm', '--t-base', '--t-md', '--t-lg', '--t-xl', '--t-2xl',
    '--sp-1', '--sp-2', '--sp-3', '--sp-4', '--sp-6', '--sp-8', '--sp-12',
    '--r', '--r-pill', '--ink', '--paper', '--elev-0', '--elev-1', '--dur', '--ease',
  ];
  for (const token of required) {
    assert.match(css, new RegExp(`${token}\\s*:`), `tokens.css must define ${token}`);
  }
});

test('tokens.css honours prefers-reduced-motion', () => {
  const css = fs.readFileSync(TOKENS, 'utf8');
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test('app.css imports tokens.css on its first line', () => {
  const css = fs.readFileSync(path.join(ROOT, 'public/css/app.css'), 'utf8');
  assert.match(css.split(/\r?\n/)[0], /@import\s+url\(["']?(\.\/)?tokens\.css["']?\)/);
});
