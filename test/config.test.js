import { describe, it, expect } from 'vitest';
import { normalise } from '../core/config.js';

describe('normalise', () => {
  it('defaults to 3:2 at 1800x1200', () => {
    const c = normalise({ layout: 'web' });
    expect(c.w).toBe(1800);
    expect(c.h).toBe(1200);
  });

  it('resolves named ratios', () => {
    expect(normalise({ ratio: '4:3' }).w).toBe(2000);
    expect(normalise({ ratio: '16:9' }).h).toBe(1080);
    expect(normalise({ ratio: '1:1' })).toMatchObject({ w: 1500, h: 1500 });
  });

  it('explicit w/h beats ratio', () => {
    const c = normalise({ ratio: '3:2', w: 800, h: 800 });
    expect(c).toMatchObject({ w: 800, h: 800 });
  });

  it('resolves a named ground to its hue', () => {
    expect(normalise({ ground: 'lavender' }).forceHue).toBe(268);
    expect(normalise({ ground: 'rose' }).forceHue).toBe(340);
  });

  it('resolves a numeric ground to a hue', () => {
    expect(normalise({ ground: '210' }).forceHue).toBe(210);
  });

  it('treats auto and nonsense as no forced hue', () => {
    expect(normalise({ ground: 'auto' }).forceHue).toBe(null);
    expect(normalise({ ground: 'banana' }).forceHue).toBe(null);
  });

  it('carries the shipped defaults', () => {
    const c = normalise({});
    expect(c.pad).toBeCloseTo(0.052);
    expect(c.grain).toBeCloseTo(0.34);
    expect(c.phoneScale).toBeCloseTo(0.86);
    expect(c.phoneBleed).toBeCloseTo(0.10);
    expect(c.fit).toBe('contain');
    expect(c.radius).toBe(Math.round(1800 * 0.0133));
  });

  it('infers layout from which images are present', () => {
    expect(normalise({ hasWeb: true, mobileCount: 0 }).layout).toBe('web');
    expect(normalise({ hasWeb: false, mobileCount: 2 }).layout).toBe('mobile');
    expect(normalise({ hasWeb: true, mobileCount: 1 }).layout).toBe('web+mobile');
  });

  it('accepts an explicit layout over the inference', () => {
    expect(normalise({ hasWeb: true, mobileCount: 1, layout: 'web' }).layout).toBe('web');
  });

  it('resolves insetX/insetY to null when absent, and passes numbers through when given', () => {
    const absent = normalise({});
    expect(absent.insetX).toBeNull();
    expect(absent.insetY).toBeNull();

    const given = normalise({ insetX: 12, insetY: 34 });
    expect(given.insetX).toBe(12);
    expect(given.insetY).toBe(34);
  });

  it('accepts fit "cover" and falls back to "contain" for anything else', () => {
    expect(normalise({ fit: 'cover' }).fit).toBe('cover');
    expect(normalise({ fit: 'nonsense' }).fit).toBe('contain');
    expect(normalise({}).fit).toBe('contain');
  });

  it('resolves tone to "light" or "mid" when given, and null otherwise', () => {
    expect(normalise({ tone: 'light' }).tone).toBe('light');
    expect(normalise({ tone: 'mid' }).tone).toBe('mid');
    expect(normalise({}).tone).toBeNull();
  });
});

describe('templates', () => {
  it('resolves a named template to its pixel size', () => {
    expect(normalise({ template: 'dribbble' })).toMatchObject({ w: 2800, h: 2100 });
    expect(normalise({ template: 'twitter-post' })).toMatchObject({ w: 1600, h: 900 });
    expect(normalise({ template: 'instagram' })).toMatchObject({ w: 2160, h: 2160 });
  });

  it('template beats ratio', () => {
    expect(normalise({ ratio: '16:9', template: 'dribbble' })).toMatchObject({ w: 2800, h: 2100 });
  });

  it('explicit w/h beats template', () => {
    expect(normalise({ template: 'dribbble', w: 100, h: 50 })).toMatchObject({ w: 100, h: 50 });
  });

  it('an unknown template falls back to the ratio', () => {
    expect(normalise({ template: 'nope', ratio: '1:1' })).toMatchObject({ w: 1500, h: 1500 });
  });

  it('ratios still work untouched', () => {
    expect(normalise({ ratio: '3:2' })).toMatchObject({ w: 1800, h: 1200 });
  });
});

describe('export settings', () => {
  it('defaults to scale 1 and png', () => {
    expect(normalise({})).toMatchObject({ scale: 1, format: 'png' });
  });

  it('accepts scale 2 and 3', () => {
    expect(normalise({ scale: 2 }).scale).toBe(2);
    expect(normalise({ scale: '3' }).scale).toBe(3);
  });

  it('rejects a nonsense scale back to 1', () => {
    expect(normalise({ scale: 7 }).scale).toBe(1);
    expect(normalise({ scale: 'big' }).scale).toBe(1);
  });

  it('accepts the three formats and rejects others', () => {
    expect(normalise({ format: 'jpeg' }).format).toBe('jpeg');
    expect(normalise({ format: 'webp' }).format).toBe('webp');
    expect(normalise({ format: 'gif' }).format).toBe('png');
  });

  it('scale does NOT change the canvas size', () => {
    // scale is applied at export, not by inflating the composition
    expect(normalise({ ratio: '3:2', scale: 3 })).toMatchObject({ w: 1800, h: 1200 });
  });
});

describe('angle', () => {
  it("defaults to frame.html's 166 degrees", () => {
    expect(normalise({}).angle).toBe(166);
  });

  it('accepts a number and wraps out-of-range values', () => {
    expect(normalise({ angle: 45 }).angle).toBe(45);
    expect(normalise({ angle: 420 }).angle).toBe(60);
    expect(normalise({ angle: -30 }).angle).toBe(330);
  });

  it('falls back to 166 on nonsense', () => {
    expect(normalise({ angle: 'sideways' }).angle).toBe(166);
  });
});
