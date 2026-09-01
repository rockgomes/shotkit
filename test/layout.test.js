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

// --- Frame regression baseline -------------------------------------------
//
// core/layout.js was closed, fully tested, and the only task across two
// plans to come back from review with zero findings - its numbers were
// verified line-by-line against frame.html, and five frozen golden PNGs
// encode its current output. This block is the guard for that: every value
// below was captured by literally running `layout()` on the UNMODIFIED
// file (commit db689d3, before any frame code existed) with
//
//   node -e "import('./core/config.js').then(async ({normalise}) => {
//     const { layout } = await import('./core/layout.js');
//     ... layout(normalise({ layout, ratio }), { web: 1.6, mobile: [...] })
//   })"
//
// and confirmed to pass against that unmodified file BEFORE any frame code
// was written. It is deep equality (toEqual), not spot checks, against
// every field the pre-frame layout() produced, across every layout mode and
// every ratio - so any accidental change to the "frameKind: 'none'" path
// (a leaked default, a reordered calculation, a changed constant) turns
// this red. The only field these objects don't carry is `chrome` on `web`,
// which is asserted separately as `null` since it did not exist before this
// task added it.
const PRE_FRAME_BASELINE = {
  'web:3:2': {
    safe: { x: 62.4, y: 62.4, w: 1675.2, h: 1075.2 },
    web: { x: 62.4, y: 76.50000000000003, w: 1675.2, h: 1047, radius: 24 },
    phones: [],
    caption: null,
  },
  'mobile:3:2': {
    safe: { x: 62.4, y: 62.4, w: 1675.2, h: 1075.2 },
    web: null,
    phones: [
      { x: 296.8127999999999, y: 153.60000000000002, w: 443.52000000000004, h: 960, frame: 8.42688, radius: 55.440000000000005, innerRadius: 47.01312 },
      { x: 678.24, y: 78, w: 443.52000000000004, h: 960, frame: 8.42688, radius: 55.440000000000005, innerRadius: 47.01312 },
      { x: 1059.6672, y: 153.60000000000002, w: 443.52000000000004, h: 960, frame: 8.42688, radius: 55.440000000000005, innerRadius: 47.01312 },
    ],
    caption: null,
  },
  'webmobile:3:2': {
    safe: { x: 62.4, y: 62.4, w: 1675.2, h: 1075.2 },
    web: { x: 62.4, y: 76.50000000000003, w: 1675.2, h: 1047, radius: 24 },
    phones: [
      { x: 1279.88736, y: 204, w: 476.78400000000005, h: 1032, frame: 9.058896, radius: 59.598000000000006, innerRadius: 50.53910400000001 },
    ],
    caption: null,
  },
  'web:4:3': {
    safe: { x: 78, y: 78, w: 1844, h: 1344 },
    web: { x: 78, y: 173.75, w: 1844, h: 1152.5, radius: 27 },
    phones: [],
    caption: null,
  },
  'mobile:4:3': {
    safe: { x: 78, y: 78, w: 1844, h: 1344 },
    web: null,
    phones: [
      { x: 246.01600000000002, y: 192, w: 554.4, h: 1200, frame: 10.5336, radius: 69.3, innerRadius: 58.7664 },
      { x: 722.8, y: 97.5, w: 554.4, h: 1200, frame: 10.5336, radius: 69.3, innerRadius: 58.7664 },
      { x: 1199.584, y: 192, w: 554.4, h: 1200, frame: 10.5336, radius: 69.3, innerRadius: 58.7664 },
    ],
    caption: null,
  },
  'webmobile:4:3': {
    safe: { x: 78, y: 78, w: 1844, h: 1344 },
    web: { x: 78, y: 173.75, w: 1844, h: 1152.5, radius: 27 },
    phones: [
      { x: 1349.8592, y: 255, w: 595.98, h: 1290, frame: 11.32362, radius: 74.4975, innerRadius: 63.173880000000004 },
    ],
    caption: null,
  },
  'web:16:9': {
    safe: { x: 56.16, y: 56.16, w: 1807.68, h: 967.6800000000001 },
    web: { x: 185.8559999999999, y: 56.16, w: 1548.2880000000002, h: 967.6800000000001, radius: 26 },
    phones: [],
    caption: null,
  },
  'mobile:16:9': {
    safe: { x: 56.16, y: 56.16, w: 1807.68, h: 967.6800000000001 },
    web: null,
    phones: [
      { x: 417.13151999999997, y: 138.24, w: 399.168, h: 864, frame: 7.584192, radius: 49.896, innerRadius: 42.311808 },
      { x: 760.4159999999999, y: 70.19999999999999, w: 399.168, h: 864, frame: 7.584192, radius: 49.896, innerRadius: 42.311808 },
      { x: 1103.7004799999997, y: 138.24, w: 399.168, h: 864, frame: 7.584192, radius: 49.896, innerRadius: 42.311808 },
    ],
    caption: null,
  },
  'webmobile:16:9': {
    safe: { x: 56.16, y: 56.16, w: 1807.68, h: 967.6800000000001 },
    web: { x: 185.8559999999999, y: 56.16, w: 1548.2880000000002, h: 967.6800000000001, radius: 26 },
    phones: [
      { x: 1451.8986240000002, y: 183.60000000000002, w: 429.1056, h: 928.8, frame: 8.153006399999999, radius: 53.6382, innerRadius: 45.4851936 },
    ],
    caption: null,
  },
  'web:1:1': {
    safe: { x: 78, y: 78, w: 1344, h: 1344 },
    web: { x: 78, y: 330, w: 1344, h: 840, radius: 20 },
    phones: [],
    caption: null,
  },
  'mobile:1:1': {
    safe: { x: 78, y: 78, w: 1344, h: 1344 },
    web: null,
    phones: [
      { x: -3.9839999999999804, y: 192, w: 554.4, h: 1200, frame: 10.5336, radius: 69.3, innerRadius: 58.7664 },
      { x: 472.8, y: 97.5, w: 554.4, h: 1200, frame: 10.5336, radius: 69.3, innerRadius: 58.7664 },
      { x: 949.5840000000001, y: 192, w: 554.4, h: 1200, frame: 10.5336, radius: 69.3, innerRadius: 58.7664 },
    ],
    caption: null,
  },
  'webmobile:1:1': {
    safe: { x: 78, y: 78, w: 1344, h: 1344 },
    web: { x: 78, y: 330, w: 1344, h: 840, radius: 20 },
    phones: [
      { x: 849.8592000000001, y: 255, w: 595.98, h: 1290, frame: 11.32362, radius: 74.4975, innerRadius: 63.173880000000004 },
    ],
    caption: null,
  },
};

