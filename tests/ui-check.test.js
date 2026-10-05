'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const scan = require('../scripts/ui-check/scan.js');
const contrast = require('../scripts/ui-check/contrast.js');

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

test('noFractionalFontSize flags a fractional size hidden in a font: shorthand', () => {
  assert.equal(scan.noFractionalFontSize('x.css', '.a { font: 700 11.5px ui-monospace, monospace; }').length, 1);
});

test('noFractionalFontSize does not flag a whole-number size in a font: shorthand', () => {
  assert.equal(scan.noFractionalFontSize('x.css', '.a { font: 600 14px ui-monospace, monospace; }').length, 0);
});

test('noFractionalFontSize does not flag font: inherit', () => {
  assert.equal(scan.noFractionalFontSize('x.css', '.a { font: inherit; }').length, 0);
});

test('noFractionalFontSize does not flag a fractional border width', () => {
  assert.equal(scan.noFractionalFontSize('x.css', '.a { border: 1.5px solid red; }').length, 0);
});

test('noFractionalFontSize still flags the font-size longhand', () => {
  assert.equal(scan.noFractionalFontSize('x.css', '.a { font-size: 12.5px; }').length, 1);
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

test('radiusTokensOnly: trailing same-line ui-check-ignore comment suppresses the finding', () => {
  const ignored = '.a { border-radius: 12px; } /* ui-check-ignore */';
  const notIgnored = '.a { border-radius: 12px; }';
  assert.equal(scan.radiusTokensOnly('x.css', ignored).length, 0);
  assert.equal(scan.radiusTokensOnly('x.css', notIgnored).length, 1);
});

test('noHoverTranslate: trailing same-line ui-check-ignore comment suppresses the finding', () => {
  const ignored = '.a:hover { transform: translateY(-2px); } /* ui-check-ignore */';
  const notIgnored = '.a:hover { transform: translateY(-2px); }';
  assert.equal(scan.noHoverTranslate('x.css', ignored).length, 0);
  assert.equal(scan.noHoverTranslate('x.css', notIgnored).length, 1);
});

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
