import { RATIOS, HUES, DEFAULTS, RADIUS_RATIO } from './presets.js';

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
  const [rw, rh] = RATIOS[input.ratio] || RATIOS[DEFAULTS.ratio];
  const w = num(input.w, rw);
  const h = num(input.h, rh);

  let forceHue = null;
  if (input.ground !== undefined && input.ground !== null && input.ground !== 'auto') {
    const named = HUES[input.ground];
    const parsed = named !== undefined ? named : Number(input.ground);
    if (Number.isFinite(parsed)) forceHue = parsed;
  }

  let layout = input.layout || null;
  if (!layout) {
    const hasWeb = !!input.hasWeb;
    const mobileCount = num(input.mobileCount, 0);
    layout = hasWeb && mobileCount > 0 ? 'web+mobile' : (hasWeb ? 'web' : 'mobile');
  }

  return {
    w, h, layout,
    fit: input.fit === 'cover' ? 'cover' : DEFAULTS.fit,
    pad: num(input.pad, DEFAULTS.pad),
    radius: num(input.radius, Math.round(w * RADIUS_RATIO)),
    grain: num(input.grain, DEFAULTS.grain),
    phoneScale: num(input.phoneScale, DEFAULTS.phoneScale),
    phoneBleed: num(input.phoneBleed, DEFAULTS.phoneBleed),
    insetX: input.insetX === undefined ? null : num(input.insetX, null),
    insetY: input.insetY === undefined ? null : num(input.insetY, null),
    caption: input.caption ? String(input.caption) : DEFAULTS.caption,
    forceHue,
    tone: input.tone === 'light' || input.tone === 'mid' ? input.tone : DEFAULTS.tone,
  };
}
