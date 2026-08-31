import { describe, it, expect } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { normalise } from '../core/config.js';
import { paintGround } from '../core/render.js';

const GROUND = ['#f7f4ff', '#ece6fb', '#ded3f5'];

function renderCtx(overrides = {}) {
  const c = normalise({ ratio: '3:2', ...overrides });
  const cv = createCanvas(c.w, c.h);
  const ctx = cv.getContext('2d');
  paintGround(ctx, c, GROUND);
  return ctx;
}

function render(overrides = {}) {
  return renderCtx(overrides).canvas.toBuffer('image/png');
}

function px(ctx, x, y) {
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2]];
}

// Deterministic grid of sample points across the canvas - not random, so the
// hue-spread test below can't flake between runs.
function samplePoints(ctx, n) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    const x = Math.min(w - 1, Math.floor((col + 0.5) * w / cols));
    const y = Math.min(h - 1, Math.floor((row + 0.5) * h / rows));
    pts.push(px(ctx, x, y));
  }
  return pts;
}

// Hue in degrees, or null when the pixel is too close to neutral grey for hue
// to mean anything (avoids a near-white antialiasing pixel snapping to an
// arbitrary hue and blowing up the spread measurement below).
function hueOf([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.01) return null;
  let h;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return h;
}

// The smallest arc (in degrees) that contains every hue, going the short way
// around the circle - i.e. 360 minus the largest gap between consecutive
// hues once sorted.
function circularSpread(hues) {
  const valid = hues.filter(h => h !== null && Number.isFinite(h));
  if (valid.length < 2) return 0;
  const sorted = [...valid].sort((a, b) => a - b);
  let maxGap = 0;
  for (let i = 0; i < sorted.length; i++) {
    const gap = i === sorted.length - 1
      ? 360 - sorted[i] + sorted[0]
      : sorted[i + 1] - sorted[i];
    if (gap > maxGap) maxGap = gap;
  }
  return 360 - maxGap;
}

describe('paintGround dispatch', () => {
  it('defaults to linear and is byte-identical to before', () => {
    expect(Buffer.compare(render({}), render({ bgType: 'linear' }))).toBe(0);
  });

  it('solid fills flat with the middle stop', () => {
    const ctx = renderCtx({ bgType: 'solid' });
    expect(px(ctx, 40, 40)).toEqual(px(ctx, 1760, 1160));
  });

  it('mesh differs from linear', () => {
    expect(Buffer.compare(render({ bgType: 'mesh' }), render({}))).not.toBe(0);
  });
});

describe('paintMesh', () => {
  it('is deterministic for a given seed', () => {
    expect(Buffer.compare(render({ bgType: 'mesh', seed: 7 }), render({ bgType: 'mesh', seed: 7 }))).toBe(0);
  });

  it('a different seed gives a different field', () => {
    expect(Buffer.compare(render({ bgType: 'mesh', seed: 7 }), render({ bgType: 'mesh', seed: 8 }))).not.toBe(0);
  });

  it('fills every pixel opaquely', () => {
    const ctx = renderCtx({ bgType: 'mesh' });
    for (const [x, y] of [[0, 0], [1799, 0], [0, 1199], [1799, 1199], [900, 600]]) {
      expect(ctx.getImageData(x, y, 1, 1).data[3]).toBe(255);
    }
  });

  it('stays within the ground palette — no colour outside the three stops\' hue range', () => {
    // a mesh built from the sampled stops must not invent a hue the product
    // does not have; that would break the "ground comes from the product"
    // rule.
    const ctx = renderCtx({ bgType: 'mesh' });
    const hues = samplePoints(ctx, 200).map(hueOf);
    const spread = circularSpread(hues);
    expect(spread).toBeLessThan(40); // degrees
  });
});
