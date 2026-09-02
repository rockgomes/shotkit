import { describe, it, expect, beforeEach } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import pixelmatch from 'pixelmatch';
import { state, bindCanvas, render } from '../web/state.js';
import { normalise, layout as coreLayout } from '../core/index.js';

// Task 3 (export) drives THE SAME render() Task 2 wired up for the live
// preview, just with state.config.scale temporarily pointed at 2 or 3 (see
// web/export.js) - it never calls composeWithMeta itself and never
// stretches a finished canvas. core/'s own scale test
// (test/compose.test.js, "is a faithful enlargement at scale 2") already
// proves this holds at the ONE canvas size every golden PNG in
// test/golden/render covers: 3:2, 1800x1200. That leaves a real gap the
// brief for this task calls out explicitly: nothing anywhere pixel-verifies
// scale fidelity at any OTHER size, and every geometric quantity core/
// computes (padding, radius, the screenshot's own box) is expressed as a
// fraction of the canvas it was HANDED, not of some canonical 1800x1200 -
// so a stray fixed-pixel literal would only show its face at a size that
// isn't 1800x1200. This test deliberately renders at 4:3 (2000x1500) - a
// size with no golden coverage at all - specifically to give that kind of
// bug somewhere to hide that isn't already covered.
//
// Two checks, deliberately different in what they can see:
//
// 1. A whole-canvas diff: export at 1x/2x/3x, downscale the larger ones back
//    to the 1x pixel size, and diff against the REAL 1x export. This is a
//    broad "still roughly the same picture" smoke test - useful, but it was
//    tried against a REAL injected bug while writing this file (paintWeb's
//    rounded-rect clip hardcoded to a fixed 24px radius instead of
//    `box.radius`, at core/render.js:356) and it did NOT go red: the corner
//    arc a fixed-radius bug distorts is a few hundred pixels out of a
//    3,000,000-pixel canvas, so even a visibly-wrong radius barely nudges a
//    whole-image diff fraction. Kept below anyway because a bug that IS
//    widespread (a mis-scaled pad, a grain tile at a fixed px size) would
//    still show up here - just annotated honestly about the one shape of
//    bug it can't see.
//
// 2. A direct measurement of the painted corner radius itself, in test 2
//    below - the check that actually caught the injected bug above. It
//    computes the EXPECTED radius the same way composeWithMeta does
//    (normalise + layout, scaled exactly as core/index.js documents), then
//    scans the real rendered pixels along the 45-degree diagonal into the
//    screenshot box's own corner to find where the arc actually starts,
//    converts that back to a radius, and compares. This is what "actually
//    look, don't just check dimensions" (the task brief) means in test form.
const mk = (w, h) => createCanvas(w, h);

function downscaleTo(sourceCanvas, w, h) {
  const out = createCanvas(w, h);
  out.getContext('2d').drawImage(sourceCanvas, 0, 0, w, h);
  return out;
}

beforeEach(() => {
  state.config = { ratio: '4:3' };
  state.images = { web: null, mobile: [] };
  state.meta = null;
  state.surround = 'mid';
});

// This file gets its own timeout, above vitest.config.js's suite-wide 20s.
//
// It is the most expensive test in the suite by a wide margin: the first case
// composes the SAME shot at 1x, 2x and 3x, and 3x of a 2000x1500 canvas is
// 6000x4500 - 27 megapixels through @napi-rs/canvas - then pixel-diffs it
// against a downscale. That is legitimately slow, not hung, and it is the
// whole point of the test.
//
// Measured on the dev machine (x64 Mac, same architecture CI pins):
//
//   standalone, 3 runs        5.3s / 6.5s / 5.3s   (first case)
//   under full-suite load     9.5s                 (first case)
//
// 9.5s against a 20s budget is 2.1x headroom, and CI's shared macos-15-intel
// runner is slower than this machine - so it timed out there while every
// local run passed. Timings before and after Cycle A Task 4b were measured
// and are identical (5.4s vs 5.3s standalone), so this is a budget that was
// always marginal, not a regression.
//
// 90s is ~9x the measured full-suite worst case. It is deliberately scoped to
// this file rather than raised globally: the other 320 tests run in
// milliseconds and should keep a tight budget, because for them a 20s hang IS
// the bug signal. If this needs raising again, remeasure first - do not just
// bump it.
const SCALE_TEST_TIMEOUT = 90_000;

