import { describe, it, expect } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { normalise } from '../core/config.js';
import { layout } from '../core/layout.js';
import { paintGround, paintWeb } from '../core/render.js';

const GROUND = ['#f7f4ff', '#ece6fb', '#ded3f5'];

function px(ctx, x, y) {
  const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
  return [d[0], d[1], d[2]];
}

async function scene(overrides = {}) {
  const img = await loadImage('samples/fieldset.png');
  const c = normalise({ layout: 'web', ratio: '3:2', ...overrides });
  const lay = layout(c, { web: img.width / img.height, mobile: [] });
  const cv = createCanvas(c.w, c.h);
  const ctx = cv.getContext('2d');
  paintGround(ctx, c, GROUND);
  paintWeb(ctx, c, lay.web, img);
  return { c, lay, ctx, img };
}

function groundOnly(c) {
  const cv = createCanvas(c.w, c.h);
  const ctx = cv.getContext('2d');
  paintGround(ctx, c, GROUND);
  return ctx;
}

describe('paintWeb', () => {
  it('paints inside the screen box', async () => {
    const { c, lay, ctx } = await scene();

    // Comparing two DIFFERENT points (e.g. (10,10) vs the screen centre)
    // cannot prove paintWeb did anything - the ground gradient itself
    // varies by position with or without a screen painted over it, so that
    // comparison would still pass with paintWeb deleted entirely. Instead,
    // sample the SAME coordinate from a ground-only render and require the
    // painted canvas to differ from it there.
    const gctx = groundOnly(c);
    const x = lay.web.x + lay.web.w / 2;
    const y = lay.web.y + lay.web.h / 2;
    const inside = px(ctx, x, y);
    const groundAtSamePoint = px(gctx, x, y);

    expect(inside).not.toEqual(groundAtSamePoint);

    // Stronger, content-specific check: fieldset.png's UI is white at this
    // coordinate (verified against the fixture), while the ground gradient
    // never reaches near-white this far from its highlight corner. So the
    // screen interior being near-white specifically requires the screenshot
    // to have been drawn here, not just some incidental pixel change (a
    // shadow, a stray stroke, off-by-one geometry, etc).
    expect(Math.min(...inside)).toBeGreaterThanOrEqual(250);
    expect(Math.min(...groundAtSamePoint)).toBeLessThan(250);
  });

  it('leaves the corners rounded, not square', async () => {
    const { lay, ctx } = await scene();
    // 2px inside the bounding-box corner is outside a 24px radius
    const corner = px(ctx, lay.web.x + 2, lay.web.y + 2);
    const centre = px(ctx, lay.web.x + lay.web.w / 2, lay.web.y + 20);
    expect(corner).not.toEqual(centre);
  });

  it('darkens the ground below the screen with a shadow, by a bounded amount', async () => {
    const { c, lay, ctx } = await scene();
    const gctx = groundOnly(c);

    const y = Math.min(c.h - 2, lay.web.y + lay.web.h + 12);
    const x = lay.web.x + lay.web.w / 2;
    const sum = a => a.reduce((p, q) => p + q, 0);
    const diff = sum(px(gctx, x, y)) - sum(px(ctx, x, y));

    // Some darkening must be present...
    expect(diff).toBeGreaterThan(0);

    // ...but bounded to a measured range. Under @napi-rs/canvas (the engine
    // this suite runs on) at frame.html's own alphas (0.17 / 0.07), this
    // exact point darkens by ~16 (sum of R+G+B delta, measured directly).
    // The bounds below have headroom for minor engine/version drift, but
    // must still catch:
    //   - a doubled alpha pair (0.34/0.14 measures ~54 here) - this is the
    //     regression this test exists to catch, per the round-1 incident
    //     where the alphas were wrongly tuned up to compensate for a
    //     napi-rs-only rendering quirk and all tests stayed green;
    //   - a near-zero regression (e.g. an accidentally tiny or zeroed
    //     alpha measures ~0-6 here).
    // See core/render.js's paintShadow/paintWeb comments for why alphas
    // must stay at frame.html's values and never be retuned against a
    // napi-rs measurement.
    expect(diff).toBeGreaterThan(8);
    expect(diff).toBeLessThan(30);
  });

  it('is deterministic', async () => {
    const a = await scene();
    const b = await scene();
    const ga = Array.from(a.ctx.getImageData(0, 0, 400, 400).data);
    const gb = Array.from(b.ctx.getImageData(0, 0, 400, 400).data);
    expect(ga).toEqual(gb);
  });
});

