/**
 * render.js - paint a layout onto a canvas 2D context.
 *
 * Handed a target context; never creates one. That keeps core/ free of DOM
 * types and lets Node reuse this file through @napi-rs/canvas.
 *
 * Covers the whole paint order: ground gradient, grain overlay, shadows,
 * the web screen (plain or chrome-framed) and the phone.
 */

import {
  CHROME_DOT_RATIO,
  CHROME_DOT_GAP_RATIO,
  CHROME_BAR_PADDING_RATIO,
  CHROME_BAR_GAP_RATIO,
  URL_PILL_HEIGHT_RATIO,
  URL_PILL_RADIUS_RATIO,
  URL_PILL_FONT_RATIO,
} from './presets.js';

export const SHADOW_RGB = '12,14,20';

/**
 * How far paintShadow's opaque source rect is pulled inside the box it
 * shadows, in device pixels.
 *
 * A rasterisation constant, not a design dimension - the same category as
 * `lineWidth = 1`, and documented alongside it in the plan's Global
 * Constraints for the same reason: it exists to hide antialiased coverage,
 * which is a fixed number of pixels wide at every canvas size. Scaling it
 * with the canvas would make it too small to work on a small export and
 * needlessly fat on a large one.
 *
 * Why 2 and not 1. Both were measured, by rendering every call site at
 * `shadowScale: 0` and diffing against a build whose paintShadow was gutted
 * entirely - any surviving difference is opaque fill showing through, and
 * nothing else. Per-call-site differing pixels / worst channel:
 *
 *   inset 0 (the bug)  none 5316/110  browser-dark 5300/119
 *                      browser-light 5296/76  phone-frame 2742/125
 *                      mobile 3179/119
 *   inset 1            none 0/0  browser-dark 18/3  browser-light 8/1
 *                      phone-frame 193/4  mobile 68/7
 *   inset 2            all five: 0 / 0
 *
 * 1 fixes the flat edges but leaves a residue in the corners, where the
 * body's curvature and the source rect's do not coincide pixel-for-pixel.
 * 2 is the smallest inset that takes the opaque fill's contribution to
 * exactly zero everywhere, and it costs nothing to go there: the shadow's
 * own worst-case error against inset 1 is identical (max 5-6 levels, mean
 * ~1.2 over the pixels that move at all).
 */
const SHADOW_SOURCE_INSET = 2;

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/**
 * An elliptical radial gradient, faded to transparent at `stop`.
 * CSS: radial-gradient(<rx>% <ry>% at <cx>% <cy>%, colour 0%, transparent stop%)
 *
 * Canvas radial gradients are circular, so we draw into a scaled space
 * (translate to the centre, scale Y by ry/rx) and let a circular gradient of
 * radius rx come out elliptical once the scale is undone by `restore`.
 */
function radial(ctx, c, hex, cxPct, cyPct, rxPct, ryPct, stopPct) {
  const cx = c.w * cxPct, cy = c.h * cyPct;
  const rx = c.w * rxPct, ry = c.h * ryPct;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, rgba(hex, 1));
  g.addColorStop(Math.min(1, stopPct), rgba(hex, 0));
  g.addColorStop(1, rgba(hex, 0));
  ctx.fillStyle = g;
  // generous rect: the scaled space is taller/shorter than the canvas
  ctx.fillRect(-c.w * 2, -c.h * 2, c.w * 4, c.h * 4);
  ctx.restore();
}

/**
 * The ground: a 166deg linear gradient through the three stops, with a
 * top-left highlight and a bottom-right deepening laid over it.
 * Ported from frame.html's `body` background:
 *
 *   background:
 *     radial-gradient(115% 85% at 22% 6%,  var(--g1) 0%, transparent 58%),
 *     radial-gradient(105% 90% at 88% 97%, var(--g3) 0%, transparent 62%),
 *     linear-gradient(166deg, var(--g1) 0%, var(--g2) 52%, var(--g3) 100%);
 *
 * CSS paints background layers first-on-top, so the linear gradient goes
 * down first here and the two radials are layered over it in the same order.
 *
 * `c.bgType` picks the background: 'linear' (default), 'solid', or 'mesh'.
 * Callers keep calling this one function - the split is invisible downstream.
 */
