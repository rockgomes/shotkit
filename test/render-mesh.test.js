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

  // THIS TEST USED TO FORBID WHAT TASK 9 EXISTS TO ADD, so it is restated
  // rather than deleted. The rule it protects is real and unchanged: the
  // ground comes from the product, so a mesh must not invent a hue the
  // screenshot does not have. What changes is that the rule is now
  // PARAMETERISED - `spread` says how far around the ground's own hue the
  // mesh may wander, and it is centred there, so the mesh still belongs to
  // the screenshot it came from. At spread 0 the old guarantee holds
  // exactly, which is what this asserts.
  it('at spread 0, stays within the ground palette — the pre-Task-9 guarantee', () => {
    const ctx = renderCtx({ bgType: 'mesh', mesh: { spread: 0 } });
    const hues = samplePoints(ctx, 200).map(hueOf);
    expect(circularSpread(hues)).toBeLessThan(40); // degrees
  });

  it('never wanders further than the spread it was given', () => {
    const ctx = renderCtx({ bgType: 'mesh', mesh: { stops: 5, spread: 60 } });
    const hues = samplePoints(ctx, 200).map(hueOf);
    // The arc the blobs are drawn from is `spread` wide; blending between
    // neighbours stays inside it, and the corner radials are the sampled
    // stops themselves. A generous margin, because this guards "does not
    // invent an unrelated hue", not the exact arithmetic.
    expect(circularSpread(hues)).toBeLessThan(60 + 40);
  });
});

// --- Cycle A Task 9: mesh has to earn its place -------------------------
//
// Rock: "I still don't know what mesh does. you're gonna need to show me the
// value of it." It was two tints of ONE hue with a reroll button, which is
// why it could only ever look like a blotchier linear gradient. These are
// the three gates from the plan: distinguishable, steerable, not muddy.
function meshScene(overrides = {}) {
  const c = normalise({ ratio: '3:2', bgType: 'mesh', ...overrides });
  const cv = createCanvas(c.w, c.h);
  const ctx = cv.getContext('2d');
  paintGround(ctx, c, GROUND);
  return { c, ctx };
}

// Compare two renders by their PNG bytes, the idiom the rest of this file
// already uses. NOT `expect(Buffer.from(getImageData(...))).toEqual(...)`,
// which is what the plan sketched: vitest deep-equals that element by
// element across 8.6 million entries and each such assertion took 25-70
// SECONDS here. Same claim, three orders of magnitude cheaper.
const bytes = ({ ctx }) => ctx.canvas.toBuffer('image/png');
const same = (a, b) => Buffer.compare(bytes(a), bytes(b)) === 0;

// Distinct 15-degree hue buckets over a sample grid, ignoring near-greys.
function hueBuckets(ctx, c) {
  const seen = new Set();
  for (let i = 1; i < 8; i++) {
    for (let j = 1; j < 6; j++) {
      const d = ctx.getImageData(
        Math.round((c.w * i) / 8), Math.round((c.h * j) / 6), 1, 1,
      ).data;
      const mx = Math.max(d[0], d[1], d[2]), mn = Math.min(d[0], d[1], d[2]);
      if ((mx - mn) / 255 < 0.04) continue;      // too grey to have a hue
      const h = hueOf([d[0], d[1], d[2]]);
      if (h !== null) seen.add(Math.round(h / 15));
    }
  }
  return seen;
}

// Mean chroma (max channel minus min, 0-255) over the same grid.
function meanChroma(ctx, c) {
  let total = 0, n = 0;
  for (let i = 1; i < 8; i++) {
    for (let j = 1; j < 6; j++) {
      const d = ctx.getImageData(
        Math.round((c.w * i) / 8), Math.round((c.h * j) / 6), 1, 1,
      ).data;
      total += Math.max(d[0], d[1], d[2]) - Math.min(d[0], d[1], d[2]);
      n++;
    }
  }
  return total / n;
}

