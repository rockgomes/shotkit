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
  TRAFFIC_DOT_RATIO,
  TRAFFIC_GAP_RATIO,
  TRAFFIC_INSET_RATIO,
  URL_PILL_WIDTH_RATIO,
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
 *
 * STILL LOAD-BEARING AFTER TASK 4D, for a second reason. paintShadow now
 * clips the box out of itself (even-odd) so the caster cannot land under
 * the shot at all, which looks like it should make an inset pointless. It
 * does not: at inset 0 the caster's path and the clip's boundary are the
 * SAME rounded rect, both antialiased, so the boundary pixel would get
 * black at k * (1 - k) - about 0.24 of it at k = 0.6 - and that is a dark
 * ring, the same artefact in the opposite direction. The inset is what
 * keeps the caster's own antialiased edge two pixels clear of the clip's.
 */
const SHADOW_SOURCE_INSET = 2;

/**
 * How far a shot's own drawing is pushed past the mask that shapes it,
 * inside its offscreen tile, in device pixels. Task 4d.
 *
 * A rasterisation constant, the third in this file's small set alongside
 * `lineWidth = 1` and SHADOW_SOURCE_INSET above, and listed with them in
 * the plan's Global Constraints for the same reason: what it compensates
 * for is one pixel wide at every canvas size.
 *
 * THE RULE THIS ENCODES: A SHOT GETS EXACTLY ONE ANTIALIASED EDGE, AND IT
 * IS THE MASK'S. Every part drawn inside a tile - the screenshot, the
 * browser's title bar - is drawn one pixel PAST where the shot ends, so it
 * has no partial coverage of its own along that line; `placeShot` then
 * cuts the shape once, with a single `destination-in` fill of the rounded
 * path, and stamps the result down at integer coordinates.
 *
 * Why one edge and not two. A mask and a `drawImage` rect that land on the
 * same line are each antialiased, and their coverages MULTIPLY: a boundary
 * pixel the geometry puts 60% inside got the screenshot at 0.6 x 0.6 =
 * 0.36 and kept whatever was behind it for the other 0.64. That is a
 * one-pixel halo of the backing colour around every shot, worst at the
 * corners, and it is what Rock reported three times. Measured in Chromium
 * on this exact geometry, screenshot coverage against the path's own:
 *
 *   tile, no bleed     left 0.361 (path 0.600)   top 0.000 (path 0.502)
 *                      right 0.361 (0.596)       bottom 0.250 (0.502)
 *   tile, bleed 1      left 0.600  top 0.500  right 0.594  bottom 0.500
 *
 * The bleed is an EDGE CLAMP - the source's own outermost row and column,
 * stretched one pixel outward under `destination-over` - and not a scaled-
 * up second copy of the whole picture. Both fix the coverage identically;
 * the clamp also keeps the boundary pixel's COLOUR exact, because it
 * extends the edge pixels rather than resampling the picture off its own
 * grid. On a source whose first row is a distinct colour, Chromium reads
 * that row at the top boundary pixel as 218,90,218 with the clamp and
 * 172,136,172 with a scaled copy, against 218,90,218 for the row itself.
 * `destination-over` is what keeps it to the ring: it can only fill pixels
 * the picture left transparent, so a window capture's own transparent
 * corners stay transparent and nothing in the interior is touched.
 *
 * What this replaced, and why that had to go. Task 4c solved the same
 * multiplication by snapping the screenshot's destination rect outward
 * onto the pixel grid inside a `ctx.clip()`. It worked, and it cost two
 * things. It resampled the picture at up to 0.05% off its own scale (7-12%
 * of pixels in every golden), and - because the drawn rect now reached the
 * clip - it exposed the clip itself, which in Chromium does not agree with
 * the path it was built from. Measured, same geometry, walking the shot's
 * implied edge position row by row up the bottom-right corner:
 *
 *   clip + snapped drawImage   rows 1110-1121 track the arc to 0.03px,
 *                              row 1122 +0.45px, row 1123 +14.0px
 *   tile + bleed + mask        worst row 0.031px, worst step 0.026px
 *
 * Fourteen pixels of shot sticking out where the straight edge meets the
 * arc, plus a full pixel of overshoot along the right and bottom edges
 * (coverage 1.000 where the path says 0.596 and 0.502) - "a visible spike
 * where the straight edge meets the corner arc", reported without zooming.
 * That much is the same Chromium behaviour Task 4b measured for a covering
 * `fillRect` (see fillRoundRect): a non-rectangular clip is rasterised
 * against rounded device bounds, not against its path. @napi-rs/canvas
 * reproduces none of it - the Node numbers for the same walk are 0.031px
 * worst and 0.021px worst step, before and after - so it is guarded
 * structurally, in test/render-clip-safety.test.js, and measured in
 * docs/verification-2026-09-01.md.
 *
 * The other report - "1px is cut from the top and left" - needs no engine
 * quirk at all and is not one. The snapped rect starts at `floor(box.x)`,
 * the clip cuts at `box.x`, and the overhang between them is picture: 39%
 * of the source's first row and 30% of its first column, identical to three
 * decimals in both engines. That half IS a pixel test - see
 * test/render-edge-blend.test.js.
 *
 * NOTHING IS CLIPPED AND NOTHING IS PAINTED BEHIND A SHOT ANY MORE. Both
 * followed from the same question Rock asked - "I don't understand why we
 * are rendering anything behind it at all" - and he was right: the only
 * reason a backing ever existed was paintShadow's opaque caster showing
 * through partial coverage. paintShadow now clips that caster out of the
 * box (see its doc comment), so the honest answer behind a shot is the
 * ground that is already there.
 */
