import { describe, it, expect } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { normalise } from '../core/config.js';
import { paintGround, paintGrain, noiseTile } from '../core/render.js';

function px(ctx, x, y) {
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2]];
}

describe('paintGround', () => {
  it('fills every pixel', () => {
    const c = normalise({ ratio: '3:2' });
    const cv = createCanvas(c.w, c.h);
    const ctx = cv.getContext('2d');
    paintGround(ctx, c, ['#f7f4ff', '#ece6fb', '#ded3f5']);
    for (const [x, y] of [[0, 0], [c.w - 1, 0], [0, c.h - 1], [c.w - 1, c.h - 1], [900, 600]]) {
      expect(ctx.getImageData(x, y, 1, 1).data[3]).toBe(255);
    }
  });

  it('is lighter at the top-left than the bottom-right', () => {
    const c = normalise({ ratio: '3:2' });
    const cv = createCanvas(c.w, c.h);
    const ctx = cv.getContext('2d');
    paintGround(ctx, c, ['#f7f4ff', '#ece6fb', '#ded3f5']);
    const tl = px(ctx, 40, 40).reduce((a, b) => a + b, 0);
    const br = px(ctx, c.w - 40, c.h - 40).reduce((a, b) => a + b, 0);
    expect(tl).toBeGreaterThan(br);
  });
});

