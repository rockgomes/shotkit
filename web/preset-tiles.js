// web/preset-tiles.js — the small ground thumbnails in the Background panel,
// each painted into its canvas by the code that paints the real one: the
// eight preset tiles, and the Angle dial.
//
// THE TILE IS DRAWN BY THE REAL GENERATOR, NEVER APPROXIMATED. That is this
// file's whole reason to exist, and it is not a style preference.
//
// What it replaces: `gradientFor` in web/sidebar.js built a CSS
// `linear-gradient` string that approximated what `paintGround` would draw —
// a second implementation of the ground, in a different language, kept in
// step by hand. It had already lied once, and Cycle C caught it lying again
// within an hour of `ash` gaining its own saturation: the swatch previewed a
// blue tint for a preset that renders grey. A swatch that misrepresents what
// selecting it produces is worse than no swatch, because it is trusted.
//
// test/preset-tiles.test.js enforces the rule by reading this file's source
// for `linear-gradient`, and by painting the same preset at 44px and at
// 1800px and comparing the two at matching relative positions. An
// approximation drifts across that; the real generator cannot.
import {
  GROUNDS, DEFAULTS, BG_TYPES, normalise, groundFor, groundFromMeta, paintGround,
} from '../core/index.js';

/**
 * Paint one named preset into `canvas`.
 *
 * `config` is the app's own config — the tile has to honour the type, the
 * angle and the luminosity, or it previews something the
 * canvas will not produce. `meta` is a previously-returned ground meta for
 * the loaded screenshot, so a preset can be previewed against the user's own
 * image without re-analysing it per tile; `null` falls back to a synthetic
 * source, which is what the empty state shows.
 *
 * `makeCanvas` is injected rather than assumed, matching every other entry
 * point in this codebase: `core/` never creates a canvas itself, and it is
 * what lets this be tested under Node.
 */
export function renderTile(canvas, name, config, meta = null, makeCanvas = defaultMakeCanvas) {
  const preset = GROUNDS[name];
  if (!preset || !canvas) return;

  // The preset's OWN saturation when it declares one — `ash` is grey
  // whatever it is dropped on, and a tile that ignored this is precisely
  // the lie this file exists to stop telling.
  const forceSat = preset.sat ?? null;

  const eff = normalise(config || {});
  const stops = meta
    ? groundFromMeta(meta, preset.hue, eff.luminosity, forceSat).ground
    // No screenshot yet: a synthetic mid-tone source at this preset's own
    // hue, which is what web/sidebar.js's swatches have always fallen back
    // to for the empty state.
    : groundFor([syntheticSource(preset.hue, makeCanvas)],
                preset.hue, eff.luminosity, forceSat).ground;

  // A config describing THE TILE, not the shot: its own pixel size, and the
  // background settings the shot would use. Grain is absent because
  // paintGround does not paint it — `paintGrain` is a separate pass in
  // composeWithMeta — and at 44px it would be noise rather than texture.
  const tileConfig = {
    ...eff,
    w: canvas.width,
    h: canvas.height,
    bgType: BG_TYPES.includes(eff.bgType) ? eff.bgType : DEFAULTS.bgType,
  };

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  paintGround(ctx, tileConfig, stops);
}

/** A flat mid-tone source at one hue, for previewing with no screenshot
 *  loaded. Deliberately mid lightness and mid chroma so the sampled ground
 *  it produces is representative rather than extreme. */
function syntheticSource(hueDeg, makeCanvas) {
  const cv = makeCanvas(8, 8);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = `hsl(${hueDeg} 50% 55%)`;
  ctx.fillRect(0, 0, 8, 8);
  return ctx.getImageData(0, 0, 8, 8);
}

function defaultMakeCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

/**
 * The Angle dial (Cycle C Task 7). Rock, on the shipped app: *"I can't seem
 * to understand the logic behind how Angle works."*
 *
 * A number cannot say which way 166° points, and an ARROW drawn from that
 * number would only restate it. So the dial is a circle of the REAL ground
 * at the current settings — the same rule as the tiles above, and the same
 * reason: it cannot disagree with the canvas, because it is the canvas's own
 * function. The tick then marks the light end, from the same `angle` field
 * `paintGround` reads.
 *
 * `markInk` and `markHalo` are passed in rather than read here: `web/` keeps
 * its colours in tokens.css, and this file is not the one allowed raw hex.
 */
export function renderGroundDial(canvas, config, stops, { markInk, markHalo } = {}) {
  // `stops` may be null before a screenshot is loaded: there is no ground to
  // show yet, and inventing one would be the tile's old lie in a new place.
  // The tick still draws, so the control says which way it points regardless.
  if (!canvas) return;
  const eff = normalise(config || {});
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 1;

  if (stops) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    paintGround(ctx, { ...eff, w, h }, stops);
    ctx.restore();
  }

  // THE LIGHT END. Measured, not assumed - see docs/verification-2026-09-01.md:
  // `angle` is the direction the gradient TRAVELS, light to dark, with 0
  // pointing up and rising numbers turning clockwise. So the light end sits
  // half a turn away from it.
  const bearing = (lightEndBearing(eff.angle)) * Math.PI / 180;
  const ux = Math.sin(bearing), uy = -Math.cos(bearing);
  const draw = (colour, width) => {
    ctx.beginPath();
    ctx.moveTo(cx + ux * r * 0.5, cy + uy * r * 0.5);
    ctx.lineTo(cx + ux * r * 0.92, cy + uy * r * 0.92);
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
  };
  // A halo under the tick so it reads against a pale ground AND a dark one.
  if (markHalo) draw(markHalo, 3.5);
  if (markInk) draw(markInk, 1.5);
}

/** Compass bearing of the gradient's LIGHT end: 0 is up, clockwise. */
export function lightEndBearing(angle) {
  return (((angle ?? 166) + 180) % 360 + 360) % 360;
}