const TILE_BLEED = 1;

/**
 * Tile bitmaps are allocated at a whole multiple of this many pixels per
 * axis, always at least the size the shot needs. Task 4d.
 *
 * Not a rendering constant - it changes nothing that is painted. The extra
 * strip is transparent, `destination-in` clears it with everything else
 * outside the mask, and compositing a transparent strip is a no-op. It is
 * an ALLOCATION constant, and it exists because `makeCanvas` implementations
 * are entitled to pool by size: web/state.js keeps one canvas per `WxH` it
 * has been asked for, so a tile sized to the exact box would mint a new
 * multi-megabyte canvas on every frame of a padding drag and keep every one
 * of them. Quantised, a full sweep of the padding slider on an 1800x1200
 * canvas asks for eight distinct tile sizes instead of about two hundred.
 * The cost is at most 63 unused pixels per axis - about 7% of the tile's
 * area on a full-width web shot.
 */
const TILE_QUANTUM = 64;

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
  ctx.beginPath();
  traceRoundRect(ctx, x, y, w, h, r);
}

/**
 * The same shape, added to whatever path is already open instead of
 * starting a fresh one. Only paintShadow needs it, to trace the canvas and
 * the box as two subpaths of ONE even-odd path; every other caller wants
 * roundRect above, which is this plus the `beginPath` it used to inline.
 */
function traceRoundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y,     x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x,     y + h, rr);
  ctx.arcTo(x,     y + h, x,     y,     rr);
  ctx.arcTo(x,     y,     x + w, y,     rr);
  ctx.closePath();
}

/**
 * Fill a rounded rect by filling its PATH. Every body/screen fill in this
 * file goes through here.
 *
 * NEVER PAINT A BODY WITH fillRect INSIDE A ROUNDED CLIP. That is what this
 * function exists to prevent, and it is not a style preference - it was
 * shipping a white border on every dark screenshot. In Chromium, a fillRect
 * that COVERS its clip region is rasterised against the clip mask's
 * rounded-out device bounds instead of its own rectangle, and for an
 * antialiased non-rectangular clip those bounds overshoot the path by ~4px
 * on the right and bottom. Measured directly in Chrome (Cycle A Task 4b),
 * canvas 1800x1200, box {x:100,y:100,w:1600,h:1000}:
 *
 *   radius 0   clip+fillRect -> right 1699, bottom 1099   (exact)
 *   radius 2..96 clip+fillRect -> right 1703, bottom 1103 (+4 / +4)
 *   radius 24  clip+fill(path) -> right 1699, bottom 1099 (exact)
 *
 * The overshoot is a constant +4, independent of the radius, and appears on
 * the right and bottom only. On the real shot that is a 4px band of the
 * BODY colour - white - showing between the screenshot and the ground, plus
 * a bottom-right corner whose curve no longer matches the shot's radius.
 * Both were reported: "they have a white stroke", "even the roundness of
 * the corner is off". It is invisible on a pale screenshot, which is why it
 * survived so long.
 *
 * Only a fill that covers the whole clip triggers it: a small rect deep
 * inside the clip (the browser bar in paintChrome) is exact, and so is
 * drawImage at any size. So the fix is not "stop clipping" - it is "fill
 * the path you already have instead of a rectangle over it".
 *
 * @napi-rs/canvas does NOT reproduce this, so no Node test can catch it -
 * see test/render-clip-safety.test.js for the source-level guard that
 * stands in for one, and docs/verification-2026-09-01.md for the full
 * measurement.
 */