describe('export scale fidelity - the property no golden PNG can see', { timeout: SCALE_TEST_TIMEOUT }, () => {
  it('2x and 3x renders are exactly proportional in size and the same composition as 1x, at a canvas size no golden PNG covers', async () => {
    const web = await loadImage('samples/fieldset.png');
    const target = createCanvas(10, 10);
    bindCanvas(target, mk);
    state.images.web = web;

    state.config.scale = 1;
    render();
    const w1 = target.width;
    const h1 = target.height;
    expect([w1, h1]).toEqual([2000, 1500]); // sanity: this IS the non-golden size

    const at1x = mk(w1, h1);
    at1x.getContext('2d').drawImage(target, 0, 0);
    const a = at1x.getContext('2d').getImageData(0, 0, w1, h1);

    for (const scale of [2, 3]) {
      state.config.scale = scale;
      render();

      // Dimensions: exactly scale x, not "close to".
      expect(target.width).toBe(w1 * scale);
      expect(target.height).toBe(h1 * scale);

      const down = downscaleTo(target, w1, h1);
      const b = down.getContext('2d').getImageData(0, 0, w1, h1);

      const numDiff = pixelmatch(a.data, b.data, null, w1, h1, { threshold: 0.1 });
      const fraction = numDiff / (w1 * h1);
      expect(fraction).toBeLessThan(0.01);
    }
  });

  it('the screenshot box corner radius itself scales exactly with scale, measured in the actual painted pixels', async () => {
    // bgType: 'solid' + tone: 'mid' (the same trick core/'s own scale test
    // uses, test/compose.test.js) gives a flat mid-lightness ground that is
    // nowhere close to white - grain: 0 keeps the diagonal scan below from
    // tripping on noise near its white-fill threshold. Neither affects
    // radius or layout, only what colour surrounds the box, which is the
    // whole point: it makes "is this pixel inside the box's white fill yet"
    // an unambiguous question.
    const config = { ratio: '4:3', bgType: 'solid', tone: 'mid', grain: 0 };
    const web = await loadImage('samples/fieldset.png');
    const target = createCanvas(10, 10);
    bindCanvas(target, mk);
    state.config = { ...config };
    state.images.web = web;

    for (const scale of [1, 2, 3]) {
      state.config.scale = scale;
      render();

      // The expected box, derived the exact way composeWithMeta itself
      // derives `rc` before calling layout() (see core/index.js) - not a
      // re-implementation of that logic, a literal copy of its two lines,
      // so this can never drift out of sync with what compose actually
      // does.
      const c = normalise({ ...config, scale, hasWeb: true, mobileCount: 0 });
      const rc = c.scale === 1 ? c : { ...c, w: c.w * c.scale, h: c.h * c.scale, radius: c.radius * c.scale };
      const box = coreLayout(rc, { web: web.width / web.height, mobile: [] }).web;

      const ctx = target.getContext('2d');
      const { data } = ctx.getImageData(0, 0, target.width, target.height);
      const width = target.width;

      // Walk outward from the box's own bounding-box corner (box.x, box.y)
      // along the (1,1) diagonal. For a quarter-circle corner of radius r
      // centred at (box.x+r, box.y+r), that diagonal crosses into the
      // circle at distance r*(sqrt(2)-1) from the corner point - geometry,
      // not a magic number: solve |t/sqrt2 - r| = r/sqrt2 for the point
      // where the diagonal's distance to the centre first equals r.
      // paintWeb fills the box with pure #ffffff before drawing the
      // screenshot into it (core/render.js), so "first opaque near-white
      // pixel" is exactly the arc boundary, regardless of the screenshot's
      // own content.
      let crossingDistance = null;
      for (let d = 0; d < box.radius * 2 + 20; d += 0.5) {
        const x = Math.round(box.x + d / Math.SQRT2);
        const y = Math.round(box.y + d / Math.SQRT2);
        if (x < 0 || y < 0 || x >= width || y >= target.height) break;
        const idx = (y * width + x) * 4;
        if (data[idx] > 250 && data[idx + 1] > 250 && data[idx + 2] > 250 && data[idx + 3] > 250) {
          crossingDistance = d;
          break;
        }
      }

      expect(crossingDistance, `scale ${scale}: never found the box's white fill along the diagonal`).not.toBeNull();
      const measuredRadius = crossingDistance / (Math.SQRT2 - 1);

      // A few px of slack for antialiasing at the arc boundary - not for
      // the radius being systematically off. box.radius is ~27px at scale
      // 1 and ~81px at scale 3 (RADIUS_RATIO * 2000, then x scale) - 6px is
      // generous for antialiasing but would catch a fixed-pixel radius bug
      // outright: that failure mode is off by tens of px at scale 2/3, not
      // a handful.
      expect(Math.abs(measuredRadius - box.radius)).toBeLessThan(6);
    }
  });
});
