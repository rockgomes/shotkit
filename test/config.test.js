import { describe, it, expect } from 'vitest';
import { normalise } from '../core/config.js';
import { SHADOW_SCALE_RANGE } from '../core/presets.js';

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

  it('falls back to inference for an unrecognised layout, rather than passing it through', () => {
    // Only 'web' | 'mobile' | 'web+mobile' are real layouts. Anything else -
    // a typo, a stale sentinel from an old caller, garbage from a jobs.json -
    // must be treated as though `layout` were never given, not passed
    // through to layout.js (which would match none of its branches and
    // silently render a blank ground with no error).
    expect(normalise({ layout: 'none', hasWeb: true, mobileCount: 0 }).layout).toBe('web');
    expect(normalise({ layout: 'nonsense', hasWeb: false, mobileCount: 2 }).layout).toBe('mobile');
    expect(normalise({ layout: 'macos', hasWeb: true, mobileCount: 1 }).layout).toBe('web+mobile');
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
  it('defaults to scale 1', () => {
    expect(normalise({}).scale).toBe(1);
  });

  it('accepts scale 2 and 3', () => {
    expect(normalise({ scale: 2 }).scale).toBe(2);
    expect(normalise({ scale: '3' }).scale).toBe(3);
  });

  it('rejects a nonsense scale back to 1', () => {
    expect(normalise({ scale: 7 }).scale).toBe(1);
    expect(normalise({ scale: 'big' }).scale).toBe(1);
  });

  it('normalise() reports the unscaled composition size, regardless of scale', () => {
    // scale renders the SAME composition at `scale` times the canvas size -
    // see composeWithMeta in core/index.js, the only place that reads it.
    // normalise() itself never inflates w/h: it reports what the caller
    // asked to compose, not what an export ends up sized as.
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

describe('frameKind', () => {
  it('defaults to none', () => {
    expect(normalise({}).frameKind).toBe('none');
  });

  it('accepts browser and phone', () => {
    expect(normalise({ frameKind: 'browser' }).frameKind).toBe('browser');
    expect(normalise({ frameKind: 'phone' }).frameKind).toBe('phone');
  });

  it('falls back to none for any unrecognised value, including "macos"', () => {
    // macOS was removed as a product decision (v1 ships none/browser/phone
    // only - every image-slot in the design handoff sits inside the same
    // "browser" chrome, and "macOS" appears only as an inert inspector
    // chip with no frame ever rendered for it). An unrecognised kind - a
    // stale "macos" from an old jobs.json, a typo, anything else - must
    // fall back to 'none' rather than throw or silently pass through.
    expect(normalise({ frameKind: 'macos' }).frameKind).toBe('none');
    expect(normalise({ frameKind: 'made-up' }).frameKind).toBe('none');
    expect(normalise({ frameKind: undefined }).frameKind).toBe('none');
  });
});

describe('chromeTheme', () => {
  it('defaults to dark', () => {
    expect(normalise({}).chromeTheme).toBe('dark');
  });

  it('accepts light, falls back to dark otherwise', () => {
    expect(normalise({ chromeTheme: 'light' }).chromeTheme).toBe('light');
    expect(normalise({ chromeTheme: 'nonsense' }).chromeTheme).toBe('dark');
  });
});

// Task 6: closing the long-standing gap - core/ had a captured colour
// (fUrlTxt) for the browser pill's text but nowhere for the app to put a
// real string. `url` is the new field; the two states below are exactly
// what the task brief asks for: absent (null, the pill stays empty - see
// core/render.js's paintChrome) and present (a real string, drawn).
describe('url', () => {
  it('defaults to null - an empty pill, never a fabricated placeholder', () => {
    expect(normalise({}).url).toBe(null);
  });

  it('accepts a real string', () => {
    expect(normalise({ url: 'app.acme.dev' }).url).toBe('app.acme.dev');
  });

  // Same coercion as `caption` (config.js, right above this field): an
  // empty string is "no value", not a value with zero characters - so a
  // text input that was typed into and then cleared falls straight back to
  // the empty-pill default, not a technically-truthy-but-blank string.
  it('coerces an empty string to null, same as caption does', () => {
    expect(normalise({ url: '' }).url).toBe(null);
  });

  it('coerces a non-string to a string, same as caption does', () => {
    expect(normalise({ url: 404 }).url).toBe('404');
  });
});

// Task 6b: shadowScale is a MULTIPLIER over paintShadow's verified alphas
// (core/render.js), never a replacement for them - see that file's doc
// comment and presets.js's SHADOW_SCALE_RANGE. These tests only cover
// normalise()'s own resolve/clamp job; the actual darkening effect is
// covered directly in test/render-screen.test.js and via the golden in
// test/compose.test.js.
describe('shadowScale', () => {
  it('defaults to 1 - frame.html\'s own alphas, unchanged', () => {
    expect(normalise({}).shadowScale).toBe(1);
  });

  it('accepts a value inside the range verbatim', () => {
    expect(normalise({ shadowScale: 1.6 }).shadowScale).toBeCloseTo(1.6, 6);
    expect(normalise({ shadowScale: 0 }).shadowScale).toBe(0);
    expect(normalise({ shadowScale: SHADOW_SCALE_RANGE[1] }).shadowScale).toBe(SHADOW_SCALE_RANGE[1]);
  });

  it('clamps to [SHADOW_SCALE_RANGE[0], SHADOW_SCALE_RANGE[1]] - never negative, never runaway', () => {
    expect(normalise({ shadowScale: -5 }).shadowScale).toBe(SHADOW_SCALE_RANGE[0]);
    expect(normalise({ shadowScale: 999 }).shadowScale).toBe(SHADOW_SCALE_RANGE[1]);
  });

  it('falls back to the default 1 on nonsense, same coercion every other numeric field gets', () => {
    expect(normalise({ shadowScale: 'heavy' }).shadowScale).toBe(1);
    expect(normalise({ shadowScale: undefined }).shadowScale).toBe(1);
  });
});
