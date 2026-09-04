import { describe, it, expect } from 'vitest';
import { normalise } from '../core/config.js';
import { layout } from '../core/layout.js';
import { MIN_MARGIN_RATIO, BROWSER_BAR_RATIO } from '../core/presets.js';

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
  it('never crops: keeps the source ratio inside the box', () => {
    const c = cfg({ ratio: '3:2' });
    const { safe, web } = layout(c, { web: 2.5, mobile: [] });   // wider than the box
    expect(web.w / web.h).toBeCloseTo(2.5, 6);
    expect(web.w).toBeLessThanOrEqual(safe.w + 1e-6);
    expect(web.h).toBeLessThanOrEqual(safe.h + 1e-6);
  });

  it('handles a source taller than the box', () => {
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

// Cycle A Task 4: the caption is retired. `caption` is not a key that is
// always null - it is not a key at all, which is what `in` checks here. A
// `caption: null` left on the object would keep render.js's `if
// (lay.caption)` call site alive and give the field somewhere to come back.
describe('caption is gone from the layout', () => {
  it('returns no caption key, even when a stale caption is passed in', () => {
    for (const input of [{}, { caption: 'hello' }]) {
      const out = layout(cfg(input), { web: 1.6, mobile: [] });
      expect('caption' in out, JSON.stringify(input)).toBe(false);
    }
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
  },
  'mobile:3:2': {
    safe: { x: 62.4, y: 62.4, w: 1675.2, h: 1075.2 },
    web: null,
    phones: [
      { x: 296.8127999999999, y: 153.60000000000002, w: 443.52000000000004, h: 960, frame: 8.42688, radius: 55.440000000000005, innerRadius: 47.01312 },
      { x: 678.24, y: 78, w: 443.52000000000004, h: 960, frame: 8.42688, radius: 55.440000000000005, innerRadius: 47.01312 },
      { x: 1059.6672, y: 153.60000000000002, w: 443.52000000000004, h: 960, frame: 8.42688, radius: 55.440000000000005, innerRadius: 47.01312 },
    ],
  },
  'webmobile:3:2': {
    safe: { x: 62.4, y: 62.4, w: 1675.2, h: 1075.2 },
    web: { x: 62.4, y: 76.50000000000003, w: 1675.2, h: 1047, radius: 24 },
    phones: [
      { x: 1279.88736, y: 204, w: 476.78400000000005, h: 1032, frame: 9.058896, radius: 59.598000000000006, innerRadius: 50.53910400000001 },
    ],
  },
  'web:4:3': {
    safe: { x: 78, y: 78, w: 1844, h: 1344 },
    web: { x: 78, y: 173.75, w: 1844, h: 1152.5, radius: 27 },
    phones: [],
  },
  'mobile:4:3': {
    safe: { x: 78, y: 78, w: 1844, h: 1344 },
    web: null,
    phones: [
      { x: 246.01600000000002, y: 192, w: 554.4, h: 1200, frame: 10.5336, radius: 69.3, innerRadius: 58.7664 },
      { x: 722.8, y: 97.5, w: 554.4, h: 1200, frame: 10.5336, radius: 69.3, innerRadius: 58.7664 },
      { x: 1199.584, y: 192, w: 554.4, h: 1200, frame: 10.5336, radius: 69.3, innerRadius: 58.7664 },
    ],
  },
  'webmobile:4:3': {
    safe: { x: 78, y: 78, w: 1844, h: 1344 },
    web: { x: 78, y: 173.75, w: 1844, h: 1152.5, radius: 27 },
    phones: [
      { x: 1349.8592, y: 255, w: 595.98, h: 1290, frame: 11.32362, radius: 74.4975, innerRadius: 63.173880000000004 },
    ],
  },
  'web:16:9': {
    safe: { x: 56.16, y: 56.16, w: 1807.68, h: 967.6800000000001 },
    web: { x: 185.8559999999999, y: 56.16, w: 1548.2880000000002, h: 967.6800000000001, radius: 26 },
    phones: [],
  },
  'mobile:16:9': {
    safe: { x: 56.16, y: 56.16, w: 1807.68, h: 967.6800000000001 },
    web: null,
    phones: [
      { x: 417.13151999999997, y: 138.24, w: 399.168, h: 864, frame: 7.584192, radius: 49.896, innerRadius: 42.311808 },
      { x: 760.4159999999999, y: 70.19999999999999, w: 399.168, h: 864, frame: 7.584192, radius: 49.896, innerRadius: 42.311808 },
      { x: 1103.7004799999997, y: 138.24, w: 399.168, h: 864, frame: 7.584192, radius: 49.896, innerRadius: 42.311808 },
    ],
  },
  'webmobile:16:9': {
    safe: { x: 56.16, y: 56.16, w: 1807.68, h: 967.6800000000001 },
    web: { x: 185.8559999999999, y: 56.16, w: 1548.2880000000002, h: 967.6800000000001, radius: 26 },
    phones: [
      { x: 1451.8986240000002, y: 183.60000000000002, w: 429.1056, h: 928.8, frame: 8.153006399999999, radius: 53.6382, innerRadius: 45.4851936 },
    ],
  },
  'web:1:1': {
    safe: { x: 78, y: 78, w: 1344, h: 1344 },
    web: { x: 78, y: 330, w: 1344, h: 840, radius: 20 },
    phones: [],
  },
  'mobile:1:1': {
    safe: { x: 78, y: 78, w: 1344, h: 1344 },
    web: null,
    phones: [
      { x: -3.9839999999999804, y: 192, w: 554.4, h: 1200, frame: 10.5336, radius: 69.3, innerRadius: 58.7664 },
      { x: 472.8, y: 97.5, w: 554.4, h: 1200, frame: 10.5336, radius: 69.3, innerRadius: 58.7664 },
      { x: 949.5840000000001, y: 192, w: 554.4, h: 1200, frame: 10.5336, radius: 69.3, innerRadius: 58.7664 },
    ],
  },
  'webmobile:1:1': {
    safe: { x: 78, y: 78, w: 1344, h: 1344 },
    web: { x: 78, y: 330, w: 1344, h: 840, radius: 20 },
    phones: [
      { x: 849.8592000000001, y: 255, w: 595.98, h: 1290, frame: 11.32362, radius: 74.4975, innerRadius: 63.173880000000004 },
    ],
  },
};

describe('frame: none (the existing behaviour)', () => {
  const RATIOS = ['3:2', '4:3', '16:9', '1:1'];

  // Strip the fields the baseline predates before comparing - and assert
  // each one's no-frame, no-stroke value first, so nothing is dropped
  // blindly: `chrome` is null per this task's contract, `strokeWidth` is
  // exactly 0 (Task 7's default style is 'none'), and `inner` is the box's
  // own rect, which is the whole claim that a mat of zero width costs the
  // picture nothing.
  function webWithoutFrameFields(web) {
    if (web === null) return null;
    expect(web.chrome).toBeNull();
    expect(web.strokeWidth).toBe(0);
    expect(web.inner).toEqual({ x: web.x, y: web.y, w: web.w, h: web.h, radius: web.radius });
    const { chrome, strokeWidth, inner, ...rest } = web;
    return rest;
  }

  for (const ratio of RATIOS) {
    it(`produces exactly the same web-layout output as before, at ${ratio}`, () => {
      const c = normalise({ layout: 'web', ratio });
      const out = layout(c, { web: 1.6, mobile: [] });
      expect({ ...out, web: webWithoutFrameFields(out.web) }).toEqual(PRE_FRAME_BASELINE[`web:${ratio}`]);
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
      expect({ ...out, web: webWithoutFrameFields(out.web) }).toEqual(PRE_FRAME_BASELINE[`webmobile:${ratio}`]);
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

  // Was "keeps the outer frame inside the safe box". Cycle A Task 6 replaced
  // that invariant deliberately: the composite is now allowed to eat the
  // padding (that is the whole point - see "frames grow outward" below), and
  // the only box it may not cross is the canvas less MIN_MARGIN_RATIO. The
  // guard is kept, retargeted at the invariant that actually holds now, so
  // the frame still cannot run off the canvas.
  it('keeps the composite inside the canvas less the minimum margin', () => {
    const c = normalise({ layout: 'web', ratio: '3:2', frameKind: 'browser' });
    const { web } = layout(c, { web: 1.6, mobile: [] });
    const m = MIN_MARGIN_RATIO * Math.min(c.w, c.h);
    expect(web.x).toBeGreaterThanOrEqual(m - 1e-6);
    expect(web.y).toBeGreaterThanOrEqual(m - 1e-6);
    expect(web.x + web.w).toBeLessThanOrEqual(c.w - m + 1e-6);
    expect(web.y + web.h).toBeLessThanOrEqual(c.h - m + 1e-6);
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
describe('frame: screen always matches the source ratio', () => {
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

// --- Cycle A Task 6 reverses round 2's "accepted consequence" -----------
//
// This block used to assert the opposite: that `chrome.screen` had LESS area
// than the equivalent unframed box, because the frame was fitted into the
// safe box and the bar/bezel was carved out of the screenshot. Rock's
// verdict on seeing it was "it resizes the image inside for some reason",
// and Task 6 made frames outsets instead. The assertion is inverted rather
// than deleted, so nothing can quietly reintroduce the carve-out: with the
// frame growing outward, the phone's interior is EXACTLY the unframed box.
describe('frame: the screenshot is no longer shrunk by its own frame', () => {
  it('phone: chrome.screen is exactly the unframed web box', () => {
    const src = 1.6;
    const unframed = layout(normalise({ layout: 'web', ratio: '3:2' }), { web: src, mobile: [] }).web;
    const framed = layout(normalise({ layout: 'web', ratio: '3:2', frameKind: 'phone' }), { web: src, mobile: [] }).web;
    expect(framed.chrome.screen.w).toBe(unframed.w);
    expect(framed.chrome.screen.h).toBe(unframed.h);
  });
});

// --- Cycle A Task 6: frames are OUTSETS ---------------------------------
//
// Round one fitted the FRAME into the safe box and carved the screenshot out
// of it, so turning a frame on shrank the picture. Rock's call: the
// screenshot keeps its size and the frame grows outward, eating the padding.
// `screen` is now the STARTING point (fitted to the safe box at the source
// ratio) and the composite is screen + insets, fitted only to the canvas
// less MIN_MARGIN_RATIO. That floor is the only thing that can still shrink
// the picture, and then it shrinks the whole composite uniformly.
//
// Two source ratios below, both real screen sizes and both deliberate:
//
//   SRC (2880x1720 = 1.67442) — samples/fieldset.png's own ratio, i.e. the
//     exact source every framed golden is rendered from. At 3:2 / default
//     padding the composite clears the floor for every frame kind, so the
//     screenshot is EXACTLY unchanged. This is the acceptance case, and the
//     numbers here are the numbers in the goldens and in the preview.
//     Deliberately NOT 16:9 (1.7778): at that ratio the OLD model happened
//     to leave the screenshot unshrunk too (the old frame fit was
//     width-constrained there, and frameRatio's round trip is exact), so it
//     could not tell the two models apart. 1.67442 is inside the band where
//     the old model shrank the picture by 4.5% and the new one does not.
//   FLOORED_SRC (16:10, 1.6) — the same canvas, but the browser bar
//     (BROWSER_BAR_RATIO ~ 7.5% of the screen width, the "comically big" bar
//     Task 8 rebuilds) pushes the composite past the floor, so the whole
//     thing scales down ~1.8%. Pinned so the floor's behaviour is asserted
//     rather than assumed, and so Task 8's smaller bar shows up here.
const SRC = 2880 / 1720;
const FLOORED_SRC = 1440 / 900;
const FRAME_KINDS_ALL = ['none', 'browser', 'phone'];

describe('frames grow outward', () => {
  it('the interior keeps the source ratio exactly (regression guard, green before Task 6)', () => {
    for (const frameKind of FRAME_KINDS_ALL) {
      for (const src of [SRC, FLOORED_SRC, 0.462]) {
        const c = normalise({ layout: 'web', ratio: '3:2', frameKind });
        const lay = layout(c, { web: src, mobile: [] });
        const screen = lay.web.chrome ? lay.web.chrome.screen : lay.web;
        expect(screen.w / screen.h, `${frameKind} @ ${src}`).toBeCloseTo(src, 12);
      }
    }
  });

  it('turning on a frame does not shrink the screenshot — none, browser and phone are identical', () => {
    const bare = layout(normalise({ layout: 'web', ratio: '3:2', frameKind: 'none' }),
                        { web: SRC, mobile: [] }).web;
    for (const frameKind of ['browser', 'phone']) {
      const framed = layout(normalise({ layout: 'web', ratio: '3:2', frameKind }),
                            { web: SRC, mobile: [] }).web;
      // Exact, not approximate: `screen` is the same computation in both
      // paths, multiplied by a shrink factor of exactly 1 when the floor
      // does not bind, so the doubles are bit-identical. This is the
      // acceptance criterion for the whole task.
      expect(framed.chrome.screen.w, `${frameKind} width`).toBe(bare.w);
      expect(framed.chrome.screen.h, `${frameKind} height`).toBe(bare.h);
    }
  });

  it('the composite is allowed past the safe box — the padding is what gives way', () => {
    const safe = layout(normalise({ layout: 'web', ratio: '3:2' }), { web: SRC, mobile: [] }).safe;
    // Phone: a bezel on all four sides, so the composite is wider than the
    // safe box the bare screenshot exactly filled.
    const phone = layout(normalise({ layout: 'web', ratio: '3:2', frameKind: 'phone' }),
                         { web: SRC, mobile: [] }).web;
    expect(phone.w).toBeGreaterThan(safe.w);
    expect(phone.x).toBeLessThan(safe.x);
    // Browser: a bar above, so the composite is taller than the safe box.
    const browser = layout(normalise({ layout: 'web', ratio: '3:2', frameKind: 'browser' }),
                           { web: FLOORED_SRC, mobile: [] }).web;
    expect(browser.h).toBeGreaterThan(safe.h);
    expect(browser.y).toBeLessThan(safe.y);
  });

  it('the composite grows outward from the screenshot, not into it', () => {
    const lay = layout(normalise({ layout: 'web', ratio: '3:2', frameKind: 'browser' }),
                       { web: SRC, mobile: [] });
    expect(lay.web.h).toBeGreaterThan(lay.web.chrome.screen.h);
    expect(lay.web.y).toBeLessThan(lay.web.chrome.screen.y);
  });

  // THE PREMISE MOVED TWICE, AND THE ASSERTION NEVER DID. Turning a browser
  // frame on used to cross MIN_MARGIN_RATIO all by itself at the default
  // padding. Task 8 took the bar from 7.5% of the window width to 4.1%, and
  // then to 3.1% at Rock's "about 1/4 shorter" - so it now fits inside the
  // default padding twice over. That is the feature working, not a
  // regression, so this test chases a config where the floor still binds
  // rather than loosening what it checks.
  //
  // `pad: 0.02` puts the safe box exactly on the floor, and a SQUARE source
  // makes height the binding dimension: the screenshot already fills the
  // safe box's full height, so any bar at all has to push past it.
  const SQUARE_SRC = 1;
  it('scales the whole composite uniformly when the floor does bind', () => {
    const bare = layout(normalise({ layout: 'web', ratio: '3:2', frameKind: 'none', pad: 0.02 }),
                        { web: SQUARE_SRC, mobile: [] }).web;
    const framed = layout(normalise({ layout: 'web', ratio: '3:2', frameKind: 'browser', pad: 0.02 }),
                          { web: SQUARE_SRC, mobile: [] }).web;
    expect(framed.w).toBeLessThan(bare.w);   // the floor really did bind
    const screen = framed.chrome.screen;
    // Uniform: width and height lose the same factor, so the picture is
    // scaled, never squashed.
    expect(screen.w / bare.w).toBeCloseTo(screen.h / bare.h, 12);
    // And the loss is small — a floor, not the old carve-out. Round one's
    // model lost 8.3% of the screen width here; this must stay under 5%.
    expect(screen.w / bare.w).toBeGreaterThan(0.95);
    expect(screen.w / bare.w).toBeLessThan(1);
  });

  it('never exceeds the canvas less the minimum margin', () => {
    // A deliberately extreme case: a phone frame on a very tall source with
    // almost no padding, where the composite would otherwise run off the
    // canvas.
    const c = normalise({ layout: 'web', ratio: '1:1', frameKind: 'phone', pad: 0.005 });
    const lay = layout(c, { web: 0.3, mobile: [] });
    const m = MIN_MARGIN_RATIO * Math.min(c.w, c.h);
    expect(lay.web.x).toBeGreaterThanOrEqual(m - 1e-9);
    expect(lay.web.y).toBeGreaterThanOrEqual(m - 1e-9);
    expect(lay.web.x + lay.web.w).toBeLessThanOrEqual(c.w - m + 1e-9);
    expect(lay.web.y + lay.web.h).toBeLessThanOrEqual(c.h - m + 1e-9);
  });
});

// --- Strokes (Cycle A Task 7) --------------------------------------------
//
// The stroke is the OUTERMOST outset: it wraps the frame, not the other way
// round. These assert the accumulation, not the painting - see
// test/render-stroke.test.js for what reaches the canvas.
describe('stroke insets', () => {
  const SW = 1200 * 0.02;   // shorter canvas side at 3:2, x the stroke width

  it('grows the composite on all four sides and leaves the screenshot alone', () => {
    const bare = layout(normalise({ layout: 'web', ratio: '3:2' }), { web: 1.6, mobile: [] });
    const mat = layout(
      normalise({ layout: 'web', ratio: '3:2', stroke: { style: 'light', width: 0.02 } }),
      { web: 1.6, mobile: [] },
    );
    expect(mat.web.strokeWidth).toBeCloseTo(SW, 9);
    expect(mat.web.w).toBeCloseTo(bare.web.w + SW * 2, 9);
    expect(mat.web.h).toBeCloseTo(bare.web.h + SW * 2, 9);
    expect(mat.web.inner.w).toBeCloseTo(bare.web.w, 9);
    expect(mat.web.inner.h).toBeCloseTo(bare.web.h, 9);
    // Still centred: the mat grew equally on the left and the right.
    expect(mat.web.x + mat.web.w / 2).toBeCloseTo(bare.web.x + bare.web.w / 2, 9);
  });

  it('does not make the browser title bar taller', () => {
    const bare = layout(
      normalise({ layout: 'web', ratio: '3:2', frameKind: 'browser' }), { web: 1.6, mobile: [] });
    const mat = layout(
      normalise({ layout: 'web', ratio: '3:2', frameKind: 'browser', stroke: { style: 'light', width: 0.02 } }),
      { web: 1.6, mobile: [] },
    );
    // NOT `barH` equality: at 3:2 a browser composite already crosses
    // MIN_MARGIN_RATIO, so adding a mat makes the whole thing scale down
    // uniformly - bar, screenshot and mat together. What must hold is the
    // PROPORTION: the bar stays BROWSER_BAR_RATIO of the screenshot's own
    // width, which is exactly what a mat leaking into the bar would break.
    for (const out of [bare, mat]) {
      expect(out.web.chrome.barH)
        .toBeCloseTo(out.web.chrome.screen.w * BROWSER_BAR_RATIO, 9);
    }
    // The screenshot starts a full stroke further in than it used to.
    expect(mat.web.chrome.screen.x - mat.web.x).toBeCloseTo(mat.web.strokeWidth, 9);
  });

  it('does not make the phone bezel thicker, and keeps the corners concentric', () => {
    const bare = layout(
      normalise({ layout: 'web', ratio: '3:2', frameKind: 'phone' }), { web: 0.462, mobile: [] });
    const mat = layout(
      normalise({ layout: 'web', ratio: '3:2', frameKind: 'phone', stroke: { style: 'light', width: 0.02 } }),
      { web: 0.462, mobile: [] },
    );
    expect(mat.web.chrome.frame).toBeCloseTo(bare.web.chrome.frame, 9);
    expect(mat.web.chrome.bodyRadius).toBeCloseTo(mat.web.chrome.radius - SW, 9);
    expect(mat.web.chrome.innerRadius)
      .toBeCloseTo(mat.web.chrome.bodyRadius - mat.web.chrome.frame, 9);
  });

  it('scales down uniformly rather than inverting at the maximum width', () => {
    const mat = layout(
      normalise({ layout: 'web', ratio: '3:2', stroke: { style: 'light', width: 99 } }),
      { web: 1.6, mobile: [] },
    );
    expect(mat.web.inner.w).toBeGreaterThan(0);
    expect(mat.web.inner.h).toBeGreaterThan(0);
    expect(mat.web.inner.radius).toBeGreaterThanOrEqual(0);
    // The floor held: the composite still clears MIN_MARGIN_RATIO.
    expect(mat.web.x).toBeGreaterThanOrEqual(1800 * 0 + 1200 * 0.02 - 1e-9);
  });
});

// --- Cycle B Task 2: the readers move onto the element block -------------
//
// THE REAL ACCEPTANCE TEST FOR THIS TASK IS THE GOLDEN SET. It is a pure
// refactor: `npx vitest run && git status --short test/golden` reporting
// nothing is the claim. These two only pin the new plumbing.
describe('layout reads the element block, not the flat fields (Task 2)', () => {
  it('an element override changes the layout; the flat field alone still works', () => {
    const flat = layout(normalise({ layout: 'web', ratio: '3:2', frameKind: 'browser' }),
                        { web: 1.6, mobile: [] });
    const viaBlock = layout(normalise({
      layout: 'web', ratio: '3:2', elements: { web: { frameKind: 'browser' } },
    }), { web: 1.6, mobile: [] });
    expect(viaBlock.web.chrome.barH).toBeCloseTo(flat.web.chrome.barH, 9);
    expect(viaBlock.web.chrome.barH).toBeGreaterThan(0);
  });

  // THE PLAN GOT THIS ONE BACKWARDS, and the first version could not fail.
  // It set the web element to 'none' and the mobile element to 'browser'
  // with no flat key at all - which today leaves `c.frameKind` at its own
  // default of 'none', so `chrome` is null before the fix and after it.
  // Green either way is not a test. The flat key has to be 'browser', so
  // that only an element override reading correctly can produce null.
  it("an element override beats the flat key, and the other element's does not leak", () => {
    const out = layout(normalise({
      layout: 'web', ratio: '3:2',
      frameKind: 'browser',
      elements: { web: { frameKind: 'none' }, mobile: { frameKind: 'phone' } },
    }), { web: 1.6, mobile: [] });
    expect(out.web.chrome).toBeNull();
  });
});