describe('frame: none (the existing behaviour)', () => {
  const RATIOS = ['3:2', '4:3', '16:9', '1:1'];

  // Strip `web.chrome` from the live output before comparing to the
  // baseline, which predates that field entirely - and assert separately
  // that it's null, per this task's contract for frameKind === 'none'.
  function webWithoutChrome(web) {
    if (web === null) return null;
    expect(web.chrome).toBeNull();
    const { chrome, ...rest } = web;
    return rest;
  }

  for (const ratio of RATIOS) {
    it(`produces exactly the same web-layout output as before, at ${ratio}`, () => {
      const c = normalise({ layout: 'web', ratio });
      const out = layout(c, { web: 1.6, mobile: [] });
      expect({ ...out, web: webWithoutChrome(out.web) }).toEqual(PRE_FRAME_BASELINE[`web:${ratio}`]);
    });

    it(`produces exactly the same mobile-layout output as before, at ${ratio}`, () => {
      const c = normalise({ layout: 'mobile', ratio });
      const out = layout(c, { web: null, mobile: [0.462, 0.462, 0.462] });
      expect(out.web).toBeNull();
      expect(out).toEqual(PRE_FRAME_BASELINE[`mobile:${ratio}`]);
    });

    it(`produces exactly the same web+mobile-layout output as before, at ${ratio}`, () => {
      const c = normalise({ layout: 'web+mobile', ratio });
      const out = layout(c, { web: 1.6, mobile: [0.462] });
      expect({ ...out, web: webWithoutChrome(out.web) }).toEqual(PRE_FRAME_BASELINE[`webmobile:${ratio}`]);
    });
  }
});

