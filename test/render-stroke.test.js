import { describe, it, expect } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { normalise } from '../core/config.js';
import { layout } from '../core/layout.js';
import { paintGround, paintWeb } from '../core/render.js';

const GROUND = ['#f7f4ff', '#ece6fb', '#ded3f5'];
const SRC = 1440 / 900;

function px(ctx, x, y) {
  const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
  return [d[0], d[1], d[2]];
}

function scene(overrides) {
  const img = createCanvas(1440, 900);
  const ictx = img.getContext('2d');
  ictx.fillStyle = '#101826';
  ictx.fillRect(0, 0, 1440, 900);

  const c = normalise({ layout: 'web', ratio: '3:2', ...overrides });
  const lay = layout(c, { web: SRC, mobile: [] });
  const cv = createCanvas(c.w, c.h);
  const ctx = cv.getContext('2d');
  paintGround(ctx, c, GROUND);
  paintWeb(ctx, c, lay.web, img, createCanvas);
  return { c, lay, ctx };
}

// A framed scene, so the mat has a WINDOW to wrap rather than a bare
// screenshot. Same harness as `scene` above; the source is deliberately a
// flat colour so any pixel that is not that colour, the bar's, or the mat's
// is a defect rather than picture detail.
function framedScene(overrides) {
  const img = createCanvas(1440, 900);
  const ictx = img.getContext('2d');
  ictx.fillStyle = '#101826';
  ictx.fillRect(0, 0, 1440, 900);

  const c = normalise({ layout: 'web', ratio: '3:2', frameKind: 'browser', ...overrides });
  const lay = layout(c, { web: SRC, mobile: [] });
  const cv = createCanvas(c.w, c.h);
  const ctx = cv.getContext('2d');
  paintGround(ctx, c, GROUND);
  paintWeb(ctx, c, lay.web, img, createCanvas);
  return { c, lay, ctx };
}

describe('strokes', () => {
  it('style none paints nothing — output matches a config with no stroke key', () => {
    const a = scene({ stroke: { style: 'none' } });
    const b = scene({});
    const mid = Math.round(a.lay.web.y + a.lay.web.h / 2);
    for (const x of [10, 200, 900, 1600, 1790]) {
      expect(px(a.ctx, x, mid).join()).toBe(px(b.ctx, x, mid).join());
    }
  });

  it('a light stroke puts near-white between the ground and the screenshot', () => {
    const { lay, ctx } = scene({ stroke: { style: 'light', width: 0.02 } });
    const b = lay.web;
    const mid = Math.round(b.y + b.h / 2);
    // 3px inside the composite's left edge is stroke, not screenshot.
    const [r, g, bl] = px(ctx, Math.round(b.x) + 3, mid);
    expect(Math.min(r, g, bl)).toBeGreaterThan(230);
  });

  it('the stroke grows the composite and leaves the screenshot alone', () => {
    const bare = scene({});
    const stroked = scene({ stroke: { style: 'light', width: 0.02 } });
    expect(stroked.lay.web.w).toBeGreaterThan(bare.lay.web.w);
    // With no frame, the interior IS the screenshot box; compare interiors.
    const bareScreen = bare.lay.web;
    const strokedScreen = stroked.lay.web.inner;
    expect(strokedScreen.w).toBeCloseTo(bareScreen.w, 6);
  });

  it('never covers the screenshot: the mat stops where the picture starts', () => {
    const { lay, ctx } = scene({ stroke: { style: 'light', width: 0.02 } });
    expect(px(ctx, lay.web.x + lay.web.w / 2, lay.web.y + lay.web.h / 2))
      .toEqual([16, 24, 38]);
    // The centre alone cannot fail — it is the image with or without a mat.
    // The real guard is the picture's own left edge: the first fully interior
    // pixel of `inner` must already be screenshot, not more mat. A stroke
    // painted OVER the shot, or an interior computed too small, moves it.
    const mid = Math.round(lay.web.inner.y + lay.web.inner.h / 2);
    expect(px(ctx, Math.ceil(lay.web.inner.x) + 1, mid)).toEqual([16, 24, 38]);
  });

  it('clamps an absurd width instead of inverting the box', () => {
    const { lay } = scene({ stroke: { style: 'light', width: 99 } });
    expect(lay.web.inner.w).toBeGreaterThan(0);
    expect(lay.web.inner.h).toBeGreaterThan(0);
  });

  // FOUND IN CHROMIUM, NOT HERE, AND ONLY BY LOOKING. The first version of
  // this task handed paintChrome the OUTER box, so with a mat on, the title
  // bar was drawn one stroke-width too high and ended one stroke-width
  // short of the screenshot - a 16px band of bare white mat between the bar
  // and the picture at a 1.5% stroke, on a 3:2 canvas. Nothing else in the
  // suite could see it: the unstroked frame is unaffected (the outer box
  // and the frame body are the same rect then), and the stroke-browser
  // golden was generated from the broken render, so it agreed with itself.
  //
  // The sample sits 3px above the screenshot's own top edge, below the URL
  // pill's bottom (the pill is ~45/1064 of the frame width tall and centred
  // in a bar ~10/133 of it, so it clears the last quarter of the bar) -
  // verified by scanning the whole column, not assumed.
  it('leaves no gap between the browser bar and the screenshot', () => {
    const { lay, ctx } = framedScene({ stroke: { style: 'light', width: 0.015 } });
    const mx = Math.round(lay.web.x + lay.web.w / 2);
    const [r, g, b] = px(ctx, mx, Math.floor(lay.web.chrome.screen.y) - 3);
    // #1b1d22, the dark theme's bar - emphatically not the white mat.
    expect([r, g, b]).toEqual([27, 29, 34]);
  });

  it('wraps the browser window without moving the bar off the screenshot', () => {
    const bare = framedScene({});
    const mat = framedScene({ stroke: { style: 'light', width: 0.015 } });
    // The bar still meets the screenshot in both, and the mat sits wholly
    // outside the window: one stroke width of white above the bar.
    for (const s of [bare, mat]) {
      const mx = Math.round(s.lay.web.x + s.lay.web.w / 2);
      expect(px(s.ctx, mx, Math.floor(s.lay.web.chrome.screen.y) + 3)).toEqual([16, 24, 38]);
    }
    const mx = Math.round(mat.lay.web.x + mat.lay.web.w / 2);
    expect(px(mat.ctx, mx, Math.ceil(mat.lay.web.y) + 3)).toEqual([255, 255, 255]);
  });
});