export function paintGround(ctx, c, stops) {
  if (c.bgType === 'solid') return paintSolid(ctx, c, stops);
  if (c.bgType === 'mesh')  return paintMesh(ctx, c, stops);

  const [g1, g2, g3] = stops;

  // linear-gradient(<angle>deg, g1 0%, g2 52%, g3 100%) - 166deg by default.
  // CSS 0deg points up and angles run clockwise.
  const rad = ((c.angle ?? 166) - 90) * Math.PI / 180;
  const len = Math.abs(c.w * Math.cos(rad)) + Math.abs(c.h * Math.sin(rad));
  const dx = Math.cos(rad) * len / 2, dy = Math.sin(rad) * len / 2;
  const lin = ctx.createLinearGradient(c.w / 2 - dx, c.h / 2 - dy, c.w / 2 + dx, c.h / 2 + dy);
  lin.addColorStop(0, g1);
  lin.addColorStop(0.52, g2);
  lin.addColorStop(1, g3);
  ctx.fillStyle = lin;
  ctx.fillRect(0, 0, c.w, c.h);

  // radial-gradient(115% 85% at 22% 6%,  g1 0%, transparent 58%)
  radial(ctx, c, g1, 0.22, 0.06, 1.15, 0.85, 0.58);
  // radial-gradient(105% 90% at 88% 97%, g3 0%, transparent 62%)
  radial(ctx, c, g3, 0.88, 0.97, 1.05, 0.90, 0.62);
}

/**
 * Flat ground: the middle sampled stop, wall to wall. The simplest possible
 * background, and still "from the product" since g2 is itself derived from
 * the screenshot's own accent (see core/ground.js).
 */
export function paintSolid(ctx, c, stops) {
  ctx.fillStyle = stops[1];
  ctx.fillRect(0, 0, c.w, c.h);
}

/**
 * A seeded mesh ground: soft radial blobs scattered over the middle stop,
 * finished with the same two corner radials the linear path uses.
 *
 * Colour comes ONLY from the three sampled stops (g1 and g3, alternating -
 * g2 is already the base fill). That is deliberate, not an oversight: this
 * library's whole premise is that the ground comes from the product's own
 * accent colour, never an invented hue. A mesh that painted in colours the
 * screenshot doesn't have would break the same "dark UI gets a mid-tone
 * ground" contract core/ground.js exists to uphold, just with prettier
 * blobs. See test/render-mesh.test.js's hue-spread test for the guard.
 *
 * Positions and radii come from mulberry32, the same PRNG noiseTile already
 * uses, seeded from c.seed so the field is reproducible and re-exportable.
 */
export function paintMesh(ctx, c, stops) {
  const [g1, , g3] = stops;
  const blobColours = [g1, g3];
  const BLOB_COUNT = 6;

  // base fill - the field of blobs is laid over this, same role g2 plays in
  // the linear gradient's midpoint.
  ctx.fillStyle = stops[1];
  ctx.fillRect(0, 0, c.w, c.h);

  const rnd = mulberry32(c.seed ?? 1);
  const short = Math.min(c.w, c.h);
  const margin = short * 0.12;

  for (let i = 0; i < BLOB_COUNT; i++) {
    const cx = margin + rnd() * (c.w - margin * 2);
    const cy = margin + rnd() * (c.h - margin * 2);
    const r = short * (0.40 + rnd() * 0.35);   // 40-75% of the shorter side
    const colour = blobColours[i % blobColours.length];

    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, rgba(colour, 0.75));
    g.addColorStop(1, rgba(colour, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.w, c.h);
  }

  // Same two corner radials the linear path uses, so a mesh ground still
  // reads as belonging to the same system: top-left highlight, bottom-right
  // deepening.
  radial(ctx, c, g1, 0.22, 0.06, 1.15, 0.85, 0.58);
  radial(ctx, c, g3, 0.88, 0.97, 1.05, 0.90, 0.62);
}

/**
 * mulberry32: tiny, seeded, no dependency. Shared by noiseTile (always seeded
 * from the fixed constant 0x9e3779b9 - do not change that default, the grain
 * it produces is baked into every frozen golden PNG) and paintMesh (seeded
 * from c.seed).
 */