describe('mesh has real colour variety', () => {
  it('a spread mesh spans more hue buckets than a linear ground', () => {
    const mesh = meshScene({ mesh: { stops: 5, spread: 90 }, seed: 7 });
    const linear = meshScene({ bgType: 'linear' });
    expect(hueBuckets(mesh.ctx, mesh.c).size)
      .toBeGreaterThan(hueBuckets(linear.ctx, linear.c).size);
  });

  it('spread 0 collapses toward a single hue family', () => {
    const wide = meshScene({ mesh: { stops: 5, spread: 120 }, seed: 7 });
    const flat = meshScene({ mesh: { stops: 5, spread: 0 }, seed: 7 });
    expect(hueBuckets(flat.ctx, flat.c).size)
      .toBeLessThan(hueBuckets(wide.ctx, wide.c).size);
  });

  it('is deterministic for a given seed', () => {
    const a = meshScene({ mesh: { stops: 4, spread: 60 }, seed: 12 });
    const b = meshScene({ mesh: { stops: 4, spread: 60 }, seed: 12 });
    expect(same(a, b)).toBe(true);
  });

  it('changing only the seed changes the image', () => {
    const a = meshScene({ mesh: { stops: 4, spread: 60 }, seed: 12 });
    const b = meshScene({ mesh: { stops: 4, spread: 60 }, seed: 13 });
    expect(same(a, b)).toBe(false);
  });

  it('stop count actually reaches the canvas', () => {
    const few = meshScene({ mesh: { stops: 3, spread: 120 }, seed: 3 });
    const many = meshScene({ mesh: { stops: 5, spread: 120 }, seed: 3 });
    expect(same(few, many)).toBe(false);
  });

  it('spread actually reaches the canvas', () => {
    const a = meshScene({ mesh: { stops: 4, spread: 20 }, seed: 3 });
    const b = meshScene({ mesh: { stops: 4, spread: 140 }, seed: 3 });
    expect(same(a, b)).toBe(false);
  });

  // THE GATE THAT MATTERS MOST, and the one whose limits are worth stating
  // exactly. Overlapping hues average toward grey, and a mesh that
  // technically contains five hues but renders as sludge is worse than the
  // linear gradient it replaced.
  //
  // It is measured at spread 180 - the TOP of MESH_SPREAD_RANGE, the worst
  // case a user can reach - not at the plan's 140, because a gate that
  // stops short of the range's own maximum does not cover the range.
  // Measured mean chroma over the sample grid, ground #ece6fb:
  //
  //   linear ground        21.17   -> floor at x0.75 = 15.88
  //   mesh spread   0      24.54
  //   mesh spread  70      23.77   (the default)
  //   mesh spread 140      19.63
  //   mesh spread 180      17.31   <- what this asserts, 9% clear
  //
  // WHAT IT DOES NOT CATCH, said plainly rather than left to be discovered:
  // raising the per-blob alpha to 0.85 does not trip it. Alpha is not the
  // lever that muds this construction - the blobs are drawn source-over, so
  // the topmost mostly replaces rather than averages, and it is SPREAD that
  // pulls chroma down. So this is a floor on the worst case a user can
  // reach, not a detector of every possible way to make mud. The other half
  // of the gate is a human looking at the preview, which is why the task
  // requires that too.
  //
  // If it fails, the fix is in paintMesh - lower the per-blob alpha, reduce
  // the overlap, narrow the range - NEVER the thresholds below.
  it('the widest spread does not wash the colour out', () => {
    const linear = meshScene({ bgType: 'linear' });
    const widest = meshScene({ mesh: { stops: 5, spread: 180 }, seed: 7 });
    expect(meanChroma(widest.ctx, widest.c))
      .toBeGreaterThan(meanChroma(linear.ctx, linear.c) * 0.75);
  });

  it('the widest spread keeps most of the colour a flat one has', () => {
    // The same claim measured against the mesh's OWN spread-0 render rather
    // than against the linear ground, so it holds whatever ground it is
    // handed. Measured 17.31 / 24.54 = 70.5% against this 65% floor.
    const flat = meshScene({ mesh: { stops: 5, spread: 0 }, seed: 7 });
    const widest = meshScene({ mesh: { stops: 5, spread: 180 }, seed: 7 });
    expect(meanChroma(widest.ctx, widest.c))
      .toBeGreaterThan(meanChroma(flat.ctx, flat.c) * 0.65);
  });
});
