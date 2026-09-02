import { describe, it, expect } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import pixelmatch from 'pixelmatch';
import { normalise } from '../core/config.js';
import { layout } from '../core/layout.js';
import { paintGround, paintWeb, roundRect } from '../core/render.js';
import { composeWithMeta } from '../core/index.js';
import {
  CHROME_DOT_RATIO,
  CHROME_DOT_GAP_RATIO,
  CHROME_BAR_PADDING_RATIO,
  CHROME_BAR_GAP_RATIO,
  URL_PILL_HEIGHT_RATIO,
  URL_PILL_RADIUS_RATIO,
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
  paintWeb(ctx, c, lay.web, img, createCanvas);
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

// Task 6: the URL pill's own text (core/config.js's `url` field, default
// null). Two states, per the task brief: absent (the pill must stay
// EXACTLY the plain fill it always was - the whole point of the original
// "refuse to fabricate placeholder copy" decision this closes out) and
// present (drawn in fUrlTxt, clipped to the pill so an overlong string
// can't spill into the dot group or past the bar's own right padding).
function pillGeomOf(web) {
  const padX = web.w * CHROME_BAR_PADDING_RATIO;
  const barGap = web.w * CHROME_BAR_GAP_RATIO;
  const dotsGroupW = web.w * CHROME_DOT_RATIO * 3 + web.w * CHROME_DOT_GAP_RATIO * 2;
  const pillX = web.x + padX + dotsGroupW + barGap;
  const pillW = (web.x + web.w - padX) - pillX;
  const pillH = web.w * URL_PILL_HEIGHT_RATIO;
  const pillR = web.w * URL_PILL_RADIUS_RATIO;
  const barY = web.y + web.chrome.barH / 2;
  const pillY = barY - pillH / 2;
  return { pillX, pillY, pillW, pillH, pillR, barY };
}

/** Independent oracle for "the pill with no text at all": the exact same
 *  two draws paintChrome itself does for the plain pill (bar fillRect, then
 *  the pill's own roundRect fill) - reproduced here from scratch, not by
 *  calling paintChrome with url stripped, so a regression that made
 *  paintChrome draw text UNCONDITIONALLY (the "invented placeholder" bug
 *  this whole field exists to prevent) has no way to also corrupt this
 *  independent reference. */
function plainPillOracle(c, web, theme) {
  const barColour = theme === 'light' ? '#f6f7f9' : '#1b1d22';
  const pillColour = theme === 'light' ? '#ffffff' : 'rgba(255,255,255,0.07)';
  const cv = createCanvas(c.w, c.h);
  const octx = cv.getContext('2d');
  octx.fillStyle = barColour;
  octx.fillRect(web.x, web.y, web.w, web.chrome.barH);
  const { pillX, pillY, pillW, pillH, pillR } = pillGeomOf(web);
  roundRect(octx, pillX, pillY, pillW, pillH, pillR);
  octx.fillStyle = pillColour;
  octx.fill();
  return octx;
}

function regionBytes(ctx, x, y, w, h) {
  return Buffer.from(ctx.getImageData(Math.round(x), Math.round(y), Math.round(w), Math.round(h)).data);
}

describe('paintWeb - browser URL pill text (Task 6)', () => {
  it('stays exactly, pixel-for-pixel empty when url is unset - the default this closes out, unchanged', async () => {
    // Break-it check: a version of paintChrome that fell back to a
    // fabricated placeholder (the exact thing the original implementer
    // refused to do) would still pass a spot-check at an unlucky pixel a
    // short string's glyphs happen to miss - this compares the WHOLE pill
    // rectangle, byte for byte, against an independent from-scratch oracle
    // that never draws text at all, so no glyph position can hide from it.
    const { c, lay, ctx } = await scene({ frameKind: 'browser', chromeTheme: 'dark' });
    const { pillX, pillY, pillW, pillH } = pillGeomOf(lay.web);
    const oracle = plainPillOracle(c, lay.web, 'dark');
    expect(regionBytes(ctx, pillX, pillY, pillW, pillH)).toEqual(
      regionBytes(oracle, pillX, pillY, pillW, pillH),
    );
  });

  it('draws the url text once set - the same region now differs from the empty-pill oracle', async () => {
    const { c, lay, ctx } = await scene({ frameKind: 'browser', chromeTheme: 'dark', url: 'app.acme.dev' });
    const { pillX, pillY, pillW, pillH } = pillGeomOf(lay.web);
    const oracle = plainPillOracle(c, lay.web, 'dark');
    expect(regionBytes(ctx, pillX, pillY, pillW, pillH)).not.toEqual(
      regionBytes(oracle, pillX, pillY, pillW, pillH),
    );
  });

  it('draws the url text in fUrlTxt (#9ba1ab dark / #5c6470 light), not some other colour', async () => {
    // A long, dense run of the narrowest mono glyphs ("iiiiiiiiiiiiiiiiiiii")
    // packed across the whole pill width, so at least one column in this
    // scan is near-certain to land on solid ink rather than inter-glyph
    // gap - then take the sample closest to the expected colour instead of
    // guessing a single point, so the assertion doesn't depend on exactly
    // where glyphs fall.
    const url = 'iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii';
    const dark = await scene({ frameKind: 'browser', chromeTheme: 'dark', url });
    const light = await scene({ frameKind: 'browser', chromeTheme: 'light', url });

    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    function closestToExpected(s, expected) {
      const { pillX, pillW, barY } = pillGeomOf(s.lay.web);
      let best = Infinity;
      for (let frac = 0.05; frac <= 0.95; frac += 0.01) {
        best = Math.min(best, dist(px(s.ctx, pillX + pillW * frac, barY), expected));
      }
      return best;
    }

    // Within 10 RGB levels (antialiasing at 9.5px-equivalent text softens
    // the exact hex) of the documented fUrlTxt colour for each theme.
    expect(closestToExpected(dark, [155, 161, 171])).toBeLessThan(10);  // #9ba1ab
    expect(closestToExpected(light, [92, 100, 112])).toBeLessThan(10); // #5c6470
  });

  it('clips an overlong string to the pill - it never bleeds past either pill edge', async () => {
    // 300 narrow mono glyphs: verified (by measureText, against this exact
    // font stack under @napi-rs/canvas) to render far wider than pillW, so
    // a center-anchored, UNCLIPPED draw would spill deep into the bar on
    // both sides - confirmed by temporarily deleting the ctx.clip() call in
    // paintChrome and re-running this exact scan: pixels at every one of
    // these offsets came back in fUrlTxt (~[155,161,171]), not the bar
    // fill, the moment the clip was removed.
    const long = await scene({ frameKind: 'browser', chromeTheme: 'dark', url: 'i'.repeat(300) });
    const { pillX, pillW, barY } = pillGeomOf(long.lay.web);
    const barOnly = px(long.ctx, long.lay.web.x + 3, barY); // plain bar fill, left of the dots

    // Just past each edge of the pill, still comfortably inside the bar -
    // must be exactly the untouched bar fill, on both sides, at every
    // offset checked.
    for (const d of [4, 10, 20, 30]) {
      expect(px(long.ctx, pillX + pillW + d, barY)).toEqual(barOnly);
      expect(px(long.ctx, pillX - d, barY)).toEqual(barOnly);
    }
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
    paintWeb(ctx, c, lay.web, img, createCanvas);

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

describe('paintWeb - phone frame', () => {
  it('paints the same phone-body colour paintPhone uses, not a browser bar', async () => {
    const { lay, ctx } = await scene({ frameKind: 'phone' });
    const { web } = lay;
    // A few px inside the bezel, away from both the screenshot and the
    // rounded corner - plain body fill only. Exact match, not `close()`:
    // the browser-theme dark body (#101114) that this render used to fall
    // through to is only 1-4 RGB levels off #111318 at every channel, close
    // enough to slip past a tolerant comparison undetected.
    const bodyPx = px(ctx, web.x + 4, web.y + web.h / 2);
    expect(bodyPx).toEqual([17, 19, 24]); // #111318, paintPhone's --phone-frame
  });

  it('has no title bar: chrome.barH is 0, so the top edge is body colour, not a bar fill', async () => {
    const { lay, ctx } = await scene({ frameKind: 'phone' });
    const { web } = lay;
    expect(web.chrome.barH).toBe(0);
    const topPx = px(ctx, web.x + web.w / 2, web.y + 2);
    const bodyPx = px(ctx, web.x + 4, web.y + web.h / 2);
    expect(topPx).toEqual(bodyPx);
  });

  it('ignores chromeTheme - a phone body looks the same dark vs light', async () => {
    const dark = await scene({ frameKind: 'phone', chromeTheme: 'dark' });
    const light = await scene({ frameKind: 'phone', chromeTheme: 'light' });
    const darkPx = px(dark.ctx, dark.lay.web.x + 4, dark.lay.web.y + dark.lay.web.h / 2);
    const lightPx = px(light.ctx, light.lay.web.x + 4, light.lay.web.y + light.lay.web.h / 2);
    expect(darkPx).toEqual(lightPx);
  });

  it('lands the screenshot inside chrome.screen with a plain drawImage - no fit/cover maths', async () => {
    const img = await loadImage('samples/fieldset.png');
    const c = normalise({ layout: 'web', ratio: '3:2', frameKind: 'phone' });
    const lay = layout(c, { web: img.width / img.height, mobile: [] });
    const { chrome } = lay.web;

    const cv = createCanvas(c.w, c.h);
    const ctx = cv.getContext('2d');
    paintGround(ctx, c, GROUND);
    paintWeb(ctx, c, lay.web, img, createCanvas);

    // Independent oracle, exactly as the browser-frame test above: a plain
    // drawImage into chrome.screen on a blank canvas, no bezel, no clipping.
    const oracle = createCanvas(c.w, c.h);
    const octx = oracle.getContext('2d');
    octx.drawImage(img, chrome.screen.x, chrome.screen.y, chrome.screen.w, chrome.screen.h);

    const x = chrome.screen.x + chrome.screen.w / 2;
    const yInside = chrome.screen.y + 4;
    expect(px(ctx, x, yInside)).toEqual(px(octx, x, yInside));

    // Inside the bezel itself: body colour, not screenshot content, and the
    // oracle (which never draws outside chrome.screen) has nothing there.
    const yInBezel = lay.web.y + chrome.frame / 2;
    expect(px(ctx, x, yInBezel)).not.toEqual(px(octx, x, yInBezel));
  });

  it('draws the inset highlight hairline in the phone colour, rgba(255,255,255,0.10)', async () => {
    // Same hairline paintPhone strokes around its own body - sampled just
    // inside the frame's rounded edge, away from any corner arc.
    const { lay, ctx } = await scene({ frameKind: 'phone' });
    const { web } = lay;
    const withHairline = px(ctx, web.x + 1, web.y + web.h / 2);
    const bodyOnly = px(ctx, web.x + 4, web.y + web.h / 2);
    // The hairline is a thin white-ish stroke blended over the dark body -
    // brighter than plain body fill at that exact 1px edge.
    expect(withHairline[0]).toBeGreaterThan(bodyOnly[0]);
  });
});
