/**
 * Token contrast audit (Cycle A, Tasks 3 and 3b).
 *
 * Task 3 raised one token to the AA floor and stopped. Rock looked at it:
 * "still dim. I think our greys need to get closer to white. I feel like we
 * using 'pass' as the floor... even the placeholder 'square' on the center of
 * the page is so dim that I can barely see the dashed lines and the ratio on
 * the corner."
 *
 * He was right twice. The floor WAS the target — 4.5:1 — and the audit
 * measured text only, so every border, dashed affordance and the dot grid
 * went unchecked and all of them failed badly (1.15:1 to 1.46:1).
 *
 * Task 3b replaced the spec's Contrast section with five items, and this file
 * is all five of them:
 *
 *   1. Informational text            >= 7:1   on every surface it sits on
 *   2. Adjacent ladder rungs         >= 1.2:1 apart
 *   3. Interactive boundaries and
 *      meaningful graphics           >= 3:1
 *   4. Decorative separators and the
 *      dot grid                      no WCAG duty, but VISIBLE: 1.8-2.5:1,
 *                                    a judgement call, bounded at both ends
 *   5. Inert and disabled states     explicit colours at full alpha, never
 *                                    `opacity` — see the last describe block
 *
 * Neither PAIRS nor NON_TEXT below is a guess. Every row was read out of
 * web/style.css and carries the line numbers it came from: a token's row
 * exists for a background it is actually painted on, and where several apply
 * the *lightest* one is the binding test (this is a dark theme). If a pairing
 * here is ever wrong the fix is to correct the pairing, never to lower `min`.
 *
 * The helper is deliberately local to this file — Cycle B recomputes contrast
 * for the generated ground hues separately and must not couple to this one.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

function srgbToLinear(v) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex) {
  const m = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16));
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

function tokens() {
  // Comments are stripped FIRST — pre-emptively, not because anything has
  // gone wrong yet. tokens.css documents every retired token in prose right
  // where it used to live, and today those notes quote bare hexes only, so a
  // raw regex and a stripped one both yield the same tokens. The moment one
  // of those notes is written in `--name: #value` form the raw regex
  // resurrects a deleted token, and the dead-token guard below — whose whole
  // job is to notice a removal being undone — would pass on a ghost.
  const css = readFileSync('web/tokens.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const out = {};
  for (const [, name, value] of css.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    out[name] = value;
  }
  return out;
}

const TEXT_MIN = 7.0;

const PAIRS = [
  // --- The five-rung ladder ---------------------------------------------
  // Task 3b's policy item 1: 7:1, not the AA 4.5 Task 3 settled for. Note
  // --surface-hover: it was called --border-hairline until 3b, and it is the
  // lightest surface any text is painted on, so it binds every rung.

  // body (style.css:43) sits on --surface-window; the selected template /
  // preset / sampled rows repaint it on --surface-raised-1 (628, 732, 1278);
  // the active rail item on --surface-raised-2 (410); .icon-btn:hover on
  // --surface-hover (411); .dropzone:focus copy on --surface-canvas.
  ['--text-primary', '--surface-window', TEXT_MIN],
  ['--text-primary', '--surface-canvas', TEXT_MIN],
  ['--text-primary', '--surface-raised-1', TEXT_MIN],
  ['--text-primary', '--surface-raised-2', TEXT_MIN],
  ['--text-primary', '--surface-hover', TEXT_MIN],

  // .btn-ghost (322), .preset-row (721), .sampled-row (1266), .select-control
  // (1413), and the hover states of .rail-item / .segmented-cell / .chip.
  // Three of those hovers also swap the background to --surface-hover (327,
  // 728, 1274). .dropzone-title (1001) sits on --surface-canvas.
  ['--text-secondary', '--surface-window', TEXT_MIN],
  ['--text-secondary', '--surface-hover', TEXT_MIN],
  ['--text-secondary', '--surface-canvas', TEXT_MIN],
  ['--text-secondary', '--surface-raised-1', TEXT_MIN],

  // .zoom-stepper (261), .cli-status (780), .inline-control-row (1097),
  // .slider-label (1172), .template-row (596) — whose hover lays it on
  // --surface-hover (624) — and .dropzone:hover (976) on --surface-canvas.
  ['--text-muted', '--surface-window', TEXT_MIN],
  ['--text-muted', '--surface-hover', TEXT_MIN],
  ['--text-muted', '--surface-canvas', TEXT_MIN],

  // .cli-command (771), .segmented-cell (1119), .chip (1359) on the window;
  // the selected row's dimensions (635) and the active sampled row's hue
  // (1338) on --surface-raised-1.
  ['--text-faint', '--surface-window', TEXT_MIN],
  ['--text-faint', '--surface-raised-1', TEXT_MIN],

  // The busiest token. On --surface-window: .section-label,
  // .template-row--add, .custom-size-field, .canvas-toolbar-label,
  // .sampled-hue, .file-slot--empty, the rail icons, and the
  // two usages absorbed from --text-disabled — .template-row .dim (the
  // "2800x2100" dimensions) and .export-footnote. On --surface-hover:
  // .template-row--add is a .template-row, so its hover lands there, and so
  // does .dim's. On --surface-canvas: the whole of the dropzone's copy,
  // including .dropzone-dims — the corner ratio label Rock named.
  ['--text-fainter', '--surface-window', TEXT_MIN],
  ['--text-fainter', '--surface-hover', TEXT_MIN],
  ['--text-fainter', '--surface-canvas', TEXT_MIN],

  // --- Inverted and one-off pairs ---------------------------------------
  // .btn-primary (331) and .chip.is-selected (1365) paint --surface-window as
  // INK on --surface-inverse. It is the Export button's label: same threshold.
  ['--surface-window', '--surface-inverse', TEXT_MIN],

  // The active segmented cell's label (1127) on --surface-control-active.
  ['--color-white', '--surface-control-active', TEXT_MIN],

  // The drop error strip (1023/1024) — an opaque pair that only ever has to
  // work against itself.
  ['--color-danger', '--surface-danger', TEXT_MIN],
];

describe('token contrast', () => {
  const t = tokens();
  for (const [fg, bg, min] of PAIRS) {
    it(`${fg} on ${bg} clears ${min}:1`, () => {
      expect(t[fg], `${fg} missing`).toBeTruthy();
      expect(t[bg], `${bg} missing`).toBeTruthy();
      const r = ratio(t[fg], t[bg]);
      expect(
        Number(r.toFixed(2)),
        `${fg} (${t[fg]}) on ${bg} (${t[bg]}) = ${r.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(min);
    });
  }

  // The retired tokens must not creep back. `--text-subtle` was dead from the
  // previous cycle and the ten fixed swatch hues lost their markup in Task 2.
  it('carries no token that nothing references', () => {
    const t2 = tokens();
    for (const dead of [
      // Merged into --text-fainter: 1.0005:1 apart, i.e. the same colour.
      '--text-disabled',
      '--text-subtle',
      '--color-blue', '--color-pink', '--color-cyan', '--color-indigo',
      '--color-orange', '--color-magenta', '--color-green', '--color-teal',
      '--color-slate', '--color-charcoal',
    ]) {
      expect(t2[dead], `${dead} was removed in Cycle A Task 3`).toBeUndefined();
    }
  });
});


/**
 * NON-TEXT CONTRAST — the half Task 3 never measured.
 *
 * Text was audited and lifted; every border, every dashed affordance, every
 * focus ring and the dot grid were not looked at once, and they were the
 * worst things in the app: the empty state's dashed frame at 1.43:1, the dot
 * grid at 1.15:1. Rock found both by eye before any test did.
 *
 * Two thresholds, from the spec:
 *
 *   BOUNDARY (3.0) — interactive component boundaries and meaningful
 *   graphics. Control borders, input borders, the slider track, focus rings,
 *   status indicators, and the empty state's dashed frame.
 *
 *   DECOR (1.8 floor, 2.5 CEILING) — purely decorative separators and the dot
 *   grid. These owe WCAG nothing, so the floor is a visibility judgement, not
 *   a standard. The ceiling is the other half of that judgement and is the
 *   reason this is a range and not a `>=`: pane separators pushed to 3:1 on a
 *   dark UI stop reading as separators and start reading as a wireframe. A
 *   decorative token that drifts UP out of this range is as wrong as one that
 *   drifts down, and only an assertion with two ends catches that.
 *
 * TWO PAIRINGS ARE DELIBERATELY EXCLUDED, under one stated principle rather
 * than two excuses: A SEPARATOR OWES ITS CONTRAST TO THE REGION IT TERMINATES,
 * NOT TO THE REGION IT BELONGS TO. A 1px edge reads as a boundary if it
 * differs from either side, and the side that matters is the one it is
 * dividing the element FROM.
 *
 *   --border-hairline on --surround-mid   1.23:1  `.canvas-toolbar` and
 *     `.drop-error` carry a hairline bottom edge with the stage underneath,
 *     so once a shot is loaded that edge is adjacent to a surround. It clears
 *     1.8 against the --surface-window strip above it — and when the stage is
 *     mid-grey the strip-to-stage edge is itself an enormous value step, so
 *     the hairline has nothing left to do.
 *
 *   --border-hairline on --surface-danger 1.70:1  `.drop-error`'s bottom edge
 *     against the error strip's OWN fill. That is the region the edge belongs
 *     to; the region it terminates against is the stage below, where it
 *     measures 1.87:1.
 *
 * Neither is left as prose: `an excluded pairing still clears the floor on the
 * side that matters` below asserts the other side of both, so the principle
 * fails loudly if the value it rests on ever moves.
 *
 * The argument does NOT cover the drag-over outline, which sits entirely
 * inside one backdrop — which is why that one gets real per-surround pairings
 * instead. Nor does it cover --border-strong against --surface-control-active
 * (2.80:1 before this review): that is a control boundary, not a separator,
 * and item 3 exists to stop the arguing. --border-strong was re-solved to
 * bind on that surface instead.
 */
