import { describe, it, expect } from 'vitest';
import { normalise } from '../core/config.js';
import { layout } from '../core/layout.js';

const cfg = (o = {}) => normalise({ layout: 'web', ...o });

describe('safe box', () => {
  it('gives an identical margin on all four edges', () => {
    for (const ratio of ['3:2', '4:3', '16:9', '1:1']) {
      const c = cfg({ ratio });
      const { safe } = layout(c, { web: 1.6, mobile: [] });
      const left = safe.x;
      const top = safe.y;
      const right = c.w - (safe.x + safe.w);
      const bottom = c.h - (safe.y + safe.h);
      expect(left).toBeCloseTo(top, 6);
      expect(left).toBeCloseTo(right, 6);
      expect(left).toBeCloseTo(bottom, 6);
    }
  });

  it('measures padding against the shorter side', () => {
    const c = cfg({ ratio: '16:9', pad: 0.1 });   // 1920x1080, shorter = 1080
    const { safe } = layout(c, { web: 1.6, mobile: [] });
    expect(safe.x).toBeCloseTo(108, 6);
  });

  it('honours per-axis overrides when given', () => {
    const c = cfg({ ratio: '3:2', insetX: 0.10, insetY: 0.02 });
    const { safe } = layout(c, { web: 1.6, mobile: [] });
    expect(safe.x).toBeCloseTo(180, 6);
    expect(safe.y).toBeCloseTo(24, 6);
  });
});

describe('web screen', () => {
  it('contain never crops: keeps the source ratio inside the box', () => {
    const c = cfg({ ratio: '3:2' });
    const { safe, web } = layout(c, { web: 2.5, mobile: [] });   // wider than the box
    expect(web.w / web.h).toBeCloseTo(2.5, 6);
    expect(web.w).toBeLessThanOrEqual(safe.w + 1e-6);
    expect(web.h).toBeLessThanOrEqual(safe.h + 1e-6);
  });

  it('contain handles a source taller than the box', () => {
    const c = cfg({ ratio: '3:2' });
    const { safe, web } = layout(c, { web: 0.5, mobile: [] });
    expect(web.h).toBeCloseTo(safe.h, 6);
    expect(web.w / web.h).toBeCloseTo(0.5, 6);
  });

  it('centres the screen in the safe box', () => {
    const c = cfg({ ratio: '3:2' });
    const { safe, web } = layout(c, { web: 2.5, mobile: [] });
    expect(web.x + web.w / 2).toBeCloseTo(safe.x + safe.w / 2, 6);
    expect(web.y + web.h / 2).toBeCloseTo(safe.y + safe.h / 2, 6);
  });

  it('cover fills the whole safe box', () => {
    const c = cfg({ ratio: '3:2', fit: 'cover' });
    const { safe, web } = layout(c, { web: 2.5, mobile: [] });
    expect(web.w).toBeCloseTo(safe.w, 6);
    expect(web.h).toBeCloseTo(safe.h, 6);
  });
});

describe('mobile layout', () => {
  it('never squashes the phone', () => {
    const c = normalise({ layout: 'mobile', ratio: '3:2' });
    const { phones } = layout(c, { web: null, mobile: [0.5] });
    expect(phones[0].w / phones[0].h).toBeCloseTo(0.5, 6);
  });

  it('caps at three phones', () => {
    const c = normalise({ layout: 'mobile', ratio: '3:2' });
    const { phones } = layout(c, { web: null, mobile: [0.462, 0.462, 0.462, 0.462] });
    expect(phones).toHaveLength(3);
  });

  it('uses a bigger phone when there is only one', () => {
    const c = normalise({ layout: 'mobile', ratio: '3:2' });
    const one = layout(c, { web: null, mobile: [0.462] }).phones[0];
    const two = layout(c, { web: null, mobile: [0.462, 0.462] }).phones[0];
    expect(one.h).toBeCloseTo(1200 * 0.86, 6);
    expect(two.h).toBeCloseTo(1200 * 0.80, 6);
  });

  it('lifts the middle phone highest when there are three', () => {
    const c = normalise({ layout: 'mobile', ratio: '3:2' });
    const { phones } = layout(c, { web: null, mobile: [0.462, 0.462, 0.462] });
    expect(phones[1].y).toBeLessThan(phones[0].y);
    expect(phones[1].y).toBeLessThan(phones[2].y);
  });

  it('falls back to a sane ratio when the source ratio is missing', () => {
    const c = normalise({ layout: 'mobile', ratio: '3:2' });
    const { phones } = layout(c, { web: null, mobile: [null] });
    expect(phones[0].w / phones[0].h).toBeCloseTo(0.462, 6);
  });
});

describe('web+mobile layout', () => {
  it('draws both, with the phone bleeding past the bottom edge', () => {
    const c = normalise({ layout: 'web+mobile', ratio: '3:2' });
    const { web, phones } = layout(c, { web: 1.6, mobile: [0.462] });
    expect(web).not.toBeNull();
    expect(phones).toHaveLength(1);
    expect(phones[0].y + phones[0].h).toBeGreaterThan(1200);
  });

  it('drops to web-only when no phone image is present', () => {
    const c = normalise({ layout: 'web+mobile', ratio: '3:2' });
    const { web, phones } = layout(c, { web: 1.6, mobile: [] });
    expect(web).not.toBeNull();
    expect(phones).toHaveLength(0);
  });
});

describe('caption', () => {
  it('sits at the left margin, above the bottom edge', () => {
    const c = cfg({ caption: 'hello' });
    const { safe, caption } = layout(c, { web: 1.6, mobile: [] });
    expect(caption.x).toBeCloseTo(safe.x, 6);
    expect(caption.y).toBeCloseTo(1200 - 1200 * 0.035, 6);
    expect(caption.fontSize).toBe(Math.round(1200 * 0.021));
  });

  it('is null when no caption is set', () => {
    expect(layout(cfg(), { web: 1.6, mobile: [] }).caption).toBeNull();
  });
});