function fillRoundRect(ctx, x, y, w, h, r, style) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = style;
  ctx.fill();
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
 *
 * THE BOX IS CLIPPED OUT OF ITS OWN SHADOW (Task 4d). Everything this
 * function draws lands strictly OUTSIDE `box`: the even-odd clip below is
 * the canvas with the box path punched out of it, so the blur still spills
 * outward exactly as before while the opaque caster - and the inner half
 * of the blur, which nothing ever saw anyway - never reaches a pixel the
 * shot will sit on.
 *
 * That is what lets every painter above stop drawing a backing. Until now
 * this caster was the ONLY reason anything was painted behind a shot:
 * frame.html's white `--screen-bg` card, then (Task 4c) a second pass of
 * the ground over it. Both existed to hide an opaque black rectangle that
 * should not have been under the picture in the first place, and both were
 * themselves visible - as a white halo, and through any transparent pixel
 * in the source. Rock asked the right question: "I don't understand why we
 * are rendering anything behind it at all." Nothing is, now.
 *
 * The clip's outer ring is `ctx.canvas`, which every canvas 2D context
 * exposes - it is the surface being painted, not a DOM lookup, and reading
 * it is not engine detection.
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

  ctx.save();
  // Everything except the box: the whole surface, with the box's own path
  // punched out of it, even-odd. Traced as one path so the two subpaths
  // are a single clip region - two separate clips would intersect, not
  // subtract.
  ctx.beginPath();
  ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
  traceRoundRect(ctx, box.x, box.y, box.w, box.h, box.radius);
  ctx.clip('evenodd');

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

  ctx.restore();
}

/**
 * Draw `image` into `box` with object-fit and object-position: top center,
 * at the box's TRUE rect - no rounding, no snapping, no clip - and then
 * clamp its outermost row and column one pixel further out.
 *
 * ONLY EVER CALLED INTO A TILE, never straight onto the target canvas. The
 * clamped pixels are deliberately outside the shot; `placeShot` below cuts
 * them off with the single mask that gives the shot its shape. Drawing this
 * onto the target directly would paint a one-pixel skirt around the
 * picture. That is why nothing here clips: a clip on this rect would be a
 * second antialiased edge on the same line as the mask, which is the bug
 * (see TILE_BLEED at the top of this file).
 *
 * The clamp is four `drawImage` calls under `destination-over`, each taking
 * a one-pixel source strip - the image's own first/last row and column -
 * and stretching it TILE_BLEED pixels beyond the drawn rect. Two properties
 * matter and neither is incidental:
 *
 *  - `destination-over` can only fill pixels the picture left transparent,
 *    so the interior is bit-for-bit the plain `drawImage` above it. A macOS
 *    window capture's transparent corners stay transparent.
 *  - the strips carry the edge's OWN colour. Redrawing the whole picture a
 *    pixel larger fixes the coverage just as well and shifts the boundary
 *    colour, because it resamples the picture off its own grid: measured in
 *    Chromium on a source whose first row is a distinct colour, the top
 *    boundary pixel reads 218,90,218 clamped and 172,136,172 scaled, where
 *    the row itself is 218,90,218.
 *
 * A 'cover' fit overflows the box on one axis; those strips land outside
 * the mask and are cut away with everything else, which costs two thin
 * draws and keeps this function free of a special case.
 */
function drawFitted(ctx, box, image, fit) {
  const ir = image.width / image.height;
  const br = box.w / box.h;
  let dw, dh;
  if (fit === 'cover' ? ir > br : ir < br) { dh = box.h; dw = box.h * ir; }
  else                                     { dw = box.w; dh = box.w / ir; }

  const dx = box.x + (box.w - dw) / 2, dy = box.y;                        // top center
  ctx.drawImage(image, dx, dy, dw, dh);

  const b = TILE_BLEED;
  const iw = image.width, ih = image.height;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.drawImage(image, 0,      0,      iw, 1,  dx - b,      dy - b,      dw + b * 2, b * 2);
  ctx.drawImage(image, 0,      ih - 1, iw, 1,  dx - b,      dy + dh - b, dw + b * 2, b * 2);
  ctx.drawImage(image, 0,      0,      1, ih,  dx - b,      dy - b,      b * 2, dh + b * 2);
  ctx.drawImage(image, iw - 1, 0,      1, ih,  dx + dw - b, dy - b,      b * 2, dh + b * 2);
  ctx.restore();
}

