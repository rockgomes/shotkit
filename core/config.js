import {
  RATIOS, HUES, DEFAULTS, RADIUS_RATIO, TEMPLATES, DEFAULT_ANGLE, SCALES, FRAME_KINDS,
  LAYOUTS, TONES, BG_TYPES, CHROME_THEMES, SHADOW_SCALE_RANGE,
  SHADOW_DEFAULTS, SHADOW_DISTANCE_RANGE, SHADOW_BLUR_RANGE,
} from './presets.js';

function num(v, fallback) {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Clamp into a [min, max] pair from presets.js. Written as one helper
 *  rather than three inline Math.min(Math.max(...)) nests so the shadow
 *  block below reads as what it is. */
function clamp(n, [min, max]) {
  return Math.min(max, Math.max(min, n));
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

  // Cycle A Task 5: distance, angle, blur and a directional mode.
  //
  // THE DEFAULTS REPRODUCE THE SHIPPED SHADOW EXACTLY, and that is a
  // frozen guarantee, not an aspiration: test/render-shadow.test.js
  // renders paintShadow alone at these values and diffs it against
  // test/golden/shadow/default.png, captured from the pre-Task-5 code.
  // `distance` and `blur` are fractions of a base length (the canvas
  // height at three of the four call sites) - see SHADOW_DEFAULTS in
  // presets.js for what each field means and where its number came from.
  //
  // Resolved BEFORE the return (Cycle A Task 5c) rather than inline in it,
  // because the top-level `shadowScale` field below is now this block's
  // `scale`, reported twice rather than resolved twice. See its comment.
  const shadow = (() => {
    const s = input.shadow || {};
    // `shadowScale` at the top level is still honoured: it was the only
    // shadow input before this task, so anything that already sets it
    // keeps working, with Task 6b's clamp semantics preserved exactly
    // (out-of-range values clamp, non-numbers fall back). An explicit
    // `shadow.scale` wins over it - the specific beats the legacy.
    //
    // THAT PRECEDENCE IS CORRECT AND STAYS. Cycle A Task 5c's regression
    // was NOT this rule: it was the app manufacturing a specific value it
    // never meant to. web/inspector-frame.js's `writableShadow` seeded a
    // missing block from SHADOW_DEFAULTS, `scale: 1` included, so the
    // first touch of any Advanced control minted an explicit
    // `shadow.scale` of 1 that then outranked the Shadow slider's
    // `shadowScale` forever - the slider moved and the render ignored it.
    // The panel now writes `shadow.scale` and seeds from the RESOLVED
    // block, so nothing is ever invented; the rule below never had to
    // change.
    const scaleIn = s.scale !== undefined ? s.scale : input.shadowScale;
    return {
      scale: clamp(num(scaleIn, SHADOW_DEFAULTS.scale), SHADOW_SCALE_RANGE),
      distance: clamp(num(s.distance, SHADOW_DEFAULTS.distance), SHADOW_DISTANCE_RANGE),
      // Wrapped, not clamped: 450 degrees is 90, and -90 is 270. Same
      // normalisation `angle` (the ground gradient's) above already uses.
      angle: (() => {
        const a = num(s.angle, SHADOW_DEFAULTS.angle);
        return ((a % 360) + 360) % 360;
      })(),
      blur: clamp(num(s.blur, SHADOW_DEFAULTS.blur), SHADOW_BLUR_RANGE),
      // Strictly `true`, never merely truthy: a stale jobs.json carrying
      // the string 'false' must not switch this on.
      directional: s.directional === true,
    };
  })();

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
    // and the doc comment on paintShadow itself (core/render.js).
    //
    // Cycle A Task 5 gave the shadow a whole config block (above), and
    // `scale` there is this same number. This top-level field STAYS as an
    // OUTPUT: it was the only shadow input that ever existed, it is what a
    // jobs.json written against the shipped CLI carries, and
    // test/compose.test.js's `shadow-heavy` golden is generated from it.
    //
    // IT IS THE SAME VALUE, NOT A SECOND RESOLUTION OF IT (Task 5c). It
    // used to be computed independently from `input.shadowScale`, which
    // meant `normalise(x).shadowScale` and `normalise(x).shadow.scale`
    // could report different numbers for one config - and only the second
    // is drawn (core/render.js reads `c.shadow` at all four call sites).
    // Two fields for one quantity is exactly the shape of bug this task
    // exists to close, so there is now one resolution and one clamp,
    // mirrored here. Every legacy input still lands where it did:
    // `{shadowScale: 1.6}` reports 1.6 in both, out-of-range still clamps,
    // a non-number still falls back to DEFAULTS.shadowScale.
    shadowScale: shadow.scale,
    shadow,
  };
}