function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic fractal value noise. The original used an SVG feTurbulence
 * filter, which cannot be reproduced exactly on a canvas, so this is a
 * fixed-seed approximation with the same character: 3 octaves, fine grain.
 *
 * Fixed seed matters twice - the pixel-diff tests need it, and the user needs
 * the export to match the preview byte for byte.
 *
 * `baseSize` fixes the octave grid resolution to the UNSCALED 240px tile
 * regardless of the raster `size` requested. That matters for `scale`
 * (paintGrain below): calling `noiseTile(240 * k, 240)` doesn't just make a
 * bigger tile with the same-looking fine speckle - because the grid stays
 * sized off 240, each grid cell now spans `k` times as many raw pixels, so
 * the whole speckle pattern comes out as an exact k-times nearest-neighbour
 * enlargement of the 1x tile. Default `baseSize = size` reproduces the
 * original, size-relative grid exactly - every existing caller (goldens
 * included) is byte-for-byte unaffected by this parameter's addition.
 */
export function noiseTile(size = 240, baseSize = size) {
  const rnd = mulberry32(0x9e3779b9);

  const grid = n => {
    const g = new Float64Array(n * n);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    return g;
  };

  // three octaves, wrapping so the tile is seamless
  const octaves = [
    { n: baseSize / 2 | 0, amp: 0.5 },
    { n: baseSize / 4 | 0, amp: 0.3 },
    { n: baseSize / 8 | 0, amp: 0.2 },
  ].map(o => ({ ...o, g: grid(o.n) }));

  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const { n, amp, g } of octaves) {
        const gx = Math.floor(x * n / size) % n;
        const gy = Math.floor(y * n / size) % n;
        v += g[gy * n + gx] * amp;
      }
      const b = Math.round(v * 255);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

// Keyed by tile size in raw px (240 at scale 1, 480 at scale 2, ...) - never
// by anything else, so a render at one scale can never hand another scale's
// wrong-sized tile back out. Measured: building one tile (noiseTile +
// putImageData) costs ~4ms at 240px and scales roughly with pixel count
// (~34ms at 720px, i.e. scale 3) - real cost for a UI re-rendering on every
// slider tweak, so a same-size repeat is worth skipping the rebuild for.
// Distinct sizes coexist rather than evicting each other: a session only
// ever touches a handful of scales (1/2/3), so the cache stays tiny.
const tileCanvasCache = new Map();

function tileCanvasFor(size, makeCanvas) {
  let tc = tileCanvasCache.get(size);
  if (!tc) {
    const t = noiseTile(size, 240);
    tc = makeCanvas(size, size);
    const tctx = tc.getContext('2d');
    const id = tctx.createImageData(size, size);
    id.data.set(t.data);
    tctx.putImageData(id, 0, 0);
    tileCanvasCache.set(size, tc);
  }
  return tc;
}

/**
 * Fine grain, tiled at 240px * c.scale. Keeps big flat gradients from
 * banding. soft-light, matching the original mix-blend-mode.
 *
 * Scaling the tile with `c.scale` (rather than always tiling at a literal
 * 240px) is what makes a 2x/3x export a genuine enlargement instead of the
 * same shot with finer-looking grain: see noiseTile's `baseSize` doc comment
 * for why passing the bigger size through with the grid still fixed at 240
 * reproduces the 1x speckle pattern at `scale` times the size, pixel for
 * pixel, rather than a same-looking tile that merely repeats less often.
 *
 * Builds the tile into a scratch canvas (via the injected `makeCanvas`
 * factory - core/ never creates a canvas itself) and paints it as a
 * repeating pattern with fillRect, rather than stamping it with putImageData
 * in a loop. putImageData ignores globalAlpha and globalCompositeOperation
 * entirely, so a putImageData-based version would stamp opaque grey noise
 * straight over the finished ground at full strength instead of soft-light
 * blending into it - a silent visual bug, not a style choice.
 */
export function paintGrain(ctx, c, makeCanvas) {
  if (!c.grain || c.grain <= 0) return;

  const tileSize = Math.round(240 * (c.scale || 1));
  const tile = tileCanvasFor(tileSize, makeCanvas);

  ctx.save();
  ctx.globalAlpha = c.grain;
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = ctx.createPattern(tile, 'repeat');
  ctx.fillRect(0, 0, c.w, c.h);
  ctx.restore();
}

