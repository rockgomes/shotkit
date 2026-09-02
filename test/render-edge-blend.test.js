import { describe, it, expect } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { normalise } from '../core/config.js';
import { layout } from '../core/layout.js';
import { paintGround, paintWeb, roundRect } from '../core/render.js';

/**
 * THE BOUNDARY PIXEL, MEASURED AGAINST A COMPUTED IDEAL (Cycle A Task 4c).
 *
 * Rock reported a light line around his shot three times. Task 1 deleted an
 * unconditional hairline and Task 4b fixed a Chromium clip leak; both were
 * real, neither was this. What was left is a one-pixel halo on all four
 * edges of an opaque screenshot, worst at the corners.
 *
 * Why the earlier guards could not see it. They asserted "no pure white" and
 * sampled the first FULLY INTERIOR pixel. The leak is neither: it lives in
 * the partially-covered boundary pixel itself, and it is a blend, so it is
 * never 255,255,255. Measured on a flat #1e1e1e shot over a ~179 ground,
 * `frame: none`: interior 30, boundary 159, ground 179, where an honest
 * coverage blend is 104. Fifty-five levels of leak, and invisible to every
 * assertion in the suite.
 *
 * So this file computes the ideal instead of eyeballing a threshold:
 *
 *   ideal = k * shot + (1 - k) * backdrop
 *
 * with both terms measured rather than assumed.
 *
 *   `k` comes from `coverage()` below - a render of the same path, filled.
 *   NOT the geometric fraction: skia's analytic antialiasing does not always
 *   agree with it (0.502 where the geometry says 0.600, on the browser
 *   frame's bottom edge), and a test that assumed geometry would report a
 *   defect where the rasteriser simply disagrees with a ruler.
 *
 *   `backdrop` comes from re-rendering the identical scene with a fully
 *   TRANSPARENT source. Same ground, same shadow, same frame, same
 *   everything - minus the screenshot. Whatever is legitimately behind the
 *   shot at that pixel is exactly what that render shows there.
 *
 * The result is an assertion with no tuned constant in it, on all four edges
 * and around a corner, for `frame: none`, `browser` and `phone`.
 */

const GROUND = ['#f7f4ff', '#ece6fb', '#ded3f5'];

// A ground deliberately far from BOTH failure colours, for the transparency
// cases at the bottom of this file: mid-tone, so a white fill (255) and the
// shadow's opaque black caster (0) are each ~170 levels away and neither can
// hide inside "close enough to the ground".
const GROUND_MID = ['#4a6b7c', '#3a5464', '#2b3f4c'];

const SRC_W = 1440, SRC_H = 900;
const SHOT = 30;            // #1e1e1e, flat: one number for every channel

function flatSource(hex) {
  const cv = createCanvas(SRC_W, SRC_H);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, SRC_W, SRC_H);
  return cv;
}

// Never drawn, never painted: a source whose every pixel is alpha 0.
function transparentSource() {
  return createCanvas(SRC_W, SRC_H);
}

/**
 * A macOS window capture in miniature: an opaque body with genuinely
 * transparent rounded corners, and a soft alpha shadow bleeding out of them.
 * This is the shape Rock's own screengrabs have, and the reason "just delete
 * the white fill" is not the whole fix - something honest has to be behind
 * the picture, or the corners show whatever the shadow pass left there.
 */
function windowCaptureSource() {
  const cv = createCanvas(SRC_W, SRC_H);
  const ctx = cv.getContext('2d');
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#1e1e1e';
  roundRect(ctx, 40, 40, SRC_W - 80, SRC_H - 80, 120);
  ctx.fill();
  ctx.restore();
  return cv;
}

function scene(frameKind, image, stops = GROUND) {
  const c = normalise({ layout: 'web', ratio: '3:2', frameKind });
  const lay = layout(c, { web: SRC_W / SRC_H, mobile: [] });
  const cv = createCanvas(c.w, c.h);
  const ctx = cv.getContext('2d');
  paintGround(ctx, c, stops);
  paintWeb(ctx, c, lay.web, image, stops);
  return { c, box: lay.web, ctx };
}

function groundOnly(c, stops) {
  const cv = createCanvas(c.w, c.h);
  const ctx = cv.getContext('2d');
  paintGround(ctx, c, stops);
  return ctx;
}

function px(ctx, x, y) {
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2]];
}

/**
 * The rasteriser's own coverage for a rounded rect, as a 0..1 sampler. Fills
 * the path white on black and reads the level back; verified identical to
 * the coverage a `ctx.clip()` of the same path produces, which is the mask
 * paintWeb actually draws through.
 */
