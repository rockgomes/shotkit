// test/render-shadow.test.js — Cycle A Task 5.
//
// THE ISOLATED SHADOW GOLDEN, AND WHY IT IS NOT A WHOLE-SHOT GOLDEN.
//
// paintShadow's alphas have been broken once already: a pass retuned them
// against @napi-rs/canvas (0.17/0.07 -> 0.40/0.30), every Node test stayed
// green, and Chromium — the actual product — would have shipped a shadow
// ~65 RGB levels too dark. It was caught only because a reviewer measured
// Chromium by hand. frame.html, the original reference, is deleted, so
// those numbers cannot be re-derived from anything.
//
// Every whole-shot golden under test/golden/render/ has legitimately moved
// several times during Cycle A (Tasks 1, 4b, 4c, 4d), so a shadow
// regression could ride along inside a diff that was expected anyway. This
// golden cannot hide one: nothing but the shadow is drawn in it.
//
// The comparison technique is test/compose.test.js's, unchanged — loadImage
// the PNG, draw it into a canvas, pixelmatch the two ImageDatas at
// threshold 0. No new dependency (no pngjs): core/ has zero runtime
// dependencies and this round adds none on the test side either.
import { describe, it, expect } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import pixelmatch from 'pixelmatch';
import { existsSync } from 'node:fs';
import { normalise } from '../core/config.js';
import { paintShadow, phoneShadow } from '../core/render.js';
import { SHADOW_DEFAULTS, PHONE_SHADOW_DISTANCE_RATIO, PHONE_SHADOW_BLUR_RATIO }
  from '../core/presets.js';

const W = 1800, H = 1200;
// Identical to scripts/make-shadow-golden.js. If either moves, both move.
const BOX = { x: 300, y: 220, w: 1200, h: 760, radius: 24 };
const GOLDEN = 'test/golden/shadow/default.png';

function blank() {
  const cv = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  return ctx;
}

function render(shadow, a1 = 0.17, a2 = 0.07) {
  const ctx = blank();
  paintShadow(ctx, BOX, shadow, a1, a2, H);
  return ctx;
}

async function diffAgainstGolden(ctx) {
  expect(existsSync(GOLDEN), `missing ${GOLDEN} — run scripts/make-shadow-golden.js`).toBe(true);
  const ref = await loadImage(GOLDEN);
  const rc = createCanvas(ref.width, ref.height);
  rc.getContext('2d').drawImage(ref, 0, 0);
  const a = ctx.getImageData(0, 0, W, H);
  const b = rc.getContext('2d').getImageData(0, 0, ref.width, ref.height);
  return pixelmatch(a.data, b.data, null, W, H, { threshold: 0 });
}

describe('shadow defaults are frozen', () => {
  it('reproduces the pre-refactor shadow exactly', async () => {
    const c = normalise({});
    expect(await diffAgainstGolden(render(c.shadow))).toBe(0);
  });

  // The two checks below are the point of the golden. A golden that matches
  // itself proves only that the renderer is deterministic; these prove it
  // would actually have caught the two things this task could break.
  it('the golden actually discriminates — a nudged distance fails it', async () => {
    const c = normalise({});
    const nudged = { ...c.shadow, distance: c.shadow.distance * 1.1 };
    expect(await diffAgainstGolden(render(nudged))).toBeGreaterThan(0);
  });

  it('the golden catches an alpha change', async () => {
    const c = normalise({});
    // 0.17 -> 0.20 on the direct layer only: three hundredths, the size of
    // the nudge nobody notices, not the 0.40/0.30 blow-out.
    expect(await diffAgainstGolden(render(c.shadow, 0.20, 0.07))).toBeGreaterThan(0);
  });

  it('the golden catches a blur change too', async () => {
    const c = normalise({});
    const softer = { ...c.shadow, blur: c.shadow.blur * 1.1 };
    expect(await diffAgainstGolden(render(softer))).toBeGreaterThan(0);
  });
});

describe('the config block', () => {
  it('normalise() defaults are exactly the spec values', () => {
    expect(normalise({}).shadow).toEqual({
      scale: 1, distance: 0.040, angle: 90, blur: 0.105, directional: false,
    });
  });

  it('a top-level shadowScale still folds into shadow.scale, clamped', () => {
    expect(normalise({ shadowScale: 1.6 }).shadow.scale).toBeCloseTo(1.6, 6);
    expect(normalise({ shadowScale: 99 }).shadow.scale).toBe(2);
    expect(normalise({ shadowScale: -5 }).shadow.scale).toBe(0);
    expect(normalise({ shadowScale: 'nonsense' }).shadow.scale).toBe(1);
    // shadow.scale wins when both are given — the specific beats the legacy.
    expect(normalise({ shadowScale: 1.6, shadow: { scale: 0.5 } }).shadow.scale).toBe(0.5);
  });

  it('distance and blur clamp at both ends, angle wraps', () => {
    expect(normalise({ shadow: { distance: -1 } }).shadow.distance).toBe(0);
    expect(normalise({ shadow: { distance: 99 } }).shadow.distance).toBe(0.20);
    expect(normalise({ shadow: { blur: -1 } }).shadow.blur).toBe(0);
    expect(normalise({ shadow: { blur: 99 } }).shadow.blur).toBe(0.40);
    expect(normalise({ shadow: { angle: 450 } }).shadow.angle).toBe(90);
    expect(normalise({ shadow: { angle: -90 } }).shadow.angle).toBe(270);
  });

  it('directional is strictly boolean true, never a truthy string', () => {
    expect(normalise({ shadow: { directional: true } }).shadow.directional).toBe(true);
    expect(normalise({ shadow: { directional: 'yes' } }).shadow.directional).toBe(false);
    expect(normalise({}).shadow.directional).toBe(false);
  });
});