const BOUNDARY = 3.0;
const DECOR_MIN = 1.8;
const DECOR_MAX = 2.5;

const NON_TEXT = [
  // --- Interactive boundaries -------------------------------------------
  // .zoom-stepper (259), .btn-ghost (320), .sidebar-search (528),
  // .custom-size-input (687), .segmented (1107), the slider's unfilled track
  // (1197-1205), .chip (1356) and .select-control (1410) all draw
  // --border-strong straight onto the window.
  ['--border-strong', '--surface-window', BOUNDARY, BOUNDARY],
  // .btn-ghost keeps that border while :hover paints --surface-hover under
  // it (320 + 327).
  ['--border-strong', '--surface-hover', BOUNDARY, BOUNDARY],
  // .template-row.is-selected (629), .preset-row.is-selected (733) and
  // .sampled-row.is-active (1279) put it on the selected row's own fill.
  ['--border-strong', '--surface-raised-1', BOUNDARY, BOUNDARY],
  // .dropzone:hover (975) swaps the dashed frame's colour to it.
  ['--border-strong', '--surface-canvas', BOUNDARY, BOUNDARY],
  // The .segmented container's border (1107) runs against the ACTIVE cell's
  // fill (1126) wherever that cell is first or last — `overflow: hidden` on
  // the container means the fill reaches the border. This is the lightest
  // backdrop --border-strong has anywhere, and it was missed in the first
  // pass: the token was solved against --surface-hover and measured 2.80 here.
  ['--border-strong', '--surface-control-active', BOUNDARY, BOUNDARY],
  // The drag-over outline's light-surround override (883).
  ['--border-strong', '--surround-light', BOUNDARY, BOUNDARY],

  // The empty state's dashed frame (967) — the thing Rock named. Also
  // .template-row--add (641) and .custom-size-form (661) on the window, and
  // because .template-row--add IS a .template-row its hover fill (624) lands
  // under the same dashes.
  ['--border-dashed', '--surface-canvas', BOUNDARY, BOUNDARY],
  ['--border-dashed', '--surface-window', BOUNDARY, BOUNDARY],
  ['--border-dashed', '--surface-hover', BOUNDARY, BOUNDARY],

  // Focus rings. Every `outline: 2px solid var(--text-primary)` in the file
  // (298, 345, 415, 493, 550, 648, 700, 980, 1140, 1241, 1299, 1381, 1431);
  // the row outlines use outline-offset: -2px so they land on the row's own
  // fill rather than the window.
  ['--text-primary', '--surface-window', BOUNDARY, BOUNDARY],
  ['--text-primary', '--surface-raised-1', BOUNDARY, BOUNDARY],
  // .dropzone:focus-visible (980), and the drag-over outline (878) on the
  // empty stage and on the two dark surrounds. The light surround is the
  // override row above.
  ['--text-primary', '--surface-canvas', BOUNDARY, BOUNDARY],
  ['--text-primary', '--surround-dark', BOUNDARY, BOUNDARY],
  ['--text-primary', '--surround-mid', BOUNDARY, BOUNDARY],

  // Hover borders on .custom-size-input (696), .chip (1372) and
  // .select-control (1423) — a lift off --border-strong, so they must clear
  // the boundary floor in their own right.
  ['--text-fainter', '--surface-window', BOUNDARY, BOUNDARY],

  // The CLI-connected status dot (787) — a 6px indicator carrying state that
  // nothing else in that card carries.
  ['--color-status-green', '--surface-window', BOUNDARY, BOUNDARY],
  // The slider thumb (1220, 1231).
  ['--color-white', '--surface-window', BOUNDARY, BOUNDARY],
  // The .btn-primary fill (331) and the selected chip's pill (1365-1366):
  // filled controls whose boundary IS the fill.
  ['--surface-inverse', '--surface-window', BOUNDARY, BOUNDARY],

  // The app-mark glyph (205, 448) on the brand gradient's two stops. WCAG
  // 1.4.3 exempts logotypes from the text threshold, so this is held at the
  // graphic floor rather than at 7:1 — moving it means restating the brand
  // colours, which is a design decision and not a contrast fix.
  ['--color-white', '--color-brand-start', BOUNDARY, BOUNDARY],
  ['--color-white', '--color-brand-end', BOUNDARY, BOUNDARY],

  // --- Decorative -------------------------------------------------------
  // Pane and section separators: #toolbar (186), #rail (436), #sidebar (514),
  // .canvas-toolbar (815), .drop-error (1022), #inspector (1040),
  // .inspector-section (1049). Bottom of the range on purpose — these are the
  // longest and most repeated lines in the layout.
  ['--border-hairline', '--surface-window', DECOR_MIN, DECOR_MAX],
  ['--border-hairline', '--surface-canvas', DECOR_MIN, DECOR_MAX],
  // .toolbar-divider (219) and .cli-card (760): short, so the top of it.
  ['--border-subtle', '--surface-window', DECOR_MIN, DECOR_MAX],
  // The stage dot grid (837): 1px dots on a 22px pitch, the sparsest mark in
  // the app, so also the top of the range.
  ['--dot-grid-dot', '--surface-canvas', DECOR_MIN, DECOR_MAX],
];