function coverage(c, rect, radius) {
  const cv = createCanvas(c.w, c.h);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, c.w, c.h);
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, radius);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  return (x, y) => ctx.getImageData(x, y, 1, 1).data[0] / 255;
}

// The four boundary pixels: the row/column each edge actually lands in.
function edgePixels(rect) {
  const midX = Math.round(rect.x + rect.w / 2);
  const midY = Math.round(rect.y + rect.h / 2);
  return [
    ['left',   Math.floor(rect.x),          midY],
    ['right',  Math.floor(rect.x + rect.w), midY],
    ['top',    midX, Math.floor(rect.y)],
    ['bottom', midX, Math.floor(rect.y + rect.h)],
  ];
}

// Every partially-covered pixel in a window - the corner arc, where coverage
// is most partial and the halo was worst.
function partialPixels(k, x0, y0, w, h) {
  const out = [];
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const cov = k(x, y);
      if (cov > 0.03 && cov < 0.97) out.push([x, y, cov]);
    }
  }
  return out;
}

// The arc of one corner of `rect`, as a window big enough to hold it.
function cornerWindow(rect, radius, corner = 'top-left') {
  const span = Math.ceil(radius) + 6;
  const left = Math.floor(rect.x) - 2;
  const top = Math.floor(rect.y) - 2;
  const bottom = Math.floor(rect.y + rect.h) + 2 - span;
  return corner === 'bottom-left' ? [left, bottom, span, span] : [left, top, span, span];
}

/**
 * `frame: none` - the case Rock measured. Nothing is painted over the
 * screenshot here, so the ideal is exact and the tolerance can be tight.
 */
describe('frame: none — the shot blends into the ground at its own edge', () => {
  const shot = scene('none', flatSource('#1e1e1e'));
  const bare = scene('none', transparentSource());
  const k = coverage(shot.c, shot.box, shot.box.radius);

  for (const [edge, x, y] of edgePixels(shot.box)) {
    it(`${edge} edge lands on the ideal coverage blend`, () => {
      const cov = k(x, y);
      // If this ever stops being a partially covered pixel the assertion
      // below would be vacuous, so say so out loud first.
      expect(cov, `${edge} sample is not on the boundary`).toBeGreaterThan(0.05);
      expect(cov).toBeLessThan(0.95);

      const backdrop = px(bare.ctx, x, y);
      const actual = px(shot.ctx, x, y);
      const ideal = backdrop.map(v => cov * SHOT + (1 - cov) * v);

      actual.forEach((v, i) => {
        expect(
          Math.abs(v - ideal[i]),
          `${edge} channel ${i}: got ${v}, ideal ${ideal[i].toFixed(1)} ` +
          `(shot ${SHOT} at ${cov.toFixed(3)} over backdrop ${backdrop[i]})`,
        ).toBeLessThanOrEqual(3);
      });
    });
  }

  it('the corner arc neither lightens nor darkens, pixel by pixel or on average', () => {
    const pixels = partialPixels(k, ...cornerWindow(shot.box, shot.box.radius));
    expect(pixels.length, 'no partially covered corner pixels found').toBeGreaterThan(20);

    const errors = pixels.map(([x, y, cov]) => {
      const backdrop = px(bare.ctx, x, y)[0];
      const actual = px(shot.ctx, x, y)[0];
      return actual - (cov * SHOT + (1 - cov) * backdrop);
    });

    const mean = errors.reduce((a, b) => a + b, 0) / errors.length;
    const worst = Math.max(...errors.map(Math.abs));
    // Mean is the "no NET lightening or darkening" half; worst is the "and
    // not one bad pixel either" half. A halo shows up in both.
    expect(Math.abs(mean), `mean signed error ${mean.toFixed(2)}`).toBeLessThanOrEqual(2);
    expect(worst, `worst pixel off by ${worst.toFixed(1)}`).toBeLessThanOrEqual(6);
  });
});

/**
 * The phone frame's screen. Its boundary is an interior one - the device's
 * own bezel is behind it - and nothing is painted over it either, so this is
 * as exact as `frame: none`. The white fill here read as a white ring inside
 * a dark bezel, which is the same bug at a different radius.
 */
