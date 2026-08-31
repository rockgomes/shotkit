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
