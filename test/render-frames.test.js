import { describe, it, expect } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import pixelmatch from 'pixelmatch';
import { normalise } from '../core/config.js';
import { layout } from '../core/layout.js';
import { paintGround, paintWeb, roundRect } from '../core/render.js';
import { composeWithMeta } from '../core/index.js';
import {
  TRAFFIC_DOT_RATIO,
  TRAFFIC_GAP_RATIO,
  TRAFFIC_INSET_RATIO,
  URL_PILL_WIDTH_RATIO,
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
  const dotD = box.w * TRAFFIC_DOT_RATIO;
  const cy = box.y + chrome.barH / 2;
  const centres = [];
  // Task 8: TRAFFIC_GAP_RATIO is CENTRE TO CENTRE (the reference's circles
  // sit at cx 6, 26, 46), so it is the stride - not a gap added to the
  // diameter, which is what the retired CHROME_DOT_GAP_RATIO was.
  let cx = box.x + box.w * TRAFFIC_INSET_RATIO + dotD / 2;
  for (let i = 0; i < 3; i++) {
    centres.push([cx, cy]);
    cx += box.w * TRAFFIC_GAP_RATIO;
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

    expect(close(darkPx, [27, 29, 34])).toBe(true);      // #1b1d22
    expect(close(lightPx, [255, 255, 255])).toBe(true);  // #ffffff, Task 8
    expect(darkPx).not.toEqual(lightPx);
  });

  it('paints the URL pill in its own fill colour, distinct from the plain bar', async () => {
    const { lay, ctx, c } = await scene({ frameKind: 'browser', chromeTheme: 'dark' });
    const { web } = lay;
    const barY = web.y + web.chrome.barH / 2;

    const { pillX } = pillGeomOf(web);

    const barOnly = px(ctx, web.x + 3, barY);       // plain bar fill
    const pillFill = px(ctx, pillX + 5, barY);      // inside the pill

    expect(barOnly).not.toEqual(pillFill);
    // dark URL pill: rgba(255,255,255,.16) blended over the #1b1d22 bar.
    // Task 8 raised this from .07, which was near-invisible - see the
    // CHROME_THEME comment in core/render.js.
    expect(close(pillFill, [64, 66, 70], 6)).toBe(true);
    // And it is genuinely lighter than the bar, not merely different.
    expect(pillFill[0]).toBeGreaterThan(barOnly[0] + 20);
  });
});

// Task 6: the URL pill's own text (core/config.js's `url` field, default
// null). Two states, per the task brief: absent (the pill must stay
// EXACTLY the plain fill it always was - the whole point of the original
// "refuse to fabricate placeholder copy" decision this closes out) and
// present (drawn in fUrlTxt, clipped to the pill so an overlong string
// can't spill into the dot group or past the bar's own right padding).
function pillGeomOf(web) {
  // Task 8: a fixed width, centred in the window - not the leftover space
  // after the dot group.
  const pillW = web.w * URL_PILL_WIDTH_RATIO;
  const pillX = web.x + (web.w - pillW) / 2;
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
  // Task 8 remeasured these against the Safari reference - see the
  // CHROME_THEME table in core/render.js for the full comparison and which
  // three changed. Literals here on purpose: an oracle that imported the
  // table would agree with a wrong table.
  const barColour = theme === 'light' ? '#ffffff' : '#1b1d22';
  const pillColour = theme === 'light' ? '#f0f0f0' : 'rgba(255,255,255,0.16)';
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
    // INTEGER sample columns, derived from where the stroke actually lands.
    // paintDeviceHairline strokes a 1px line centred on box.x + 0.5, so it
    // covers x in [web.x, web.x + 1]. Cycle A Task 6 moved the phone
    // composite outward by its own bezel, which made web.x fractional (30.57
    // here, 62.4 before), and the old `web.x + 1` sample rounded PAST the
    // stroke onto plain body - it read equal to the body sample and asserted
    // nothing. Column floor(web.x) is no good either: that is the body's own
    // antialiased edge against a pale ground, which is brighter than the body
    // with or without a hairline (verified by stubbing paintDeviceHairline to
    // a no-op - the assertion stayed green).
    //
    // The one column that is BOTH fully inside the body and under the stroke
    // is floor(web.x) + 1, covered by exactly frac(web.x) of it.
    const yMid = Math.round(web.y + web.h / 2);
    const inner = Math.floor(web.x) + 1;
    const cov = web.x + 1 - inner;              // the stroke's share of it
    expect(cov, 'the hairline barely covers the sample column').toBeGreaterThan(0.3);
    expect(web.chrome.frame, 'both samples must stay inside the bezel').toBeGreaterThan(8);
    const withHairline = px(ctx, inner, yMid);
    const bodyOnly = px(ctx, inner + 5, yMid);
    // rgba(255,255,255,0.10) at `cov` coverage over the body, within a level
    // of rounding - not just "brighter", which the body's own edge would
    // also satisfy.
    const predicted = bodyOnly[0] + cov * 0.10 * (255 - bodyOnly[0]);
    expect(Math.abs(withHairline[0] - predicted)).toBeLessThanOrEqual(1.5);
    // The hairline is a thin white-ish stroke blended over the dark body -
    // brighter than plain body fill at that exact 1px edge.
    expect(withHairline[0]).toBeGreaterThan(bodyOnly[0]);
  });
});

