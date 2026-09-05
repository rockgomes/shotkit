import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { GROUNDS } from '../core/presets.js';
import { renderTile, renderGroundDial, lightEndBearing } from '../web/preset-tiles.js';

// Comment-stripped source, so the structural guards below read CODE and not
// prose. Same helper as test/selection.test.js, which earned it by failing
// on the word `getContext` inside a comment explaining why that file must
// never call it. Duplicated rather than shared because these are two
// unrelated suites and a shared test helper is a dependency between them.
function codeOf(path) {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const mk = (w, h) => createCanvas(w, h);
const px = (cv, x, y) => {
  const d = cv.getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data;
  return [d[0], d[1], d[2]];
};

/** The same preset, painted at two very different sizes. */
function at(w, h, name) {
  const cv = mk(w, h);
  renderTile(cv, name, { ratio: '3:2' }, null, mk);
  return cv;
}

describe('preset tiles are the real thing (Task 5)', () => {
  it('web/preset-tiles.js paints through core/, and never fakes a gradient', () => {
    // The rule this file exists to hold. `gradientFor` in web/sidebar.js
    // built a CSS `linear-gradient` string that APPROXIMATED what
    // paintGround would draw - a second implementation of the ground, in a
    // different language, which has already lied once.
    const src = codeOf('web/preset-tiles.js');
    expect(src).toContain('paintGround');
    expect(src).not.toContain('linear-gradient');
  });

  it('the retired CSS approximation is gone, not merely unused', () => {
    // An unused second implementation of the ground is exactly the thing
    // that lies later.
    expect(codeOf('web/sidebar.js')).not.toContain('linear-gradient');
    expect(codeOf('web/sidebar.js')).not.toContain('gradientFor');
  });

  it('a tile matches what the canvas will actually render, not an approximation', () => {
    // Painted at tile size and at canvas size, compared at matching
    // RELATIVE positions. A CSS approximation drifts; the real generator
    // cannot. The tolerance covers the gradient's own interpolation across
    // two very different pixel counts, not a different algorithm - the
    // measured differences are recorded in the task report.
    const big = at(1800, 1200, 'lavender');
    const tile = at(44, 44, 'lavender');
    for (const [u, v] of [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]]) {
      const a = px(big, 1800 * u, 1200 * v);
      const b = px(tile, 44 * u, 44 * v);
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(a[i] - b[i]),
          `channel ${i} at ${u},${v}: ${a.join()} vs ${b.join()}`).toBeLessThanOrEqual(6);
      }
    }
  });

  it('a grey preset renders grey in its tile, not a blue tint', () => {
    // The swatch that would have lied. `ash` is the only preset carrying
    // its own saturation, and the CSS approximation did not know about it.
    const tile = at(44, 44, 'ash');
    const [r, g, b] = px(tile, 22, 22);
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(8);
  });

  it('a coloured preset still renders coloured', () => {
    const tile = at(44, 44, 'rose');
    const [r, g, b] = px(tile, 22, 22);
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeGreaterThan(8);
  });

  it('every named preset produces a distinct tile', () => {
    // The whole point of the change, asserted rather than assumed: eight
    // presets that render the same tile are eight presets nobody can
    // choose between.
    const seen = new Map();
    for (const name of Object.keys(GROUNDS)) {
      const key = px(at(44, 44, name), 22, 22).join();
      expect(seen.has(key), `${name} renders identically to ${seen.get(key)}`).toBe(false);
      seen.set(key, name);
    }
    expect(seen.size).toBe(Object.keys(GROUNDS).length);
  });

  it('honours the type: a solid tile is flat, a gradient tile is not', () => {
    const solid = mk(44, 44);
    renderTile(solid, 'mint', { ratio: '3:2', bgType: 'solid' }, null, mk);
    expect(px(solid, 8, 8)).toEqual(px(solid, 36, 36));

    const grad = mk(44, 44);
    renderTile(grad, 'mint', { ratio: '3:2', bgType: 'linear' }, null, mk);
    expect(px(grad, 8, 8)).not.toEqual(px(grad, 36, 36));
  });

  it('honours the luminosity, so a dark ground previews dark', () => {
    const pale = mk(44, 44);
    renderTile(pale, 'mint', { ratio: '3:2' }, null, mk);
    const dark = mk(44, 44);
    renderTile(dark, 'mint', { ratio: '3:2', luminosity: 0.18 }, null, mk);
    expect(px(dark, 22, 22)[0]).toBeLessThan(px(pale, 22, 22)[0] - 100);
  });
});

describe('the Angle dial shows the real ground (Task 7)', () => {
  const S = 44;
  const STOPS = ['#ffffff', '#888888', '#000000'];
  const half = (cv, top) => {
    const d = cv.getContext('2d').getImageData(0, top ? 0 : S / 2, S, S / 2).data;
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 200) continue;           // outside the clipped circle
      sum += (d[i] + d[i + 1] + d[i + 2]) / 3; n++;
    }
    return sum / n;
  };
  const dial = (angle) => {
    const cv = mk(S, S);
    renderGroundDial(cv, { ratio: '3:2', angle }, STOPS, {});
    return cv;
  };

  it('names the light end from the same rule the render uses', () => {
    // Measured, not assumed: at 0 deg the light sits at the BOTTOM, at 90
    // deg at the LEFT. See docs/verification-2026-09-01.md.
    expect(lightEndBearing(0)).toBe(180);
    expect(lightEndBearing(90)).toBe(270);
    expect(lightEndBearing(180)).toBe(0);
    expect(lightEndBearing(270)).toBe(90);
  });

  it('and paints the light where that says it is', () => {
    // The dial is paintGround itself, clipped to a circle, so this is the
    // canvas's own behaviour read at 44px.
    expect(half(dial(0), false)).toBeGreaterThan(half(dial(0), true) + 40);
    expect(half(dial(180), true)).toBeGreaterThan(half(dial(180), false) + 40);
  });

  it('draws nothing but the tick when there is no ground to show', () => {
    // Before a screenshot loads there are no sampled stops. Inventing some
    // would be the retired CSS swatch's lie in a new place.
    const cv = mk(S, S);
    renderGroundDial(cv, { ratio: '3:2' }, null, {});
    const d = cv.getContext('2d').getImageData(0, 0, S, S).data;
    let painted = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) painted++;
    expect(painted).toBe(0);
  });
});
