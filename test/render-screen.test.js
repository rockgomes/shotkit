import { describe, it, expect } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { normalise } from '../core/config.js';
import { layout } from '../core/layout.js';
import { paintGround, paintWeb, paintShadow } from '../core/render.js';

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
  paintWeb(ctx, c, lay.web, img, createCanvas);
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
    paintWeb(ctx, c, lay.web, img, createCanvas);

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

// The bug this suite exists for, and why the test above did not catch it.
//
// Task 1 deleted paintWeb's unconditional hairline, and the test above went
// green - but the rendered shot still had a dark border. There were two
// sources, not one. The second was paintShadow: to make canvas cast a blur it
// must fill an opaque shape, and it filled `box` itself, in black, on exactly
// the geometry the screen is then painted on. Both fills are antialiased on
// that same rounded path, so at the boundary pixel the body covered only `k`
// of the black beneath it and the rest showed through.
//
// The test above samples the first FULLY INTERIOR pixel, where the body's
// coverage is 1 and the black is completely hidden - so it could never see
// this. These tests sample the BOUNDARY pixel, where it lived.
describe('paintShadow leaves no dark rim of its own', () => {
  // A solid ground, so "unchanged" is exact rather than approximate, and a
  // box on deliberately fractional coordinates so every edge is antialiased
  // (on integer coordinates there is no partial coverage and no bug to see).
  const BOX = { x: 100.4, y: 80.6, w: 600, h: 400, radius: 24 };

  function shadowOnly(scale) {
    const cv = createCanvas(900, 700);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 900, 700);
    // Task 5 turned paintShadow's positional spread/blur into a config
    // block of FRACTIONS of a base length. Base 1000 reproduces this
    // suite's original literal 40 / 100 exactly (1000 * 0.040, 1000 * 0.100)
    // — the numbers under test here are unchanged, only how they are passed.
    paintShadow(
      ctx, BOX,
      { scale, distance: 0.040, angle: 90, blur: 0.100, directional: false },
      0.17, 0.07, 1000,
    );
    return ctx;
  }

  it('keeps its opaque source fill clear of the box boundary', () => {
    // This is the invariant for ALL FOUR call sites at once - the unframed
    // screen, the browser frame, and both phone painters all reach the fill
    // through this one function, and every one of them paints an opaque body
    // over `box` afterwards. If the fill stays clear of the boundary here, no
    // caller can leak it, whatever box it passes.
    //
    // The composed framed renders cannot assert this themselves: the browser
    // and phone bodies are near-black, so black bleeding out from under them
    // is indistinguishable from the body itself. That is what made this bug
    // invisible on the frames and glaring on the unframed white screen.
    //
    // shadowScale 0 isolates the fill: the blur contributes literally nothing
    // at alpha 0, so anything that changed a pixel here is the opaque rect.
    // That is also why the bug outlived Task 1 - it was never the shadow.
    const ctx = shadowOnly(0);
    const changed = [];
    for (const [edge, at] of [
      ['left',   (k) => [Math.floor(BOX.x) + k, Math.round(BOX.y + BOX.h / 2)]],
      ['right',  (k) => [Math.floor(BOX.x + BOX.w) - k, Math.round(BOX.y + BOX.h / 2)]],
      ['top',    (k) => [Math.round(BOX.x + BOX.w / 2), Math.floor(BOX.y) + k]],
      ['bottom', (k) => [Math.round(BOX.x + BOX.w / 2), Math.floor(BOX.y + BOX.h) - k]],
    ]) {
      for (let k = 0; k < 2; k++) {
        const [x, y] = at(k);
        const [r, g, b] = px(ctx, x, y);
        if (r !== 128 || g !== 128 || b !== 128) changed.push(`${edge}+${k}@(${x},${y})=${r},${g},${b}`);
      }
    }
    // Unfixed, the fill lands on `box` exactly and all eight of these read
    // black or nearly so - 21,21,21 on the left boundary, 0,0,0 one pixel in.
    expect(changed).toEqual([]);
  });

  it('still casts the shadow it is there to cast', () => {
    // The guard on the guard: if the fill were simply dropped rather than
    // inset, the test above would pass and the product would lose its shadow.
    const ctx = shadowOnly(1);
    const below = px(ctx, Math.round(BOX.x + BOX.w / 2), Math.round(BOX.y + BOX.h) + 20);
    expect(below[0]).toBeLessThan(128);
  });
});