// --- Cycle A Task 8: the rebuilt browser chrome --------------------------
//
// Round one's chrome came from the Backdrop handoff's own small mockup and
// read, in Rock's words, "comically big and ugly". These three assert the
// PROPORTIONS a browser has to have to read as one at a glance, in terms
// loose enough that a later re-measurement does not have to rewrite them.
describe('browser chrome proportions', () => {
  it('the bar is a small fraction of the window width', () => {
    const c = normalise({ layout: 'web', ratio: '3:2', frameKind: 'browser' });
    const lay = layout(c, { web: 1440 / 900, mobile: [] });
    const r = lay.web.chrome.barH / lay.web.w;
    expect(r).toBeGreaterThan(0.02);
    expect(r).toBeLessThan(0.055);   // the old 10/133 = 0.0752 fails this
  });

  it('draws three traffic lights in the bar, left-aligned', async () => {
    // Sample the bar's vertical centre across its left eighth and count runs
    // of non-bar colour. Three dots => three runs. Deliberately geometry-free:
    // it does not read the dot ratios, so it cannot pass by agreeing with the
    // constants the code under test also reads.
    const { ctx, lay } = await scene({ frameKind: 'browser', chromeTheme: 'dark' });
    const ch = lay.web.chrome;
    const y = Math.round(ch.screen.y - ch.barH / 2);
    const bar = px(ctx, Math.round(lay.web.x + lay.web.w * 0.22), y);
    // Start 3px inside the window. The frame's own outer hairline sits on
    // its first column and is a legitimate non-bar run - it is a different
    // element, with its own test, and counting it would make this four.
    const from = Math.ceil(lay.web.x) + 3;
    const runs = [];
    let inRun = false, runStart = 0;
    for (let x = from; x < lay.web.x + lay.web.w * 0.18; x++) {
      const p = px(ctx, x, y);
      const differs = Math.abs(p[0] - bar[0]) + Math.abs(p[1] - bar[1]) + Math.abs(p[2] - bar[2]) > 24;
      if (differs && !inRun) { inRun = true; runStart = x; }
      if (!differs && inRun) { inRun = false; runs.push([runStart, x]); }
    }
    expect(runs.length).toBe(3);

    // Three dots on their own would have passed against round one's chrome
    // too - it had three. What round one FAILS is the size of the group:
    // its dots were 1.9% of the frame each and 1.2% apart, so the trio
    // spanned 8% of the window. The reference's span 12 + 20 + 20 = 52 of
    // 1280, just over 4%.
    const span = (runs[2][1] - runs[0][0]) / lay.web.w;
    expect(span).toBeLessThan(0.06);
    // And the group starts near the window's edge, not a full bar-padding in.
    expect((runs[0][0] - lay.web.x) / lay.web.w).toBeLessThan(0.022);
  });

  it('centres the URL pill in the window', async () => {
    const { ctx, lay } = await scene({ frameKind: 'browser', chromeTheme: 'dark' });
    const ch = lay.web.chrome;
    const y = Math.round(ch.screen.y - ch.barH / 2);
    const bar = px(ctx, Math.round(lay.web.x + lay.web.w * 0.22), y);
    // Walk the bar and find where the pill starts and ends. Its midpoint must
    // land on the window's own midpoint, not somewhere left of it - round
    // one's pill filled whatever was left after the dots.
    const isBar = x => {
      const p = px(ctx, x, y);
      return Math.abs(p[0] - bar[0]) + Math.abs(p[1] - bar[1]) + Math.abs(p[2] - bar[2]) <= 12;
    };
    let first = null, last = null;
    for (let x = Math.round(lay.web.x + lay.web.w * 0.18); x < lay.web.x + lay.web.w - 2; x++) {
      if (!isBar(x)) { if (first === null) first = x; last = x; }
    }
    expect(first).not.toBeNull();
    const pillMid = (first + last) / 2;
    const windowMid = lay.web.x + lay.web.w / 2;
    expect(Math.abs(pillMid - windowMid)).toBeLessThan(lay.web.w * 0.01);
  });

  it('keeps the pill empty when no url is set', async () => {
    const { ctx, lay } = await scene({ frameKind: 'browser', chromeTheme: 'dark' });
    const ch = lay.web.chrome;
    const y = Math.round(ch.screen.y - ch.barH / 2);
    const fill = px(ctx, Math.round(lay.web.x + lay.web.w / 2), y);
    let maxDelta = 0;
    for (let d = -60; d <= 60; d++) {
      const p = px(ctx, Math.round(lay.web.x + lay.web.w / 2) + d, y);
      maxDelta = Math.max(maxDelta, Math.abs(p[0] - fill[0]));
    }
    expect(maxDelta).toBeLessThan(12);
  });
});
