#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { RULES } = require('./ui-check/scan.js');

const ROOT = path.join(__dirname, '..');
const BASELINE = path.join(__dirname, 'ui-baseline.json');
const TARGETS = ['public/css', 'public/js'];

function walk(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return walk(rel);
    return /\.(css|js)$/.test(e.name) ? [rel] : [];
  });
}

function collect() {
  const findings = [];
  for (const rel of TARGETS.flatMap(walk)) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const ext = path.extname(rel);
    for (const rule of RULES) {
      if (rule.appliesTo !== ext) continue;
      findings.push(...rule.test(rel, src));
    }
  }
  return findings;
}

/** { rule: { file: count } } */
function tally(findings) {
  const out = {};
  for (const f of findings) {
    out[f.rule] = out[f.rule] || {};
    out[f.rule][f.file] = (out[f.rule][f.file] || 0) + 1;
  }
  return out;
}

const findings = collect();
const actual = tally(findings);

if (process.argv.includes('--write-baseline')) {
  fs.writeFileSync(BASELINE, `${JSON.stringify(actual, null, 2)}\n`);
  console.log(`Baseline written: ${Object.keys(actual).length} rule(s), ${findings.length} finding(s).`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
const keys = new Set([...Object.keys(actual), ...Object.keys(baseline)]);
const regressions = [];
const stale = [];

for (const rule of keys) {
  const a = actual[rule] || {};
  const b = baseline[rule] || {};
  for (const file of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const got = a[file] || 0;
    const allowed = b[file] || 0;
    if (got > allowed) regressions.push(`${rule}  ${file}  ${got} > ${allowed} allowed`);
    if (got < allowed) stale.push(`${rule}  ${file}  ${got} < ${allowed} allowed`);
  }
}

if (regressions.length) {
  console.error('\nNEW VIOLATIONS (fix these):\n');
  for (const r of regressions) console.error(`  ${r}`);
  console.error('\nOffending lines:\n');
  for (const f of findings) console.error(`  ${f.file}:${f.line}  [${f.rule}]  ${f.text}`);
}

if (stale.length) {
  console.error('\nSTALE BASELINE (violations fixed — tighten the baseline):\n');
  for (const s of stale) console.error(`  ${s}`);
  console.error('\nRun: node scripts/check-ui-tokens.js --write-baseline\n');
}

if (regressions.length || stale.length) process.exit(1);
console.log(`ui-check: clean (${findings.length} finding(s), all within baseline).`);