/**
 * Compose one shot in its own offscreen canvas, cut its shape once, and
 * stamp it down.
 *
 * `bounds` is the rect the tile has to hold; the tile is that rect rounded
 * outward to whole pixels, so it lands on the target at INTEGER coordinates
 * and `drawImage` copies it one-for-one with no resampling of any kind.
 * `paint(tctx, at)` fills it in: `at(rect)` shifts a canvas-space rect into
 * tile space (the tile deliberately carries NO transform - see the comment
 * on that inside), and everything drawn should be drawn GENEROUSLY, past
 * `mask` on every side. That is what drawFitted's clamp does for a
 * screenshot and what the TILE_BLEED overshoot on paintChrome's bar does
 * for the browser's title bar. `mask` is the rounded rect that then cuts
 * the shape, in one `destination-in` fill: the shot's single antialiased
 * edge.
 *
 * `makeCanvas` is the factory core/ is handed (composeWithMeta's fourth
 * argument). This file never creates a canvas itself - there is no
 * `document` in the CLI or in the test harness, and reaching for one would
 * be exactly the engine assumption the plan's Global Constraints forbid.
 *
 * Cost: one canvas the size of the shot, per shot, per render, and it is
 * worth reading the two numbers separately because they disagree.
 *
 * IN THE BROWSER - the product, and the thing that re-renders on every
 * slider drag - it is free. Chromium, the standard 1800x1200 web case with
 * its shadow, 60 renders each, forced to flush every frame:
 *
 *   Task 4c   backing fill + clip + snapped drawImage   mean 74.8ms
 *   Task 4d   clipped shadow + tile                     mean 71.1ms
 *
 * Slightly faster, in fact: both are dominated by the two shadow blurs, and
 * clipping the box out of the shadow gives the blur less to cover than the
 * tile costs to blit.
 *
 * IN @napi-rs/canvas it is NOT free - a software rasteriser has to compose
 * and then blit a second full-size surface. Same case, colour analysis
 * excluded (it dwarfs everything at ~200ms and is cached across drags - see
 * composeWithMeta's `precomputedMeta`), mean of 40:
 *
 *   frame: none  3.7ms -> 26.3ms      browser  3.7ms -> 29.2ms
 *   phone frame  3.7ms -> 29.0ms      web+mobile (two shots)  3.8ms -> 36.4ms
 *
 * Almost all of it is the tile blit: an EMPTY 1728x1088 tile costs 4.7ms to
 * draw onto the target there. That is the CLI's and the test suite's bill,
 * not a user's - the full suite went from 31.1s to 29.4s, because the
 * goldens spend their time elsewhere - and it buys an edge that is correct
 * in both engines. It is the reason TILE_QUANTUM exists and the reason this
 * function tiles the SHOT rather than the whole canvas.
 */
function placeShot(ctx, makeCanvas, bounds, mask, paint) {
  const ox = Math.floor(bounds.x), oy = Math.floor(bounds.y);
  const w = Math.max(1, Math.ceil(bounds.x + bounds.w) - ox);
  const h = Math.max(1, Math.ceil(bounds.y + bounds.h) - oy);

  // Rounded up to TILE_QUANTUM (see its comment): the extra strip is never
  // painted into and is cleared by the mask below along with everything else
  // outside the shot, so it costs allocation and nothing else.
  const aw = Math.ceil(w / TILE_QUANTUM) * TILE_QUANTUM;
  const ah = Math.ceil(h / TILE_QUANTUM) * TILE_QUANTUM;

  const tile = makeCanvas(aw, ah);
  const tctx = tile.getContext('2d');
  // The factory is free to hand back a pooled canvas (web/state.js does),
  // so start from a known-empty one rather than trusting it to be fresh.
  tctx.clearRect(0, 0, aw, ah);

  // THE TILE CARRIES NO TRANSFORM, AND THAT IS NOT A STYLE CHOICE. Setting
  // `translate(-ox, -oy)` and letting `paint` work in canvas coordinates is
  // the obvious way to write this and it is silently, catastrophically
  // broken under @napi-rs/canvas: a `destination-in` fill whose path lies
  // outside the UNTRANSFORMED canvas bounds is culled, and a culled
  // destination-in clears the entire surface. Measured - a 512x1024 tile,
  // translate(-ox, 0), the mask traced at x = ox + 1: correct for every ox
  // up to 500, and empty for every ox from 550 on. A phone in the mobile
  // layout sits at x = 670, so the first version of this shipped phones
  // with no screenshot in them at all and the goldens caught it. Offsetting
  // the coordinates instead has no such edge, in any engine.
  //
  // `at` is how a painter reaches tile space: it shifts a rect and keeps
  // every other field, so `at(box)` is still a box, chrome and all.
  const at = r => ({ ...r, x: r.x - ox, y: r.y - oy });

  paint(tctx, at);

  // ONE MASK, ONE EDGE. destination-in keeps the tile only where this fill
  // lands, and clears it everywhere else - including the parts of the tile
  // the path never reaches, which is how the corners get cut.
  const m = at(mask);
  tctx.globalCompositeOperation = 'destination-in';
  roundRect(tctx, m.x, m.y, m.w, m.h, m.radius);
  tctx.fillStyle = '#000';
  tctx.fill();
  tctx.globalCompositeOperation = 'source-over';

  ctx.drawImage(tile, ox, oy);
}

