/**
 * Token contrast audit (Cycle A, Task 3).
 *
 * "generally, our contrast is pretty bad. we really need to bring the texts
 * 'up' on their luminosity." — this file is the floor that keeps them up.
 *
 * The thresholds come from the spec's Contrast section: body text 7:1,
 * secondary text and controls 4.5:1, decorative and disabled states 3:1.
 *
 * The PAIRS table below is NOT a guess. Every row was read out of
 * web/style.css: a text token's row exists for a background it is actually
 * painted on, and the *lightest* such background is the binding one (this is
 * a dark theme, so a lighter surface is a harder test). If a pairing here is
 * ever wrong the fix is to correct the pairing, never to lower `min`.
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
  // raw regex and a stripped one both yield the same 25 tokens. The moment
  // one of those notes is written in `--name: #value` form the raw regex
  // resurrects a deleted token, and the dead-token guard below — whose whole
  // job is to notice a removal being undone — would pass on a ghost.
  const css = readFileSync('web/tokens.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const out = {};
  for (const [, name, value] of css.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    out[name] = value;
  }
  return out;
}

const PAIRS = [
  // --- Body text -------------------------------------------------------
  // body (style.css:43) sits on --surface-window; the selected template /
  // preset / sampled rows repaint it on --surface-raised-1 (564, 668, 1188);
  // the active rail item on --surface-raised-2 (414); .icon-btn:hover on
  // --border-hairline (349), which is the lightest surface any text touches.
  ['--text-primary', '--surface-window', 7.0],
  ['--text-primary', '--surface-raised-1', 7.0],
  ['--text-primary', '--surface-raised-2', 7.0],
  ['--text-primary', '--border-hairline', 7.0],

  // --- Secondary text and controls -------------------------------------
  // .btn-ghost (260), .preset-row (657), .sampled-row (1176), .select-control
  // (1314), and the hover states of .rail-item / .segmented-cell / .chip.
  // Three of those hovers also swap the background to --border-hairline
  // (265, 664, 1184). .dropzone-title (929) sits on --surface-canvas.
  ['--text-secondary', '--surface-window', 4.5],
  ['--text-secondary', '--border-hairline', 4.5],
  ['--text-secondary', '--surface-canvas', 4.5],

  // .zoom-stepper (202), .cli-status (720), .inline-control-row (1005),
  // .slider-label (1081), .template-row (532) — whose hover lays it on
  // --border-hairline (560) — and .dropzone:hover (904) on --surface-canvas.
  ['--text-muted', '--surface-window', 4.5],
  ['--text-muted', '--border-hairline', 4.5],
  ['--text-muted', '--surface-canvas', 4.5],

  // .cli-command (711), .segmented-cell (1027), .chip (1259) on the window;
  // the selected row's dimensions (571) and the active sampled row's hue
  // (1228) on --surface-raised-1.
  ['--text-faint', '--surface-window', 4.5],
  ['--text-faint', '--surface-raised-1', 4.5],

  // The busiest token, and since the merge (see tokens.css) the only one at
  // the 4.5 floor. On --surface-window: .section-label, .template-row--add,
  // .custom-size-field, .canvas-toolbar-label, .control-hint, .sampled-hue,
  // and the two usages absorbed from --text-disabled — .template-row .dim
  // (the "2800×2100" dimensions) and .export-footnote. On --border-hairline:
  // .template-row--add is a .template-row, so its hover lands there, and so
  // does .dim's. On --surface-canvas: the whole of the dropzone's copy.
  // None of it is decoration, so all three rows are 4.5 and not 3.0.
  ['--text-fainter', '--surface-window', 4.5],
  ['--text-fainter', '--border-hairline', 4.5],
  ['--text-fainter', '--surface-canvas', 4.5],

  // --- Inverted and one-off pairs ---------------------------------------
  // .btn-primary (270) and .chip.is-selected (1267) paint --surface-window as
  // INK on --surface-inverse. Same threshold as body text: it is the Export
  // button's label.
  ['--surface-window', '--surface-inverse', 7.0],

  // The active segmented cell's label (1035) on --surface-control-active.
  ['--color-white', '--surface-control-active', 4.5],

  // The drop error strip (952/951) — an opaque pair that only ever has to
  // work against itself.
  ['--color-danger', '--surface-danger', 4.5],
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
 * THE LADDER.
 *
 * Clearing 4.5:1 is a floor, and a floor can be cleared by a UI with no
 * hierarchy left in it at all. In a dark theme the floor over the lightest
 * text-bearing surface admits roughly one value, so every token pushed down
 * to it converges — which is exactly how --text-fainter and --text-disabled
 * ended up 1.0005:1 apart, two names for one colour, with every PAIRS row
 * green. They are now one token.
 *
 * The failure this guards is the opposite one, and it is a live temptation:
 * the inert sections below are hard to read, and the obvious "fix" is to
 * raise a text token until they are. Raise --text-fainter to #c6cad2 chasing
 * that and every section label in the app collapses into secondary text —
 * again with every PAIRS row green, because a brighter token clears its
 * floor more easily, not less.
 *
 * So: the rungs must stay in order, and stay apart. Both halves have been
 * watched go red (see the task report) — order by handing the ladder a
 * leapfrogged token, separation by handing it a merged pair.
 */
