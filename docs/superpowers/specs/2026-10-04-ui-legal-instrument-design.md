# SignFlow UI — "Legal Instrument" visual direction

**Date:** 2026-10-04
**Status:** Approved design, pending implementation plan
**Scope:** Visual polish across all three UI surfaces, shared token foundation first

## Problem

The UI is structurally sound — token-driven themes, consistent control heights, real
responsive breakpoints — but reads as generically AI-generated, a look the owner
explicitly rejected. The cause is genericness rather than poor craft: stock palette,
soft radial washes, glassmorphic nav, floating-card hover lifts, inconsistent rounding,
and Inter used for everything.

Audited tells, with evidence:

| Tell | Location | Evidence |
|---|---|---|
| Radial hero wash | `public/css/site.css` 54, 89, 231 | `radial-gradient(1200px 400px at 20% -10%, --s-pri-soft, transparent)` |
| Glassmorphic nav | `public/css/site.css` 43 | `backdrop-filter: saturate(1.4) blur(10px)` |
| Gradient CTA band | `public/css/site.css` 188 | `linear-gradient(120deg, --s-pri, mix(--s-pri 60%, #0f172a))` |
| Floating-card lift | `site.css` 95, `app.css` 117 | `translateY(-2px)` plus `0 14px 30px -14px` shadow |
| Radius soup | both | 10 distinct values: 3, 4, 6, 8, 9, 10, 12, 14, 16, 99px |
| Stock palette | `app.css` 2 | `#2563eb` primary, `#6366f1` dark-theme indigo |
| Generic UI font | `app.css` 38 | Inter with no display face for contrast |

Not guilty: no emoji anywhere in site copy.

## Goals

1. Remove the AI-generated read across app, marketing site, and signing/verify pages.
2. Commit to one specific, opinionated direction: institutional/Swiss "legal instrument",
   matching the product's evidentiary value proposition.
3. Establish a shared token foundation so all three surfaces improve together and stay
   consistent afterwards.

## Non-goals

- No new frontend framework, bundler, or build step. The project's no-build-step property
  is a hard constraint.
- No renaming or removal of the 7 existing themes. They are a documented product feature.
- No information-architecture or flow changes. This is visual, not UX restructuring.
- No accessibility programme. `prefers-reduced-motion` is adopted because the token layer
  touches motion anyway; the broader a11y gap (6 `aria-*`, 2 `role=`, 0 `tabindex` across
  `public/`) is noted as separate future work.

## Decisions taken

- **Direction:** A, "Legal instrument" (institutional/Swiss), over dense-product-tool and
  editorial alternatives.
- **Typography:** the IBM Plex trio.
- **Marketing site follows the 7 themes** rather than `prefers-color-scheme`. This is a
  behaviour change, not pure polish: Midnight will begin theming the public site.
- **PDF certificate and HTML emails are out of scope**, tracked as follow-up work.

## Section 1 — Typography

`@fontsource/ibm-plex-serif`, `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`
(all 5.3.0, verified available). Served through the existing `/vendor/fonts` static mount
in `src/server.js:1412` — no new infrastructure, no CDN, and `font-src 'self'` in
`src/security/http.js:11` stays satisfied.

Rationale: one family with three voices and shared skeletons; institutional pedigree by
design brief; Plex Mono is functional rather than decorative here, because the product
displays SHA-256 fingerprints, audit chains, and certificate data, and `app.css:46`
already defines a `.mono` class on a generic fallback.

| Role | Face | Weights | Applied to |
|---|---|---|---|
| Display | Plex Serif | 600 | `h1`, marketing heroes, signing/verify page headings, stat numerals |
| UI | Plex Sans | 400, 500, 600 | body, controls, tables, nav, `h3`, `h4` |
| Data | Plex Mono | 400, 500 | hashes, audit trail, recovery codes, IPs, invoice numbers |

Constraints:

- Serif is restricted to page-title level and above. `h3` and `h4` remain Plex Sans, so the
  app's dense tables and settings panels do not read as fussy.
- Latin subset only. Budget: 110–130KB woff2 total. If exceeded, drop Plex Sans 500.
- Preload Plex Serif 600 and Plex Sans 400 only; `font-display: swap` on the rest.
- The existing system-font stack is retained as the fallback chain, so a cold load never
  shows blank text.

## Section 2 — Shared token layer

New file `public/css/tokens.css`, imported by both `app.css` and `site.css`.

| Concern | Current | Target |
|---|---|---|
| Radii | 10 values | 2 tokens: `--r: 4px`, `--r-pill: 999px` |
| Elevation | `--shadow` on every card | 2 levels: hairline for cards/stats/tables; real shadow only for modals, dropdowns, toasts |
| Hover | `translateY(-2px)` plus shadow | Never moves: `border-color` plus `--surface-2` only |
| Gradients | 4 washes plus glass nav | All removed. Hero flat `--s-bg2` plus 1px rule; nav solid, no `backdrop-filter`; band solid ink |
| Type sizes | ad-hoc, incl. 11.5/12.5/13.5px | 7 tokens, no fractional sizes |
| Spacing | off-grid 9/11/18/22px | 4/8 grid: 4, 8, 12, 16, 24, 32, 48 |
| Motion | assorted `.15s` | `--dur: 120ms`, `--ease: cubic-bezier(.2,0,.38,.9)` |
| Reduced motion | absent | `@media (prefers-reduced-motion: reduce)` disables transitions and animations |