/**
 * A 1px hairline stroked just INSIDE a rounded rect's own edge - what CSS's
 * `border: 1px solid` does, and the shape three painters below want.
 *
 * THE RADIUS SHRINKS WITH THE INSET, AND THAT IS THE WHOLE REASON THIS
 * FUNCTION EXISTS. A stroke straddles its path, so the path goes half a
 * pixel in on every side; a rect inset by 0.5 whose radius is left at `r`
 * is no longer concentric with the `r` corner it is supposed to trace, and
 * the hairline bulges outside the arc. It is the same correction
 * paintShadow already makes for its inset caster.
 *
 * The error is 0.5 against the radius, so it hid for as long as the radii
 * were large: at the browser frame's old 23.6px corner it is 2%, invisible.
 * Rock asked for a 0.6%-of-canvas window corner (10.8px), which doubled it
 * to 4.6% - past the tolerance of the corner-continuity metric in
 * test/render-edge-blend.test.js, which is what surfaced it. An unframed
 * shot at the same radius passed the identical metric, which is how it was
 * pinned on the hairline rather than on the arc or on the ruler.
 */
export function strokeInsetHairline(ctx, box, style) {
  ctx.save();
  ctx.strokeStyle = style;
  ctx.lineWidth = 1;
  roundRect(ctx, box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1,
            Math.max(0, box.radius - 0.5));
  ctx.stroke();
  ctx.restore();
}

/**
 * The stroke: an opt-in MAT around the shot (Cycle A Task 7).
 *
 * It is a filled rounded rect painted at the composite's OUTER box, before
 * anything else lands on top of it. That ordering is the whole design and
 * it is what makes the function's one promise cheap to keep: the shot is
 * placed afterwards, into `box.inner`, so the mat can grow the composite
 * outward and can never cover the picture. There is no lineWidth here and
 * no `ctx.stroke()` for the mat itself - a real canvas stroke straddles its
 * path, so half of it would land inside the shot's own edge, which is
 * exactly the inset hairline Task 1 deleted.
 *
 * `width` is the ALREADY-RESOLVED thickness in canvas pixels (layout.js
 * computed it from `stroke.width` x the shorter canvas side, then scaled it
 * by the same `shrink` as every other outset). Do not pass a ratio, and do
 * not re-derive it from the canvas here - a second derivation is a second
 * source of truth, and the composite's geometry was already settled in
 * layout.js.
 *
 * A path FILL, not a fillRect in a clip - see fillRoundRect's comment for
 * the Chromium clip-bounds overshoot that rule exists to avoid. Its own
 * antialiased edge against the ground is a single boundary, exactly like
 * the device body's.
 *
 * `glass` is deliberately translucent (0.55 white) so the ground reads
 * through it, which is what makes it look like glass rather than a thinner
 * white mat. That leaves it very faint on a pale ground, so it - and only
 * it - gets a hairline on its outer edge to hold the shape. `light` and
 * `custom` are opaque and need no such help.
 */
export function paintStroke(ctx, box, stroke, width) {
  if (stroke.style === 'none' || width <= 0) return;

  ctx.save();
  roundRect(ctx, box.x, box.y, box.w, box.h, box.radius);
  if (stroke.style === 'glass') {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
  } else if (stroke.style === 'custom') {
    ctx.fillStyle = stroke.color;
  } else {
    ctx.fillStyle = '#ffffff';
  }
  ctx.fill();
  ctx.restore();

  if (stroke.style === 'glass') {
    strokeInsetHairline(ctx, box, 'rgba(16,18,27,0.06)');
  }
}

/**
 * The web screen: rounded body, screenshot, floating shadow.
 * Ported from frame.html's `.web` rule and `makeWeb()`. frame.html's
 * `.web::after` inset hairline is deliberately NOT ported - see the note at
 * the end of this function.
 */