describe('frame: browser', () => {
  it('adds a chrome block above the screenshot', () => {
    const c = normalise({ layout: 'web', ratio: '3:2', frameKind: 'browser' });
    const { web } = layout(c, { web: 1.6, mobile: [] });
    expect(web.chrome).not.toBeNull();
    expect(web.chrome.barH).toBeGreaterThan(0);
  });

  it('shrinks the screenshot area by exactly the bar height', () => {
    const c = normalise({ layout: 'web', ratio: '3:2', frameKind: 'browser' });
    const { web } = layout(c, { web: 1.6, mobile: [] });
    expect(web.chrome.screen.h).toBeCloseTo(web.h - web.chrome.barH, 6);
    expect(web.chrome.screen.y).toBeCloseTo(web.y + web.chrome.barH, 6);
    expect(web.chrome.screen.w).toBeCloseTo(web.w, 6);
  });

  it('scales the bar with the canvas, not with fixed pixels', () => {
    // NB: the brief's illustrative snippet for this test omitted
    // `layout: 'web'`, so normalise() would have inferred `layout: 'mobile'`
    // (no `hasWeb` given) and `sources.web` would never have been used -
    // `small.web`/`big.web` would both be null. Added explicitly here so
    // the web branch actually runs.
    const small = layout(normalise({ layout: 'web', ratio: '3:2', frameKind: 'browser' }), { web: 1.6, mobile: [] });
    const big = layout(normalise({ layout: 'web', template: 'dribbble', frameKind: 'browser' }), { web: 1.6, mobile: [] });
    const ratioSmall = small.web.chrome.barH / small.web.w;
    const ratioBig = big.web.chrome.barH / big.web.w;
    expect(ratioSmall).toBeCloseTo(ratioBig, 6);
  });

  it('keeps the outer frame inside the safe box', () => {
    const c = normalise({ layout: 'web', ratio: '3:2', frameKind: 'browser' });
    const { safe, web } = layout(c, { web: 1.6, mobile: [] });
    expect(web.x).toBeGreaterThanOrEqual(safe.x - 1e-6);
    expect(web.y + web.h).toBeLessThanOrEqual(safe.y + safe.h + 1e-6);
  });
});

describe('frame: phone', () => {
  it('has no title bar and uses the phone corner radius', () => {
    const c = normalise({ layout: 'web', ratio: '3:2', frameKind: 'phone' });
    const { web } = layout(c, { web: 0.462, mobile: [] });
    expect(web.chrome.barH).toBe(0);
    expect(web.chrome.radius / web.w).toBeCloseTo(0.125, 3);
  });
});

// --- Fix round 1: `screen` must be the genuine interior for every kind ---
//
// A reviewer caught that `chrome.screen` for 'phone' was the FULL web box
// with no bezel inset, even though `innerRadius = radius - bezel` implied a
// bezel existed - Task 5 would have had to either paint under the bezel or
// re-derive `w * PHONE_BEZEL_RATIO` by hand. Fixed by exposing the bezel as
// `chrome.frame` (matching phoneBox()'s own field name) for every frame
// kind - 0 for 'browser', since the mockup shows the screenshot flush
// inside the wrapper - and insetting `screen` by it on every side.
describe('frame: screen is the genuine interior, for every kind', () => {
  const CASES = [
    ['browser', 1.6],
    ['phone', 0.462],
  ];

  for (const [frameKind, sourceRatio] of CASES) {
    it(`${frameKind}: screen sits fully inside the outer web box`, () => {
      const c = normalise({ layout: 'web', ratio: '3:2', frameKind });
      const { web } = layout(c, { web: sourceRatio, mobile: [] });
      const { screen } = web.chrome;
      expect(screen.x).toBeGreaterThanOrEqual(web.x);
      expect(screen.y).toBeGreaterThanOrEqual(web.y + web.chrome.barH);
      expect(screen.x + screen.w).toBeLessThanOrEqual(web.x + web.w + 1e-6);
      expect(screen.y + screen.h).toBeLessThanOrEqual(web.y + web.h + 1e-6);
    });

    it(`${frameKind}: screen.h === web.h - barH - 2*frame (the exact inset relation)`, () => {
      const c = normalise({ layout: 'web', ratio: '3:2', frameKind });
      const { web } = layout(c, { web: sourceRatio, mobile: [] });
      const { barH, frame, screen } = web.chrome;
      // Fails if `screen` were left as the full box (frame unsubtracted):
      // for 'phone' that would make screen.h === web.h, not web.h - 2*frame.
      expect(screen.h).toBeCloseTo(web.h - barH - frame * 2, 6);
      expect(screen.w).toBeCloseTo(web.w - frame * 2, 6);
      expect(screen.x).toBeCloseTo(web.x + frame, 6);
      expect(screen.y).toBeCloseTo(web.y + barH + frame, 6);
    });
  }

  it('phone has a non-zero frame; browser has none (per the mockup)', () => {
    const phone = layout(normalise({ layout: 'web', ratio: '3:2', frameKind: 'phone' }), { web: 0.462, mobile: [] });
    const browser = layout(normalise({ layout: 'web', ratio: '3:2', frameKind: 'browser' }), { web: 1.6, mobile: [] });
    expect(phone.web.chrome.frame).toBeGreaterThan(0);
    expect(browser.web.chrome.frame).toBe(0);
  });
});