Type scale tokens: `--t-xs: 12px`, `--t-sm: 13px`, `--t-base: 14px`, `--t-md: 16px`,
`--t-lg: 20px`, `--t-xl: 26px`, `--t-2xl: 34px`.

The app/site base-size difference is intentional and preserved: app body resolves to
`--t-base` (14px), marketing body to `--t-md` (16px).

### Palette

Two new structural tokens: `--ink: #121a24` for text and solid bands, and
`--paper: #fbfaf8`, a warm off-white replacing the cool `#f5f7fb`. Warm paper against ink
is the strongest "document" signal after typography.

Each theme's accent deepens off the stock values. Starting points, to be contrast-verified
during implementation:

| Theme | From | To |
|---|---|---|
| ocean | `#2563eb` | `#15457e` |
| emerald | `#059669` | `#046b50` |
| sunset | `#ea580c` | `#b4440b` |
| royal | `#7c3aed` | `#512aa8` |
| rose | `#e11d48` | `#a81436` |
| graphite | `#18181b` | unchanged (already ink) |
| midnight | `#6366f1` | `#3f6fa8` |

**Acceptance criterion:** every accent used as a button background must reach WCAG AA
contrast (at least 4.5:1) against its button text colour, and `--muted` must reach at least
4.5:1 against `--surface`. Any starting point failing this is adjusted until it passes; the
measured ratios are recorded in the implementation PR.

`THEMES` in `public/js/app.js:15-22` currently duplicates this palette in JavaScript for the
settings swatches, which means every palette edit has to be made twice or the swatches
misrepresent the themes.

Rather than maintain the duplication, `THEMES` is reduced to names only and the swatch
colours are derived at runtime from CSS: for each theme key, set `data-theme` on a detached
element and read the resolved `--sidebar`, `--bg`, `--primary`, and `--sidebar-text` values
via `getComputedStyle`. This makes `public/css/tokens.css` and the `[data-theme]` blocks the
single source of truth for the palette, and it is what allows the "no raw hex in
`public/js/`" guard in Section 4 to hold.

## Section 3 — Per-surface application

Sequenced so each step is independently reviewable:

1. **`tokens.css`** — token layer, type scale, motion, reduced-motion, font `@font-face`
   wiring. No visual change committed alone.
2. **App** (`app.css`, `app.js`, `editor.js`, `saas.js`, `access-ui.js`) — the sidebar is
   already near-black and absorbs `--ink` naturally. Stats lose the lift. Tables gain
   hairlines and `font-variant-numeric: tabular-nums`. Serif on `h1` and stat numerals only.
3. **Marketing** (`site.css`, `src/site/site.js`) — flatten the three washes and the nav;
   cards become ruled rather than floating; pricing numerals tabular; surfaces switch from
   `prefers-color-scheme` to the active theme.
4. **Signing and verify** (`sign.html`, `verify.html`, `sign.js`, `verify.js`) — largest
   serif heading, Plex Mono on hash and audit trail. The strongest "legal instrument"
   reading belongs here.

### Known scope risk

This is not a CSS-only change. `public/js/` contains **83 hardcoded hex colours** and heavy
inline styling — `app.js` 93 sites, `saas.js` 66, `access-ui.js` 47, `sign.js` 23,
`editor.js` 19. Auditing these to token references is the bulk of the labour and the main
regression risk. Each file is converted in its own commit so a regression can be bisected
to one surface.

### Out of scope, tracked as follow-ups

- **PDF certificate** (`src/pdf.js`) — would need real font embedding via pdf-lib.
- **HTML emails** (`src/mail.js`) — self-hosted fonts are unreliable in mail clients.

Both fall back to a system serif stack and will drift slightly from the app until done.

## Section 4 — Verification

The project has no test infrastructure: no test script, no devDependencies. The plan adds
the minimum that makes this change reviewable and keeps it from regressing.

1. **`scripts/check-ui-tokens.js`** — dependency-free guard, wired as `npm run check:ui`.
   Assertions, each failing with the offending file and line:
   - no `translateY` inside a `:hover` rule
   - no `gradient(` in `public/css/`
   - no `border-radius` value outside `var(--r)`, `var(--r-pill)`, `0`, `50%`
   - no fractional `font-size`
   - no raw hex colour in `public/js/`
2. **`public/styleguide.html`** — static kitchen-sink page rendering every component with a
   theme switcher. Served by the existing static mount; no new routes. Makes reviewing
   7 themes tractable.
3. **Manual matrix** — 3 surfaces x 7 themes at 2 breakpoints (360px, 1440px), driven off
   the styleguide plus the real dashboard, editor, and signing page.
4. **Font loading** — confirm the fallback chain shows no blank text on a cold load, and
   that the CSP in `src/security/http.js` still passes with no console violations.
5. **Server smoke** — `/healthz`, `/app`, `/verify` return 200 and the PDF editor still
   renders pages after the stylesheet changes.

Visual regression testing is not available in this environment (no browser automation), so
final visual sign-off is the owner's, on the styleguide page.

## Success criteria

- `npm run check:ui` passes.
- No gradient, `backdrop-filter`, or translate-on-hover remains in `public/css/`.
- Exactly 2 radius tokens in use.
- No raw hex colours in `public/js/`.
- All 7 themes render correctly on all 3 surfaces at both breakpoints.
- Theme swatches in settings match the actual rendered themes.
- All accent/text pairs meet WCAG AA, with measured ratios recorded.
- No build step introduced; `npm start` remains the only run command.
- Owner confirms the UI no longer reads as AI-generated.