export function paintWeb(ctx, c, box, image, makeCanvas) {
  // A device frame replaces everything below with a chrome-specific
  // painter: browser goes to paintWebChrome, phone to paintPhoneChrome.
  // box.chrome is null for frameKind: 'none' - the only branch this adds -
  // so every line below it is completely untouched, reached exactly as
  // before whenever there is no frame.
  if (box.chrome?.kind === 'phone') return paintPhoneChrome(ctx, c, box, image, makeCanvas);
  if (box.chrome) return paintWebChrome(ctx, c, box, image, makeCanvas);

  // The shadow, cast around the box rather than under it.
  //
  // Alphas are frame.html's makeWeb() values UNCHANGED: 0.17 / 0.07. Do not
  // retune these - see paintShadow's doc comment above (a prior pass did,
  // and had to be reverted: it fixed napi-rs's faint test render while
  // shipping a far-too-heavy shadow to the browser, the actual product).
  // `c.shadowScale` (Task 6b, default 1) multiplies ON TOP of these -
  // the alphas themselves stay exactly as written here.
  paintShadow(ctx, box, c.h * 0.040, c.h * 0.105, 0.17, 0.07, c.shadowScale);

  // NOTHING IS PAINTED BEHIND THE SCREENSHOT (Task 4d). This line was
  // `fillRoundRect(..., '#ffffff')` - frame.html's `--screen-bg`, a white
  // card - and then, briefly, a second pass of the ground over the same
  // path. Both were there to cover paintShadow's opaque caster, and both
  // leaked around the picture's own edge because a backing can only ever
  // show through partial coverage. The caster is clipped out of the box
  // now, so what is behind the shot is the ground that was already there.
  //
  // A LITERAL 'contain'. `c.fit` is gone (Cycle A Task 4) - the web screen
  // never crops. drawFitted stays because paintPhone still calls it with
  // 'cover' for the phone's own screen, which is a different decision.
  // The mat, if there is one. Painted BEFORE the shot and never after: it
  // is a backing for the ring of pixels outside `box.inner` and nothing
  // else, so it cannot leak over the picture the way frame.html's inset
  // hairline did. `box.strokeWidth` is 0 by default, and paintStroke
  // returns immediately at style 'none', so the unframed no-stroke path
  // below is exactly what it was.
  paintStroke(ctx, box, c.stroke, box.strokeWidth);

  // The shot goes into the INTERIOR. With no stroke `box.inner` is `box`'s
  // own rect to the last ULP (layout.js), so this line is unchanged for
  // every existing config.
  placeShot(ctx, makeCanvas, box.inner, box.inner,
    (t, at) => drawFitted(t, at(box.inner), image, 'contain'));

  // STILL NO UNCONDITIONAL STROKE. frame.html stroked an inset hairline on
  // every unframed screen; it read as an unrequested border and was the
  // first item of round two's feedback. The edge above is opt-in - it is
  // painted only when the user asked for one - and it is an OUTSET, drawn
  // outside the picture rather than over it. Do not reinstate the old one.
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
//
// TASK 8 CHECKED THESE AGAINST THE SAFARI REFERENCE. Reported in full
// because the task required a verdict either way:
//
//   value        handoff (was)          Safari reference        verdict
//   dark bar     #1b1d22                #191c1f                agree (2 levels)
//   dark body    #101114                #0c0f12                agree (4 levels)
//   light bar    #f6f7f9                #ffffff                CHANGED
//   light pill   #ffffff                #f0f0f0                CHANGED
//   dark pill    rgba(255,255,255,.07)  #434343                CHANGED
//
// The dark pair are within a few levels and are the app's own palette, so
// they stay. The pills did not merely differ in value, they differed in
// SIGN: our light pill was LIGHTER than its bar, where a browser's URL
// field is recessed - darker than the chrome around it. That reads wrong at
// any size, so the light bar goes to the reference's white and the light
// pill to its #f0f0f0, restoring the relationship.
//
// The dark pill stays a translucent white rather than the reference's flat
// #434343: the reference is neutral grey and our bar is blue-grey, so a
// literal port would sit as a colour-cast patch inside it. 0.16 over
// #1b1d22 lands at #40424a - the same lightness as #434343, carrying the
// bar's own hue. That is a port of the relationship, not of the number, and
// it is written down here rather than left as a mystery constant.
const CHROME_THEME = {
  dark:  { bar: '#1b1d22', body: '#101114', border: 'rgba(255,255,255,0.09)', pill: 'rgba(255,255,255,0.16)', pillText: '#9ba1ab' },
  light: { bar: '#ffffff', body: '#ffffff', border: '#e3e5ea',                pill: '#f0f0f0',                pillText: '#5c6470' },
};

function chromeColours(theme) {
  return theme === 'light' ? CHROME_THEME.light : CHROME_THEME.dark;
}

// The macOS traffic lights, theme-independent. Kept at the saturated
// system values the handoff used, NOT swapped for the Safari reference's
// own #EE6A5F / #F5BD4F / #61C454 - those are its matte reconstruction of
// the same three lights, each with a darker ring, and at the size these
// draw here (12/1280 of the frame - about 17px on a 1800px canvas) the
// ring is sub-pixel and the muted fills just read as dimmer dots. Recorded
// so the difference is a decision rather than an oversight.
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
 * ONLY EVER CALLED INTO A TILE, like drawFitted (Task 4d), and from exactly
 * one place: paintWebChrome's `placeShot` callback, which hands it a `box`
 * already shifted into tile space. The bar deliberately overshoots the
 * frame's left, right and top by TILE_BLEED and relies on the tile's mask to
 * cut it - see the comment on that fill. Calling this straight onto the
 * target canvas would paint a bar a pixel wider than its frame, with square
 * top corners.
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

  // bar fill, overshooting left, right and top by TILE_BLEED.
  //
  // THIS FUNCTION IS ONLY EVER CALLED INTO A TILE (from paintWebChrome
  // below), where the mask is what gives the frame its shape - so the bar
  // has to reach PAST the frame's left, right and top edges rather than
  // stop on them. Stopping on them would put the bar's own antialiased
  // edge on the same line as the mask's and multiply the two, which is a
  // pale seam down the frame's top corners: the same defect TILE_BLEED
  // exists to prevent for the screenshot. The bottom edge is not bled: it
  // meets the screenshot, an interior boundary the mask never touches, and
  // an exact fillRect edge is what should land there.
  ctx.fillStyle = t.bar;
  ctx.fillRect(barX - TILE_BLEED, barY - TILE_BLEED,
               barW + TILE_BLEED * 2, barH + TILE_BLEED);

  // bar's own bottom hairline: `border-bottom:1px solid {{fBorder}}` on the
  // bar div itself, distinct from the frame's outer border painted by
  // paintWebChrome. Bled sideways for the same reason as the fill - its two
  // ends land on the frame's edge otherwise.
  ctx.save();
  ctx.strokeStyle = t.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(barX - TILE_BLEED, barY + barH - 0.5);
  ctx.lineTo(barX + barW + TILE_BLEED, barY + barH - 0.5);
  ctx.stroke();
  ctx.restore();

  // Traffic lights: three dots at TRAFFIC_INSET_RATIO from the window's own
  // left edge, TRAFFIC_GAP_RATIO apart CENTRE TO CENTRE (not edge to edge -
  // the reference's circles sit at cx 6, 26, 46, so the gap is the stride),
  // vertically centred in the bar.
  const dotD = box.w * TRAFFIC_DOT_RATIO;
  const cy = barY + barH / 2;
  let cx = barX + box.w * TRAFFIC_INSET_RATIO + dotD / 2;
  for (const colour of TRAFFIC_DOT_COLOURS) {
    ctx.beginPath();
    ctx.fillStyle = colour;
    ctx.arc(cx, cy, dotD / 2, 0, Math.PI * 2);
    ctx.fill();
    cx += box.w * TRAFFIC_GAP_RATIO;
  }

  // URL pill: a FIXED width, CENTRED in the window. Round one sized it to
  // whatever was left after the dot group and the bar's padding, so it was
  // never centred on anything and grew with the frame in a way the
  // reference's never does. Both facts come straight from the Figma node -
  // 484 wide, and left:50% with a -50% translate.
  const pillW = box.w * URL_PILL_WIDTH_RATIO;
  const pillH = box.w * URL_PILL_HEIGHT_RATIO;
  const pillR = box.w * URL_PILL_RADIUS_RATIO;
  const pillX = barX + (barW - pillW) / 2;
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
    // A UI SANS, NOT A MONO. The reference sets this in SF Pro Display
    // Medium - a browser's address bar is system UI text, and Geist Mono at
    // this size read as a code snippet pasted into the chrome. `system-ui`
    // resolves to SF Pro on macOS, which is the reference's own face.
    ctx.font = `500 ${box.w * URL_PILL_FONT_RATIO}px system-ui, -apple-system, 'Segoe UI', 'Geist', sans-serif`;
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
 * ratio - that is layout.js's job (see webBox()/chromeFor() there: the
 * screenshot's box is computed FIRST and the frame grows outward from it) - so
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
function paintWebChrome(ctx, c, box, image, makeCanvas) {
  const chrome = box.chrome;
  const outer = { x: box.x, y: box.y, w: box.w, h: box.h, radius: chrome.radius };
  // The frame itself, inside the mat. Identical to `outer` when there is no
  // stroke (layout.js's bodyRadius is `radius` unchanged then), so every
  // line below is what it was for an unstroked browser frame.
  //
  // It carries `chrome` because paintChrome reads it, and it is what
  // paintChrome must be given: the bar belongs to the WINDOW, not to the
  // mat around it. Handing it the outer box instead drew the bar a stroke
  // too high and a stroke too short, leaving a band of bare mat between the
  // bar and the screenshot - 16px of white, measured in Chromium at a 1.5%
  // stroke before this line existed.
  const body = { ...box.inner, radius: chrome.bodyRadius, chrome };
  const t = chromeColours(c.chromeTheme);

  // Same alphas/spread maths as the unframed screen's shadow above - only
  // the shadowed box changes (the outer frame, not the bare screenshot).
  // Do NOT retune: see the doc comment above paintShadow. `c.shadowScale`
  // multiplies on top, same as every other paintShadow call site.
  paintShadow(ctx, outer, c.h * 0.040, c.h * 0.105, 0.17, 0.07, c.shadowScale);

  // The mat wraps the whole window, bar included - see paintStroke above.
  paintStroke(ctx, outer, c.stroke, box.strokeWidth);

  // The whole frame is composed in one tile and cut once (Task 4d). There
  // is no body fill behind it and no ground re-painted under it: `fBodyBg`
  // was white in the light theme and #101114 in the dark one, and since the
  // bar covers its whole strip and the screenshot covers everything below,
  // the only thing it ever did was leak at the frame's own edge - on the
  // left, right and bottom of every light-theme browser shot. Ground was
  // then tried in its place and leaked identically, because the leak is
  // partial coverage, not the colour. Nothing goes behind it now.
  placeShot(ctx, makeCanvas, body, body, (tc, at) => {
    // Straight into the interior - no fit/cover/contain maths belongs here;
    // `screen` already carries the source's exact ratio, so 'contain' is a
    // no-op fit and drawFitted is used for its bleed (see its doc comment).
    drawFitted(tc, at(chrome.screen), image, 'contain');
    // THE BAR IS PAINTED AFTER THE SCREENSHOT, DELIBERATELY. The
    // screenshot's top edge and the bar's bottom edge are the same line,
    // and the screenshot's bleed now reaches a pixel past it. Painting the
    // bar last puts an exact fillRect edge on that boundary and covers the
    // bleed. Nothing else depends on the order: the two abut, they never
    // overlap by design.
    paintChrome(tc, c, at(body), c.chromeTheme);
  });

  // outer hairline: `border:1px solid {{fBorder}}` on the mockup's frame
  // wrapper. Stroked on the target, not in the tile: half its width falls
  // outside the frame, which is where the mask ends and is exactly what the
  // CSS border does.
  strokeInsetHairline(ctx, body, t.border);
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
  // A clip plus a covering fillRect used to draw this; the clip was doing
  // nothing a path fill does not do, and in Chromium the covering fillRect
  // overshot it by ~4px on the right and bottom (see fillRoundRect).
  fillRoundRect(ctx, box.x, box.y, box.w, box.h, box.radius, '#111318');  // --phone-frame
  ctx.restore();
}

function paintDeviceHairline(ctx, box) {
  strokeInsetHairline(ctx, box, 'rgba(255,255,255,0.10)');
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
 * is sized FROM the source image's own ratio by layout.js's webBox() - which
 * starts from the screenshot and grows the bezel outward - so
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
function paintPhoneChrome(ctx, c, box, image, makeCanvas) {
  const chrome = box.chrome;
  const outer = { x: box.x, y: box.y, w: box.w, h: box.h, radius: chrome.radius };
  // The device, inside the mat. Identical to `outer` with no stroke.
  const body = { ...box.inner, radius: chrome.bodyRadius };

  // Same alphas as paintWebChrome's own outer shadow (see this function's
  // doc comment above); `c.shadowScale` multiplies on top, same as every
  // other paintShadow call site.
  paintShadow(ctx, outer, c.h * 0.040, c.h * 0.105, 0.17, 0.07, c.shadowScale);

  // The mat wraps the device - see paintStroke above.
  paintStroke(ctx, outer, c.stroke, box.strokeWidth);

  // The device body needs no tile: it is a path FILL, so its own edge is
  // already the single antialiased boundary between the device and the
  // ground, and paintShadow no longer casts anything underneath it.
  paintDeviceBody(ctx, body);

  // The screen is its own tile, cut to the bezel's inner radius. WHAT IS
  // BEHIND A PHONE'S SCREEN IS THE PHONE - the device body above has
  // already filled this whole area, so the screen's boundary pixel blends
  // screenshot into device, and a transparent source shows the device
  // rather than a hole. That is drawn content, not a backing hiding a
  // shadow caster, and it is deliberately not the ground: backing this
  // screen with the ground instead was measured at +52 levels of light
  // halo inside the bezel, which is the reported bug in a new colour.
  //
  // Unlike paintPhone's mobile screenshots (always 'cover'), chrome.screen
  // carries the source image's own ratio - layout.js's webBox() sizes the
  // frame FROM the picture, outward - so 'contain' is a no-op fit here.
  const screen = { ...chrome.screen, radius: chrome.innerRadius };
  placeShot(ctx, makeCanvas, chrome.screen, screen,
    (t, at) => drawFitted(t, at(chrome.screen), image, 'contain'));

  paintDeviceHairline(ctx, body);
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
export function paintPhone(ctx, c, box, image, makeCanvas) {
  paintShadow(ctx, box, box.h * 0.055, box.h * 0.14, 0.22, 0.10, c.shadowScale);

  // body - shared with the phone frame's paintPhoneChrome via
  // paintDeviceBody, defined above. A path fill, so its edge against the
  // ground is already a single antialiased boundary.
  paintDeviceBody(ctx, box);

  // screen, inset by the bezel. Always cover, anchored top center, and
  // backed by the device for the reasons paintPhoneChrome sets out above.
  const inner = {
    x: box.x + box.frame,
    y: box.y + box.frame,
    w: box.w - box.frame * 2,
    h: box.h - box.frame * 2,
  };
  placeShot(ctx, makeCanvas, inner, { ...inner, radius: box.innerRadius },
    (t, at) => drawFitted(t, at(inner), image, 'cover'));

  // inset 0 0 0 1px rgba(255,255,255,0.10) - shared via paintDeviceHairline,
  // same as the body above.
  paintDeviceHairline(ctx, box);
}