describe('non-text contrast', () => {
  const t = tokens();
  for (const [fg, bg, min, max] of NON_TEXT) {
    const band = max > min ? `sits in ${min}-${max}:1` : `clears ${min}:1`;
    it(`${fg} on ${bg} ${band}`, () => {
      expect(t[fg], `${fg} missing`).toBeTruthy();
      expect(t[bg], `${bg} missing`).toBeTruthy();
      const r = Number(ratio(t[fg], t[bg]).toFixed(2));
      const where = `${fg} (${t[fg]}) on ${bg} (${t[bg]}) = ${r}:1`;
      expect(r, `${where} — below the ${min}:1 floor`).toBeGreaterThanOrEqual(min);
      if (max > min) {
        expect(
          r,
          `${where} — ABOVE the ${max}:1 ceiling. Decoration this strong ` +
            'reads as a wireframe; that is a regression, not an improvement.',
        ).toBeLessThanOrEqual(max);
      }
    });
  }

  // Two orderings the values above have to keep, and that a per-pair
  // threshold cannot see: a dashed stroke covers about half its own path, so
  // it is set a step ABOVE the solid boundary token deliberately, and the
  // decorative pair must stay under both of them.
  // The two pairings the header excludes, asserted from the other side so the
  // principle is a measurement and not a paragraph. Each entry is
  // [separator, the region it BELONGS to (excluded), the region it
  // TERMINATES against (must clear the floor)].
  it('an excluded pairing still clears the floor on the side that matters', () => {
    const t2 = tokens();
    for (const [edge, belongsTo, terminates] of [
      ['--border-hairline', '--surround-mid', '--surface-window'],
      ['--border-hairline', '--surface-danger', '--surface-canvas'],
    ]) {
      const weak = ratio(t2[edge], t2[belongsTo]);
      const load = ratio(t2[edge], t2[terminates]);
      expect(
        Number(load.toFixed(2)),
        `${edge} is excused against ${belongsTo} (${weak.toFixed(2)}:1) only ` +
          `because it terminates against ${terminates} — where it now measures ` +
          `${load.toFixed(2)}:1. That excuse has just expired.`,
      ).toBeGreaterThanOrEqual(DECOR_MIN);
    }
  });

  it('keeps the border tokens in their intended order', () => {
    const t2 = tokens();
    const on = (k) => ratio(t2[k], t2['--surface-window']);
    expect(on('--border-dashed')).toBeGreaterThan(on('--border-strong'));
    expect(on('--border-strong')).toBeGreaterThan(on('--border-subtle'));
    expect(on('--border-subtle')).toBeGreaterThan(on('--border-hairline'));
  });
});