describe('frame: none leaves no dark rim at the box boundary', () => {
  function whiteScene(overrides) {
    const img = createCanvas(1440, 900);
    const ictx = img.getContext('2d');
    ictx.fillStyle = '#ffffff';
    ictx.fillRect(0, 0, 1440, 900);

    const c = normalise({ layout: 'web', ratio: '3:2', frameKind: 'none', ...overrides });
    const lay = layout(c, { web: 1440 / 900, mobile: [] });
    const cv = createCanvas(c.w, c.h);
    const ctx = cv.getContext('2d');
    paintGround(ctx, c, GROUND);
    paintWeb(ctx, c, lay.web, img, createCanvas);
    return { c, box: lay.web, ctx, gctx: groundOnly(c) };
  }

  // Boundary pixel first, then three inward. k = 0 is the partially covered
  // pixel the existing test skips.
  function edgeWalk(box) {
    const midY = Math.round(box.y + box.h / 2);
    const midX = Math.round(box.x + box.w / 2);
    const out = [];
    for (const [edge, at] of [
      ['left',   (k) => [Math.floor(box.x) + k, midY]],
      ['right',  (k) => [Math.floor(box.x + box.w) - k, midY]],
      ['top',    (k) => [midX, Math.floor(box.y) + k]],
      ['bottom', (k) => [midX, Math.floor(box.y + box.h) - k]],
    ]) for (let k = 0; k < 4; k++) out.push([edge, k, ...at(k)]);
    return out;
  }

  it('has no pixel at or inside the edge darker than the ground, per channel (shadow off)', () => {
    // With the shadow off, the ground under the box edge is untouched, so a
    // white screenshot over it can only ever lighten a pixel. Any channel
    // that came back darker is the shadow's opaque fill showing through - the
    // only other thing paintWeb draws near this edge.
    const { box, ctx, gctx } = whiteScene({ shadowScale: 0 });
    const darker = [];
    for (const [edge, k, x, y] of edgeWalk(box)) {
      const p = px(ctx, x, y);
      const g = px(gctx, x, y);
      for (let ch = 0; ch < 3; ch++) {
        if (p[ch] < g[ch]) darker.push(`${edge}+${k}@(${x},${y}) ch${ch} ${p[ch]}<${g[ch]}`);
      }
    }
    // Measured margins with the fill inset: every boundary pixel is 2-19
    // levels LIGHTER than the ground. Unfixed, the left boundary pixel reads
    // 167,166,167 against a 239,234,252 ground - 72 to 85 levels darker.
    expect(darker).toEqual([]);
  });

  it('has no pixel at or inside the edge darker than the ground, at the shipping shadow', () => {
    // Same walk at the default shadowScale of 1, which is what actually
    // ships. Compared on total brightness rather than per channel: the
    // shadow legitimately darkens the ground the boundary pixel is half made
    // of, and on this lilac ground that costs the blue channel a level or
    // two while the pixel as a whole still reads lighter.
    const { box, ctx, gctx } = whiteScene({});
    const sum = (a) => a[0] + a[1] + a[2];
    const darker = [];
    for (const [edge, k, x, y] of edgeWalk(box)) {
      const d = sum(px(ctx, x, y)) - sum(px(gctx, x, y));
      if (d < 0) darker.push(`${edge}+${k}@(${x},${y}) ${d}`);
    }
    // Unfixed, the left boundary pixel reads 166,166,167 against a
    // 239,234,252 ground: -227 on this sum, against a floor of 0.
    expect(darker).toEqual([]);
  });
});

// Cycle A Task 4: paintWeb passes a LITERAL 'contain' to drawFitted. The
// config field it used to read is gone, so this guards the constant rather
// than the field: hand paintWeb a box whose ratio deliberately disagrees
// with the image's, and the image must be letterboxed inside it, never
// scaled up and cropped. drawFitted itself stays - paintPhone still calls it
// with 'cover' for the phone screen, which is a different thing.
describe('paintWeb never crops', () => {
  it('letterboxes into a box whose ratio disagrees with the image, even with a stale fit: cover', () => {
    // 400x200 source (ratio 2.0). The left quarter is red; everything else
    // is white.
    const img = createCanvas(400, 200);
    const ictx = img.getContext('2d');
    ictx.fillStyle = '#ffffff';
    ictx.fillRect(0, 0, 400, 200);
    ictx.fillStyle = '#ff0000';
    ictx.fillRect(0, 0, 100, 200);

    // A tall, narrow box (ratio 0.5) - nothing like the source's 2.0.
    //   contain: the full 400px width maps onto the box's 200px width, so
    //            the box's left edge shows the red column.
    //   cover:   the image is blown up to 800px wide and centred, so the
    //            box's left edge lands at source x=150 - white, and the red
    //            column is cropped off entirely.
    const box = { x: 100, y: 100, w: 200, h: 400, radius: 0, chrome: null };

    const c = normalise({ layout: 'web', ratio: '3:2', fit: 'cover' });
    const cv = createCanvas(c.w, c.h);
    const ctx = cv.getContext('2d');
    paintGround(ctx, c, GROUND);
    paintWeb(ctx, c, box, img, createCanvas);

    const [r, g, b] = px(ctx, box.x + 4, box.y + 4);
    expect(`${r},${g},${b}`).toBe('255,0,0');
  });
});
