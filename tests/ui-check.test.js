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