// Task 6b: shadowScale is a MULTIPLIER over the verified 0.17/0.07 alphas
// above, never a replacement for them - this measures the same point the
// "darkens...by a bounded amount" test above does, at scale values away
// from the default 1, to prove the multiplier actually reaches paintShadow
// (core/render.js) rather than being threaded to a config field nothing
// reads.
describe('paintWeb - shadowScale (Task 6b)', () => {
  function darkeningAt(c, lay, ctx) {
    const gctx = groundOnly(c);
    const y = Math.min(c.h - 2, lay.web.y + lay.web.h + 12);
    const x = lay.web.x + lay.web.w / 2;
    const sum = (a) => a.reduce((p, q) => p + q, 0);
    return sum(px(gctx, x, y)) - sum(px(ctx, x, y));
  }

  it('scale 0 removes the shadow entirely - no darkening at all', async () => {
    const { c, lay, ctx } = await scene({ shadowScale: 0 });
    expect(darkeningAt(c, lay, ctx)).toBe(0);
  });

  it('scale 2 darkens measurably more than the default (scale 1), never less', async () => {
    // Measured directly (same harness as the bounded-amount test above):
    // scale 1 darkens by ~16 here, scale 2 by ~54. Quantization keeps this
    // from being an exact 2x, so the assertion checks direction and a
    // generous floor rather than a precise ratio - the golden-based guard
    // in test/compose.test.js is what pins the exact pixels.
    const atDefault = await scene({ shadowScale: 1 });
    const atDouble = await scene({ shadowScale: 2 });
    const defaultDarkening = darkeningAt(atDefault.c, atDefault.lay, atDefault.ctx);
    const doubleDarkening = darkeningAt(atDouble.c, atDouble.lay, atDouble.ctx);

    expect(defaultDarkening).toBeGreaterThan(8);
    expect(defaultDarkening).toBeLessThan(30); // same bound as the test above
    expect(doubleDarkening).toBeGreaterThan(defaultDarkening);
    expect(doubleDarkening).toBeGreaterThan(40);
  });

  it('an out-of-range scale is clamped by normalise(), never reaching paintShadow unclamped', async () => {
    // core/config.js clamps to SHADOW_SCALE_RANGE ([0, 2]) before paintShadow
    // ever sees it - a caller asking for 999 gets exactly the scale-2
    // darkening above, not something far more extreme.
    const atDouble = await scene({ shadowScale: 2 });
    const atRunaway = await scene({ shadowScale: 999 });
    const doubleDarkening = darkeningAt(atDouble.c, atDouble.lay, atDouble.ctx);
    const runawayDarkening = darkeningAt(atRunaway.c, atRunaway.lay, atRunaway.ctx);
    expect(runawayDarkening).toBe(doubleDarkening);
  });
});

describe('frame: none draws no stroke', () => {
  it('leaves no darker ring just inside the screen edge', async () => {
    // A pure white source image. With no stroke, every pixel just inside the
    // box edge must be white - a hairline would darken the first row/column.
    const img = createCanvas(1440, 900);
    const ictx = img.getContext('2d');
    ictx.fillStyle = '#ffffff';
    ictx.fillRect(0, 0, 1440, 900);

    const c = normalise({ layout: 'web', ratio: '3:2', frameKind: 'none' });
    const lay = layout(c, { web: 1440 / 900, mobile: [] });
    const cv = createCanvas(c.w, c.h);
    const ctx = cv.getContext('2d');
    paintGround(ctx, c, GROUND);
    paintWeb(ctx, c, lay.web, img);

    const b = lay.web;
    const midY = Math.round(b.y + b.h / 2);
    const midX = Math.round(b.x + b.w / 2);

    // The FIRST FULLY INTERIOR pixel on each edge - not two pixels in. The
    // hairline was stroked at `box.x + 0.5` with `lineWidth: 1`, so it
    // straddles the box boundary and lands on exactly this pixel and the
    // partially-covered one outside it. Sampling further in (the plan said
    // 2px) clears the hairline entirely and the test cannot fail.
    for (const [x, y, edge] of [
      [Math.ceil(b.x), midY, 'left'],
      [Math.floor(b.x + b.w) - 1, midY, 'right'],
      [midX, Math.ceil(b.y), 'top'],
      [midX, Math.floor(b.y + b.h) - 1, 'bottom'],
    ]) {
      const [r, g, bl] = px(ctx, x, y);
      expect(`${edge}:${r},${g},${bl}`).toBe(`${edge}:255,255,255`);
    }
  });
});