/**
 * Rounded-rect path helper. Shared by the web screen, the phone, and both
 * device frames.
 */
export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y,     x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x,     y + h, rr);
  ctx.arcTo(x,     y + h, x,     y,     rr);
  ctx.arcTo(x,     y,     x + w, y,     rr);
  ctx.closePath();
}

/**
 * The original CSS stacked two shadows (ambient + contact) per element;
 * canvas takes one per draw, so this is two passes over the same rect. Use
 * frame.html's alphas UNCHANGED in any caller: @napi-rs/canvas (every test
 * here, and the CLI) renders this shadowBlur ~5.4x fainter than Chromium,
 * which is linear in alpha and matches CSS at these exact values - a
 * harness limitation, not something to correct by scaling alphas up. See
 * paintWeb below for the measurement.
 *
 * `scale` (Task 6b, default 1) is a MULTIPLIER applied ON TOP of `a1`/`a2`
 * below - it is not, and must never become, a way to retune them. At scale
 * 1 the product is exactly `a1`/`a2` unchanged, so every existing caller
 * that omits it renders byte-identically to before this parameter existed.
 * `core/config.js`'s `shadowScale` is the only source of a non-1 value in
 * this codebase (bounded by `SHADOW_SCALE_RANGE` in presets.js, itself
 * outside [0,1]), so the clamp below is a second, defensive line - the
 * product actually painted can never exceed a real alpha regardless of what
 * a caller passes.
 */
