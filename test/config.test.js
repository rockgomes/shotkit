import { describe, it, expect } from 'vitest';
import { normalise } from '../core/config.js';
import { layout } from '../core/layout.js';
import { SHADOW_SCALE_RANGE, SHADOW_BLUR_RANGE, SHADOW_DEFAULTS } from '../core/presets.js';

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

  // An empty string is "no value", not a value with zero characters - so a
  // text input that was typed into and then cleared falls straight back to
  // the empty-pill default, not a technically-truthy-but-blank string.
  it('coerces an empty string to null', () => {
    expect(normalise({ url: '' }).url).toBe(null);
  });

  it('coerces a non-string to a string', () => {
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

// Cycle A Task 4: `fit`/`FITS`/`cover` and `caption` are retired vocabulary.
// Rock on `cover`: "idk what 'cover' is doing there, since it just crops the
// image" - cropping was its entire effect, inherited from the retired
// frame.html. On the caption: "idk about that 'caption' thing. we can also
// drop it." These assert normalise() drops both FIELDS, not merely that it
// rejects bad values - a `fit` that still resolved to 'contain' would leave
// the branch (and the UI control) alive.
describe('retired vocabulary', () => {
  it('drops fit entirely', () => {
    const c = normalise({ fit: 'cover' });
    expect(c.fit).toBeUndefined();
    expect('fit' in c).toBe(false);
  });

  it('drops caption entirely', () => {
    const c = normalise({ caption: 'hello' });
    expect(c.caption).toBeUndefined();
    expect('caption' in c).toBe(false);
  });

  it('ignores a stale cover and still uses the image ratio', () => {
    const c = normalise({ layout: 'web', ratio: '3:2', fit: 'cover' });
    const lay = layout(c, { web: 1440 / 900, mobile: [] });
    expect(lay.web.w / lay.web.h).toBeCloseTo(1440 / 900, 12);
  });
});

// Cycle A Task 5b: SOFTNESS HAS A FLOOR, AND THE FLOOR IS ABOVE ZERO.
//
// Rock, on Task 5's Blur slider: "blur is useless atm... you put it on zero
// and it becomes this weird thing with the 'shadow' being sharp" - and, of
// the same render, "but still weird that we have 2 shadows, no?". Both are
// one artefact. At blur 0 paintShadow's two layers stop being a blur at all
// and become two hard-edged rectangles, offset by `distance` and
// `0.28 * distance`, with a ~40-level step at each edge.
//
// The floor was measured in CHROMIUM, not here: @napi-rs/canvas renders the
// same shadowBlur far fainter and clears the same threshold six times
// sooner, so a Node measurement would have set a floor six times too low -
// the same trap that once let the alphas be retuned to 0.40/0.30 with every
// Node test green. The number and the method are in the plan's Task 5b.
//
// What IS engine-independent, and so is what this file asserts: the clamp
// exists, the bound is above zero, and the shipped default is untouched by
// it.
describe('Task 5b: the softness floor', () => {
  it('is above zero - a floor at zero is not a floor', () => {
    expect(SHADOW_BLUR_RANGE[0]).toBeGreaterThan(0);
  });

  // BOTH assertions, deliberately. `toBe(SHADOW_BLUR_RANGE[0])` alone passed
  // against the pre-change code, because the bound it compares to WAS zero -
  // a test that cannot fail. The second line is what makes it a test.
  it('clamps a zero softness up to the floor instead of drawing a hard edge', () => {
    const blur = normalise({ shadow: { blur: 0 } }).shadow.blur;
    expect(blur).toBe(SHADOW_BLUR_RANGE[0]);
    expect(blur).toBeGreaterThan(0);
  });

  it('clamps a negative softness the same way', () => {
    const blur = normalise({ shadow: { blur: -1 } }).shadow.blur;
    expect(blur).toBe(SHADOW_BLUR_RANGE[0]);
    expect(blur).toBeGreaterThan(0);
  });

  it('leaves the shipped default alone - it sits well above the floor', () => {
    expect(normalise({}).shadow.blur).toBe(SHADOW_DEFAULTS.blur);
    expect(SHADOW_DEFAULTS.blur).toBeGreaterThan(SHADOW_BLUR_RANGE[0]);
  });

  it('still clamps the top end, and the range is not inverted', () => {
    expect(normalise({ shadow: { blur: 99 } }).shadow.blur).toBe(SHADOW_BLUR_RANGE[1]);
    expect(SHADOW_BLUR_RANGE[1]).toBeGreaterThan(SHADOW_BLUR_RANGE[0]);
  });
});
