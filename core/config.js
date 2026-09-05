import {
  RATIOS, HUES, GROUNDS, DEFAULTS, RADIUS_RATIO, TEMPLATES, DEFAULT_ANGLE, SCALES, FRAME_KINDS,
  LAYOUTS, BG_TYPES, CHROME_THEMES, SHADOW_SCALE_RANGE, LUMINOSITY_RANGE,
  STROKE_STYLES, STROKE_WIDTH_RANGE, STROKE_DEFAULTS,
  MESH_STOPS_RANGE, MESH_SPREAD_RANGE, MESH_DEFAULTS,
  ELEMENT_KINDS, ELEMENT_DEFAULTS,
} from './presets.js';

function num(v, fallback) {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Resolve one field for one element.
 *
 * PRECEDENCE, AND WHY IT IS A FUNCTION RATHER THAN THREE SPREADS: an
 * element entry wins over a flat key, and a flat key wins over the default
 * - but ONLY when the input actually carried it. `undefined` means absent,
 * and a resolved default is never an override.
 *
 * Cycle A Task 5b is the reason. It introduced a nested block alongside a
 * flat field, seeded the block with its own defaults, and so made the
 * nested value always present and therefore always winning. The flat field
 * went dead while its slider went on displaying the old number, and the
 * whole task had to be reverted. A spread cannot express "only if the
 * caller said so"; this can.
 */
function pickField(elInput, flatInput, fallback) {
  if (elInput !== undefined) return elInput;
  if (flatInput !== undefined) return flatInput;
  return fallback;
}

/**
 * The stroke block, shared by the top-level `stroke` field and by every
 * element's own. One function so the two cannot drift into disagreeing
 * about what a valid width or colour is.
 */
function normaliseStroke(s) {
  const v = s || {};
  const style = STROKE_STYLES.includes(v.style) ? v.style : STROKE_DEFAULTS.style;
  return {
    style,
    width: Math.min(
      STROKE_WIDTH_RANGE[1],
      Math.max(STROKE_WIDTH_RANGE[0], num(v.width, STROKE_DEFAULTS.width)),
    ),
    color: /^#[0-9a-fA-F]{6}$/.test(v.color) ? v.color : STROKE_DEFAULTS.color,
  };
}

/**
 * `elements: { web, mobile }` - Cycle B Task 1.
 *
 * Built from `input`, NOT from the resolved config: by the time the config
 * exists every absent field has already become a default, and pickField's
 * whole job is to tell those apart from values the caller supplied.
 *
 * NOTHING READS THIS YET. Task 2 moves layout.js and render.js onto it, and
 * its acceptance test is that all fourteen goldens stay byte-identical.
 */
function elementsFrom(input) {
  const out = {};
  for (const kind of ELEMENT_KINDS) {
    const e = (input.elements && input.elements[kind]) || {};
    const frameKind = pickField(e.frameKind, input.frameKind, ELEMENT_DEFAULTS[kind].frameKind);
    const chromeTheme = pickField(e.chromeTheme, input.chromeTheme, 'dark');
    const url = pickField(e.url, input.url, DEFAULTS.url);
    const shadowScale = pickField(e.shadowScale, input.shadowScale, DEFAULTS.shadowScale);
    const stroke = pickField(e.stroke, input.stroke, undefined);

    out[kind] = {
      frameKind: FRAME_KINDS.includes(frameKind) ? frameKind : ELEMENT_DEFAULTS[kind].frameKind,
      chromeTheme: CHROME_THEMES.includes(chromeTheme) ? chromeTheme : 'dark',
      url: url ? String(url) : DEFAULTS.url,
      // null means "this frame's own corner", resolved in layout.js by Task
      // 3 - the answer depends on which frame is on and on the element's
      // own width, neither of which normalise() knows.
      //
      // DELIBERATELY NOT INHERITED FROM THE FLAT `radius`. That field is a
      // resolved pixel count for the BARE screenshot and has never meant
      // "the browser window's corner"; inheriting it would hand a browser
      // frame a 24px corner the moment anyone touched the old slider.
      radius: e.radius === undefined ? null : num(e.radius, null),
      shadowScale: Math.min(
        SHADOW_SCALE_RANGE[1],
        Math.max(SHADOW_SCALE_RANGE[0], num(shadowScale, DEFAULTS.shadowScale)),
      ),
      stroke: normaliseStroke(stroke),
    };
  }
  return out;
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

  // A named preset carries its own saturation as well as its hue - that is
  // what lets `ash` be a grey rather than a hue nobody can see. A RAW
  // DEGREE carries only a hue, so the hue slider and a jobs.json full of
  // numbers behave exactly as they always did.
  let forceHue = null;
  let forceSat = null;
  if (input.ground !== undefined && input.ground !== null && input.ground !== 'auto') {
    const named = GROUNDS[input.ground];
    const parsed = named !== undefined ? named.hue : Number(input.ground);
    if (Number.isFinite(parsed)) forceHue = parsed;
    if (named && named.sat !== undefined) forceSat = named.sat;
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
    pad: num(input.pad, DEFAULTS.pad),
    radius: num(input.radius, Math.round(w * RADIUS_RATIO)),
    grain: num(input.grain, DEFAULTS.grain),
    phoneScale: num(input.phoneScale, DEFAULTS.phoneScale),
    phoneBleed: num(input.phoneBleed, DEFAULTS.phoneBleed),
    insetX: input.insetX === undefined ? null : num(input.insetX, null),
    insetY: input.insetY === undefined ? null : num(input.insetY, null),
    // An empty string is "no value", not a value with zero characters, so a
    // text input that was typed into and then cleared falls all the way back
    // to DEFAULTS.url (null) rather than becoming a technically-truthy-but-
    // blank string. See Task 6's header note in render.js's paintChrome for
    // why an empty pill must stay empty rather than fall back to invented
    // placeholder copy. (This coercion used to be shared with `caption`,
    // retired in Cycle A Task 4; it stands on its own now.)
    url: input.url ? String(input.url) : DEFAULTS.url,
    forceHue,
    forceSat,
    // Cycle C: `tone` retired. null means SAMPLED - core/ground.js runs its
    // own inference and lands on one of the two anchors, reproducing what
    // shipped before. A number is the ground's own top-stop lightness,
    // clamped here the same defensive way every other bounded field is.
    luminosity: (() => {
      const v = num(input.luminosity, null);
      // NOT `Math.max(lo, null)`, which is `lo` - so a garbage value would
      // silently become the darkest ground instead of falling back to
      // sampled. Anything that is not a real number is absent.
      if (v === null) return DEFAULTS.luminosity;
      return Math.min(LUMINOSITY_RANGE[1], Math.max(LUMINOSITY_RANGE[0], v));
    })(),
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
    // Task 7. A nested block rather than three flat `strokeStyle`/
    // `strokeWidth`/`strokeColor` keys because the spec's per-element model
    // (Cycle B) gives `web` and `mobile` one each, and a nested value moves
    // there as a unit. `style` defaults to 'none': an edge is opt-in, and
    // `width`/`color` still resolve so switching the style on has somewhere
    // sensible to land. Width is clamped to STROKE_WIDTH_RANGE here, the
    // same defensive clamp shadowScale gets, so a stale jobs.json or a
    // runaway slider can never reach layout.js unbounded.
    // Task 9. `stops` and `spread` only - `seed` stays the top-level field
    // it always was, for the one-value-one-home reason spelled out beside
    // MESH_DEFAULTS in presets.js. Both are clamped here, the same
    // defensive clamp shadowScale and stroke.width get.
    mesh: (() => {
      const m = input.mesh || {};
      return {
        stops: Math.min(
          MESH_STOPS_RANGE[1],
          Math.max(MESH_STOPS_RANGE[0], Math.round(num(m.stops, MESH_DEFAULTS.stops))),
        ),
        spread: Math.min(
          MESH_SPREAD_RANGE[1],
          Math.max(MESH_SPREAD_RANGE[0], num(m.spread, MESH_DEFAULTS.spread)),
        ),
      };
    })(),
    stroke: normaliseStroke(input.stroke),
    // Cycle B Task 1. Read by nothing yet - see elementsFrom above.
    elements: elementsFrom(input),
  };
}