describe('directional', () => {
  // Sample points are stated as offsets from BOX's own edges and asserted to
  // be OUTSIDE the box, because paintShadow clips the box out of itself —
  // a point inside it is white no matter what the shadow does, and would
  // make any of these pass vacuously.
  const px = (ctx, x, y) => {
    expect(
      x < BOX.x || x > BOX.x + BOX.w || y < BOX.y || y > BOX.y + BOX.h,
      `sample (${x},${y}) is INSIDE the box, where the clip guarantees white`,
    ).toBe(true);
    const d = ctx.getImageData(x, y, 1, 1).data;
    return d[0];
  };

  const LEFT = Math.round(BOX.x) - 30;             // 270, left of x=300
  const RIGHT = Math.round(BOX.x + BOX.w) + 30;    // 1530, right of x+w=1500
  const MIDY = Math.round(BOX.y + BOX.h / 2);      // 600

  it('with directional OFF, angle changes nothing', async () => {
    const c = normalise({});
    const east = { ...c.shadow, angle: 0 };
    expect(await diffAgainstGolden(render(east))).toBe(0);
  });

  it('with directional ON at the default angle 90, the output is still the golden', async () => {
    // 90 degrees is straight down, which is exactly what the non-directional
    // construction already did. Turning the toggle on at the default angle
    // must therefore move nothing at all.
    const c = normalise({ shadow: { directional: true } });
    expect(await diffAgainstGolden(render(c.shadow))).toBe(0);
  });

  it('with directional ON, angle 0 throws the shadow to the right', async () => {
    const c = normalise({ shadow: { directional: true, angle: 0 } });
    const ctx = render(c.shadow);
    const left = px(ctx, LEFT, MIDY);
    const right = px(ctx, RIGHT, MIDY);
    // Darker means a LOWER red channel on white.
    expect(right).toBeLessThan(left);
  });

  it('with directional ON, angle 180 throws it to the left', async () => {
    const c = normalise({ shadow: { directional: true, angle: 180 } });
    const ctx = render(c.shadow);
    expect(px(ctx, LEFT, MIDY)).toBeLessThan(px(ctx, RIGHT, MIDY));
  });

  it('the same two points are symmetric when directional is OFF', async () => {
    // The break-it check for the two above: without this, "right is darker
    // than left" could be true of the default shadow as well and the angle
    // would be proving nothing.
    const ctx = render(normalise({}).shadow);
    const left = px(ctx, LEFT, MIDY);
    const right = px(ctx, RIGHT, MIDY);
    // Non-vacuity first: both points must actually be IN the shadow. Without
    // this, a paintShadow that drew nothing at all would satisfy the equality
    // below (255 === 255) and every directional assertion above would be
    // resting on a blank canvas.
    expect(left, 'the left sample is untouched white — the shadow never reached it').toBeLessThan(255);
    expect(right, 'the right sample is untouched white — the shadow never reached it').toBeLessThan(255);
    expect(left).toBe(right);
  });
});

describe('the phone shot keeps its own, larger shadow basis', () => {
  // core/render.js's paintPhone has ALWAYS measured its shadow against the
  // PHONE's height, not the canvas's: box.h * 0.055 and box.h * 0.14, with
  // alphas 0.22/0.10. (The plan's Task 5 sketch says all four call sites
  // pass c.h * 0.040 / c.h * 0.105; three do, this one never did.) Folding
  // it onto the canvas basis would have quietly changed every mobile shot,
  // so instead the user's distance/blur are carried across as RATIOS of
  // their own defaults. At the defaults that ratio is exactly 1, so the
  // phone's numbers come out exactly as they were.
  it('reproduces box.h * 0.055 and box.h * 0.14 exactly at the defaults', () => {
    const s = phoneShadow(normalise({}).shadow);
    expect(s.distance).toBe(PHONE_SHADOW_DISTANCE_RATIO);
    expect(s.blur).toBe(PHONE_SHADOW_BLUR_RATIO);
    expect(s.distance).toBe(0.055);
    expect(s.blur).toBe(0.14);
  });

  it('scales proportionally with the user\'s own setting', () => {
    const doubled = phoneShadow({ ...SHADOW_DEFAULTS, distance: 0.080, blur: 0.210 });
    expect(doubled.distance).toBeCloseTo(0.055 * 2, 12);
    expect(doubled.blur).toBeCloseTo(0.14 * 2, 12);
  });

  it('carries angle, directional and scale through untouched', () => {
    const s = phoneShadow({ scale: 0.5, distance: 0.040, angle: 217, blur: 0.105, directional: true });
    expect(s.angle).toBe(217);
    expect(s.directional).toBe(true);
    expect(s.scale).toBe(0.5);
  });
});
