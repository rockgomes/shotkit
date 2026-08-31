/**
 * render.js - paint a layout onto a canvas 2D context.
 *
 * Handed a target context; never creates one. That keeps core/ free of DOM
 * types and lets Node reuse this file through @napi-rs/canvas.
 *
 * This file covers the first half of the painting: the ground gradient and
 * the grain overlay. Task 6 appends paintShadow (reusing SHADOW_RGB and
 * rgba()/hexToRgb below); Task 7 appends the phone and caption.
 */

export const SHADOW_RGB = '12,14,20';

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
 */
export function paintGround(ctx, c, stops) {
  const [g1, g2, g3] = stops;

  // linear-gradient(166deg, g1 0%, g2 52%, g3 100%)
  // CSS 0deg points up and angles run clockwise.
  const rad = (166 - 90) * Math.PI / 180;
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
 * Deterministic fractal value noise. The original used an SVG feTurbulence
 * filter, which cannot be reproduced exactly on a canvas, so this is a
 * fixed-seed approximation with the same character: 3 octaves, fine grain.
 *
 * Fixed seed matters twice - the pixel-diff tests need it, and the user needs
 * the export to match the preview byte for byte.
 */
export function noiseTile(size = 240) {
  // mulberry32: tiny, seeded, no dependency
  let s = 0x9e3779b9;
  const rnd = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const grid = n => {
    const g = new Float64Array(n * n);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    return g;
  };

  // three octaves, wrapping so the tile is seamless
  const octaves = [
    { n: size / 2 | 0, amp: 0.5 },
    { n: size / 4 | 0, amp: 0.3 },
    { n: size / 8 | 0, amp: 0.2 },
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

let tileCanvasCache = null;

/**
 * Fine grain, tiled at 240px. Keeps big flat gradients from banding.
 * soft-light, matching the original mix-blend-mode.
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

  if (!tileCanvasCache) {
    const t = noiseTile(240);
    const tc = makeCanvas(240, 240);
    const tctx = tc.getContext('2d');
    const id = tctx.createImageData(240, 240);
    id.data.set(t.data);
    tctx.putImageData(id, 0, 0);
    tileCanvasCache = tc;
  }

  ctx.save();
  ctx.globalAlpha = c.grain;
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = ctx.createPattern(tileCanvasCache, 'repeat');
  ctx.fillRect(0, 0, c.w, c.h);
  ctx.restore();
}

/**
 * Rounded-rect path helper. Shared by the web screen and (Task 7) the phone.
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
 * The original CSS stacked two shadows on every element: a wide ambient one
 * and a tight contact one. Canvas takes a single shadow per draw, so this is
 * two passes over the same rounded rect.
 *
 * CSS blur-radius and canvas shadowBlur both resolve to sigma = value / 2,
 * so the numbers carry over directly. This was verified, not assumed - see
 * the measurement note on paintWeb below. Use frame.html's alphas UNCHANGED
 * for any new caller of this function (Task 7's phone included): the browser
 * engine that actually ships this code renders them correctly.
 *
 * CAUTION FOR ANYONE TESTING THIS UNDER @napi-rs/canvas (i.e. every test in
 * this repo, and the CLI harness): that engine's shadow blur is measurably
 * NOT linear in alpha at these blur radii - see paintWeb's comment for the
 * numbers. A napi-rs render will look visibly fainter than the browser at
 * the exact same alpha values. That is a harness/engine limitation, not a
 * bug in this function or its callers. Do NOT "fix" it by scaling alphas up
 * in shipping code - that would fix the test screenshots while shipping a
 * grossly heavy shadow to every real user, since core/render.js runs in the
 * browser for the actual product. If a napi-rs-rendered golden PNG looks
 * faint, that is expected: it is a napi-rs-vs-napi-rs regression baseline,
 * not a statement about what ships.
 */
export function paintShadow(ctx, box, spreadY, blur, a1, a2) {
  for (const [dy, b, a] of [[spreadY, blur, a1], [spreadY * 0.28, blur * 0.3, a2]]) {
    ctx.save();
    ctx.shadowColor = `rgba(${SHADOW_RGB},${a})`;
    ctx.shadowBlur = b;
    ctx.shadowOffsetY = dy;
    ctx.fillStyle = '#000';
    roundRect(ctx, box.x, box.y, box.w, box.h, box.radius);
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
 * The web screen: rounded body, screenshot, inset hairline, floating shadow.
 * Ported from frame.html's `.web` rule, `.web::after`, and `makeWeb()`.
 */
export function paintWeb(ctx, c, box, image) {
  // shadow first, on an opaque rect, then the screen over it.
  //
  // Alphas are frame.html's makeWeb() values UNCHANGED: 0.17 / 0.07. Do not
  // retune these - a previous pass here did, based on a real but
  // misattributed measurement. Recording both what was measured and why the
  // fix was wrong, so it doesn't happen again on the phone shadow in Task 7:
  //
  // Method: served frame.html locally, drove it through its `?c=<base64>`
  // config param with matching ground/box/samples/fieldset.png, then used an
  // SVG-foreignObject canvas capture (same-origin, no CORS taint) to read
  // exact rendered Chromium pixels at 18 points around the screen (below the
  // bottom edge at 6/12/20/30/40/60/80/99px, beside each side edge at
  // 3/10/20/30/60px), grain disabled on both sides to remove that
  // (already-accepted, unrelated) source of pixel noise. Compared those
  // against the same points rendered here via @napi-rs/canvas (the engine
  // every test in this repo runs under). At 0.17/0.07 the @napi-rs/canvas
  // render came out 5-7x fainter than frame.html's.
  //
  // That gap is real, but it is a property of @napi-rs/canvas's shadow blur
  // specifically, not of canvas shadows or of these alpha values: a
  // follow-up review ran this exact paintShadow, unmodified, in an actual
  // Chromium canvas (not napi-rs) against the same 18 points and frame.html
  // matched to within 1 RGB level at every one (SSE 3) - because CSS
  // box-shadow and browser canvas shadow are the same rendering path.
  // @napi-rs/canvas alone renders this alpha/blur combination roughly 5-7x
  // too faint, and does so non-linearly (halving alpha there cuts rendered
  // darkness by far more than half), which is why a single "scale factor"
  // looked plausible but was really curve-fitting the wrong engine's bug.
  //
  // core/render.js ships to the browser - that is the product. napi-rs is
  // only a test/CLI harness, and it renders this function's shadows fainter
  // than a user will ever see. That is the harness's limitation to carry,
  // not something to compensate for by darkening shipping code (which would
  // have shipped a shadow up to ~65 RGB levels too heavy in the browser).
  // Consequence for tests: any napi-rs-rendered golden image of this shadow
  // is a napi-rs-vs-napi-rs regression baseline only - it encodes a fainter
  // shadow than real users see, and must never be compared against a
  // frame.html/browser screenshot to judge fidelity.
  paintShadow(ctx, box, c.h * 0.040, c.h * 0.105, 0.17, 0.07);

  ctx.save();
  roundRect(ctx, box.x, box.y, box.w, box.h, box.radius);
  ctx.clip();
  ctx.fillStyle = '#ffffff';                       // --screen-bg
  ctx.fillRect(box.x, box.y, box.w, box.h);
  drawFitted(ctx, box, image, c.fit);
  ctx.restore();

  // inset 0 0 0 1px hairline
  ctx.save();
  ctx.strokeStyle = 'rgba(16,18,27,0.07)';         // --hairline
  ctx.lineWidth = 1;
  roundRect(ctx, box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1, box.radius);
  ctx.stroke();
  ctx.restore();
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
 * here.
 */
export function paintPhone(ctx, c, box, image) {
  paintShadow(ctx, box, box.h * 0.055, box.h * 0.14, 0.22, 0.10);

  // body
  ctx.save();
  roundRect(ctx, box.x, box.y, box.w, box.h, box.radius);
  ctx.clip();
  ctx.fillStyle = '#111318';                       // --phone-frame
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.restore();

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

  // inset 0 0 0 1px rgba(255,255,255,0.10)
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  roundRect(ctx, box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1, box.radius);
  ctx.stroke();
  ctx.restore();
}

/**
 * The caption: a single line of translucent ink, bottom-left of the safe box.
 * Ported from frame.html's `.caption` rule and the caption block in the IIFE.
 */
export function paintCaption(ctx, c, cap, text) {
  ctx.save();
  ctx.font = `${cap.fontSize}px Inter, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#101218';                       // --ink
  ctx.fillText(text, cap.x, cap.y);
  ctx.restore();
}
