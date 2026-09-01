import {
  RATIOS, HUES, DEFAULTS, RADIUS_RATIO, TEMPLATES, DEFAULT_ANGLE, SCALES, FRAME_KINDS,
  LAYOUTS, FITS, TONES, BG_TYPES, CHROME_THEMES, SHADOW_SCALE_RANGE,
} from './presets.js';

function num(v, fallback) {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Resolve raw input (CLI flags, panel values, a jobs.json entry) into a
 * complete config. Same names and defaults as the shipped CLI, so a
 * jobs.json written for the old tool stays valid input here.
 */
export function normalise(input = {}) {
  const tpl = TEMPLATES[input.template];
  const [rw, rh] = RATIOS[input.ratio] || RATIOS[DEFAULTS.ratio];
  const baseW = tpl ? tpl.w : rw;
  const baseH = tpl ? tpl.h : rh;
  const w = num(input.w, baseW);
  const h = num(input.h, baseH);

  let forceHue = null;
  if (input.ground !== undefined && input.ground !== null && input.ground !== 'auto') {
    const named = HUES[input.ground];
    const parsed = named !== undefined ? named : Number(input.ground);
    if (Number.isFinite(parsed)) forceHue = parsed;
  }

  // Only a recognised layout string is honoured verbatim; anything else
  // (an unrelated typo, a stale 'none' sentinel, undefined) is treated as
  // absent so it falls through to the same inference an app with no layout
  // opinion gets - never a silently blank composition.
  let layout = LAYOUTS.includes(input.layout) ? input.layout : null;
  if (!layout) {
    const hasWeb = !!input.hasWeb;
    const mobileCount = num(input.mobileCount, 0);
    layout = hasWeb && mobileCount > 0 ? 'web+mobile' : (hasWeb ? 'web' : 'mobile');
  }

  return {
    w, h, layout,
    fit: FITS.includes(input.fit) ? input.fit : DEFAULTS.fit,
    pad: num(input.pad, DEFAULTS.pad),
    radius: num(input.radius, Math.round(w * RADIUS_RATIO)),
    grain: num(input.grain, DEFAULTS.grain),
    phoneScale: num(input.phoneScale, DEFAULTS.phoneScale),
    phoneBleed: num(input.phoneBleed, DEFAULTS.phoneBleed),
    insetX: input.insetX === undefined ? null : num(input.insetX, null),
    insetY: input.insetY === undefined ? null : num(input.insetY, null),
    caption: input.caption ? String(input.caption) : DEFAULTS.caption,
    // Same coercion as `caption` immediately above: an empty string is
    // "no value", not a value - see Task 6's header note in render.js's
    // paintChrome for why an empty pill (the DEFAULTS.url === null case)
    // must stay empty rather than fall back to invented placeholder copy.
    url: input.url ? String(input.url) : DEFAULTS.url,
    forceHue,
    tone: TONES.includes(input.tone) ? input.tone : DEFAULTS.tone,
    // `scale` renders the composition at `scale` times its `w`x`h` - see
    // composeWithMeta in index.js, the only reader of this field. w/h above
    // stay the unscaled composition size regardless: this reports what was
    // asked for, not what gets exported.
    scale: SCALES.includes(num(input.scale, 1)) ? num(input.scale, 1) : 1,
    angle: (() => {
      const a = num(input.angle, DEFAULT_ANGLE);
      return ((a % 360) + 360) % 360;
    })(),
    template: tpl ? input.template : null,
    bgType: BG_TYPES.includes(input.bgType) ? input.bgType : DEFAULTS.bgType,
    seed: Math.round(num(input.seed, DEFAULTS.seed)),
    frameKind: FRAME_KINDS.includes(input.frameKind) ? input.frameKind : 'none',
    chromeTheme: CHROME_THEMES.includes(input.chromeTheme) ? input.chromeTheme : 'dark',
    // Task 6b: a MULTIPLIER over paintShadow's verified alphas, never a
    // replacement for them - see SHADOW_SCALE_RANGE's comment in presets.js
    // and the doc comment on paintShadow itself (core/render.js). Clamped
    // here (the same defensive clamp core/render.js also applies to the
    // final alpha product) so an out-of-range value from a stale jobs.json
    // or a runaway slider can never reach the canvas unclamped.
    shadowScale: Math.min(
      SHADOW_SCALE_RANGE[1],
      Math.max(SHADOW_SCALE_RANGE[0], num(input.shadowScale, DEFAULTS.shadowScale)),
    ),
  };
}
