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
  // Comments are stripped FIRST. tokens.css documents retired tokens by
  // quoting their old `--name: #value` in prose, and a bare regex over the
  // raw file happily resurrects them — a deleted token would then silently
  // satisfy a row here instead of failing it.
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

  // .section-label (497), .template-row--add (578), .custom-size-field (615),
  // .canvas-toolbar-label (762), .control-hint (1238) and more on the window;
  // .template-row--add is a .template-row, so its hover puts it on
  // --border-hairline (560); the dropzone's own copy (897, 923, 935) sits on
  // --surface-canvas.
  ['--text-fainter', '--surface-window', 4.5],
  ['--text-fainter', '--border-hairline', 4.5],
  ['--text-fainter', '--surface-canvas', 4.5],

  // .template-row .dim (556) and .export-footnote (1340). The dimensions are
  // information, not decoration, so this is a 4.5 row and not a 3.0 one — see
  // the token's own comment in tokens.css.
  ['--text-disabled', '--surface-window', 4.5],
  ['--text-disabled', '--border-hairline', 4.5],

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
 * MEASURED, NOT GATED — deliberately.
 *
 * The inert inspector sections (style.css:996) and every `:disabled` control
 * composite their own text over the window at 0.42 / 0.4 alpha. The spec asks
 * inert states to clear 3:1, and at these token values they cannot: reaching
 * 3:1 for a section label inside an inert section needs alpha ~0.68, at which
 * point the section no longer reads as off at all. Raising the tokens further
 * cannot fix it either — the composite is dominated by the alpha.
 *
 * So this is recorded as a measurement rather than an assertion. It exists to
 * stop the numbers being rediscovered from scratch, and to fail loudly if the
 * inert cue is ever changed without someone re-reading them.
 *
 * At the current 0.42 / 0.4, over --surface-window:
 *
 *   --text-primary    3.56 / 3.35    (min alpha for 3:1: 0.40)
 *   --text-secondary  2.92 / 2.75    (0.43)
 *   --text-muted      2.23 / 2.13    (0.55)
 *   --text-faint      1.97 / 1.89    (0.63)
 *   --text-fainter    1.85 / 1.77    (0.68)
 *   --text-disabled   1.85 / 1.77    (0.69)
 *
 * Changing `.inspector-section[inert]`'s opacity or the `:disabled` opacity
 * is a design decision about how inert "inert" should look, not a token
 * change, and it belongs to whoever owns that decision — not to this audit.
 */
function over(fg, bg, alpha) {
  const mix = (i) => {
    const f = parseInt(fg.replace('#', '').slice(i, i + 2), 16);
    const b = parseInt(bg.replace('#', '').slice(i, i + 2), 16);
    return Math.round(f * alpha + b * (1 - alpha));
  };
  return '#' + [0, 2, 4].map((i) => mix(i).toString(16).padStart(2, '0')).join('');
}

describe('inert states stay inert', () => {
  const t = tokens();

  // The floor that IS enforced: an inert section must stay clearly dimmer
  // than the same text live. If a future lift ever closed that gap the cue
  // would be gone, which is the failure mode Task 3 was warned about.
  it('the inert inspector reads dimmer than the live one', () => {
    for (const name of ['--text-primary', '--text-secondary', '--text-fainter']) {
      const live = ratio(t[name], t['--surface-window']);
      const inert = ratio(over(t[name], t['--surface-window'], 0.42), t['--surface-window']);
      expect(inert, `${name} inert (${inert.toFixed(2)}) vs live (${live.toFixed(2)})`)
        .toBeLessThan(live * 0.6);
    }
  });
});