const LADDER = [
  '--text-primary',    // 16.25:1 on --surface-window
  '--text-secondary',  // 11.91
  '--text-muted',      //  7.53
  '--text-faint',      //  6.02
  '--text-fainter',    //  5.26 — the floor
];

// Adjacent rungs today measure 1.3642, 1.5817, 1.2501 and 1.1455 apart. 1.10
// sits below the tightest of those with room to spare, and far above the
// 1.0005 that a merged pair produces. It is a "these are different colours"
// floor, not a target: nothing should be tuned to sit just above it.
const MIN_LADDER_STEP = 1.1;

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
 * THE INERT STATE — an OPEN SPEC ITEM, awaiting Rock's decision.
 *
 * `.inspector-section[inert]` and every `:disabled` control composite their
 * own text over the window at 0.42 / 0.4 alpha. The spec asks inert states to
 * clear 3:1. At 0.42 a section label reaches 1.85:1, and clearing 3:1 needs
 * alpha ~0.68, at which point the section stops reading as off.
 *
 * Raising tokens is not a way out. It is not that alpha makes 3:1 unreachable
 * in general — --text-primary already clears it at 3.56, and anything from
 * about #d0d0d0 up clears it too. What is unreachable is clearing 3:1 FOR A
 * SECTION LABEL without lifting that label above --text-secondary, i.e.
 * without destroying the ladder above. That is the real bind.
 *
 * Measured over --surface-window, at alpha 0.42 / 0.40, with the minimum
 * alpha each token needs to reach 3:1:
 *
 *   --text-primary    3.56 / 3.35    (0.37)
 *   --text-secondary  2.92 / 2.75    (0.43)
 *   --text-muted      2.23 / 2.13    (0.55)
 *   --text-faint      1.97 / 1.89    (0.62)
 *   --text-fainter    1.85 / 1.77    (0.68)
 *
 * Three options are with Rock: leave it, raise the opacity, or drop `opacity`
 * and dim the sections with explicit colours at full alpha. The third would
 * clear the floor AND read as dimmer than today, which sounds contradictory
 * and is not: `opacity` composites toward whatever is behind the element —
 * here the darkest surface in the app — so it collapses contrast much faster
 * than it reduces apparent brightness. A chosen colour spends its lightness
 * where it is wanted; an alpha spends it on the background.
 *
 * Until that is decided, this file's job is to stop the figures above
 * drifting away from the stylesheet they describe.
 */
function inertOpacity() {
  const css = readFileSync('web/style.css', 'utf8');
  const m = css.match(/\.inspector-section\[inert\]\s*\{[^}]*?opacity:\s*([\d.]+)/);
  return m ? Number(m[1]) : null;
}

function over(fg, bg, alpha) {
  const mix = (i) => {
    const f = parseInt(fg.replace('#', '').slice(i, i + 2), 16);
    const b = parseInt(bg.replace('#', '').slice(i, i + 2), 16);
    return Math.round(f * alpha + b * (1 - alpha));
  };
  return '#' + [0, 2, 4].map((i) => mix(i).toString(16).padStart(2, '0')).join('');
}

describe('inert inspector sections', () => {
  const t = tokens();

  // Read, never assumed. The table above was computed at 0.42; if the real
  // opacity moves, every figure in it is stale and this goes red so that
  // whoever moved it re-derives them.
  it('is still at the 0.42 the figures above were measured at', () => {
    expect(
      inertOpacity(),
      'web/style.css .inspector-section[inert] opacity changed — re-derive ' +
        "the table in this file's comment, and revisit the open spec item",
    ).toBe(0.42);
  });

  it('reproduces the recorded measurements', () => {
    const a = inertOpacity();
    for (const [name, expected] of [
      ['--text-primary', 3.56],
      ['--text-secondary', 2.92],
      ['--text-muted', 2.23],
      ['--text-faint', 1.97],
      ['--text-fainter', 1.85],
    ]) {
      const r = ratio(over(t[name], t['--surface-window'], a), t['--surface-window']);
      expect(Number(r.toFixed(2)), `${name} inert at ${a}`).toBe(expected);
    }
  });
});
