import { describe, it, expect } from 'vitest';
import { normalise, sizeProblem, MAX_SIDE, MAX_AREA, SCALES } from '../core/index.js';
import { applyCustomSize } from '../web/size.js';

// A CANVAS PAST THE BROWSER'S LIMIT DOES NOT THROW. IT GOES BLANK.
//
// Measured on the live app, 2026-10-17, before any of this existed: a
// 50000x50000 custom size was accepted, render() returned in 1ms without
// error, and the canvas centre pixel came back [0,0,0,0]. Export would have
// saved that blank canvas as a PNG with no warning. applyCustomSize also
// accepted 1e308.
//
// So the limits are not a taste decision and these are not style tests. The
// numbers come from what Chromium will actually paint: ~268M pixels of area
// and 65535 on any one side, divided by the 3x an export recomposes at.

const BROWSER_MAX_AREA = 268_435_456;
const BROWSER_MAX_SIDE = 65535;
const MAX_SCALE = Math.max(...SCALES);

describe('the limits leave room at the largest export scale', () => {
  it('MAX_SIDE survives being tripled', () => {
    expect(MAX_SIDE * MAX_SCALE).toBeLessThan(BROWSER_MAX_SIDE);
  });

  it('MAX_AREA survives being tripled on both axes', () => {
    expect(MAX_AREA * MAX_SCALE * MAX_SCALE).toBeLessThan(BROWSER_MAX_AREA);
  });

  it('leaves every shipped template well inside it', () => {
    // If a template ever failed this, the app would refuse its own presets.
    const biggest = 2880 * 1800; // App Store, the largest shotkit ships
    expect(biggest).toBeLessThan(MAX_AREA);
  });
});

describe('sizeProblem', () => {
  it('passes a realistic canvas', () => {
    expect(sizeProblem(1800, 1200)).toBeNull();
    expect(sizeProblem(5000, 5000)).toBeNull();
  });

  it('refuses a side over the cap, and says which limit', () => {
    expect(sizeProblem(MAX_SIDE + 1, 10)).toMatch(/each side/i);
  });

  it('refuses an area over the cap even when both sides pass', () => {
    // 8000x8000 is two legal sides and 64M pixels, 576M at 3x.
    expect(sizeProblem(MAX_SIDE, MAX_SIDE)).toMatch(/3x/);
  });

  it('refuses nonsense', () => {
    for (const [w, h] of [[0, 10], [-5, 10], [NaN, 10], [Infinity, 10], [1e308, 1e308]]) {
      expect(sizeProblem(w, h), `${w}x${h} was allowed`).toBeTruthy();
    }
  });
});

describe('applyCustomSize', () => {
  it('writes a legal size and reports no problem', () => {
    const config = {};
    expect(applyCustomSize(config, '1234', '567')).toBeNull();
    expect(config).toEqual({ w: 1234, h: 567 });
  });

  it('refuses 50000x50000 and leaves the config untouched', () => {
    // The exact input that produced a blank export.
    const config = { ratio: '3:2' };
    expect(applyCustomSize(config, '50000', '50000')).toBeTruthy();
    expect(config).toEqual({ ratio: '3:2' });
  });

  it('refuses 1e308, which the old finite-and-positive guard let through', () => {
    const config = {};
    expect(applyCustomSize(config, '1e308', '1e308')).toBeTruthy();
    expect(config.w).toBeUndefined();
  });
});

describe('normalise defends the same limits on its own', () => {
  // web/size.js refuses at the control, but w/h also arrive from a
  // jobs.json, a CLI flag or a stale saved config.
  it('clamps a side past the cap', () => {
    expect(normalise({ w: 100000, h: 10 }).w).toBe(MAX_SIDE);
  });

  it('clamps the area, keeping the shape', () => {
    const n = normalise({ w: 50000, h: 25000 });
    expect(n.w * n.h).toBeLessThanOrEqual(MAX_AREA);
    expect(n.w / n.h).toBeCloseTo(2, 2);
  });

  it('falls back to the template size for garbage, not to the maximum', () => {
    for (const bad of [NaN, Infinity, -5, 0, 'x']) {
      const n = normalise({ w: bad, h: bad, ratio: '3:2' });
      expect([n.w, n.h], `${bad} did not fall back`).toEqual([1800, 1200]);
    }
  });

  it('falls back for a number too large to square, rather than giving 1x1', () => {
    // 1e308 * 1e308 is Infinity, which made the scale factor 0 and handed
    // back a one-pixel canvas.
    const n = normalise({ w: 1e308, h: 1e308, ratio: '3:2' });
    expect([n.w, n.h]).toEqual([1800, 1200]);
  });

  it('derives the corner radius from the CLAMPED width', () => {
    // The first version of this clamp ran at the return statement, which
    // left `radius: w * RADIUS_RATIO` computed from a width the canvas
    // never had - a 50000px-wide radius on a 5000px canvas.
    const n = normalise({ w: 50000, h: 50000 });
    const atTheSameSize = normalise({ w: n.w, h: n.h });
    expect(n.radius).toBe(atTheSameSize.radius);
  });
});