// --- Fix round 2: the frame must be sized FROM the screenshot, not the
// other way round -----------------------------------------------------
//
// Round 1 fit the *frame* into the safe box using the source ratio, then
// carved `screen` out of it by subtracting the bar/bezel - leaving `screen`
// at a DIFFERENT aspect ratio than the source image, which would force
// Task 5 to letterbox, crop or stretch the screenshot inside its own frame.
// A real browser window is sized BY its content: frame width = screenshot
// width, frame height = screenshot height + bar height (+ bezel, for
// phone), and THAT assembly is what gets fitted into the safe box. This
// block pins the fix: `screen` must always come back at the source ratio.
describe('frame: screen always matches the source ratio (contain)', () => {
  const CASES = [
    ['browser', 1.6],
    ['browser', 0.5],
    ['phone', 0.462],
    ['phone', 2.2],
  ];

  for (const [frameKind, sourceRatio] of CASES) {
    it(`${frameKind} @ source ratio ${sourceRatio}: screen.w/screen.h === source ratio`, () => {
      const c = normalise({ layout: 'web', ratio: '3:2', frameKind });
      const { web } = layout(c, { web: sourceRatio, mobile: [] });
      expect(web.chrome.screen.w / web.chrome.screen.h).toBeCloseTo(sourceRatio, 6);
    });
  }
});

describe('frame: cover is untouched - the frame still fills the box and the screenshot crops', () => {
  for (const frameKind of ['browser', 'phone']) {
    it(`${frameKind}: with fit 'cover', the frame fills the safe box exactly (screen may not match the source ratio)`, () => {
      const c = normalise({ layout: 'web', ratio: '3:2', fit: 'cover', frameKind });
      const { safe, web } = layout(c, { web: 2.5, mobile: [] });
      expect(web.w).toBeCloseTo(safe.w, 6);
      expect(web.h).toBeCloseTo(safe.h, 6);
    });
  }
});

describe('frame: accepted consequence — the visible screenshot is smaller than an unframed one, at the same settings', () => {
  // Sizing the frame FROM the content (so `screen` keeps the source ratio)
  // means the bar/bezel eats into space that used to be all screenshot.
  // The OUTER frame can still be as large as the safe box allows (it may
  // even fill it in one dimension) - it's the INTERIOR `screen`, the part
  // that actually shows the UI, that shrinks. Pinned here so nobody "fixes"
  // this later thinking it's regression: it's the direct, intended result
  // of sizing the frame by its content instead of the other way round.
  const CASES = [
    ['browser', 1.6],
    ['phone', 0.462],
  ];

  for (const [frameKind, sourceRatio] of CASES) {
    it(`${frameKind}: chrome.screen has less area than the equivalent unframed web box`, () => {
      const unframed = layout(normalise({ layout: 'web', ratio: '3:2' }), { web: sourceRatio, mobile: [] }).web;
      const framed = layout(normalise({ layout: 'web', ratio: '3:2', frameKind }), { web: sourceRatio, mobile: [] }).web;
      const unframedArea = unframed.w * unframed.h;
      const screenArea = framed.chrome.screen.w * framed.chrome.screen.h;
      expect(screenArea).toBeLessThan(unframedArea);
    });
  }
});