/**
 * THE LADDER.
 *
 * Clearing a floor is a floor, and a floor can be cleared by a UI with no
 * hierarchy left in it at all. In a dark theme the floor over the lightest
 * text-bearing surface admits roughly one value, so every token pushed down
 * to it converges — which is exactly how --text-fainter and --text-disabled
 * ended up 1.0005:1 apart, two names for one colour, with every PAIRS row
 * green. They are now one token.
 *
 * The failure this guards is the opposite one, and Task 3b made it far more
 * live than Task 3 did: lifting the bottom of a ladder toward white with a
 * ceiling overhead COMPRESSES it. Five rungs 1.2 apart above a 7:1 floor need
 * 14.52:1 at the top, and pure white on --surface-hover is 16.86:1. There is
 * 1.16x of headroom in the whole design. Any future "just brighten it" edit
 * spends that headroom, and every PAIRS row stays green while it does —
 * because a brighter token clears its floor more easily, not less.
 *
 * So: the rungs must stay in order, and stay apart.
 */
const LADDER = [
  '--text-primary',    // 15.72:1 on --surface-hover
  '--text-secondary',  // 12.88
  '--text-muted',      // 10.58
  '--text-faint',      //  8.66
  '--text-fainter',    //  7.06 — the floor
];

// Adjacent rungs today measure 1.2208, 1.2174, 1.2211 and 1.2274 apart. That
// is close to this minimum and cannot honestly be otherwise: see the headroom
// arithmetic above. It is a "these are different colours" floor, not a target
// — but with this little slack, anything that pushes a rung is going to hit
// it, which is the point.
const MIN_LADDER_STEP = 1.2;

