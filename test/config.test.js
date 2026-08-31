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
});
