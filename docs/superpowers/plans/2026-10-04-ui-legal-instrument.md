# SignFlow "Legal Instrument" UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace SignFlow's generic AI-landing-page visual language with a committed institutional "legal instrument" direction across the app, marketing site, and signing pages, enforced by an automated guard.

**Architecture:** A new `public/css/tokens.css` becomes the single source of truth for palette, type scale, spacing, radii, elevation, and motion. It is pulled in by a single `@import` at the top of `app.css`, which every one of the six entry points already loads, so all three surfaces inherit it with one edit. A dependency-free guard script (`scripts/check-ui-tokens.js`) encodes the design rules as executable assertions over the CSS and JS sources, with a ratchet baseline so each task can land green while violations shrink monotonically.

**Tech Stack:** Vanilla ES modules, plain CSS custom properties, `node:test` (built into Node 22, zero new devDependencies), `@fontsource` static font packages served through the existing `/vendor/fonts` mount.

## Global Constraints

- **No build step.** `npm start` remains the only run command. No bundler, framework, or transpiler.
- **Node >= 22.** `node:test` and `node --test` are used as the test runner; no test framework is added.
- **Zero new runtime dependencies** except the three `@fontsource` font packages.
- **All 7 themes preserved** by name and key: `ocean`, `emerald`, `sunset`, `royal`, `rose`, `graphite`, `midnight`. They are a documented product feature.
- **CSP compatibility.** `src/security/http.js:11` sets `font-src 'self'`. All fonts must be self-hosted under `/vendor/fonts`; no CDN, no external host.
- **Radius tokens:** exactly two — `--r: 4px` and `--r-pill: 999px`. The only other permitted `border-radius` values are `0` and `50%`.
- **Motion tokens:** `--dur: 120ms`, `--ease: cubic-bezier(.2, 0, .38, .9)`.
- **Structural palette:** `--ink: #121a24`, `--paper: #fbfaf8`.
- **Contrast floor:** every `--primary` used as a button background must reach >= 4.5:1 against `#ffffff`, and `--muted` must reach >= 4.5:1 against `--surface`.
- **Typefaces:** IBM Plex Serif (display, 600), IBM Plex Sans (UI, 400/500/600), IBM Plex Mono (data, 400/500). Latin subset only. Serif is restricted to `h1`, marketing heroes, signing/verify headings, and stat numerals — never `h3`/`h4`.
- **Out of scope:** `src/pdf.js` (PDF certificate) and `src/mail.js` (HTML emails). Do not modify them.
- **Elevation rule — decoration flattens, function never does (supersedes the "exactly three
  selectors" wording in Task 4 Step 7).** `box-shadow` falls into three categories and only the
  first is flattened to `--elev-0`:
  1. **Decorative elevation** — flatten to `var(--elev-0)`. Cards, stats, panels, tables.
  2. **Functional state cues** — keep. A shadow that is the *only* indicator of focus, selection,
     or active state must never become `none`, and a shadow a keyframe animates must never be
     zeroed (that silently turns the animation into a no-op). Sanctioned: `input:focus` /
     `select:focus` / `textarea:focus` and `.font-opts button.on` (tokenised as `--focus-ring`
     and `--focus-ring-sm`); `.editor .fld.sel`, `.recip.active`, and `.sign .fld.focus` with its
     `@keyframes pulse` (these carry a per-recipient `var(--c)` colour, so they stay literal).
  3. **Genuinely floating layers** — keep at `var(--elev-1)`. `.modal`, `.toast`, dropdowns, and
     the mobile drawers `.sidebar.open` and `.editor.has-sel .side.right`.

  Sheet-of-paper surfaces (`.page`, `.tpl .thumb canvas`) use a dedicated `--elev-paper` token:
  they depict a physical document and are part of the design language, not decoration.
- **Foreground-on-accent rule.** `--on-primary: #ffffff` is the foreground for anything sitting on a
  `--primary` background (button labels, the auth-art brand, icons on accent fills). It is a fixed
  white, not a theme-varying token, because the contrast criterion above is defined as *accent vs
  `#ffffff`* — every one of the 7 accents was verified >= 4.5:1 against white. Never substitute
  `var(--surface)` for white text on an accent: under Midnight, `--surface` is `#131a2a`, which gives
  3.35:1 on `#3f6fa8` and fails AA.
- **Baseline tightening protocol (binds every task that touches `scripts/ui-baseline.json`).**
  Always run `npm run check:ui` **before** `--write-baseline`, and read its output.
  It is only safe to regenerate the baseline when the output contains a
  `STALE BASELINE` section and **no** `NEW VIOLATIONS` section. If `NEW VIOLATIONS`
  appears, fix the offending lines first — regenerating the baseline while new
  violations exist silently bakes them in and defeats the ratchet. Never run
  `--write-baseline` as the first command in a verification step.

### Verified contrast figures

Measured with the WCAG 2.1 formula during planning. These are the target values; Task 2 automates the check.

| Theme | Current `--primary` | vs `#fff` | New `--primary` | vs `#fff` |
|---|---|---|---|---|
| ocean | `#2563eb` | 5.17 | `#15457e` | 9.61 |
| emerald | `#059669` | **3.77 FAIL** | `#046b50` | 6.51 |
| sunset | `#ea580c` | **3.56 FAIL** | `#b4440b` | 5.57 |
| royal | `#7c3aed` | 5.70 | `#512aa8` | 9.35 |
| rose | `#e11d48` | 4.70 | `#a81436` | 7.45 |
| graphite | `#18181b` | 17.72 | `#18181b` (unchanged) | 17.72 |
| midnight | `#6366f1` | **4.47 FAIL** | `#3f6fa8` | 5.18 |

Three current themes fail AA today. This plan fixes that as a side effect.

Also verified: `--ink #121a24` on `--paper #fbfaf8` = 16.79; `--muted #64748b` on `#ffffff` = 4.76.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `public/css/tokens.css` | Single source of truth: `@font-face` wiring, palette, type scale, spacing, radii, elevation, motion, reduced-motion |
| `scripts/ui-check/contrast.js` | Pure colour maths: hex parsing, relative luminance, contrast ratio |
| `scripts/ui-check/scan.js` | Pure source scanners, one function per design rule, plus the theme-token cascade resolver |
| `scripts/check-ui-tokens.js` | CLI: runs scanners over the tree, compares against the ratchet baseline, exits non-zero on regression |
| `scripts/ui-baseline.json` | Ratchet baseline — per-rule, per-file counts of known remaining violations |
| `tests/ui-check.test.js` | `node:test` suite for `contrast.js` and `scan.js` |
| `public/styleguide.html` | Static kitchen-sink page rendering every component with a theme switcher |

**Modified:**

| File | Change |
|---|---|
| `package.json` | Add 3 `@fontsource` deps; add `check:ui` and `test` scripts |
| `public/css/app.css` | `@import` tokens; adopt type/space/radius/motion tokens; delete shadows from flat surfaces; serif on `h1`; deepen 7 theme accents |
| `public/css/site.css` | Delete 3 radial washes, the gradient band, and `backdrop-filter`; surfaces follow app theme tokens instead of `prefers-color-scheme` |
| `public/js/app.js` | `THEMES` reduced to names only; swatch colours derived at runtime from CSS; raw hex removed |
| `public/js/editor.js`, `saas.js`, `access-ui.js`, `compliance-ui.js`, `sign.js`, `verify.js`, `common.js` | Raw hex to token references |
| `public/app.html`, `public/sign.html`, `public/verify.html` | Font preload tags |
| `src/site/routes.js:55` | Font preload tags in the marketing head |

**Deliberate deviation from the spec:** the spec named a single `scripts/check-ui-tokens.js`. It is split into a thin CLI plus two pure modules (`scan.js`, `contrast.js`) so the logic is unit-testable without shelling out. Same behaviour, same npm script name.

---

## Task 1: Guard harness — scanners and ratchet CLI

**Files:**
- Create: `scripts/ui-check/scan.js`
- Create: `scripts/check-ui-tokens.js`
- Create: `scripts/ui-baseline.json`
- Create: `tests/ui-check.test.js`
- Modify: `package.json` (scripts block)

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `scan.js` exports `stripComments(src) -> string`, `noGradients(file, src) -> Finding[]`, `noBackdropFilter(file, src) -> Finding[]`, `noHoverTranslate(file, src) -> Finding[]`, `radiusTokensOnly(file, src) -> Finding[]`, `noFractionalFontSize(file, src) -> Finding[]`, `noRawHexInJs(file, src) -> Finding[]`, `RULES` (array of `{name, test, appliesTo}`).
  - `Finding` is `{ rule: string, file: string, line: number, text: string }`.
  - CLI `scripts/check-ui-tokens.js` supports `--write-baseline`; exit 0 clean, 1 on regression or stale baseline.

- [ ] **Step 1: Write the failing test**

Create `tests/ui-check.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const scan = require('../scripts/ui-check/scan.js');

test('stripComments blanks comments but preserves line numbers', () => {
  const src = 'a{}\n/* gradient(\n   still comment */\nb{}';
  const out = scan.stripComments(src);
  assert.equal(out.split('\n').length, 4);
  assert.ok(!out.includes('gradient('));
});

test('noGradients flags a gradient and reports its line', () => {
  const src = '.a { color: red; }\n.b { background: linear-gradient(180deg, #fff, #000); }';
  const found = scan.noGradients('x.css', src);
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 2);
  assert.equal(found[0].rule, 'no-gradient');
});

test('noGradients ignores gradients inside comments', () => {
  assert.equal(scan.noGradients('x.css', '/* background: radial-gradient(red, blue); */').length, 0);
});

test('noBackdropFilter flags backdrop-filter', () => {
  const found = scan.noBackdropFilter('x.css', '.n { backdrop-filter: blur(10px); }');
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, 'no-backdrop-filter');
});

test('noHoverTranslate flags translate only inside :hover rules', () => {
  const bad = '.card:hover { transform: translateY(-2px); }';
  const ok = '.card { transform: translateY(-2px); }';
  assert.equal(scan.noHoverTranslate('x.css', bad).length, 1);
  assert.equal(scan.noHoverTranslate('x.css', ok).length, 0);
});

test('noHoverTranslate finds hover rules nested in @media', () => {
  const src = '@media (max-width: 800px) {\n  .s:hover { transform: translateX(3px); }\n}';
  assert.equal(scan.noHoverTranslate('x.css', src).length, 1);
});

test('radiusTokensOnly accepts tokens, 0 and 50%, rejects px', () => {
  assert.equal(scan.radiusTokensOnly('x.css', '.a { border-radius: var(--r); }').length, 0);
  assert.equal(scan.radiusTokensOnly('x.css', '.a { border-radius: var(--r-pill); }').length, 0);
  assert.equal(scan.radiusTokensOnly('x.css', '.a { border-radius: 50%; }').length, 0);
  assert.equal(scan.radiusTokensOnly('x.css', '.a { border-radius: 0; }').length, 0);
  assert.equal(scan.radiusTokensOnly('x.css', '.a { border-radius: 12px; }').length, 1);
  assert.equal(scan.radiusTokensOnly('x.css', '.a { border-radius: 2px 0 3px 0; }').length, 1);
});

test('noFractionalFontSize flags 12.5px but not 12px', () => {
  assert.equal(scan.noFractionalFontSize('x.css', '.a { font-size: 12.5px; }').length, 1);
  assert.equal(scan.noFractionalFontSize('x.css', '.a { font-size: 12px; }').length, 0);
});

test('noRawHexInJs flags colours but not DOM id selectors', () => {
  assert.equal(scan.noRawHexInJs('x.js', "el.style.color = '#0f172a';").length, 1);
  assert.equal(scan.noRawHexInJs('x.js', "el.style.color = '#fff';").length, 1);
  assert.equal(scan.noRawHexInJs('x.js', "document.querySelector('#add-user');").length, 0);
  assert.equal(scan.noRawHexInJs('x.js', "document.querySelector('#ok');").length, 0);
});

test('ui-check-ignore suppresses a line', () => {
  const src = '.a { background: linear-gradient(red, blue); } /* ui-check-ignore */';
  assert.equal(scan.noGradients('x.css', src).length, 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/ui-check.test.js`
Expected: FAIL — `Cannot find module '../scripts/ui-check/scan.js'`

- [ ] **Step 3: Write the scanners**

Create `scripts/ui-check/scan.js`:

```js
'use strict';

const IGNORE = 'ui-check-ignore';
const RADIUS_ALLOWED = new Set(['var(--r)', 'var(--r-pill)', '0', '50%']);
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![-\w])/g;

/** Blank out CSS comments, keeping newlines so reported line numbers stay accurate. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

function finding(rule, file, lineIndex, text) {
  return { rule, file, line: lineIndex + 1, text: String(text).trim().slice(0, 120) };
}

/** Run a per-line regex rule over comment-stripped source. */
function lineRule(rule, re, file, src) {
  const out = [];
  stripComments(src).split(/\r?\n/).forEach((line, i) => {
    if (line.includes(IGNORE)) return;
    if (re.test(line)) out.push(finding(rule, file, i, line));
  });
  return out;
}

function noGradients(file, src) {
  return lineRule('no-gradient', /gradient\s*\(/, file, src);
}

function noBackdropFilter(file, src) {
  return lineRule('no-backdrop-filter', /backdrop-filter\s*:/, file, src);
}

/**
 * Flag transform translation inside a :hover rule. Matches innermost
 * declaration blocks only, so rules nested in @media are still seen.
 */
function noHoverTranslate(file, src) {
  const out = [];
  const css = stripComments(src);
  const block = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = block.exec(css)) !== null) {
    const [, selector, body] = m;
    if (!/:hover/.test(selector)) continue;
    if (!/translate/.test(body)) continue;
    if (body.includes(IGNORE) || selector.includes(IGNORE)) continue;
    const line = css.slice(0, m.index).split(/\r?\n/).length;
    out.push({ rule: 'no-hover-translate', file, line, text: selector.trim().slice(0, 120) });
  }
  return out;
}

function radiusTokensOnly(file, src) {
  const out = [];
  stripComments(src).split(/\r?\n/).forEach((line, i) => {
    if (line.includes(IGNORE)) return;
    for (const m of line.matchAll(/border-radius\s*:\s*([^;}]+)/g)) {
      const parts = m[1].trim().split(/\s+/);
      if (!parts.every((p) => RADIUS_ALLOWED.has(p))) {
        out.push(finding('radius-token', file, i, line));
      }
    }
  });
  return out;
}

function noFractionalFontSize(file, src) {
  return lineRule('fractional-font-size', /font-size\s*:\s*\d+\.\d+/, file, src);
}

/**
 * Flag hex colours in JavaScript. The negative lookahead in HEX keeps DOM id
 * selectors such as '#add-user' from being mistaken for the colour '#add'.
 */
function noRawHexInJs(file, src) {
  const out = [];
  src.split(/\r?\n/).forEach((line, i) => {
    if (line.includes(IGNORE)) return;
    const hits = line.match(HEX);
    if (hits) for (let k = 0; k < hits.length; k++) out.push(finding('no-raw-hex-js', file, i, line));
  });
  return out;
}

const RULES = [
  { name: 'no-gradient', test: noGradients, appliesTo: '.css' },
  { name: 'no-backdrop-filter', test: noBackdropFilter, appliesTo: '.css' },
  { name: 'no-hover-translate', test: noHoverTranslate, appliesTo: '.css' },
  { name: 'radius-token', test: radiusTokensOnly, appliesTo: '.css' },
  { name: 'fractional-font-size', test: noFractionalFontSize, appliesTo: '.css' },
  { name: 'no-raw-hex-js', test: noRawHexInJs, appliesTo: '.js' },
];

module.exports = {
  stripComments, noGradients, noBackdropFilter, noHoverTranslate,
  radiusTokensOnly, noFractionalFontSize, noRawHexInJs, RULES,
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/ui-check.test.js`
Expected: PASS — 10 tests, 0 failures

- [ ] **Step 5: Write the ratchet CLI**

Create `scripts/check-ui-tokens.js`:

```js
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
```

- [ ] **Step 6: Generate the starting baseline and sanity-check it**

Run: `node scripts/check-ui-tokens.js --write-baseline && cat scripts/ui-baseline.json`

Expected: the baseline reflects the audited starting state. Verify these anchors, which were measured during planning:
- `no-gradient` on `public/css/site.css` = **4**
- `no-backdrop-filter` on `public/css/site.css` = **1**
- `no-hover-translate` = **1** in `public/css/app.css` and **1** in `public/css/site.css`
- `no-raw-hex-js` totals **about 83** across the `public/js` files

If `no-raw-hex-js` is far above 83, the DOM-id lookahead is misfiring — inspect the printed lines before continuing.

- [ ] **Step 7: Wire the npm scripts**

In `package.json`, replace the `scripts` block with:

```json
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test tests/",
    "check:ui": "node scripts/check-ui-tokens.js",
    "backup": "node scripts/backup.js",
    "restore": "node scripts/restore.js",
    "admin": "node scripts/admin.js"
  },
```

- [ ] **Step 8: Verify both commands pass**

Run: `npm test && npm run check:ui`
Expected: tests PASS; `ui-check: clean (N finding(s), all within baseline).`

- [ ] **Step 9: Commit**

```bash
git add scripts/ui-check/scan.js scripts/check-ui-tokens.js scripts/ui-baseline.json tests/ui-check.test.js package.json
git commit -m "test: add UI token guard with ratchet baseline"
```

---

## Task 2: Contrast checking and theme-token resolution

**Files:**
- Create: `scripts/ui-check/contrast.js`
- Modify: `scripts/ui-check/scan.js` (add `resolveThemes`)
- Modify: `scripts/check-ui-tokens.js` (add the contrast gate)
- Modify: `tests/ui-check.test.js` (append tests)

**Interfaces:**
- Consumes: `scan.stripComments` from Task 1.
- Produces:
  - `contrast.js` exports `parseHex(input) -> [r,g,b]`, `relativeLuminance([r,g,b]) -> number`, `contrastRatio(hexA, hexB) -> number`.
  - `scan.js` additionally exports `resolveThemes(css) -> { [themeName]: { [token]: value } }`, where `:root` declarations form the base and `[data-theme="x"]` declarations override them.
  - CLI additionally exports nothing but gains a contrast gate reading `public/css/app.css` and `public/css/tokens.css`.

- [ ] **Step 1: Write the failing test**

Append to `tests/ui-check.test.js`:

```js
const contrast = require('../scripts/ui-check/contrast.js');

test('parseHex handles 3- and 6-digit forms', () => {
  assert.deepEqual(contrast.parseHex('#fff'), [255, 255, 255]);
  assert.deepEqual(contrast.parseHex('#0f172a'), [15, 23, 42]);
  assert.throws(() => contrast.parseHex('rebeccapurple'));
});

test('contrastRatio matches known WCAG values', () => {
  assert.equal(contrast.contrastRatio('#000', '#fff').toFixed(2), '21.00');
  assert.equal(contrast.contrastRatio('#fff', '#fff').toFixed(2), '1.00');
  assert.equal(contrast.contrastRatio('#15457e', '#ffffff').toFixed(2), '9.61');
  assert.equal(contrast.contrastRatio('#3f6fa8', '#ffffff').toFixed(2), '5.18');
});

test('contrastRatio is symmetric', () => {
  const a = contrast.contrastRatio('#b4440b', '#fff');
  const b = contrast.contrastRatio('#fff', '#b4440b');
  assert.equal(a.toFixed(4), b.toFixed(4));
});

test('resolveThemes merges :root base with theme overrides', () => {
  const css = `
    :root, [data-theme="ocean"] { --primary: #15457e; --surface: #ffffff; --muted: #64748b; }
    [data-theme="emerald"] { --primary: #046b50; }
  `;
  const themes = scan.resolveThemes(css);
  assert.equal(themes.ocean['--primary'], '#15457e');
  assert.equal(themes.emerald['--primary'], '#046b50');
  assert.equal(themes.emerald['--surface'], '#ffffff', 'inherits :root surface');
});

test('resolveThemes ignores commented-out theme blocks', () => {
  const themes = scan.resolveThemes('/* [data-theme="ghost"] { --primary: #000; } */');
  assert.equal(themes.ghost, undefined);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/ui-check.test.js`
Expected: FAIL — `Cannot find module '../scripts/ui-check/contrast.js'`

- [ ] **Step 3: Write the contrast module**

Create `scripts/ui-check/contrast.js`:

```js
'use strict';

/** Parse #rgb or #rrggbb into [r, g, b] in 0..255. Throws on anything else. */
function parseHex(input) {
  const raw = String(input).trim().replace(/^#/, '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`not a hex colour: ${input}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

/** WCAG 2.1 relative luminance. */
function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours, in 1..21. */
function contrastRatio(hexA, hexB) {
  const la = relativeLuminance(parseHex(hexA));
  const lb = relativeLuminance(parseHex(hexB));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

module.exports = { parseHex, relativeLuminance, contrastRatio };
```

- [ ] **Step 4: Add the theme resolver**

Append to `scripts/ui-check/scan.js`, before `module.exports`:

```js
/**
 * Resolve the custom-property cascade for each theme. `:root` declarations
 * form the base; `[data-theme="x"]` declarations override them.
 */
function resolveThemes(css) {
  const src = stripComments(css);
  const base = {};
  const themes = {};
  const block = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = block.exec(src)) !== null) {
    const selector = m[1].trim();
    const decls = {};
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) decls[d[1]] = d[2].trim();
    if (/(^|,)\s*:root\s*(,|$)/.test(selector)) Object.assign(base, decls);
    for (const t of selector.matchAll(/\[data-theme="([^"]+)"\]/g)) {
      themes[t[1]] = Object.assign(themes[t[1]] || {}, decls);
    }
  }
  const out = {};
  for (const [name, decls] of Object.entries(themes)) out[name] = { ...base, ...decls };
  return out;
}
```

Then extend the exports to include it:

```js
module.exports = {
  stripComments, noGradients, noBackdropFilter, noHoverTranslate,
  radiusTokensOnly, noFractionalFontSize, noRawHexInJs, resolveThemes, RULES,
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/ui-check.test.js`
Expected: PASS — 15 tests, 0 failures

- [ ] **Step 6: Add the contrast gate to the CLI**

In `scripts/check-ui-tokens.js`, add after the `require` lines:

```js
const { resolveThemes } = require('./ui-check/scan.js');
const { contrastRatio } = require('./ui-check/contrast.js');

const MIN_RATIO = 4.5;
const ON_PRIMARY = '#ffffff';

/** Contrast failures across every theme. Non-hex values are skipped. */
function contrastFailures() {
  const css = ['public/css/tokens.css', 'public/css/app.css']
    .map((p) => path.join(ROOT, p))
    .filter((p) => fs.existsSync(p))
    .map((p) => fs.readFileSync(p, 'utf8'))
    .join('\n');
  const out = [];
  for (const [theme, tokens] of Object.entries(resolveThemes(css))) {
    const pairs = [
      ['primary-on-white', tokens['--primary'], ON_PRIMARY],
      ['muted-on-surface', tokens['--muted'], tokens['--surface']],
    ];
    for (const [label, fg, bg] of pairs) {
      if (!fg || !bg || !fg.startsWith('#') || !bg.startsWith('#')) continue;
      const ratio = contrastRatio(fg, bg);
      if (ratio < MIN_RATIO) {
        out.push(`${theme}  ${label}  ${fg} on ${bg}  ${ratio.toFixed(2)} < ${MIN_RATIO}`);
      }
    }
  }
  return out;
}
```

Then, immediately before the final `if (regressions.length || stale.length) process.exit(1);`, insert:

```js
const contrastBad = contrastFailures();
if (contrastBad.length) {
  console.error('\nCONTRAST BELOW WCAG AA:\n');
  for (const c of contrastBad) console.error(`  ${c}`);
}
```

And change the final two lines to:

```js
if (regressions.length || stale.length || contrastBad.length) process.exit(1);
console.log(`ui-check: clean (${findings.length} finding(s), contrast AA across all themes).`);
```

- [ ] **Step 7: Run the gate against the current palette to confirm it catches the real failures**

Run: `npm run check:ui`

Expected: **exit 1**, reporting exactly these three pre-existing failures:

```
  emerald   primary-on-white  #059669 on #ffffff  3.77 < 4.5
  sunset    primary-on-white  #ea580c on #ffffff  3.56 < 4.5
  midnight  primary-on-white  #6366f1 on #ffffff  4.47 < 4.5
```

This is the expected red state. It is fixed in Task 4, where the accents are deepened. Do not adjust `MIN_RATIO` to make it pass.

- [ ] **Step 8: Commit**

```bash
git add scripts/ui-check/contrast.js scripts/ui-check/scan.js scripts/check-ui-tokens.js tests/ui-check.test.js
git commit -m "test: gate theme palettes on WCAG AA contrast"
```

---

## Task 3: Fonts and the shared token layer

**Files:**
- Create: `public/css/tokens.css`
- Create: `tests/fonts.test.js`
- Modify: `package.json` (dependencies)
- Modify: `public/css/app.css:1` (prepend `@import`)
- Modify: `public/app.html:8`, `public/sign.html:14`, `public/verify.html:8`, `src/site/routes.js:55` (preload tags)

**Interfaces:**
- Consumes: nothing from Tasks 1–2.
- Produces: the tokens every later task references — `--font-display`, `--font-ui`, `--font-data`, `--t-xs`…`--t-2xl`, `--sp-1`…`--sp-12`, `--r`, `--r-pill`, `--ink`, `--paper`, `--elev-0`, `--elev-1`, `--dur`, `--ease`.

- [ ] **Step 1: Install the typefaces**

Run: `npm install --ignore-scripts @fontsource/ibm-plex-serif@5.3.0 @fontsource/ibm-plex-sans@5.3.0 @fontsource/ibm-plex-mono@5.3.0`

`--ignore-scripts` is required on this machine: `better-sqlite3` has `binding.gyp` and no install script, so npm runs `node-gyp rebuild` unconditionally and fails without a C++ toolchain, even though the correct prebuilt binary is already present and working.

- [ ] **Step 2: Write the failing test**

Create `tests/fonts.test.js`:

```js
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test tests/fonts.test.js`
Expected: FAIL — "public/css/tokens.css must exist"

- [ ] **Step 4: Confirm the exact font filenames before writing them**

Run: `ls node_modules/@fontsource/ibm-plex-serif/files/ | grep -E "latin-(600)-normal.woff2"` and `ls node_modules/@fontsource/ibm-plex-sans/files/ | grep -E "latin-(400|500|600)-normal.woff2"` and `ls node_modules/@fontsource/ibm-plex-mono/files/ | grep -E "latin-(400|500)-normal.woff2"`

Expected: six `.woff2` filenames following the `<family>-latin-<weight>-normal.woff2` pattern. If any weight is missing, use the nearest available weight and note the substitution in the commit message.

- [ ] **Step 5: Write tokens.css**

Create `public/css/tokens.css`:

```css
/* ==========================================================================
   SignFlow shared design tokens — "legal instrument" direction.
   Single source of truth for typefaces, palette scaffolding, type scale,
   spacing, radii, elevation and motion. Imported by app.css, which every
   entry point loads, so all three surfaces inherit these values.
   ========================================================================== */

/* ---- Typefaces. Served by the /vendor/fonts mount in src/server.js. ---- */
@font-face {
  font-family: "IBM Plex Serif"; font-style: normal; font-weight: 600; font-display: swap;
  src: url("/vendor/fonts/ibm-plex-serif/files/ibm-plex-serif-latin-600-normal.woff2") format("woff2");
}
@font-face {
  font-family: "IBM Plex Sans"; font-style: normal; font-weight: 400; font-display: swap;
  src: url("/vendor/fonts/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2") format("woff2");
}
@font-face {
  font-family: "IBM Plex Sans"; font-style: normal; font-weight: 500; font-display: swap;
  src: url("/vendor/fonts/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2") format("woff2");
}
@font-face {
  font-family: "IBM Plex Sans"; font-style: normal; font-weight: 600; font-display: swap;
  src: url("/vendor/fonts/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2") format("woff2");
}
@font-face {
  font-family: "IBM Plex Mono"; font-style: normal; font-weight: 400; font-display: swap;
  src: url("/vendor/fonts/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2") format("woff2");
}
@font-face {
  font-family: "IBM Plex Mono"; font-style: normal; font-weight: 500; font-display: swap;
  src: url("/vendor/fonts/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2") format("woff2");
}

:root {
  /* Typeface roles. System stacks stay as fallbacks so a cold load never blanks. */
  --font-display: "IBM Plex Serif", Georgia, "Times New Roman", serif;
  --font-ui: "IBM Plex Sans", -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --font-data: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

  /* Type scale. No fractional sizes. */
  --t-xs: 12px;
  --t-sm: 13px;
  --t-base: 14px;
  --t-md: 16px;
  --t-lg: 20px;
  --t-xl: 26px;
  --t-2xl: 34px;

  /* Spacing, 4/8 grid. */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-6: 24px;
  --sp-8: 32px;
  --sp-12: 48px;

  /* Radii. Exactly two. */
  --r: 4px;
  --r-pill: 999px;

  /* Structural palette. Warm paper against ink reads as "document". */
  --ink: #121a24;
  --paper: #fbfaf8;

  /* Elevation. Flat by default; real shadow only for genuinely floating layers. */
  --elev-0: none;
  --elev-1: 0 10px 30px -12px rgba(18, 26, 36, .28);

  /* Motion. */
  --dur: 120ms;
  --ease: cubic-bezier(.2, 0, .38, .9);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 6: Import tokens from app.css**

Insert as the very first line of `public/css/app.css` (an `@import` must precede all other rules):

```css
@import url("tokens.css");
```

- [ ] **Step 7: Add font preload tags**

In `public/app.html`, `public/sign.html`, and `public/verify.html`, insert immediately before the existing `<link rel="stylesheet" href="/css/app.css">` line:

```html
<link rel="preload" href="/vendor/fonts/ibm-plex-serif/files/ibm-plex-serif-latin-600-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/vendor/fonts/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
```

Add the same two lines to the marketing head in `src/site/routes.js`, immediately before line 55's `<link rel="stylesheet" href="/css/app.css">`.

The private-access page (`routes.js:38`) and the 404 page (`routes.js:135`) intentionally skip preload — they are single-screen pages where the `font-display: swap` fallback is sufficient. They still receive the fonts via `@font-face`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `node --test tests/fonts.test.js`
Expected: PASS — 5 tests, 0 failures

- [ ] **Step 9: Verify the fonts actually serve over HTTP under the CSP**

Run in one shell: `COOKIE_SECURE=0 node src/server.js`
Then in another:

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type} %{size_download}\n" \
  http://localhost:3000/vendor/fonts/ibm-plex-serif/files/ibm-plex-serif-latin-600-normal.woff2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/css/tokens.css
```

Expected: `200 font/woff2 <non-zero bytes>` and `200`. Stop the server afterwards.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json public/css/tokens.css public/css/app.css tests/fonts.test.js public/app.html public/sign.html public/verify.html src/site/routes.js
git commit -m "feat: add IBM Plex typefaces and shared design token layer"
```

---

## Task 4: Convert app.css to the token layer

**Files:**
- Modify: `public/css/app.css` (throughout)
- Modify: `scripts/ui-baseline.json` (tighten)

**Interfaces:**
- Consumes: every token from Task 3; the contrast gate from Task 2.
- Produces: the deepened 7-theme palette that Task 5 reads at runtime for swatches. Token names consumed later: `--primary`, `--surface`, `--surface-2`, `--border`, `--muted`, `--text`, `--bg`, `--sidebar`, `--sidebar-text`.

- [ ] **Step 1: Deepen the seven theme accents**

In the theme blocks at the top of `public/css/app.css`, replace each `--primary` and `--primary-hover` pair with these verified-AA values. Leave `--primary-soft` and `--primary-text` as they are unless the contrast gate flags them.

```
ocean     --primary: #15457e;  --primary-hover: #0f3561;
emerald   --primary: #046b50;  --primary-hover: #03523d;
sunset    --primary: #b4440b;  --primary-hover: #8f3608;
royal     --primary: #512aa8;  --primary-hover: #3f2185;
rose      --primary: #a81436;  --primary-hover: #860f2b;
graphite  --primary: #18181b;  --primary-hover: #000000;   (unchanged)
midnight  --primary: #3f6fa8;  --primary-hover: #4e82bd;
```

- [ ] **Step 2: Switch the base palette to warm paper and ink**

In the `:root, [data-theme="ocean"]` block, replace `--bg: #f5f7fb;` with `--bg: var(--paper);` and `--text: #0f172a;` with `--text: var(--ink);`.

- [ ] **Step 3: Run the contrast gate — it must now pass**

Run: `npm run check:ui`

Expected: the three contrast failures from Task 2 Step 7 are **gone**. The command still exits 1 on the radius/hex/gradient baseline items, which is correct at this point. Confirm the output no longer contains a `CONTRAST BELOW WCAG AA` section.

- [ ] **Step 4: Adopt the typeface roles**

In `public/css/app.css`:

- `body` — replace `font-family: Inter, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;` with `font-family: var(--font-ui);` and `font-size: 14px;` with `font-size: var(--t-base);`
- `h1` — add `font-family: var(--font-display); font-weight: 600;` and change `font-size: 22px;` to `font-size: var(--t-xl);`
- `h2` — change `font-size: 17px;` to `font-size: var(--t-md);` (stays `--font-ui`)
- `h3` — change `font-size: 14px;` to `font-size: var(--t-base);` (stays `--font-ui`)
- `.mono` — replace the font stack with `font-family: var(--font-data);` and `font-size: 12px;` with `font-size: var(--t-xs);`
- `.stat .n` — add `font-family: var(--font-display); font-variant-numeric: tabular-nums;`

- [ ] **Step 5: Collapse every radius to the two tokens**

Apply this mapping to every `border-radius` in the file. The guard rejects anything else.

| Current value | Replace with |
|---|---|
| `3px`, `4px`, `6px`, `8px`, `9px`, `10px`, `12px`, `14px`, `16px` | `var(--r)` |
| `99px` | `var(--r-pill)` |
| `50%` | leave as `50%` (circles: `.avatar`, `.badge::before`, `.timeline .dot`) |
| `2px 0 3px 0` (`.fld .rz`) | `var(--r)` |

- [ ] **Step 6: Remove fractional font sizes**

| Current | Replace with |
|---|---|
| `font-size: 12.5px` | `font-size: var(--t-xs)` |
| `font-size: 11.5px` | `font-size: var(--t-xs)` |
| `font-size: 13.5px` | `font-size: var(--t-sm)` |

- [ ] **Step 7: Flatten elevation and remove the hover lift**

- `.card` — replace `box-shadow: var(--shadow);` with `box-shadow: var(--elev-0);`
- `.stat:hover` — replace the whole rule body. Was `transform: translateY(-2px);`, becomes:

```css
.stat:hover { border-color: var(--primary); background: var(--surface-2); }
```

- `.stat` — replace `transition: transform .15s;` with `transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);`
- Keep `box-shadow` only on `.modal` (`var(--elev-1)`), `.toast` (`var(--elev-1)`), and `.page` (the PDF page drop shadow, which represents a physical sheet of paper and is intentional).

- [ ] **Step 8: Normalise motion durations**

Replace every `.15s` and `.2s` transition duration with `var(--dur)`, and append `var(--ease)` where no timing function is given. Example — `.btn`:

```css
.btn { /* ...unchanged properties... */ transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease), color var(--dur) var(--ease); }
```

- [ ] **Step 9: Add tabular numerals to data surfaces**

```css
.tbl td { font-variant-numeric: tabular-nums; }
```

- [ ] **Step 10: Tighten the baseline and verify**

Run: `node scripts/check-ui-tokens.js --write-baseline && npm run check:ui && npm test`

Expected: `check:ui` prints `ui-check: clean`, and `public/css/app.css` now has **zero** entries under `radius-token`, `fractional-font-size`, and `no-hover-translate` in `scripts/ui-baseline.json`. Verify by inspecting the file. `public/css/site.css` entries remain — Task 7 clears those.

- [ ] **Step 11: Visual smoke check**

Run: `COOKIE_SECURE=0 node src/server.js`, open `http://localhost:3000/app`, and confirm: serif page titles, no card lift on dashboard stat hover, 4px corners throughout, and the deeper accent. Switch through all 7 themes in Settings. Stop the server.

- [ ] **Step 12: Commit**

```bash
git add public/css/app.css scripts/ui-baseline.json
git commit -m "feat: convert app.css to token layer and AA-compliant palette"
```

---

## Task 5: Make CSS the single source of truth for theme swatches

**Files:**
- Modify: `public/js/app.js:15-22` and the settings swatch renderer
- Create: `tests/themes.test.js`
- Modify: `scripts/ui-baseline.json` (tighten)

**Interfaces:**
- Consumes: the `[data-theme]` blocks in `public/css/app.css` from Task 4; `scan.resolveThemes` from Task 2.
- Produces: `THEMES` as `{ [key]: { name: string } }` and a new exported helper `themeSwatch(key) -> { sb: string, bg: string, p: string, t: string }` reading live computed values.

- [ ] **Step 1: Write the failing test**

Create `tests/themes.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/themes.test.js`
Expected: FAIL — "THEMES must not contain hex colours"

- [ ] **Step 3: Reduce THEMES to names and derive swatches from CSS**

Replace `public/js/app.js:15-22` (the `const THEMES = { ... };` block) with:

```js
const THEMES = {
  ocean: { name: 'Ocean' },
  emerald: { name: 'Emerald' },
  sunset: { name: 'Sunset' },
  royal: { name: 'Royal' },
  rose: { name: 'Rose' },
  graphite: { name: 'Graphite' },
  midnight: { name: 'Midnight (dark)' },
};

/**
 * Read a theme's swatch colours from CSS rather than duplicating them here.
 * Renders a detached probe element carrying the theme attribute and asks the
 * browser for the resolved custom properties, so public/css is the only
 * place a palette is ever defined.
 */
function themeSwatch(key) {
  const probe = document.createElement('div');
  probe.dataset.theme = key;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const read = (name) => cs.getPropertyValue(name).trim();
  const swatch = {
    sb: read('--sidebar'),
    bg: read('--bg'),
    p: read('--primary'),
    t: read('--sidebar-text'),
  };
  probe.remove();
  return swatch;
}
```

- [ ] **Step 4: Point the swatch renderer at the helper**

Find every place that reads `.sb`, `.bg`, `.p`, or `.t` off a `THEMES` entry (grep with `grep -n "THEMES\[" public/js/app.js` and `grep -n "\.sb\|\.p\b" public/js/app.js`). Replace each read with a `themeSwatch(key)` call made once per swatch, for example:

```js
const sw = themeSwatch(key);
// then use sw.sb, sw.bg, sw.p, sw.t in place of the old t.sb, t.bg, t.p, t.t
```

Keep `THEMES[key].name` for the label.

- [ ] **Step 5: Convert the remaining hex colours in app.js to tokens**

Run `grep -n "#[0-9a-fA-F]\{3,8\}" public/js/app.js` and replace each colour literal with `var(--token)` in inline styles, using this mapping:

| Hex | Token |
|---|---|
| `#0f172a`, `#121a24` | `var(--ink)` |
| `#f5f7fb`, `#fbfaf8` | `var(--paper)` |
| `#fff`, `#ffffff` **as a background/surface** | `var(--surface)` |
| `#fff`, `#ffffff` **as text or an icon sitting ON a `--primary` background** | `var(--on-primary)` |
| `#64748b`, `#5b6577` | `var(--muted)` |
| `#e2e8f0`, `#e3e8ef` | `var(--border)` |
| `#15803d` | `var(--ok)` |
| `#b45309` | `var(--warn)` |
| `#b91c1c`, `#dc2626` | `var(--bad)` |
| any theme accent | `var(--primary)` |

If a colour has no sensible token, add a new token to `tokens.css` rather than leaving the literal in JS. Where a hex is genuinely not a colour (a DOM id), add a trailing `// ui-check-ignore` comment.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test tests/themes.test.js`
Expected: PASS — 2 tests, 0 failures

- [ ] **Step 7: Verify the swatches in a browser**

Run `COOKIE_SECURE=0 node src/server.js`, open `http://localhost:3000/app`, go to Settings → Branding & themes, and confirm all 7 swatches render with colours that match the themes when selected. This is the regression this task exists to prevent. Stop the server.

- [ ] **Step 8: Tighten the baseline, verify, commit**

```bash
node scripts/check-ui-tokens.js --write-baseline
npm run check:ui && npm test
git add public/js/app.js tests/themes.test.js scripts/ui-baseline.json
git commit -m "refactor: derive theme swatches from CSS instead of duplicating palette"
```

Expected before committing: `scripts/ui-baseline.json` has **zero** `no-raw-hex-js` entries for `public/js/app.js`.

---

## Task 6: Convert the remaining app JS modules

**Files:**
- Modify: `public/js/editor.js`, `public/js/saas.js`, `public/js/access-ui.js`, `public/js/compliance-ui.js`, `public/js/common.js`
- Modify: `scripts/ui-baseline.json` (tighten)

**Interfaces:**
- Consumes: the token names and hex-to-token mapping from Task 5 Step 5.
- Produces: no new interfaces. Removes the remaining `no-raw-hex-js` baseline entries for these five files.

- [ ] **Step 1: Confirm the starting counts**

Run: `npm run check:ui 2>&1 | grep no-raw-hex-js`

Expected, per the planning audit: `saas.js` around 66 inline-style sites, `access-ui.js` around 47, `sign.js` 23, `editor.js` 19, `compliance-ui.js` 8, `verify.js` 5, `common.js` 1. Note the actual hex counts printed — these are the numbers to drive to zero.

- [ ] **Step 2: Convert one file at a time, verifying after each**

For each of `editor.js`, `saas.js`, `access-ui.js`, `compliance-ui.js`, `common.js`, in that order:

1. Run `grep -n "#[0-9a-fA-F]\{3,8\}" public/js/<file>` to list the literals.
2. Replace each with the matching `var(--token)` from the Task 5 Step 5 mapping.
3. Mark any non-colour hex (DOM ids) with a trailing `// ui-check-ignore`.
4. Run `npm run check:ui` and confirm that file's count dropped.
5. Commit that single file:

```bash
node scripts/check-ui-tokens.js --write-baseline
git add public/js/<file> scripts/ui-baseline.json
git commit -m "refactor: replace raw hex with design tokens in <file>"
```

One commit per file keeps any visual regression bisectable to a single surface.

- [ ] **Step 3: Note the editor's field colours**

`public/js/editor.js` assigns per-recipient field colours through the `--c` custom property consumed by `.fld` in `app.css`. These are **data, not styling, and they must stay literal hex.**

**Do NOT move this palette into CSS tokens.** The assigned colour is POSTed to the server, persisted in the `recipients.color` and `template_roles.color` TEXT columns, and then read back by `hexToRgb()` in `src/pdf.js`, which regex-matches a hex colour and **silently falls back to one default blue when it does not match**. Storing `var(--rc-N)` therefore collapses every recipient's field colour to the same blue in the generated signed PDF, with no error raised. A CSS custom property cannot cross into server-side PDF rendering.

Instead, keep a literal hex array in `editor.js`, marked `// ui-check-ignore` with the justification that it is a persisted data value rather than styling, and **align it with the server's own palette** in `src/builtin-templates.js`, which is the fallback used when a client does not supply a colour. Both must hold the same six values:

```js
const COLORS = ['#15457e', '#046b50', '#b4440b', '#512aa8', '#a81436', '#0e7490']; // ui-check-ignore
```

These six are verified >= 4.5:1 against white (9.61, 6.51, 5.57, 9.35, 7.45, 5.36), which matters because they are drawn onto white PDF paper. The palette they replace in `src/builtin-templates.js` had three failures: `#059669` 3.77, `#d97706` 3.19, `#0891b2` 3.68.

- [ ] **Step 4: Verify the editor still works end to end**

Run `COOKIE_SECURE=0 node src/server.js`, open `http://localhost:3000/app`, create a document, upload a PDF, add two recipients, and place a field for each. Confirm the two recipients get visually distinct field colours and that drag and resize still work. Stop the server.

- [ ] **Step 5: Final verification for this task**

Run: `npm run check:ui && npm test`
Expected: `ui-check: clean`, and `scripts/ui-baseline.json` has **zero** `no-raw-hex-js` entries for all five files. `sign.js` and `verify.js` remain — Task 8 clears those.

---

## Task 7: Flatten the marketing site and make it follow themes

**Files:**
- Modify: `public/css/site.css` (lines 3–10, 43, 54, 89, 95, 188, 231, and radii throughout)
- Modify: `scripts/ui-baseline.json` (tighten)

**Interfaces:**
- Consumes: app theme tokens (`--surface`, `--text`, `--border`, `--bg`, `--muted`, `--primary`) which already cascade in, because `src/site/routes.js` sets `data-theme` on `<html>` and loads `app.css` before `site.css`.
- Produces: no new interfaces.

- [ ] **Step 1: Point site surfaces at the app's theme tokens**

Replace `public/css/site.css` lines 3–10 (the `.sf-site` token block and the `prefers-color-scheme` block that follows it) with:

```css
.sf-site {
  --s-pri: var(--primary);
  --s-pri-soft: color-mix(in srgb, var(--s-pri) 10%, transparent);
  --s-bg: var(--surface);
  --s-bg2: var(--surface-2);
  --s-fg: var(--text);
  --s-muted: var(--muted);
  --s-line: var(--border);
  --s-card: var(--surface);
  --s-dark: var(--ink);
  --s-ok: var(--ok);
  --s-warn: var(--warn);
  --s-bad: var(--bad);
  background: var(--s-bg);
  color: var(--s-fg);
  line-height: 1.55;
  font-size: var(--t-md);
  -webkit-font-smoothing: antialiased;
}
```

The `@media (prefers-color-scheme: dark)` block is **deleted**. Dark presentation now comes from selecting the Midnight theme, which is the intended behaviour change: the public site finally follows the configured brand theme.

- [ ] **Step 2: Remove the three radial washes and the gradient band**

| Line | Was | Becomes |
|---|---|---|
| 54 `.s-hero` | `background: radial-gradient(...), linear-gradient(...)` | `background: var(--s-bg2); border-bottom: 1px solid var(--s-line);` |
| 89 `.s-phead` | `background: radial-gradient(...), var(--s-bg2)` | `background: var(--s-bg2);` (keep its existing `border-bottom`) |
| 188 `.s-band` | `background: linear-gradient(120deg, ...)` | `background: var(--ink);` |
| 231 `.s-private` | `background: radial-gradient(...), var(--s-bg2)` | `background: var(--s-bg2);` |

- [ ] **Step 3: Make the nav solid**

Replace line 43 `.s-nav`:

```css
.s-nav { position: sticky; top: 0; z-index: 30; background: var(--s-bg); border-bottom: 1px solid var(--s-line); }
```

The `backdrop-filter` and the translucent `color-mix` background are both removed.

- [ ] **Step 4: Replace the card hover lift with a border change**

Replace line 95:

```css
.s-card.s-link { transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease); }
.s-card.s-link:hover { background: var(--s-bg2); border-color: var(--s-pri); }
```

- [ ] **Step 5: Apply typeface roles and tokens**

- `.sf-site h1` — add `font-family: var(--font-display); font-weight: 600;`
- `.sf-site h2` — add `font-family: var(--font-display); font-weight: 600;`
- `.sf-site h3` — leave as `--font-ui`, change `font-size: 17px` to `font-size: var(--t-md)`
- Pricing figures — add `font-variant-numeric: tabular-nums;` to the price element
- Collapse every `border-radius` to `var(--r)` or `var(--r-pill)` per the Task 4 Step 5 mapping
- Replace fractional `font-size` values per the Task 4 Step 6 mapping

- [ ] **Step 6: Verify the guard is now fully clean on CSS**

Run: `node scripts/check-ui-tokens.js --write-baseline && npm run check:ui`

Expected: `scripts/ui-baseline.json` contains **no** `no-gradient`, `no-backdrop-filter`, `no-hover-translate`, `radius-token`, or `fractional-font-size` entries at all. Only `no-raw-hex-js` for `sign.js` and `verify.js` should remain.

- [ ] **Step 7: Check every marketing page in two themes**

Run `COOKIE_SECURE=0 node src/server.js` and load each of `/`, `/features`, `/pricing`, `/solutions`, `/templates`, `/security`, `/compliance`, `/contact`. Confirm no gradient washes remain, the nav is solid, and cards do not lift. Then set the theme to Midnight in the app settings and reload `/` — the public site should now render dark. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add public/css/site.css scripts/ui-baseline.json
git commit -m "feat: flatten marketing site and bind its surfaces to the active theme"
```

---

## Task 8: Signing and verify pages

**Files:**
- Modify: `public/js/sign.js`, `public/js/verify.js`
- Modify: `public/css/app.css` (the `.sign` and verify rules)
- Modify: `scripts/ui-baseline.json` (tighten)

**Interfaces:**
- Consumes: all tokens from Task 3; the hex-to-token mapping from Task 5 Step 5.
- Produces: no new interfaces. Clears the last `no-raw-hex-js` baseline entries.

- [ ] **Step 1: Convert the hex literals**

For `public/js/sign.js` then `public/js/verify.js`: run `grep -n "#[0-9a-fA-F]\{3,8\}" public/js/<file>`, replace each with the mapped token, and mark non-colour hex with `// ui-check-ignore`.

- [ ] **Step 2: Give the signing page its display typography**

In `public/css/app.css`, add:

```css
body.sign h1 { font-family: var(--font-display); font-weight: 600; font-size: var(--t-2xl); }
body.sign .mono, body.verify .mono { font-family: var(--font-data); }
```

- [ ] **Step 3: Put the evidentiary data in Plex Mono**

The audit trail, document SHA-256, signer IPs, and timestamps must carry `class="mono"` so they resolve to `var(--font-data)`. Grep `grep -n "sha\|hash\|audit\|ip" public/js/sign.js public/js/verify.js` and add the class to those value elements where it is missing.

- [ ] **Step 4: Verify the guard is completely clean**

Run: `node scripts/check-ui-tokens.js --write-baseline && npm run check:ui && npm test`

Expected: `scripts/ui-baseline.json` is now `{}` or contains only `ui-check-ignore`-justified entries, and `check:ui` reports clean with AA contrast across all themes.

- [ ] **Step 5: Exercise a real signing flow**

Run `COOKIE_SECURE=0 node src/server.js`. Create and send a document to yourself, copy the signing link from Settings → Outbox, open it, and complete a signature. Confirm the serif heading, the mono hash, and that typing/drawing/uploading a signature all still work. Then upload the signed PDF at `/verify` and confirm it validates. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add public/js/sign.js public/js/verify.js public/css/app.css scripts/ui-baseline.json
git commit -m "feat: apply legal-instrument typography to signing and verify pages"
```

---

## Task 9: Styleguide page and final verification

**Files:**
- Create: `public/styleguide.html`
- Modify: `README.md` (one line under the existing file table)

**Interfaces:**
- Consumes: every token and component class from Tasks 3–8.
- Produces: the review surface for final sign-off.

- [ ] **Step 1: Build the kitchen-sink page**

Create `public/styleguide.html`. It is served by the existing `express.static` mount on `public/`, so no route is needed.

```html
<!doctype html>
<html lang="en" data-theme="ocean">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SignFlow styleguide</title>
<link rel="stylesheet" href="/css/app.css">
<style>
  body { padding: var(--sp-6); }
  .sg-bar { display: flex; gap: var(--sp-2); flex-wrap: wrap; margin-bottom: var(--sp-6); }
  .sg-sec { margin: var(--sp-8) 0; }
  .sg-sec > h2 { margin-bottom: var(--sp-3); }
  .sg-row { display: flex; gap: var(--sp-3); flex-wrap: wrap; align-items: center; }
  .sg-swatch { width: 72px; height: 48px; border-radius: var(--r); border: 1px solid var(--border); }
</style>
</head>
<body>
<div class="sg-bar" id="themes"></div>

<div class="sg-sec">
  <h1>Heading 1 — display serif</h1>
  <h2>Heading 2</h2>
  <h3>Heading 3 — UI sans</h3>
  <p>Body copy at <code>--t-base</code>. The quick brown fox jumps over the lazy dog.</p>
  <p class="mono">SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855</p>
  <p class="muted small">Muted small text, for secondary labels.</p>
</div>

<div class="sg-sec">
  <h2>Buttons</h2>
  <div class="sg-row">
    <button class="btn primary">Primary</button>
    <button class="btn">Default</button>
    <button class="btn ghost">Ghost</button>
    <button class="btn danger">Danger</button>
    <button class="btn primary" disabled>Disabled</button>
    <button class="btn sm">Small</button>
    <button class="btn lg">Large</button>
  </div>
</div>

<div class="sg-sec">
  <h2>Badges</h2>
  <div class="sg-row">
    <span class="badge b-draft">Draft</span>
    <span class="badge b-in_progress">In progress</span>
    <span class="badge b-completed">Completed</span>
    <span class="badge b-declined">Declined</span>
    <span class="badge b-expired">Expired</span>
    <span class="chip">Chip</span>
  </div>
</div>

<div class="sg-sec">
  <h2>Form controls</h2>
  <div class="grid2">
    <label class="field"><span>Text input</span><input type="text" value="Acme Corporation"></label>
    <label class="field"><span>Select</span><select><option>Signer</option><option>Approver</option></select></label>
    <label class="field"><span>Textarea</span><textarea>Reason for declining…</textarea></label>
    <label class="check"><input type="checkbox" checked> Checkbox</label>
  </div>
</div>

<div class="sg-sec">
  <h2>Stats</h2>
  <div class="stats">
    <div class="card stat"><div class="ic blue"></div><div><div class="n">24</div><div class="muted small">Awaiting others</div></div></div>
    <div class="card stat"><div class="ic green"></div><div><div class="n">108</div><div class="muted small">Completed</div></div></div>
    <div class="card stat"><div class="ic amber"></div><div><div class="n">3</div><div class="muted small">Expiring soon</div></div></div>
  </div>
</div>

<div class="sg-sec">
  <h2>Table</h2>
  <div class="card"><table class="tbl">
    <thead><tr><th>Document</th><th>Status</th><th>Recipients</th><th>Value</th></tr></thead>
    <tbody>
      <tr><td>Mutual NDA</td><td><span class="badge b-completed">Completed</span></td><td>2</td><td>1,250,000</td></tr>
      <tr><td>Offer Letter</td><td><span class="badge b-in_progress">In progress</span></td><td>1</td><td>840,000</td></tr>
    </tbody>
  </table></div>
</div>

<div class="sg-sec">
  <h2>Elevation and radii</h2>
  <div class="sg-row">
    <div class="card" style="padding: var(--sp-4)">Flat card, <code>--elev-0</code></div>
    <div class="card" style="padding: var(--sp-4); box-shadow: var(--elev-1)">Floating, <code>--elev-1</code></div>
    <div class="sg-swatch" style="border-radius: var(--r)"></div>
    <div class="sg-swatch" style="border-radius: var(--r-pill)"></div>
  </div>
</div>

<div class="sg-sec">
  <h2>Theme tokens</h2>
  <div class="sg-row" id="tokens"></div>
</div>

<script type="module">
const KEYS = ['ocean', 'emerald', 'sunset', 'royal', 'rose', 'graphite', 'midnight'];
const TOKENS = ['--primary', '--ink', '--paper', '--surface', '--surface-2', '--border', '--muted', '--sidebar'];

const bar = document.getElementById('themes');
for (const key of KEYS) {
  const b = document.createElement('button');
  b.className = 'btn sm';
  b.textContent = key;
  b.onclick = () => { document.documentElement.dataset.theme = key; paint(); };
  bar.appendChild(b);
}

function paint() {
  const cs = getComputedStyle(document.documentElement);
  document.getElementById('tokens').innerHTML = TOKENS.map((t) => {
    const v = cs.getPropertyValue(t).trim();
    return `<div><div class="sg-swatch" style="background:${v}"></div><div class="small mono">${t}<br>${v}</div></div>`;
  }).join('');
}
paint();
</script>
</body>
</html>
```

- [ ] **Step 2: Document it**

Add this row to the file table in `README.md`, after the `/healthz` row:

```markdown
| `public/styleguide.html` | Component and token reference at `/styleguide.html`; switch themes to review them all |
```

- [ ] **Step 3: Run the full verification suite**

```bash
npm test
npm run check:ui
```

Expected: all tests pass; `ui-check: clean (0 finding(s), contrast AA across all themes).`

- [ ] **Step 4: Run the manual review matrix**

Run `COOKIE_SECURE=0 node src/server.js` and work through this matrix, at both 360px and 1440px viewport widths:

| Surface | URL | Check |
|---|---|---|
| Styleguide | `/styleguide.html` | Every component in all 7 themes via the switcher |
| Marketing | `/` | No washes, solid nav, no card lift |
| App dashboard | `/app` | Serif titles, flat stats, tabular table numerals |
| Editor | `/app` → open a document | Field drag/resize, distinct recipient colours |
| Signing | link from Settings → Outbox | Serif heading, mono hash, signature capture works |
| Verify | `/verify` | Validates a signed PDF |

- [ ] **Step 5: Confirm no CSP or font-loading problems**

With the server running, open the browser devtools console on `/app` and `/`. Expected: **zero** Content-Security-Policy violations and zero font 404s. Then hard-reload with the cache disabled and confirm text renders immediately in the fallback face rather than appearing blank.

- [ ] **Step 6: Commit**

```bash
git add public/styleguide.html README.md
git commit -m "docs: add component styleguide page for theme review"
```

- [ ] **Step 7: Final owner sign-off**

Visual regression testing is not available in this environment. Present `/styleguide.html` and the six matrix surfaces to the owner and confirm the UI no longer reads as AI-generated. If specific screens still feel generic, capture them as a follow-up list rather than reopening this plan.

---

## Self-review

**Spec coverage**

| Spec requirement | Task |
|---|---|
| IBM Plex trio, roles, weights, latin subset, swap, fallback chain | 3 |
| Preload serif 600 + sans 400 | 3 (4 of 6 entry points; the private and 404 pages deliberately skip it) |
| 2 radius tokens | 4, 7 (enforced by `radius-token` rule from 1) |
| 2 elevation levels | 4 |
| Hover never moves | 4, 7 (enforced by `no-hover-translate`) |
| All gradients and `backdrop-filter` removed | 7 (enforced by `no-gradient`, `no-backdrop-filter`) |
| 7-token type scale, no fractional sizes | 3, 4, 7 (enforced by `fractional-font-size`) |
| 4/8 spacing grid | 3 (tokens), applied in 4 and 7 |
| Motion tokens + `prefers-reduced-motion` | 3, 4 |
| `--ink` / `--paper` | 3, 4 |
| 7 accents deepened, AA verified | 4 (gate built in 2) |
| `THEMES` duplication removed, swatches from CSS | 5 |
| Marketing site follows themes | 7 |
| No raw hex in `public/js/` | 5, 6, 8 (enforced by `no-raw-hex-js`) |
| `scripts/check-ui-tokens.js` with all 5 assertions | 1 |
| `public/styleguide.html` | 9 |
| Manual 3x7x2 matrix | 9 |
| Font loading and CSP check | 3, 9 |
| Server smoke (`/healthz`, `/app`, `/verify`) | 9 |
| PDF certificate and emails untouched | Global Constraints |

No spec requirement is unimplemented.

**Placeholder scan:** none. Every code step carries complete code; every mapping table lists concrete values; every verification step states the exact command and expected output.

**Type consistency:** `Finding` is `{rule, file, line, text}` in Task 1 and used unchanged by the CLI. `resolveThemes` returns `{theme: {token: value}}` in Task 2 and is consumed with that shape in Task 2's contrast gate and Task 5's test. `contrastRatio(hexA, hexB)` is defined in Task 2 and called with that signature only. `themeSwatch(key)` returns `{sb, bg, p, t}` in Task 5, matching the four field names the old `THEMES` entries used, so the renderer edit in Step 4 is a rename rather than a reshape.

**Known residual risk:** Task 6 touches roughly 140 inline-style sites across five files. The per-file commits and the `no-raw-hex-js` ratchet make regressions bisectable, but this is where visual breakage is most likely and it is the task that most deserves careful review.
