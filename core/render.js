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
