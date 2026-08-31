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
});
