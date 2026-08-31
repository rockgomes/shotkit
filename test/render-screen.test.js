import { describe, it, expect } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { normalise } from '../core/config.js';
import { layout } from '../core/layout.js';
import { paintGround, paintWeb } from '../core/render.js';

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
  paintGround(ctx, c, ['#f7f4ff', '#ece6fb', '#ded3f5']);
  paintWeb(ctx, c, lay.web, img);
  return { c, lay, ctx, img };
}

describe('paintWeb', () => {
  it('paints inside the screen box', async () => {
    const { lay, ctx } = await scene();
    const before = px(ctx, 10, 10);              // ground, untouched
    const inside = px(ctx, lay.web.x + lay.web.w / 2, lay.web.y + lay.web.h / 2);
    expect(inside).not.toEqual(before);
  });

  it('leaves the corners rounded, not square', async () => {
    const { lay, ctx } = await scene();
    // 2px inside the bounding-box corner is outside a 24px radius
    const corner = px(ctx, lay.web.x + 2, lay.web.y + 2);
    const centre = px(ctx, lay.web.x + lay.web.w / 2, lay.web.y + 20);
    expect(corner).not.toEqual(centre);
  });

  it('darkens the ground below the screen with a shadow', async () => {
    const { c, lay, ctx } = await scene();
    const cv2 = createCanvas(c.w, c.h);
    const ctx2 = cv2.getContext('2d');
    paintGround(ctx2, c, ['#f7f4ff', '#ece6fb', '#ded3f5']);

    const y = Math.min(c.h - 2, lay.web.y + lay.web.h + 12);
    const x = lay.web.x + lay.web.w / 2;
    const sum = a => a.reduce((p, q) => p + q, 0);
    expect(sum(px(ctx, x, y))).toBeLessThan(sum(px(ctx2, x, y)));
  });

  it('is deterministic', async () => {
    const a = await scene();
    const b = await scene();
    const ga = Array.from(a.ctx.getImageData(0, 0, 400, 400).data);
    const gb = Array.from(b.ctx.getImageData(0, 0, 400, 400).data);
    expect(ga).toEqual(gb);
  });
});