describe('phone frame — the screenshot blends into the bezel at the screen edge', () => {
  const shot = scene('phone', flatSource('#1e1e1e'));
  const bare = scene('phone', transparentSource());
  const screen = shot.box.chrome.screen;
  const radius = shot.box.chrome.innerRadius;
  const k = coverage(shot.c, screen, radius);

  for (const [edge, x, y] of edgePixels(screen)) {
    it(`${edge} screen edge lands on the ideal coverage blend`, () => {
      const cov = k(x, y);
      expect(cov, `${edge} sample is not on the boundary`).toBeGreaterThan(0.05);
      expect(cov).toBeLessThan(0.95);

      const backdrop = px(bare.ctx, x, y);
      const actual = px(shot.ctx, x, y);
      const ideal = backdrop.map(v => cov * SHOT + (1 - cov) * v);

      actual.forEach((v, i) => {
        expect(
          Math.abs(v - ideal[i]),
          `${edge} channel ${i}: got ${v}, ideal ${ideal[i].toFixed(1)} ` +
          `(shot ${SHOT} at ${cov.toFixed(3)} over bezel ${backdrop[i]})`,
        ).toBeLessThanOrEqual(3);
      });
    });
  }

  it('the screen corner arc neither lightens nor darkens', () => {
    const pixels = partialPixels(k, ...cornerWindow(screen, radius));
    expect(pixels.length).toBeGreaterThan(20);
    const errors = pixels.map(([x, y, cov]) => {
      const backdrop = px(bare.ctx, x, y)[0];
      return px(shot.ctx, x, y)[0] - (cov * SHOT + (1 - cov) * backdrop);
    });
    const mean = errors.reduce((a, b) => a + b, 0) / errors.length;
    const worst = Math.max(...errors.map(Math.abs));
    expect(Math.abs(mean), `mean signed error ${mean.toFixed(2)}`).toBeLessThanOrEqual(2);
    expect(worst, `worst pixel off by ${worst.toFixed(1)}`).toBeLessThanOrEqual(6);
  });
});

/**
 * The browser frame, measured differently and deliberately so.
 *
 * Its screenshot is flush with the frame on the left, right and bottom
 * (chromeFor gives the browser no bezel), and the frame draws its own 1px
 * hairline border straight over that edge pixel - `border:1px solid` from
 * the handoff, ported in Task 8's predecessor and not this task's to remove.
 * Under an overlay the "ideal blend" identity above no longer holds: the
 * hairline is painted over the screenshot but only ever over the backdrop in
 * the transparent-source reference, so the two renders stop being comparable
 * by a linear blend. The bar does the same thing along the top.
 *
 * What still holds, and is what the bug was, is COVERAGE: the screenshot has
 * to reach the boundary pixel as fully as the path does. Rendering the same
 * scene with two different flat sources isolates exactly that - everything
 * that is not the screenshot cancels, overlays included:
 *
 *   out(S) = a * S + b   =>   a = (out(light) - out(dark)) / (light - dark)
 *
 * Pre-fix `a` was k squared (the clip's antialiasing multiplied by
 * drawImage's own), i.e. 60% of what it should be. The hairline can only
 * scale it by (1 - 0.09), so 0.85 of the path's coverage is a floor with
 * real room under it, not a fudged threshold.
 */
describe('browser frame — the screenshot reaches its own boundary pixel', () => {
  const DARK = 20, LIGHT = 200;                 // #141414 and #c8c8c8
  const dark = scene('browser', flatSource('#141414'));
  const light = scene('browser', flatSource('#c8c8c8'));
  const outer = { x: dark.box.x, y: dark.box.y, w: dark.box.w, h: dark.box.h };
  const k = coverage(dark.c, outer, dark.box.chrome.radius);

  const shotCoverage = (x, y) =>
    (px(light.ctx, x, y)[0] - px(dark.ctx, x, y)[0]) / (LIGHT - DARK);

  const screen = dark.box.chrome.screen;
  const [, , , [, bottomX, bottomY]] = edgePixels(outer);

  for (const [edge, x, y] of [
    ['left',   Math.floor(outer.x),            Math.round(outer.y + outer.h / 2)],
    ['right',  Math.floor(outer.x + outer.w),  Math.round(outer.y + outer.h / 2)],
    ['bottom', bottomX, bottomY],
  ]) {
    it(`${edge} edge: the screenshot covers it as fully as the frame's own path does`, () => {
      const path = k(x, y);
      expect(path, `${edge} sample is not on the boundary`).toBeGreaterThan(0.05);
      expect(path).toBeLessThan(0.95);
      const a = shotCoverage(x, y);
      expect(
        a,
        `${edge}: screenshot coverage ${a.toFixed(3)} against path coverage ${path.toFixed(3)}`,
      ).toBeGreaterThanOrEqual(path * 0.85);
    });
  }

  it('top edge: the screenshot meets the bar instead of leaving a line of it', () => {
    // The bar's bottom edge is a fillRect, whose coverage IS the geometric
    // fraction, so no path render is needed for this one.
    const x = Math.round(screen.x + screen.w / 2);
    const y = Math.floor(screen.y);
    const geometric = 1 - (screen.y - Math.floor(screen.y));
    expect(geometric).toBeGreaterThan(0.05);
    const a = shotCoverage(x, y);
    expect(
      a,
      `top: screenshot coverage ${a.toFixed(3)} against the bar's own edge ${geometric.toFixed(3)}`,
    ).toBeGreaterThanOrEqual(geometric * 0.85);
  });

  it('corner arc: the screenshot covers it too', () => {
    // The BOTTOM-left arc: the top corners are under the bar, which is
    // painted over the screenshot and would cancel out of this measurement.
    const arc = partialPixels(k, ...cornerWindow(outer, dark.box.chrome.radius, 'bottom-left'));
    expect(arc.length, 'no partially covered corner pixels found').toBeGreaterThan(20);
    const short = arc.filter(([x, y, cov]) => shotCoverage(x, y) < cov * 0.85);
    expect(
      short.map(([x, y, cov]) => `(${x},${y}) path ${cov.toFixed(2)} shot ${shotCoverage(x, y).toFixed(2)}`),
    ).toEqual([]);
  });
});

