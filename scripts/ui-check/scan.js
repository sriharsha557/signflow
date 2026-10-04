'use strict';

// Matched by plain substring against the raw line, so an unrelated comment
// that merely mentions this string would also suppress that line.
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

/**
 * Run a per-line regex rule over comment-stripped source. The ignore-marker
 * check reads the ORIGINAL (un-stripped) line, because stripComments blanks
 * comment text — including a `ui-check-ignore` marker placed inside a
 * comment — before this rule would otherwise see it. stripComments is
 * length- and line-preserving, so indices in the two line arrays line up.
 */
function lineRule(rule, re, file, src) {
  const out = [];
  const rawLines = src.split(/\r?\n/);
  stripComments(src).split(/\r?\n/).forEach((line, i) => {
    if (rawLines[i].includes(IGNORE)) return;
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
  const rawLines = src.split(/\r?\n/);
  const block = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = block.exec(css)) !== null) {
    const [, selector, body] = m;
    if (!/:hover/.test(selector)) continue;
    if (!/translate/.test(body)) continue;
    // stripComments is length-preserving, so m.index in `css` maps to the
    // same offset/line in the original `src`. The marker check reads the
    // RAW line the match starts on (not just the matched span) so a
    // trailing same-line comment after the closing brace is still seen.
    const line = css.slice(0, m.index).split(/\r?\n/).length;
    if (rawLines[line - 1].includes(IGNORE)) continue;
    out.push({ rule: 'no-hover-translate', file, line, text: selector.trim().slice(0, 120) });
  }
  return out;
}

function radiusTokensOnly(file, src) {
  const out = [];
  const rawLines = src.split(/\r?\n/);
  stripComments(src).split(/\r?\n/).forEach((line, i) => {
    if (rawLines[i].includes(IGNORE)) return;
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

module.exports = {
  stripComments, noGradients, noBackdropFilter, noHoverTranslate,
  radiusTokensOnly, noFractionalFontSize, noRawHexInJs, resolveThemes, RULES,
};