describe('the text ladder keeps its rungs', () => {
  const t = tokens();

  it('runs brightest to dimmest in the declared order', () => {
    for (let i = 0; i < LADDER.length - 1; i += 1) {
      const [a, b] = [LADDER[i], LADDER[i + 1]];
      expect(
        luminance(t[a]),
        `${a} (${t[a]}) must stay brighter than ${b} (${t[b]})`,
      ).toBeGreaterThan(luminance(t[b]));
    }
  });

  it('keeps every adjacent pair visibly apart', () => {
    for (let i = 0; i < LADDER.length - 1; i += 1) {
      const [a, b] = [LADDER[i], LADDER[i + 1]];
      const r = ratio(t[a], t[b]);
      expect(
        Number(r.toFixed(4)),
        `${a} (${t[a]}) and ${b} (${t[b]}) are ${r.toFixed(4)}:1 apart — ` +
          `below ${MIN_LADDER_STEP}, they are the same rung`,
      ).toBeGreaterThanOrEqual(MIN_LADDER_STEP);
    }
  });
});

/**
 * OFF STATES — inert, disabled, and "true but not in effect".
 *
 * `.inspector-section[inert]` was `opacity: 0.42`. Opacity is the wrong
 * instrument: it composites toward whatever is BEHIND the element — here the
 * darkest surface in the app — so it collapses contrast far faster than it
 * reduces apparent brightness. The section ran 3.56:1 at the top down to
 * 1.85:1 at the bottom, and the bottom rung is every section label in it.
 *
 * THE FIRST PASS CONVERTED ONE RULE AND LEFT NINE. That is the same failure
 * that created this task — a category named in the policy and left
 * unenforced — and the review caught it, so this file now enforces the
 * category instead of the instance. Measured in Chrome before the fix, on
 * --surface-window:
 *
 *   .zoom-btn:disabled           0.4    2.78     BELOW 3:1
 *   .btn:disabled  fill          0.4    3.51
 *                  border        0.4    1.50     below --border-inert's 1.60
 *   .btn.is-loading::before      0.75   2.71     BELOW 3:1
 *   .rail-item[aria-disabled]    0.55   3.19
 *   .segmented-cell:disabled     0.4    2.50     BELOW 3:1
 *   .slider:disabled  track      0.4    1.50
 *   .chip:disabled               0.4    2.50     BELOW 3:1
 *   .select-control:disabled     0.4    3.16
 *   .sampled-row:not(.is-active) 0.6    5.80 label / 3.60 hue, against 7:1
 *
 * The empty state — the exact screen Rock complained about — carried most of
 * those: its toolbar buttons, both zoom steppers and all four rail items were
 * DIMMER than the inert inspector panels beside them, by the mechanism item 5
 * exists to retire. And the last row is not a disabled control at all: it is
 * live, clickable, informational text in a live panel.
 *
 * So the guard below is categorical, not a list of ratios. It parses
 * web/style.css and fails on ANY static `opacity` below 1 outside
 * `@keyframes` — because a composited colour is invisible to every other
 * assertion in this file, which reads values out of tokens.css. That is
 * exactly why nine rules survived a green suite. `over()` is kept, and used
 * to prove the replacements beat what they replaced rather than to bless a
 * new composite.
 */
