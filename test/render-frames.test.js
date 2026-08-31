import { describe, it, expect } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import pixelmatch from 'pixelmatch';
import { normalise } from '../core/config.js';
import { layout } from '../core/layout.js';
import { paintGround, paintWeb } from '../core/render.js';
import { composeWithMeta } from '../core/index.js';
import {
  CHROME_DOT_RATIO,
  CHROME_DOT_GAP_RATIO,
  CHROME_BAR_PADDING_RATIO,
  CHROME_BAR_GAP_RATIO,
} from '../core/presets.js';

const GROUND = ['#f7f4ff', '#ece6fb', '#ded3f5'];
const mk = (w, h) => createCanvas(w, h);

function px(ctx, x, y) {
  const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
  return [d[0], d[1], d[2]];
}

function close(actual, expected, tol = 4) {
  return actual.every((v, i) => Math.abs(v - expected[i]) <= tol);
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

// Where paintChrome is documented (presets.js) to place the three
// traffic-light dots, purely so the test knows WHERE to sample - the
// expected COLOUR at each point is still a fixed literal from the handoff,
// never derived from the code under test.
function dotCentres(box) {
  const { chrome } = box;
  const padX = box.w * CHROME_BAR_PADDING_RATIO;
  const dotD = box.w * CHROME_DOT_RATIO;
  const dotGap = box.w * CHROME_DOT_GAP_RATIO;
  const cy = box.y + chrome.barH / 2;
  const centres = [];
  let cx = box.x + padX + dotD / 2;
  for (let i = 0; i < 3; i++) {
    centres.push([cx, cy]);
    cx += dotD + dotGap;
  }
  return centres;
}

describe('paintWeb - frameKind: none', () => {
  it('renders byte-identically to a render with no chrome code at all (the frozen pre-chrome golden)', async () => {
    const web = await loadImage('samples/fieldset.png');
    const target = createCanvas(10, 10);
    composeWithMeta(target, { ratio: '3:2', frameKind: 'none' }, { web, mobile: [] }, mk);

    const ref = await loadImage('test/golden/render/web.png');
    const rc = createCanvas(ref.width, ref.height);
    rc.getContext('2d').drawImage(ref, 0, 0);

    // Buffer comparison of the full raster, not a spot check: this must be
    // an exact match, because test/golden/render/web.png was produced
    // before any chrome-painting code existed in this file. Any drift here
    // means the chrome === null path stopped being the untouched original.
    const a = target.getContext('2d').getImageData(0, 0, target.width, target.height);
    const b = rc.getContext('2d').getImageData(0, 0, ref.width, ref.height);
    const diff = pixelmatch(a.data, b.data, null, ref.width, ref.height, { threshold: 0 });
    expect(diff).toBe(0);
  });
});

describe('paintWeb - browser chrome bar', () => {
  it('paints the bar in the theme colour, and light differs from dark', async () => {
    const dark = await scene({ frameKind: 'browser', chromeTheme: 'dark' });
    const light = await scene({ frameKind: 'browser', chromeTheme: 'light' });

    // Sample just inside the bar's own left padding - before the first dot,
    // so this is plain bar fill, not a dot or the URL pill.
    const darkPt = [dark.lay.web.x + 3, dark.lay.web.y + dark.lay.web.chrome.barH / 2];
    const lightPt = [light.lay.web.x + 3, light.lay.web.y + light.lay.web.chrome.barH / 2];

    const darkPx = px(dark.ctx, ...darkPt);
    const lightPx = px(light.ctx, ...lightPt);

    expect(close(darkPx, [27, 29, 34])).toBe(true);    // #1b1d22
    expect(close(lightPx, [246, 247, 249])).toBe(true); // #f6f7f9
    expect(darkPx).not.toEqual(lightPx);
  });

  it('paints the URL pill in its own fill colour, distinct from the plain bar', async () => {
    const { lay, ctx, c } = await scene({ frameKind: 'browser', chromeTheme: 'dark' });
    const { web } = lay;
    const barY = web.y + web.chrome.barH / 2;

    const padX = web.w * CHROME_BAR_PADDING_RATIO;
    const barGap = web.w * CHROME_BAR_GAP_RATIO;
    const dotsGroupW = web.w * CHROME_DOT_RATIO * 3 + web.w * CHROME_DOT_GAP_RATIO * 2;
    const pillStartX = web.x + padX + dotsGroupW + barGap;

    const barOnly = px(ctx, web.x + 3, barY);          // plain bar fill
    const pillFill = px(ctx, pillStartX + 5, barY);     // inside the pill

    expect(barOnly).not.toEqual(pillFill);
    // dark URL pill: rgba(255,255,255,.07) blended over #1b1d22 bar
    expect(close(pillFill, [43, 45, 49], 6)).toBe(true);
  });
});

describe('paintWeb - traffic dots', () => {
  it('draws three dots in the right colours, at the left of the bar', async () => {
    const { lay, ctx } = await scene({ frameKind: 'browser' });
    const centres = dotCentres(lay.web);
    const expected = [
      [255, 95, 87],   // #ff5f57
      [254, 188, 46],  // #febc2e
      [40, 200, 64],   // #28c840
    ];

    centres.forEach(([x, y], i) => {
      expect(close(px(ctx, x, y), expected[i], 6)).toBe(true);
    });

    // All three sit left of the bar's midpoint - "at the left of the bar".
    for (const [x] of centres) {
      expect(x).toBeLessThan(lay.web.x + lay.web.w / 2);
    }
  });

  it('are the same three colours regardless of chrome theme', async () => {
    const darkScene = await scene({ frameKind: 'browser', chromeTheme: 'dark' });
    const lightScene = await scene({ frameKind: 'browser', chromeTheme: 'light' });
    const darkCentres = dotCentres(darkScene.lay.web);
    const lightCentres = dotCentres(lightScene.lay.web);

    darkCentres.forEach(([x, y], i) => {
      const [lx, ly] = lightCentres[i];
      expect(px(darkScene.ctx, x, y)).toEqual(px(lightScene.ctx, lx, ly));
    });
  });
});

describe('paintWeb - screenshot placement inside chrome.screen', () => {
  it('lands the screenshot inside chrome.screen, not under the bar', async () => {
    const img = await loadImage('samples/fieldset.png');
    const c = normalise({ layout: 'web', ratio: '3:2', frameKind: 'browser' });
    const lay = layout(c, { web: img.width / img.height, mobile: [] });
    const { chrome } = lay.web;

    const cv = createCanvas(c.w, c.h);
    const ctx = cv.getContext('2d');
    paintGround(ctx, c, GROUND);
    paintWeb(ctx, c, lay.web, img);

    // Independent oracle: draw the raw image directly into chrome.screen on
    // a blank canvas - no ground, no bar, no clipping from paintWeb at all.
    // If paintWeb placed the screenshot anywhere else, or fit/cropped it
    // instead of a straight draw, this would diverge from the real render.
    const oracle = createCanvas(c.w, c.h);
    const octx = oracle.getContext('2d');
    octx.drawImage(img, chrome.screen.x, chrome.screen.y, chrome.screen.w, chrome.screen.h);

    const x = chrome.screen.x + chrome.screen.w / 2;
    const yBelowBar = chrome.screen.y + 4; // just inside the screen, right after the bar

    expect(px(ctx, x, yBelowBar)).toEqual(px(octx, x, yBelowBar));

    // Inside the bar itself: chrome was painted (dark, not near-white like
    // the screenshot content, and the oracle - which never draws above
    // chrome.screen.y - has nothing there at all).
    const yInBar = lay.web.y + chrome.barH / 2;
    expect(Math.max(...px(ctx, x, yInBar))).toBeLessThan(200);
    expect(px(ctx, x, yInBar)).not.toEqual(px(octx, x, yInBar));
  });
});