export function paintShadow(ctx, box, spreadY, blur, a1, a2, scale = 1) {
  // The opaque source rect is INSET by SHADOW_SOURCE_INSET, so it stops
  // short of the visible edge on every side. Without that inset it shared
  // its geometry exactly with the body painted over it - and since both are
  // antialiased on the same rounded path, the boundary pixel got the body
  // at coverage `k` over black at coverage `k`, leaving black showing
  // through at `k(1-k)`. That measured 166,166,167 on an unframed white
  // screen: darker than the ground AND darker than the screenshot. It
  // survived at shadowScale 0, with the shadow fully off, which is exactly
  // how it outlived Task 1's deletion of the real hairline and kept
  // reading as an unrequested border. Inset, the fill lands wholly beneath
  // the body and cannot show at any coverage.
  //
  // This moves only where the OPAQUE fill lands. The alphas are untouched
  // (see the note above), and so is the shadow: pulling the caster in by
  // two pixels under a blur of ~110px is not visible. Sampled 10, 20 and
  // 40px below and beside the box, every channel is byte-identical before
  // and after at all four call sites; across the whole shadow field the
  // blur's contribution moves on ~8% of pixels, by a mean of 1.2 levels and
  // never more than 6.
  const inset = Math.min(SHADOW_SOURCE_INSET, box.w / 2, box.h / 2);
  const sx = box.x + inset;
  const sy = box.y + inset;
  const sw = box.w - inset * 2;
  const sh = box.h - inset * 2;
  // Shrink the radius by the same amount so the source rect stays
  // concentric with the box: an unshrunk radius would bulge back out
  // through the corners, which is the one place the inset must still hold.
  const sr = box.radius - inset;

  for (const [dy, b, baseAlpha] of [[spreadY, blur, a1], [spreadY * 0.28, blur * 0.3, a2]]) {
    const a = Math.min(1, Math.max(0, baseAlpha * scale));
    ctx.save();
    ctx.shadowColor = `rgba(${SHADOW_RGB},${a})`;
    ctx.shadowBlur = b;
    ctx.shadowOffsetY = dy;
    ctx.fillStyle = '#000';
    roundRect(ctx, sx, sy, sw, sh, sr);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Draw `image` into `box` with object-fit and object-position: top center.
 * Assumes the path is already clipped by the caller.
 */
function drawFitted(ctx, box, image, fit) {
  const ir = image.width / image.height;
  const br = box.w / box.h;
  let dw, dh;
  if (fit === 'cover' ? ir > br : ir < br) { dh = box.h; dw = box.h * ir; }
  else                                     { dw = box.w; dh = box.w / ir; }
  ctx.drawImage(image, box.x + (box.w - dw) / 2, box.y, dw, dh);   // top center
}

/**
 * The web screen: rounded body, screenshot, floating shadow.
 * Ported from frame.html's `.web` rule and `makeWeb()`. frame.html's
 * `.web::after` inset hairline is deliberately NOT ported - see the note at
 * the end of this function.
 */
export function paintWeb(ctx, c, box, image) {
  // A device frame replaces everything below with a chrome-specific
  // painter: browser goes to paintWebChrome, phone to paintPhoneChrome.
  // box.chrome is null for frameKind: 'none' - the only branch this adds -
  // so every line below it is completely untouched, reached exactly as
  // before whenever there is no frame.
  if (box.chrome?.kind === 'phone') return paintPhoneChrome(ctx, c, box, image);
  if (box.chrome) return paintWebChrome(ctx, c, box, image);

  // shadow first, on an opaque rect, then the screen over it.
  //
  // Alphas are frame.html's makeWeb() values UNCHANGED: 0.17 / 0.07. Do not
  // retune these - see paintShadow's doc comment above (a prior pass did,
  // and had to be reverted: it fixed napi-rs's faint test render while
  // shipping a far-too-heavy shadow to the browser, the actual product).
  // `c.shadowScale` (Task 6b, default 1) multiplies ON TOP of these -
  // the alphas themselves stay exactly as written here.
  paintShadow(ctx, box, c.h * 0.040, c.h * 0.105, 0.17, 0.07, c.shadowScale);

  ctx.save();
  roundRect(ctx, box.x, box.y, box.w, box.h, box.radius);
  ctx.clip();
  ctx.fillStyle = '#ffffff';                       // --screen-bg
  ctx.fillRect(box.x, box.y, box.w, box.h);
  // A LITERAL 'contain'. `c.fit` is gone (Cycle A Task 4) - the web screen
  // never crops. drawFitted stays because paintPhone still calls it with
  // 'cover' for the phone's own screen, which is a different decision.
  drawFitted(ctx, box, image, 'contain');
  ctx.restore();

  // NO STROKE HERE, DELIBERATELY. frame.html stroked an inset hairline on
  // every unframed screen; it read as an unrequested border and was the
  // first item of round two's feedback. An edge treatment is now opt-in via
  // `stroke`, which Cycle A Task 7 adds - do not reinstate an unconditional
  // one. (paintStroke does not exist yet; this names where it will live.)
}

// --- Device frame chrome -------------------------------------------------
//
// Source: design_handoff_backdrop_1a/Backdrop Mockups.dc.html, section
// id="1a", the browser-frame markup around line 100 and the theme table in
// its renderVals() around line 376:
//
//   fBg:     dark #1b1d22   / light #f6f7f9    - bar background
//   fBorder: dark rgba(255,255,255,.09) / light #e3e5ea - frame + bar hairlines
//   fUrlBg:  dark rgba(255,255,255,.07) / light #ffffff - URL pill fill
//   fUrlTxt: dark #9ba1ab   / light #5c6470    - URL pill text colour
//   fBodyBg: dark #101114   / light #ffffff    - frame body, behind the bar
//
// fUrlTxt was captured here from day one, before core/ had anywhere to put
// real text: shotkit had no URL/title field, and inventing a placeholder
// (e.g. "example.com") would have meant shipping fabricated content into
// every user's export. Task 6 closes that gap properly - `config.url`
// (core/config.js's normalise(), default null) is the real field, and
// paintChrome below draws it in this exact colour, in Geist Mono, clipped
// to the pill, whenever it is set. Left unset (the default), the pill
// stays empty - still correct, and still better than a fabricated domain.
//
// Traffic-light colours (#ff5f57 #febc2e #28c840) are theme-independent and
// identical in both frame.html locations that render them (line ~48, the
// outer app-window traffic lights, and line ~102, the inner browser-frame
// ones being ported here).
const CHROME_THEME = {
  dark:  { bar: '#1b1d22', body: '#101114', border: 'rgba(255,255,255,0.09)', pill: 'rgba(255,255,255,0.07)', pillText: '#9ba1ab' },
  light: { bar: '#f6f7f9', body: '#ffffff', border: '#e3e5ea',                pill: '#ffffff',                pillText: '#5c6470' },
};

function chromeColours(theme) {
  return theme === 'light' ? CHROME_THEME.light : CHROME_THEME.dark;
}

const TRAFFIC_DOT_COLOURS = ['#ff5f57', '#febc2e', '#28c840'];

/**
 * Browser window chrome: the title bar, the three traffic-light dots, and
 * the URL pill. Every size below is a ratio of `box.w` (the frame's own
 * width - the same convention presets.js documents for CHROME_DOT_RATIO
 * etc., and the same one phoneBox() already uses for the phone's bezel).
 *
 * `box.chrome` kind-dispatches: only 'browser' paints anything here.
 * 'phone' is painted by paintPhoneChrome below instead - its frame carries
 * no bar (chrome.barH is 0 per layout.js's chromeFor()), so there is nothing
 * for this function to draw for that kind.
 *
 * `c.url` (Task 6) is drawn into the pill, centred both ways exactly like
 * the mockup's `justify-content:center;align-items:center` (HTML line
 * ~103), clipped to the pill's own rounded rect so a string wider than the
 * pill is cropped rather than spilling into the dot group or past the
 * bar's right padding. `c.url` is null by default (core/config.js's
 * normalise()) - when it is, this whole block is skipped and the pill is
 * exactly the plain fill painted below, unchanged from before this field
 * existed.
 */
export function paintChrome(ctx, c, box, theme) {
  const chrome = box.chrome;
  if (chrome.kind !== 'browser') return;

  const t = chromeColours(theme);
  const barX = box.x, barY = box.y, barW = box.w, barH = chrome.barH;

  // bar fill
  ctx.fillStyle = t.bar;
  ctx.fillRect(barX, barY, barW, barH);

  // bar's own bottom hairline: `border-bottom:1px solid {{fBorder}}` on the
  // bar div itself, distinct from the frame's outer border painted by
  // paintWebChrome.
  ctx.save();
  ctx.strokeStyle = t.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(barX, barY + barH - 0.5);
  ctx.lineTo(barX + barW, barY + barH - 0.5);
  ctx.stroke();
  ctx.restore();

  // traffic-light dots: left-aligned with the bar's own left padding
  const padX = box.w * CHROME_BAR_PADDING_RATIO;
  const dotD = box.w * CHROME_DOT_RATIO;
  const dotGap = box.w * CHROME_DOT_GAP_RATIO;
  const cy = barY + barH / 2;
  let cx = barX + padX + dotD / 2;
  for (const colour of TRAFFIC_DOT_COLOURS) {
    ctx.beginPath();
    ctx.fillStyle = colour;
    ctx.arc(cx, cy, dotD / 2, 0, Math.PI * 2);
    ctx.fill();
    cx += dotD + dotGap;
  }

  // URL pill: fills the rest of the bar's width after the dot group and the
  // bar's own flex gap, up to the same right padding as the left.
  const dotsGroupW = dotD * 3 + dotGap * 2;
  const barGap = box.w * CHROME_BAR_GAP_RATIO;
  const pillH = box.w * URL_PILL_HEIGHT_RATIO;
  const pillR = box.w * URL_PILL_RADIUS_RATIO;
  const pillX = barX + padX + dotsGroupW + barGap;
  const pillW = (barX + barW - padX) - pillX;
  const pillY = cy - pillH / 2;
  roundRect(ctx, pillX, pillY, pillW, pillH, pillR);
  ctx.fillStyle = t.pill;
  ctx.fill();

  if (c.url) {
    ctx.save();
    // Re-trace the exact same rounded rect purely to clip - this is a
    // second path, not a reuse of the fill above (canvas has no way to
    // replay a path already consumed by `fill()`), so drifting the two out
    // of sync would clip against the wrong rect; both come from the same
    // pillX/pillY/pillW/pillH/pillR inputs a few lines up, so they can't.
    roundRect(ctx, pillX, pillY, pillW, pillH, pillR);
    ctx.clip();
    ctx.fillStyle = t.pillText;
    ctx.font = `${box.w * URL_PILL_FONT_RATIO}px 'Geist Mono', ui-monospace, 'SFMono-Regular', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.url, pillX + pillW / 2, pillY + pillH / 2);
    ctx.restore();
  }
}

/**
 * The chrome-framed web screen: outer frame body + shadow, the bar/dots/
 * pill via paintChrome, then the screenshot drawn straight into
 * chrome.screen. `screen` already carries the source image's exact aspect
 * ratio - that is layout.js's job (see chromeFor()/frameRatio() there) - so
 * this never fits, covers, or letterboxes: a plain drawImage at chrome.screen
 * is correct and is the entire job here.
 *
 * Reuses paintShadow/roundRect exactly as the unframed path above does; only
 * the rounded-rect radius changes, to chrome.radius (the frame's own corner
 * radius from the handoff - BROWSER_RADIUS_RATIO in presets.js - which is
 * deliberately not box.radius, the plain frameless-screen radius the
 * unframed path above uses).
 *
 * Only ever called for chrome.kind === 'browser' - paintWeb below dispatches
 * 'phone' to paintPhoneChrome instead, so this function's body is exactly
 * what it was before the phone frame existed.
 */
function paintWebChrome(ctx, c, box, image) {
  const chrome = box.chrome;
  const outer = { x: box.x, y: box.y, w: box.w, h: box.h, radius: chrome.radius };
  const t = chromeColours(c.chromeTheme);

  // Same alphas/spread maths as the unframed screen's shadow above - only
  // the shadowed box changes (the outer frame, not the bare screenshot).
  // Do NOT retune: see the doc comment above paintShadow. `c.shadowScale`
  // multiplies on top, same as every other paintShadow call site.
  paintShadow(ctx, outer, c.h * 0.040, c.h * 0.105, 0.17, 0.07, c.shadowScale);

  ctx.save();
  roundRect(ctx, outer.x, outer.y, outer.w, outer.h, outer.radius);
  ctx.clip();

  ctx.fillStyle = t.body;                          // fBodyBg
  ctx.fillRect(outer.x, outer.y, outer.w, outer.h);

  paintChrome(ctx, c, box, c.chromeTheme);

  // Straight into the interior - no fit/cover/contain maths belongs here.
  ctx.drawImage(image, chrome.screen.x, chrome.screen.y, chrome.screen.w, chrome.screen.h);

  ctx.restore();

  // outer hairline: `border:1px solid {{fBorder}}` on the mockup's frame
  // wrapper.
  ctx.save();
  ctx.strokeStyle = t.border;
  ctx.lineWidth = 1;
  roundRect(ctx, outer.x + 0.5, outer.y + 0.5, outer.w - 1, outer.h - 1, outer.radius);
  ctx.stroke();
  ctx.restore();
}

/**
 * Shared device-body shape: an opaque dark-grey fill clipped to the outer
 * rounded rect, and the inset 1px translucent-white "inner highlight"
 * stroked just inside its edge. This is exactly paintPhone's body+hairline
 * below, pulled out so the phone frame (paintPhoneChrome, next) can use
 * the identical shape at a different scale instead of copying it. paintPhone
 * itself is rewired to call these two helpers in the same order it used to
 * inline them, so its own output is unchanged.
 */
function paintDeviceBody(ctx, box) {
  ctx.save();
  roundRect(ctx, box.x, box.y, box.w, box.h, box.radius);
  ctx.clip();
  ctx.fillStyle = '#111318';                       // --phone-frame
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.restore();
}

function paintDeviceHairline(ctx, box) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  roundRect(ctx, box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1, box.radius);
  ctx.stroke();
  ctx.restore();
}

/**
 * The phone frame: a web screenshot wrapped in the same body-and-hairline
 * shape paintPhone draws for the mobile layout's own phones (paintDeviceBody
 * / paintDeviceHairline above), at the frame's own scale. No title bar
 * (chrome.barH is 0, per layout.js's chromeFor()) and a bezel on all four
 * sides (chrome.frame, chrome.innerRadius - the exact same
 * PHONE_BEZEL_RATIO/PHONE_RADIUS_RATIO math phoneBox() uses, computed once
 * in layout.js so this file never duplicates it). No notch, no dynamic
 * island, no home indicator: none of those are in the handoff, and inventing
 * one would repeat the mistake that got the macOS bar height dropped. This
 * is deliberately a generic phone SHAPE, not a specific device - see
 * FRAME_KINDS in presets.js for why it isn't named after one.
 *
 * Unlike paintPhone's mobile screenshots (always `cover`-fit, because a
 * phone box's own ratio need not match its screenshot's), chrome.screen here
 * is sized FROM the source image's own ratio by layout.js's frameRatio(), so
 * the interior gets a plain drawImage - no fit/cover/contain maths belongs
 * here, exactly as paintWebChrome's own doc comment says for the browser
 * frame.
 *
 * The outer shadow reuses paintWebChrome's own alphas/spread (0.17/0.07,
 * c.h-based) rather than paintPhone's (0.22/0.10, box.h-based): both this and
 * paintWebChrome are shadowing the SAME kind of thing - a web-box-sized card
 * dropped onto the ground - just with a different body drawn inside it. The
 * 0.22/0.10 pairing stays reserved for an actual mobile-layout phone box, per
 * the doc comment on paintPhone below - do not blend the two.
 */
function paintPhoneChrome(ctx, c, box, image) {
  const chrome = box.chrome;
  const outer = { x: box.x, y: box.y, w: box.w, h: box.h, radius: chrome.radius };

  // Same alphas as paintWebChrome's own outer shadow (see this function's
  // doc comment above); `c.shadowScale` multiplies on top, same as every
  // other paintShadow call site.
  paintShadow(ctx, outer, c.h * 0.040, c.h * 0.105, 0.17, 0.07, c.shadowScale);

  paintDeviceBody(ctx, outer);

  ctx.save();
  roundRect(ctx, chrome.screen.x, chrome.screen.y, chrome.screen.w, chrome.screen.h, chrome.innerRadius);
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(chrome.screen.x, chrome.screen.y, chrome.screen.w, chrome.screen.h);
  ctx.drawImage(image, chrome.screen.x, chrome.screen.y, chrome.screen.w, chrome.screen.h);
  ctx.restore();

  paintDeviceHairline(ctx, outer);
}

/**
 * The phone: dark body, inset screen (cover-fit, top center), inset hairline,
 * floating shadow. Ported from frame.html's `.phone`, `.phone::after` and
 * `makePhone()`. `box` comes from layout.js's phoneBox() and already carries
 * `frame` (bezel thickness) and `innerRadius` (screen corner radius) -
 * computed there as `radius - frame`, matching makePhone()'s
 * `scr.style.borderRadius = px(rad - frame)`.
 *
 * Shadow alphas are frame.html's makePhone() light-mode values UNCHANGED:
 * 0.22 / 0.10. See the doc comment on paintShadow above (and the longer one
 * on paintWeb) before ever touching these - a prior pass tuned them up to
 * compensate for @napi-rs/canvas rendering shadows faintly, and that tuning
 * had to be reverted because it made the browser (the only surface that
 * ships) render up to 65 RGB levels too dark. Do not repeat that mistake
 * here. `c.shadowScale` (Task 6b) multiplies on top of 0.22/0.10 - it does
 * not change them.
 */
export function paintPhone(ctx, c, box, image) {
  paintShadow(ctx, box, box.h * 0.055, box.h * 0.14, 0.22, 0.10, c.shadowScale);

  // body - shared with the phone frame's paintPhoneChrome via
  // paintDeviceBody, defined above. Same fill, same clip, same order as
  // before this was pulled out - this call is byte-for-byte what used to be
  // inlined here.
  paintDeviceBody(ctx, box);

  // screen, inset by the bezel. Always cover, anchored top center.
  const inner = {
    x: box.x + box.frame,
    y: box.y + box.frame,
    w: box.w - box.frame * 2,
    h: box.h - box.frame * 2,
  };
  ctx.save();
  roundRect(ctx, inner.x, inner.y, inner.w, inner.h, box.innerRadius);
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
  drawFitted(ctx, inner, image, 'cover');
  ctx.restore();

  // inset 0 0 0 1px rgba(255,255,255,0.10) - shared via paintDeviceHairline,
  // same as the body above.
  paintDeviceHairline(ctx, box);
}