const OLD_INERT_ALPHA = 0.42;

/** Innermost CSS rules, with `@keyframes` blocks removed first — a keyframe
 *  step is `opacity: 0` by design and is motion, not state. */
function rules() {
  let css = readFileSync('web/style.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  // Brace-count the @keyframes bodies out rather than regexing them, so a
  // nested block can never leave a stray `}` behind to confuse the scan.
  for (;;) {
    const at = css.search(/@keyframes[^{]*\{/);
    if (at === -1) break;
    let i = css.indexOf('{', at);
    let depth = 0;
    let end = i;
    for (; end < css.length; end += 1) {
      if (css[end] === '{') depth += 1;
      else if (css[end] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    css = css.slice(0, at) + css.slice(end + 1);
  }
  // `[^{}]` on both sides matches innermost blocks only, so an @media
  // wrapper is skipped and the rules inside it are what come back.
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({
    selector: sel.trim().replace(/\s+/g, ' '),
    body,
  }));
}

/** The one rule that dims every off state, found by its declarations rather
 *  than by a selector this test would then be free to disagree with. */
function offStateRule() {
  return rules().find((r) => r.body.includes('--text-fainter: var(--text-inert)'));
}

/** The ground swatches carry an inline background written by
 *  web/inspector-background.js, so the off-state rule's token
 *  re-declarations cannot reach them and no assertion on tokens.css can see
 *  them either. The factor is read out of the stylesheet rather than assumed. */
function inertSwatchBrightness() {
  const r = rules().find(
    (x) => x.selector.includes('[inert]') && /filter:\s*brightness/.test(x.body),
  );
  const m = r && r.body.match(/filter:\s*brightness\(([\d.]+)\)/);
  return m ? Number(m[1]) : null;
}

/** The token a rule actually sets `color` to. Read, never assumed: the first
 *  version of the .sampled-row assertion below compared --text-secondary to
 *  --text-fainter as CONSTANTS, so swapping the stylesheet back to a token
 *  one rung down left it green. It was a false guard and the mutation run
 *  caught it (N6). Anything claiming "this rule dims" has to read the rule. */
function declaredColour(selector) {
  const r = rules().find((x) => x.selector === selector);
  const m = r && r.body.match(/(?:^|;)\s*color:\s*var\((--[a-z0-9-]+)\)/);
  return m ? m[1] : null;
}

function over(fg, bg, alpha) {
  const mix = (i) => {
    const f = parseInt(fg.replace('#', '').slice(i, i + 2), 16);
    const b = parseInt(bg.replace('#', '').slice(i, i + 2), 16);
    return Math.round(f * alpha + b * (1 - alpha));
  };
  return '#' + [0, 2, 4].map((i) => mix(i).toString(16).padStart(2, '0')).join('');
}

describe('off states dim with colour, never with opacity', () => {
  const t = tokens();

  it('leaves no static opacity anywhere in web/style.css', () => {
    const offenders = [];
    for (const r of rules()) {
      // `transition: ... opacity 120ms` names the property; it does not set
      // a value. Only a real declaration counts.
      for (const [, value] of r.body.matchAll(/(?:^|;)\s*opacity\s*:\s*([\d.]+)/g)) {
        if (Number(value) < 1) offenders.push(`${r.selector} { opacity: ${value} }`);
      }
    }
    expect(
      offenders,
      'opacity composites toward the darkest surface behind the element, so ' +
        'these ratios exist in the browser and in NO other assertion in this ' +
        'file — which is how nine of them survived a green suite:\n  ' +
        offenders.join('\n  '),
    ).toEqual([]);
  });

  it('routes every off state through the one rule', () => {
    const rule = offStateRule();
    expect(rule, 'no rule re-declares the ladder tokens as --text-inert').toBeTruthy();

    for (const declared of [
      '--text-primary', '--text-secondary', '--text-muted', '--text-faint',
      '--text-fainter', '--color-white', '--surface-inverse',
      '--surface-control-active', '--surface-raised-1', '--border-strong',
    ]) {
      expect(
        rule.body.includes(`${declared}:`),
        `${declared} is not re-declared on the off-state rule, so it keeps ` +
          'its live value inside something that is supposed to read as off',
      ).toBe(true);
    }

    // Every state selector in the file has to be in that rule's list. A
    // single compound ending in :disabled / [inert] / [aria-disabled] is a
    // state rule; anything with a descendant combinator, or ending in :hover
    // or :focus-visible, is a variant riding on one and inherits from it.
    const covered = new Set(offStateRule().selector.split(',').map((x) => x.trim()));
    const missed = [];
    for (const r of rules()) {
      for (const part of r.selector.split(',').map((x) => x.trim())) {
        if (part.includes(' ')) continue;
        if (!/(:disabled|\[inert\]|\[aria-disabled='true'\])$/.test(part)) continue;
        if (!covered.has(part)) missed.push(part);
      }
    }
    expect(
      missed,
      `these state rules are not in the off-state selector list, so they ` +
        `render at full live strength: ${missed.join(', ')}`,
    ).toEqual([]);
  });

  it('dims the inline-styled ground swatches to the same tone as the rest', () => {
    // Not decoration this test can reach through tokens.css: these are pale
    // grounds written inline. Without this rule they are the BRIGHTEST things
    // on a panel that is supposed to read as off — which is exactly how it
    // looked the first time `opacity` came off the section.
    const b = inertSwatchBrightness();
    expect(
      b,
      'no brightness filter on the inert ground swatches — an inline-styled ' +
        'pale swatch ignores every token re-declaration on the off-state rule',
    ).toBeTruthy();
    // A near-white swatch, multiplied down, should land on the inert tone
    // rather than above it. #f9f7fa is a real one, read out of the running app.
    const dimmed =
      '#' +
      [249, 247, 250]
        .map((v) => Math.round(v * b).toString(16).padStart(2, '0'))
        .join('');
    const swatch = ratio(dimmed, t['--surface-window']);
    const inert = ratio(t['--text-inert'], t['--surface-window']);
    expect(
      Math.abs(swatch - inert) < 0.5,
      `a pale swatch dims to ${swatch.toFixed(2)}:1 while the section's text ` +
        `sits at ${inert.toFixed(2)}:1 — the swatches are not in the same tone`,
    ).toBe(true);
  });

  it('lands the inert tone in the 3:1-3.5:1 band on every surface it is drawn on', () => {
    // --surface-window is the panel's own background; --surface-inert is what
    // the rule collapses --surface-control-active and --surface-raised-1 to,
    // so it is the lightest thing off-state text is drawn on. The third is
    // the disabled primary button, whose fill becomes the inert tone and
    // whose ink stays --surface-window.
    for (const bg of ['--surface-window', '--surface-inert']) {
      const r = ratio(t['--text-inert'], t[bg]);
      expect(
        Number(r.toFixed(2)),
        `--text-inert (${t['--text-inert']}) on ${bg} (${t[bg]}) = ${r.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(3.0);
    }
    const onWindow = ratio(t['--text-inert'], t['--surface-window']);
    expect(
      Number(onWindow.toFixed(2)),
      'inert text above 3.5:1 stops reading as unavailable',
    ).toBeLessThanOrEqual(3.5);
  });

  it('beats every composite it replaced', () => {
    const win = t['--surface-window'];
    const inert = ratio(t['--text-inert'], win);
    const inertBorder = ratio(t['--border-inert'], win);

    // The three that were BELOW 3:1 in the browser, reconstructed from live
    // tokens rather than copied out of a report.
    for (const [what, token, alpha] of [
      ['.zoom-btn:disabled', '--text-muted', 0.4],
      ['.segmented-cell:disabled', '--text-faint', 0.4],
      ['.chip:disabled', '--text-faint', 0.4],
    ]) {
      const was = ratio(over(t[token], win, alpha), win);
      expect(
        Number(inert.toFixed(2)),
        `${what} composited to ${was.toFixed(2)}:1 and the inert tone is ` +
          `${inert.toFixed(2)}:1 — the replacement has to be an improvement`,
      ).toBeGreaterThan(Number(was.toFixed(2)));
      expect(Number(was.toFixed(2)), `${what} was the failing case`).toBeLessThan(3.0);
    }

    // The disabled Export button's border had less shape than an inert one.
    const borderWas = ratio(over(t['--border-strong'], win, 0.4), win);
    expect(
      Number(inertBorder.toFixed(2)),
      `.btn:disabled composited its border to ${borderWas.toFixed(2)}:1, below ` +
        `--border-inert's ${inertBorder.toFixed(2)}:1 — the live disabled ` +
        'control had less shape than the inert one',
    ).toBeGreaterThan(Number(borderWas.toFixed(2)));

    // .sampled-row is not an off state: it is live, clickable, informational
    // text in a live panel, so it steps down the LADDER instead of into the
    // inert tone, and it still owes 7:1. Both tokens are read out of the
    // stylesheet — see declaredColour's comment.
    const base = declaredColour('.sampled-row');
    const dim = declaredColour('.sampled-row:not(.is-active)');
    expect(base, '.sampled-row sets no colour to step down FROM').toBeTruthy();
    expect(dim, '.sampled-row:not(.is-active) no longer dims at all').toBeTruthy();

    const sampledWas = ratio(over(t[base], win, 0.6), win);
    const sampledNow = ratio(t[dim], win);
    expect(Number(sampledWas.toFixed(2))).toBeLessThan(TEXT_MIN);
    expect(
      Number(sampledNow.toFixed(2)),
      `.sampled-row:not(.is-active) composited to ${sampledWas.toFixed(2)}:1 at ` +
        `opacity 0.6; ${dim} gives ${sampledNow.toFixed(2)}:1, and this is live, ` +
        'clickable, informational text',
    ).toBeGreaterThanOrEqual(TEXT_MIN);
    // ...and the dim still has to BE a dim. One ladder rung is 1.22; this
    // asks for more, or the inactive row stops reading as inactive.
    const drop = ratio(t[base], win) / sampledNow;
    expect(
      Number(drop.toFixed(2)),
      `${base} -> ${dim} is only ${drop.toFixed(2)}x — an inactive sampled row ` +
        'that close to an active one has stopped saying anything',
    ).toBeGreaterThanOrEqual(1.5);
  });

  it('names the inert colour on the one control the off-state rule cannot reach', () => {
    // .zoom-btn is `color: inherit`, which takes .zoom-stepper's COMPUTED
    // colour — a custom property re-declared on the button itself is invisible
    // to it. If this declaration goes, the disabled zoom glyphs quietly return
    // to full live --text-muted and nothing else in this file would notice.
    expect(
      declaredColour('.zoom-btn:disabled'),
      '.zoom-btn:disabled must name --text-inert outright',
    ).toBe('--text-inert');
  });

  it('reads as more off than the 0.42 it replaced', () => {
    const win = t['--surface-window'];
    const inert = ratio(t['--text-inert'], win);
    const brightest = ratio(over(t['--text-primary'], win, OLD_INERT_ALPHA), win);
    const dimmest = ratio(over(t['--text-fainter'], win, OLD_INERT_ALPHA), win);

    expect(
      Number(inert.toFixed(2)),
      `inert ${inert.toFixed(2)}:1 is no dimmer than opacity ${OLD_INERT_ALPHA} ` +
        `gave the brightest rung (${brightest.toFixed(2)}:1) — the whole point ` +
        'of dropping opacity was to spend lightness on the text, not the ground',
    ).toBeLessThan(Number(brightest.toFixed(2)));

    expect(
      Number(inert.toFixed(2)),
      `inert ${inert.toFixed(2)}:1 is no brighter than opacity ${OLD_INERT_ALPHA} ` +
        `gave the dimmest rung (${dimmest.toFixed(2)}:1) — that rung carries ` +
        'every section label in the panel and was illegible',
    ).toBeGreaterThan(Number(dimmest.toFixed(2)));
  });

  it('keeps the inert control border below the live one', () => {
    const win = t['--surface-window'];
    const inertBorder = ratio(t['--border-inert'], win);
    const liveBorder = ratio(t['--border-strong'], win);
    // WCAG 1.4.11 exempts inactive components, so this is allowed below 3:1 —
    // and has to be, or an inert control's edge reads exactly as live.
    expect(inertBorder).toBeLessThan(liveBorder);
    expect(
      Number(inertBorder.toFixed(2)),
      '--border-inert has faded to nothing; the control should still have a shape',
    ).toBeGreaterThanOrEqual(1.3);
  });

  it('keeps the inert state fill from becoming a surface of its own', () => {
    const r = ratio(t['--surface-inert'], t['--surface-window']);
    expect(
      Number(r.toFixed(2)),
      `--surface-inert is ${r.toFixed(2)}:1 over the window — a state fill ` +
        'that loud belongs to a live section, not an inert one',
    ).toBeLessThanOrEqual(1.15);
    expect(luminance(t['--surface-inert'])).toBeGreaterThan(luminance(t['--surface-window']));
  });
});