describe('noiseTile', () => {
  it('is deterministic', () => {
    const a = noiseTile(240), b = noiseTile(240);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it('is greyscale and opaque', () => {
    const t = noiseTile(64);
    for (let i = 0; i < t.data.length; i += 4) {
      expect(t.data[i]).toBe(t.data[i + 1]);
      expect(t.data[i + 1]).toBe(t.data[i + 2]);
      expect(t.data[i + 3]).toBe(255);
    }
  });

  it('actually varies', () => {
    const t = noiseTile(64);
    const vals = new Set();
    for (let i = 0; i < t.data.length; i += 4) vals.add(t.data[i]);
    expect(vals.size).toBeGreaterThan(20);
  });

  // `baseSize` is what makes `scale` (core/config.js) a genuine enlargement
  // rather than a same-looking tile that merely repeats less often (see the
  // doc comment on noiseTile in core/render.js): holding the octave grid
  // fixed at 240 regardless of the raster `size` requested means a bigger
  // tile is an exact nearest-neighbour enlargement of the 240px one, pixel
  // for pixel. This is the property paintGrain's `scale` fix depends on -
  // exercised here directly, at the pixel level, where it is exact (not
  // through a composited render, where soft-light blending on a bright
  // ground compresses genuine noise differences down to 1-2 RGB levels and
  // can pass even a reverted, unscaled implementation - see
  // test/compose.test.js's "faithful enlargement" test for that half of the
  // guard).
  //
  // Sampled directly: `noiseTile(240,240)` at (x,y) against
  // `noiseTile(240*k,240)` at (k*x,k*y) must be EXACTLY equal, all 4
  // channels - not a tolerance. Confirmed this is the correct assertion (not
  // an aspiration) by measuring it first: maxDiff was 0 at every point
  // tried, for both k=2 and k=3.
  function pixelAt(tile, x, y) {
    const i = (y * tile.width + x) * 4;
    return [tile.data[i], tile.data[i + 1], tile.data[i + 2], tile.data[i + 3]];
  }

  // A spread across the whole tile, not just corners: every 17px in x and y
  // covers ~14x14 = 196 points at k=1, landing at a mix of octave-grid cell
  // interiors and boundaries (cells are 2/4/8px wide - see noiseTile's doc
  // comment), so a break in the fixed-grid property can't hide between
  // sample points.
  function spreadPoints(max, step = 17) {
    const pts = [];
    for (let y = 0; y < max; y += step) {
      for (let x = 0; x < max; x += step) pts.push([x, y]);
    }
    return pts;
  }

  for (const k of [2, 3]) {
    it(`is an exact ${k}x nearest-neighbour enlargement when baseSize is held fixed`, () => {
      const small = noiseTile(240, 240);
      const big = noiseTile(240 * k, 240);
      expect(big.width).toBe(240 * k);

      const points = spreadPoints(240);
      expect(points.length).toBeGreaterThan(100);   // meaningfully spread, not a token few

      for (const [x, y] of points) {
        expect(pixelAt(big, x * k, y * k)).toEqual(pixelAt(small, x, y));
      }
    });
  }
});

describe('paintGrain', () => {
  it('changes the canvas when grain is on', () => {
    const c = normalise({ ratio: '1:1', grain: 0.34 });
    const cv = createCanvas(c.w, c.h);
    const ctx = cv.getContext('2d');
    paintGround(ctx, c, ['#f7f4ff', '#ece6fb', '#ded3f5']);
    const before = Array.from(ctx.getImageData(0, 0, 200, 200).data);
    paintGrain(ctx, c, (w, h) => createCanvas(w, h));
    const after = Array.from(ctx.getImageData(0, 0, 200, 200).data);
    expect(after).not.toEqual(before);
  });

  it('is a no-op when grain is 0', () => {
    const c = normalise({ ratio: '1:1', grain: 0 });
    const cv = createCanvas(c.w, c.h);
    const ctx = cv.getContext('2d');
    paintGround(ctx, c, ['#f7f4ff', '#ece6fb', '#ded3f5']);
    const before = Array.from(ctx.getImageData(0, 0, 200, 200).data);
    paintGrain(ctx, c, (w, h) => createCanvas(w, h));
    expect(Array.from(ctx.getImageData(0, 0, 200, 200).data)).toEqual(before);
  });

  // The exact-enlargement property above lives in noiseTile itself - it says
  // nothing about whether paintGrain actually ASKS for a bigger tile when
  // `c.scale` grows. That's a separate, plausible regression (e.g. reverting
  // just the `tileSize = Math.round(240 * (c.scale || 1))` line back to a
  // literal `240`, leaving noiseTile's own math untouched) that a noiseTile-
  // only test structurally cannot see, since it never calls paintGrain.
  // Spies on the injected `makeCanvas` to catch exactly that: the tile
  // canvas paintGrain builds must be sized for the scale it was given, not a
  // fixed 240px regardless of it. A fresh `scale: 3` (unused by any earlier
  // test in this file) guarantees the per-file tile cache has no 720px entry
  // yet, so a real `makeCanvas(720, 720)` call is forced, not skipped by a
  // cache hit.
  it('sizes the grain tile it requests for c.scale, not a fixed 240px', () => {
    const c = normalise({ ratio: '1:1', grain: 0.34, scale: 3 });
    const cv = createCanvas(c.w, c.h);
    const ctx = cv.getContext('2d');
    const requestedSizes = [];
    const spyMakeCanvas = (w, h) => {
      requestedSizes.push([w, h]);
      return createCanvas(w, h);
    };
    paintGrain(ctx, c, spyMakeCanvas);
    expect(requestedSizes).toContainEqual([720, 720]);   // 240 * scale(3)
    expect(requestedSizes.some(([w, h]) => w === 240 && h === 240)).toBe(false);
  });

  it('blends into the ground instead of overwriting it', () => {
    // Guards against a real regression: a putImageData-based paintGrain
    // changes every pixel too, so the "changes the canvas" test above
    // passes for that broken version as well. putImageData ignores
    // globalAlpha and globalCompositeOperation, so a broken version stamps
    // opaque greyscale noise straight over the ground instead of soft-light
    // blending into it. These two properties are true of a genuine blend
    // and false of an opaque overwrite:
    //   1. the ground's own gradient is still visible underneath (top-left
    //      is still lighter than bottom-right, same as paintGround alone).
    //   2. the perturbation grain introduces is small and not grey - an
    //      opaque noise stamp would swing pixels by up to ~255 and land
    //      almost every one of them exactly on R===G===B.
    // Thresholds below are measured on this exact config (see the task-5
    // report for the numbers), with headroom on top.
    const c = normalise({ ratio: '1:1', grain: 0.34 });
    const cv = createCanvas(c.w, c.h);
    const ctx = cv.getContext('2d');
    paintGround(ctx, c, ['#f7f4ff', '#ece6fb', '#ded3f5']);
    const before = Uint8ClampedArray.from(ctx.getImageData(0, 0, c.w, c.h).data);
    paintGrain(ctx, c, (w, h) => createCanvas(w, h));
    const after = ctx.getImageData(0, 0, c.w, c.h).data;

    // Property 1: the gradient survives underneath the grain.
    const tl = px(ctx, 40, 40).reduce((a, b) => a + b, 0);
    const br = px(ctx, c.w - 40, c.h - 40).reduce((a, b) => a + b, 0);
    expect(tl).toBeGreaterThan(br);

    // Property 2: the perturbation is small and not grey.
    let maxDelta = 0;
    let greyCount = 0;
    const totalPixels = c.w * c.h;
    for (let i = 0; i < after.length; i += 4) {
      for (let k = 0; k < 3; k++) {
        maxDelta = Math.max(maxDelta, Math.abs(after[i + k] - before[i + k]));
      }
      if (after[i] === after[i + 1] && after[i + 1] === after[i + 2]) greyCount++;
    }
    // Measured on this config: max per-channel delta 11/255, 0 grey pixels
    // out of 2.25M. A putImageData overwrite instead swings pixels by up to
    // ~255 and lands the overwhelming majority of them exactly on grey.
    expect(maxDelta).toBeLessThan(40);
    expect(greyCount).toBeLessThan(totalPixels * 0.01);
  });
});

const GROUND = ['#f7f4ff', '#ece6fb', '#ded3f5'];

function renderGroundCtx(overrides = {}) {
  const c = normalise({ ratio: '3:2', ...overrides });
  const cv = createCanvas(c.w, c.h);
  const ctx = cv.getContext('2d');
  paintGround(ctx, c, GROUND);
  return ctx;
}

function renderGround(overrides = {}) {
  return renderGroundCtx(overrides).canvas.toBuffer('image/png');
}

function lum([r, g, b]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe('paintGround angle', () => {
  it('defaults to 166 degrees — byte-identical to the hardcoded original', () => {
    const a = renderGround({ angle: 166 });
    const b = renderGround({});                 // angle omitted
    expect(Buffer.compare(a, b)).toBe(0);
  });

  it('a different angle changes the render', () => {
    const a = renderGround({ angle: 166 });
    const b = renderGround({ angle: 20 });
    expect(Buffer.compare(a, b)).not.toBe(0);
  });

  it('90 degrees puts the light source up the left edge, not the top-left', () => {
    // sanity check that the angle actually rotates the linear stop, in the
    // direction CSS uses: 0deg points up, angles run clockwise. At 90deg
    // ("to right"), CSS puts the FIRST stop (g1, the lightest of the three
    // ground colours) at the left edge and the LAST stop (g3, the darkest)
    // at the right edge, so the left edge should read brighter.
    const ctx = renderGroundCtx({ angle: 90 });
    const left = lum(px(ctx, 20, 600));
    const right = lum(px(ctx, 1780, 600));
    expect(left).toBeGreaterThan(right);
  });
});

// ---------------------------------------------------------------------
// Cycle C Task 7 — the angle steers the WHOLE ground, not a third of it.
//
// paintGround draws three layers: one linear gradient that turns with
// `angle`, and two radial washes that used to be pinned to 22%/6% and
// 88%/97% of the canvas whatever the angle said. Measured before the fix:
// the ground's brightest point landed up to 178° away from where the number
// pointed, and through 285-345° it did not move at all. That is what Rock's
// "I can't seem to understand the logic behind how Angle works" was made of.
// ---------------------------------------------------------------------
describe('the angle steers the whole ground (Task 7)', () => {
  const W = 300, H = 200;
  const STOPS = ['#ffffff', '#888888', '#000000'];

  /** Compass bearing (0 up, clockwise) of the ground's brightest region. */
  function lightBearing(angle) {
    const cv = createCanvas(W, H);
    const ctx = cv.getContext('2d');
    paintGround(ctx, { w: W, h: H, angle, bgType: 'linear' }, STOPS);
    const d = ctx.getImageData(0, 0, W, H).data;
    let min = 255, max = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
      if (l < min) min = l;
      if (l > max) max = l;
    }
    const thr = max - (max - min) * 0.15;
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if ((d[i] + d[i + 1] + d[i + 2]) / 3 < thr) continue;
        sx += x / W - 0.5; sy += y / H - 0.5; n++;
      }
    }
    const b = Math.atan2(sx / n, -(sy / n)) * 180 / Math.PI;
    return { bearing: (b + 360) % 360, spread: max - min };
  }

  const apart = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

  it('puts the light where the number says, all the way round', () => {
    // `angle` is the direction the gradient TRAVELS, light to dark, so the
    // light end is half a turn away. Worst case measured after the fix: 17°,
    // the washes' authored offsets not sitting exactly on the axis. Before
    // it, this same loop peaked at 178° — the light dead opposite the number.
    for (let a = 0; a < 360; a += 15) {
      const { bearing } = lightBearing(a);
      expect(apart(bearing, (a + 180) % 360),
        `angle ${a}: light reads at ${Math.round(bearing)}°, number says ${(a + 180) % 360}°`)
        .toBeLessThanOrEqual(25);
    }
  });

  it('and moves it through the arc where it used to be frozen', () => {
    // 285° through 345°: the pinned light wash won outright, and the
    // brightest point sat at 22%/6% for the whole sweep. Measured then:
    // identical centroid at every step.
    const seen = [285, 300, 315, 330, 345].map(a => lightBearing(a).bearing);
    for (let i = 1; i < seen.length; i++) {
      expect(apart(seen[i], seen[i - 1]),
        `the light did not move between ${270 + i * 15}° and ${285 + i * 15}°`)
        .toBeGreaterThan(8);
    }
  });

  it('and keeps the two ends of the gradient apart at every angle', () => {
    // The other half of the old defect. Sampled at the two ends of the
    // gradient's OWN axis — not the whole canvas, which stayed contrasty
    // because the pinned wash was itself bright. At 0° the axis ends
    // measured 149 (top) against 145 (bottom): four levels, a gradient with
    // nothing left of it.
    const lum = (ctx, x, y) => {
      const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
      return (d[0] + d[1] + d[2]) / 3;
    };
    for (let a = 0; a < 360; a += 15) {
      const cv = createCanvas(W, H);
      const ctx = cv.getContext('2d');
      paintGround(ctx, { w: W, h: H, angle: a, bgType: 'linear' }, STOPS);
      // 38% of the way out along the axis, both directions: inside the
      // canvas at every angle, and clear of the corners.
      const rad = (a - 90) * Math.PI / 180;
      const ex = Math.cos(rad) * 0.38, ey = Math.sin(rad) * 0.38;
      const dark = lum(ctx, (0.5 + ex) * W, (0.5 + ey) * H);
      const light = lum(ctx, (0.5 - ex) * W, (0.5 - ey) * H);
      expect(light - dark, `angle ${a}: light end ${Math.round(light)}, dark end ${Math.round(dark)}`)
        .toBeGreaterThan(60);
    }
  });

  it('leaves the default angle exactly as it was', () => {
    // The shipped look is not up for renegotiation by this fix: the washes
    // rotate by `angle - DEFAULT_ANGLE`, which is zero at the default. The
    // goldens are the real proof; this states the intent where it can be read.
    const a = createCanvas(W, H), b = createCanvas(W, H);
    paintGround(a.getContext('2d'), { w: W, h: H, bgType: 'linear' }, STOPS);
    paintGround(b.getContext('2d'), { w: W, h: H, angle: 166, bgType: 'linear' }, STOPS);
    expect(Buffer.from(a.toBuffer('image/png')).equals(Buffer.from(b.toBuffer('image/png')))).toBe(true);
  });
});