/**
 * Transparency. A macOS window capture carries transparent corners and an
 * alpha shadow, and whatever is behind the picture shows through them. It
 * must be the backdrop - not the white card this used to paint, and not the
 * opaque black rect paintShadow casts from, which is what a naive "delete
 * the white fill" leaves exposed.
 */
describe('a transparent source shows the ground, not a fill and not the shadow', () => {
  it('frame: none — the transparent corner reads as ground', () => {
    const { c, box, ctx } = scene('none', windowCaptureSource(), GROUND_MID);
    const ref = groundOnly(c, GROUND_MID);

    // 30px diagonally inside the box's top-left corner. Inside the shot's
    // OWN rounded corner - 6px in is not, it falls outside the r=24 arc, and
    // an earlier draft of this test sampled plain ground there and passed
    // against the white fill it was written to catch. Well outside the
    // capture's own 120px corner radius, and ~70px from its alpha shadow.
    const x = Math.round(box.x) + 30;
    const y = Math.round(box.y) + 30;

    const actual = px(ctx, x, y);
    const ground = px(ref, x, y);
    actual.forEach((v, i) => {
      expect(
        Math.abs(v - ground[i]),
        `channel ${i}: got ${v}, ground ${ground[i]}`,
      ).toBeLessThanOrEqual(4);
    });
    // Said explicitly, because these are the two ways it has actually been
    // wrong: a white card in front of the ground, and the shadow's caster
    // behind it.
    expect(Math.max(...actual), 'a near-white fill is showing through').toBeLessThan(200);
    expect(Math.min(...actual), 'the shadow caster is showing through').toBeGreaterThan(25);
  });

  it('browser frame — the transparent corner reads as ground, not the theme body', () => {
    const { c, box, ctx } = scene('browser', windowCaptureSource(), GROUND_MID);
    const ref = groundOnly(c, GROUND_MID);
    const screen = box.chrome.screen;

    const x = Math.round(screen.x) + 30;
    const y = Math.round(screen.y) + 30;

    const actual = px(ctx, x, y);
    const ground = px(ref, x, y);
    actual.forEach((v, i) => {
      expect(
        Math.abs(v - ground[i]),
        `channel ${i}: got ${v}, ground ${ground[i]}`,
      ).toBeLessThanOrEqual(4);
    });
    // #ffffff in the light theme, #101114 in the dark one: both must be gone.
    expect(Math.max(...actual)).toBeLessThan(200);
    expect(Math.min(...actual)).toBeGreaterThan(25);
  });

  it('phone frame — the transparent corner reads as the device, never as white', () => {
    // Deliberately NOT the ground: what is behind a phone's screen is the
    // phone. Backing the screen with the ground instead was measured and
    // puts a +52-level light halo inside the bezel — the reported bug again
    // in a new colour. The white fill is what had to go, and it is gone.
    const { box, ctx } = scene('phone', windowCaptureSource(), GROUND_MID);
    const screen = box.chrome.screen;
    const x = Math.round(screen.x + screen.w / 2);
    const y = Math.round(screen.y) + 30;

    const actual = px(ctx, x, y);
    expect(actual, 'the phone screen is showing a white fill').not.toEqual([255, 255, 255]);
    expect(Math.max(...actual), 'a near-white fill is showing through').toBeLessThan(120);
  });
});
