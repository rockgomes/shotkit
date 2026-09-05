// web/inspector-background.js — Task 5: the inspector's Background section.
//
// THE ORDER IS THE PRODUCT'S ARGUMENT, NOT A LAYOUT CHOICE: shotkit's whole
// premise is that the ground comes from the SCREENSHOT'S OWN accent colour
// (core/ground.js) — manual control is an override on top of that, never a
// peer sitting next to it. So this panel reads, top to bottom:
//
//   Sampled (the default, no interaction needed)
//     -> Presets (the eight named HUES)
//       -> Hue slider (any degree, not just the eight)
//         -> Angle slider (gradient direction — layout, not colour)
//           -> Type (linear / solid / mesh)
//             -> Seed (mesh only)
//               -> Tone (auto / light / mid — a CORRECTNESS override, not a
//                  mood setting; see its own section below)
//
// ONE RENDER PATH: every handler below mutates `state.config` and then
// calls `scheduleRender()` (web/state.js) — nothing here calls
// `composeWithMeta` directly. That is what keeps this panel's preview
// canvas from ever disagreeing with what export.js later exports; four
// prior review rounds have confirmed composeWithMeta is called from
// exactly one place, and this file does not become a second one.
//
// core/ IMPORTS: only from core/index.js, per Ruling 2 — HUES/TONES/
// BG_TYPES/DEFAULT_ANGLE/DEFAULTS/groundFor/groundFromMeta, nothing deep-
// imported from core/presets.js or core/ground.js.
//
// THE PRESET ROW AND THE HUE SLIDER WRITE THE SAME FIELD: `config.ground`.
// core/config.js's normalise() already accepts EITHER a named string (a
// HUES key, e.g. 'lavender') OR a raw numeric degree there — that is not
// new plumbing this file invents, it is what selectGround() (sidebar.js)
// already relies on, and what setHue() below does too. Because both write
// the identical field, `activeGroundKey()`/`isAutoGround()` (imported /
// defined below) can never see the two controls disagree about what is
// currently selected — there is only one value to read, not two that
// could drift apart. See "syncGroundUI" below for how that single value
// drives every visual in this panel at once.
import {
  HUES, GROUNDS, BG_TYPES, DEFAULT_ANGLE, DEFAULTS, groundFor, groundFromMeta, normalise,
  MESH_STOPS_RANGE, MESH_SPREAD_RANGE, MESH_DEFAULTS,
  LUMINOSITY_RANGE, LUM_ANCHOR_LIGHT, LUM_ANCHOR_MID,
} from '../core/index.js';
import { state, scheduleRender } from './state.js';
import { activeGroundKey, selectGround } from './sidebar.js';
import { renderTile, renderGroundDial, lightEndBearing } from './preset-tiles.js';

// ---------------------------------------------------------------------
// Pure state helpers — no DOM, no canvas. These are what
// test/inspector-background.test.js drives directly, exactly the same
// split web/sidebar.js already established (pure helpers vs. the one
// DOM-touching init function at the bottom of this file).
// ---------------------------------------------------------------------

/** `config.ground` unset/null/'auto' means "let core/ground.js sample the
 *  screenshot" — the exact same sentinel core/config.js's normalise()
 *  already treats as "no override" (see its `input.ground !== 'auto'`
 *  check). Nothing here reimplements that precedence; this only NAMES the
 *  same condition so the panel can ask it in one place. */
export function isAutoGround(config) {
  return config.ground === undefined || config.ground === null || config.ground === 'auto';
}

/** The forced hue, in degrees, or null if the ground is currently auto —
 *  the read-side twin of normalise()'s own forceHue derivation
 *  (core/config.js), duplicated here (not imported — core/config.js exports
 *  the whole `normalise()` function, not this one fragment of it) purely so
 *  the panel can ask "what hue does this config force, if any?" without
 *  running the entire normalise() pipeline just to read one field back. */
export function forcedHueDeg(config) {
  if (isAutoGround(config)) return null;
  const named = HUES[config.ground];
  const parsed = named !== undefined ? named : Number(config.ground);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The hue slider's own write: a RAW DEGREE into `config.ground` — the
 *  identical field selectGround() (sidebar.js) writes a NAMED string into.
 *  This is the whole mechanism behind "the panel reflects reality": there
 *  is exactly one field a reader (`activeGroundKey`, `isAutoGround`,
 *  `forcedHueDeg`) ever has to consult, so a preset pick and a slider drag
 *  can never leave two different fields disagreeing about which is active.
 *  See the "BREAK IT" test in test/inspector-background.test.js for what
 *  goes wrong if a future change routes this through a DIFFERENT field
 *  instead (e.g. a hypothetical `config.hue`) — normalise() would silently
 *  never see it, and the slider would visibly move while nothing rendered.
 */
export function setHue(config, deg) {
  const n = Number(deg);
  if (!Number.isFinite(n)) return;
  config.ground = ((Math.round(n) % 360) + 360) % 360;
}

/** Clears the override — "Sampled" is a real control, not just a label:
 *  clicking it hands the ground back to core/ground.js's own analysis. */
/**
 * Back to a fully sampled ground.
 *
 * IT CLEARS EVERY OVERRIDE, not just the hue, and that is Rock's call:
 * *"I was hoping that clicking on 'sampled' would reset everything,
 * including luminosity. am I thinking wrong about it?"* He was not - the
 * first version of the luminosity slider shipped a second button also
 * labelled "Sampled", which meant two controls with the same word on them
 * doing different-sized things. "Sampled" means the whole ground comes from
 * the screenshot; a single control's own reset is a different idea and is
 * now labelled "Reset" (item 18's vocabulary, which Cycle D generalises).
 *
 * Anything sampled that is added later belongs in this function. That is
 * what the word promises.
 */
export function resetToSampled(config) {
  config.ground = null;
  config.luminosity = null;
}

/** Back to the SAMPLED hue, and nothing else. The per-control reset beside
 *  the Hue slider; `resetToSampled` above is the whole-ground one. */
export function resetHueToSampled(config) {
  config.ground = null;
}

/** Back to the default gradient angle. Angle is not sampled from anything -
 *  it has a fixed default, so its reset restores that rather than clearing
 *  to null. */
export function resetAngle(config) {
  config.angle = DEFAULT_ANGLE;
}

export function isDefaultAngle(config) {
  const a = Number.isFinite(config.angle) ? config.angle : DEFAULT_ANGLE;
  return a === DEFAULT_ANGLE;
}

/**
 * The gradient's light end, in words. Cycle C Task 7.
 *
 * `angle` is the direction the gradient TRAVELS, light to dark — 0 points
 * up, rising numbers turn clockwise — so the light end is half a turn away.
 * Measured rather than read off the source: at 0° the light sits at the
 * BOTTOM, at 90° at the LEFT, at 180° at the top. See
 * docs/verification-2026-09-01.md.
 *
 * This is what the dial shows a sighted user; `aria-valuetext` says the same
 * sentence to everyone else, so the two cannot drift apart.
 */
export function lightEndLabel(angle) {
  const b = lightEndBearing(angle);
  const names = [
    'top', 'top right', 'right', 'bottom right',
    'bottom', 'bottom left', 'left', 'top left',
  ];
  return names[Math.round(b / 45) % 8];
}

/** Whether ANY part of the ground is currently overridden - what the
 *  Sampled row's pressed state and the enabled/disabled call both read. */
export function isFullySampled(config) {
  return isAutoGround(config) && isSampledLuminosity(config);
}

/**
 * The angle slider's maximum, and why it is not 360.
 *
 * Rock, 2026-09-05: *"dragging the slider to 360 makes it jump to 0."*
 * Exactly what it did: `setAngle` wraps a full turn back to zero — correct,
 * and what every other caller wants — and the panel then wrote that 0 back
 * into the input, so the thumb snapped to the far LEFT while he was still
 * holding the far right.
 *
 * The fix belongs on the slider, not on the wrap: a full turn is the same
 * ground as no turn, so 360 was never a distinct position to offer. The
 * maximum has to be a value `setAngle` leaves alone, which is what
 * test/inspector-background.test.js asserts.
 */
export const ANGLE_SLIDER_MAX = 359;

export function setAngle(config, deg) {
  const n = Number(deg);
  if (!Number.isFinite(n)) return;
  config.angle = ((Math.round(n) % 360) + 360) % 360;
}

// WHAT THE PANEL OFFERS, which is deliberately NOT all of BG_TYPES.
//
// Mesh is withheld from the UI as of 2026-09-03, at Rock's call, after he
// used the rebuilt version: "I can barely see anything... when there's a
// screen on top, there isn't much to see, and our current colors are very
// faint. would it be a good idea to turn mesh option off for now and
// revisit it later?"
//
// He is diagnosing it correctly, and the diagnosis is the reason this is a
// HIDE AND NOT A DELETE. Cycle A Task 9's three gates all pass on their own
// terms - mesh spans real hue variety, spread/stops/seed all steer it, and
// it does not go muddy - but a shot is a screenshot with a border of ground
// around it, and on a pale palette that border shows almost nothing. What
// fails is the palette, which Cycle B rewrites anyway. So `paintMesh`, its
// config block, its tests and both its goldens all stay, fully guarded;
// only the way in is closed.
//
// TO RESTORE IT: delete this constant and map over BG_TYPES again below.
// Nothing else has to come back, because nothing else went away.
export const UI_BG_TYPES = BG_TYPES.filter(t => t !== 'mesh');

// The user-facing names. "Gradient", not "Linear": `bgType`'s stored value
// stays 'linear' everywhere in core/ and in every jobs.json ever written -
// the label changes, the value does not.
export const TYPE_LABELS = { linear: 'Gradient', solid: 'Solid', mesh: 'Mesh' };

/** Angle is a GRADIENT control. `paintSolid` fills flat with the middle
 *  stop and never reads it, and `paintMesh` places its blobs from a seed -
 *  so on either of those it is a slider that moves and changes nothing,
 *  which is the defect Cycle B spent eight tasks removing and which was
 *  sitting in this panel the whole time. */
export function showsAngle(config) {
  const type = BG_TYPES.includes(config.bgType) ? config.bgType : DEFAULTS.bgType;
  return type === 'linear';
}

// Still validated against core's BG_TYPES, not against UI_BG_TYPES above: a
// jobs.json or a saved config carrying `mesh` is a legitimate input that
// core/ renders correctly, and this function's job is to reject nonsense,
// not to enforce what the panel happens to show today.
export function setBgType(config, type) {
  if (!BG_TYPES.includes(type)) return;
  config.bgType = type;
}

export const SEED_MIN = 1;
export const SEED_MAX = 99;

export function clampSeed(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return DEFAULTS.seed;
  return Math.min(SEED_MAX, Math.max(SEED_MIN, v));
}

export function setSeed(config, n) {
  config.seed = clampSeed(n);
}

// --- Mesh stops and spread (Cycle A Task 9) ------------------------------
//
// `config.mesh` is a nested block ({ stops, spread }) matching core/config.js.
// SEED IS NOT IN IT and must not be moved into it: it already lives at the
// top level with its own clamp and its own control above, and a second
// writable home for one value is how Task 5b killed the shadow slider.
//
// Both writers seed from MESH_DEFAULTS first and the current block second,
// so changing one field never resets the other - the same ordering rule
// spelled out on the stroke writers in web/inspector-frame.js, and for the
// same reason.
export function activeMeshStops(config) {
  const m = config.mesh || {};
  const n = Math.round(Number(m.stops));
  return Number.isFinite(n)
    ? Math.min(MESH_STOPS_RANGE[1], Math.max(MESH_STOPS_RANGE[0], n))
    : MESH_DEFAULTS.stops;
}

export function setMeshStops(config, n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return;
  config.mesh = {
    ...MESH_DEFAULTS,
    ...(config.mesh || {}),
    stops: Math.min(MESH_STOPS_RANGE[1], Math.max(MESH_STOPS_RANGE[0], v)),
  };
}

export function activeMeshSpread(config) {
  const m = config.mesh || {};
  const v = Number(m.spread);
  return Number.isFinite(v)
    ? Math.min(MESH_SPREAD_RANGE[1], Math.max(MESH_SPREAD_RANGE[0], v))
    : MESH_DEFAULTS.spread;
}

export function setMeshSpread(config, deg) {
  const v = Number(deg);
  if (!Number.isFinite(v)) return;
  config.mesh = {
    ...MESH_DEFAULTS,
    ...(config.mesh || {}),
    spread: Math.min(MESH_SPREAD_RANGE[1], Math.max(MESH_SPREAD_RANGE[0], v)),
  };
}

// --- Luminosity (Cycle C Task 1) -----------------------------------------
//
// This was `tone`, a three-cell segmented over Auto / Light / Mid. Both of
// those branches were pale - "Mid" meant LESS PALE - so the tool had no
// dark ground at all, which is what Rock asked for.
//
// IT BEHAVES LIKE THE HUE CONTROL, and that is the requirement rather than
// a convenience: `null` means SAMPLED, and the slider renders at whatever
// position core/ground.js's own inference chose for this screenshot.
// Touching it writes a number and makes it the user's. A slider that
// started at a fixed midpoint would throw that inference away on every
// shot, silently - and sampling the image is the product's premise, not a
// default worth overwriting.
export function isSampledLuminosity(config) {
  return config.luminosity === null || config.luminosity === undefined;
}

/** The luminosity to SHOW: the user's if they set one, otherwise the value
 *  the sampled inference actually used. `meta.luminosity` comes back from
 *  every groundFor/groundFromMeta call (core/ground.js), so the slider can
 *  sit on the sampled position without re-deriving the inference here. */
export function activeLuminosity(config, meta = null) {
  if (!isSampledLuminosity(config)) return config.luminosity;
  if (meta && Number.isFinite(meta.luminosity)) return meta.luminosity;
  // No render yet: the pale anchor, which is what an unanalysed image gets.
  return LUM_ANCHOR_LIGHT.l;
}

export function setLuminosity(config, value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  config.luminosity = Math.min(LUMINOSITY_RANGE[1],
                               Math.max(LUMINOSITY_RANGE[0], n));
}

/** Back to sampled. `null`, not a number that happens to equal the sampled
 *  one - the difference is whether the ground follows the NEXT screenshot. */
export function resetLuminosityToSampled(config) {
  config.luminosity = null;
}

// ---------------------------------------------------------------------
// "Sampled": the TRUE, unforced ground reading for the loaded image(s) —
// independent of whatever override (if any) is currently active.
//
// Why this can't just ALWAYS read `state.meta`: state.meta is
// composeWithMeta's (core/index.js) own return value, and once a hue is
// forced, `meta.hue` IS the forced value — core/ground.js's tail()
// overwrites it before returning (see that function's own comment). There
// is nowhere else in the running app that remembers what the screenshot's
// OWN accent hue was once an override has been applied.
//
// But `state.meta` is not USELESS here either — when the ground is auto
// (no override), it already holds exactly this reading, for free. So this
// is a two-tier read, not a second independent analysis on principle:
//   - auto: reuse `state.meta` — zero extra cost (`sampledMetaFor` below).
//   - forced: fall back to `computeSampledMeta`, a genuine from-scratch
//     analyse() pass, computed the exact same way core/index.js's
//     composeWithMeta computes its own UNFORCED meta (same 800px thumbnail
//     step, same groundFor call with forceHue=null/mode=null).
// `createSampledCache` (below) wraps whichever path applies in a cache
// keyed on image identity ONLY (never on config.ground/config.luminosity), so
// neither path re-runs on every hue/tone/type/angle tick — only when the
// loaded image SET actually changes.
//
// `computeSampledMeta`/`sampledMetaFor` take an injectable `makeCanvas`
// (default: a real DOM canvas) for the exact reason web/state.js's
// `bindCanvas` does: it lets test/inspector-background.test.js drive this
// with @napi-rs/canvas under Node, against real decoded images, instead of
// a browser `document`.
// ---------------------------------------------------------------------

function sampleOf(image, makeCanvas) {
  const scale = Math.min(1, 800 / image.width, 800 / image.height);
  const w = Math.max(1, Math.floor(image.width * scale));
  const h = Math.max(1, Math.floor(image.height * scale));
  const cv = makeCanvas(w, h);
  const ctx = cv.getContext('2d');
  ctx.drawImage(image, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

function defaultMakeCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

/** The unforced ground reading for `images` — forceHue and mode both null,
 *  exactly core/index.js's own no-override path (including its "nothing
 *  loaded yet" neutral-grey fallback, reproduced verbatim below so the
 *  Sampled swatch shows exactly what an empty canvas would, not an
 *  invented placeholder colour). This is a REAL analyse() pass
 *  (core/ground.js) — the same ~90-300ms a cold render pays — so it is the
 *  expensive fallback, not the common path; see `sampledMetaFor` below for
 *  the cheap path that avoids calling this at all whenever it can. Exported
 *  so tests can call it directly with a real image and a Node canvas
 *  factory. */
export function computeSampledMeta(images, makeCanvas = defaultMakeCanvas) {
  const list = [images.web, ...(images.mobile || [])].filter(Boolean);
  const samples = list.length
    ? list.map((im) => sampleOf(im, makeCanvas))
    : [{ width: 1, height: 1, data: [128, 128, 128, 255] }];
  return groundFor(samples, null, null);
}

/**
 * FIX ROUND 1: the first version of this file called `computeSampledMeta`
 * (a full, independent analyse() pass) unconditionally on every image load
 * — ~90-300ms of work duplicating what `render()` (web/state.js) had, in
 * the common case, JUST finished computing moments earlier for the SAME
 * image, at the moment the user is already waiting on a load.
 *
 * The insight: when the ground is auto (the default — `isAutoGround`,
 * above), `render()`'s own `currentMeta` (`state.meta`) already IS the
 * unforced reading — core/index.js ran `groundFor` with `forceHue: null`
 * to produce it, because there is no override to apply. There is nothing
 * left to compute; the two readings are not merely similar, they are the
 * SAME arithmetic result. Only once a hue is actually forced does
 * `currentMeta.hue` disagree with the truth (core/ground.js's `tail()`
 * overwrites it with the forced value — see this file's "Sampled" header
 * comment above) — and ONLY THEN is an independent, from-scratch analysis
 * genuinely necessary.
 *
 * `currentMeta` is trusted here ONLY at the one call site that invalidates
 * this cache (`refreshSampled()`, called by web/main.js right after
 * `addFiles()` — which calls `render()` SYNCHRONOUSLY, not through
 * `scheduleRender()`'s rAF debounce, so `state.meta` is guaranteed to
 * already reflect `state.config` exactly as it stands at that instant; see
 * web/sidebar.js's "Ground swatch gradients" header comment, which relies
 * on the same guarantee for the preset swatches). Every OTHER call in this file (a hue drag, a
 * preset click, a tone toggle, Sampled's own click) reads the cache via
 * `createSampledCache().refresh` below WITHOUT invalidating it first, so it
 * never re-evaluates this trust at a moment `state.meta` could be
 * momentarily stale — it just returns whatever was cached at the last
 * image load, cheaply, every time.
 */
export function sampledMetaFor(images, config, currentMeta, makeCanvas = defaultMakeCanvas) {
  if (isAutoGround(config) && currentMeta) return currentMeta;
  return computeSampledMeta(images, makeCanvas);
}

function sampledKeyFor(images) {
  const mobileIds = (images.mobile || []).map((m) => m.__id).join(',');
  return `${images.web ? images.web.__id : ''}|${mobileIds}`;
}

/**
 * A tiny factory for the "only recompute when the loaded image SET
 * changed" cache around `sampledMetaFor` — a factory, not one shared
 * module-level cache, so `test/inspector-background.test.js` can create an
 * independent instance per test case (no cross-test pollution from shared
 * mutable state) and so a future second inspector instance wouldn't have
 * to share one either. `initBackgroundInspector()` below creates exactly
 * one, for the app's one real inspector panel.
 */
export function createSampledCache() {
  let meta = null;
  let key = null;
  return {
    /** Returns the current sampled meta, recomputing (via `sampledMetaFor`)
     *  only when `images` identifies a different image set than last time —
     *  a hue/tone/type/angle change alone never gets here at all. */
    refresh(images, config, currentMeta, makeCanvas = defaultMakeCanvas) {
      const k = sampledKeyFor(images);
      if (key !== k || !meta) {
        meta = sampledMetaFor(images, config, currentMeta, makeCanvas);
        key = k;
      }
      return meta;
    },
    /** Forces the NEXT `refresh()` call to recompute, regardless of
     *  whether the image key actually changed — used when the caller
     *  already knows there's a new image (web/main.js's `refreshSampled`
     *  handshake) rather than waiting for the key comparison to notice. */
    invalidate() {
      key = null;
    },
  };
}

// ---------------------------------------------------------------------
// DOM wiring. Fully self-contained, like web/sidebar.js: this file wires
// its own click/input handlers directly rather than relying on
// web/main.js's generic wireSingleSelectGroup/slider-fill loops (those run
// once, at module load, against whatever static markup index.html shipped
// — this panel's entire content is built fresh by initBackgroundInspector()
// below, so there is nothing for that one-time generic pass to find here
// even if it ran first; main.js calls this AFTER its generic loops for
// exactly that reason, so there is no ambiguity about it).
// ---------------------------------------------------------------------

/**
 * A slider's own Reset — Cycle C Task 5, fix round 1.
 *
 * Rock: *"I'm not sure I follow the logic of that reset button that only
 * activates for luminosity. I think we could have just a reset button in
 * front of the slider... a small square button with the round arrow icon."*
 *
 * He is right that one slider having a reset and the others not is
 * arbitrary. Every slider in this panel gets the same control, in the same
 * place, disabled when the value is already the one the app chose. That is
 * item 18's shape; Cycle D generalises it to the Finish panel.
 *
 * DISABLED, NOT HIDDEN. A reset that vanishes when there is nothing to reset
 * makes the row jump as you drag, and hides the fact that the control HAS a
 * default. Disabled says both things at once, and Task 3b's rule makes that
 * an explicit colour rather than an opacity.
 */
function makeResetButton(label) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'slider-reset';
  btn.setAttribute('aria-label', label);
  btn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-reset"></use></svg>';
  return btn;
}

function syncSliderFill(input, valueEl, text) {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 100;
  const pct = ((Number(input.value) - min) / (max - min)) * 100;
  input.style.setProperty('--slider-fill', `${pct}%`);
  if (valueEl) valueEl.textContent = text;
}

export function initBackgroundInspector() {
  const section = document.getElementById('backgroundSection');
  if (!section) return null;

  const sampledCache = createSampledCache();

  section.innerHTML = '<h2 class="section-label">Background</h2>';

  // --- Sampled -----------------------------------------------------------
  const sampledRow = document.createElement('button');
  sampledRow.type = 'button';
  sampledRow.className = 'sampled-row';
  sampledRow.setAttribute('aria-pressed', 'false');

  const sampledStopsEl = document.createElement('span');
  sampledStopsEl.className = 'sampled-stops';
  sampledStopsEl.setAttribute('aria-hidden', 'true');
  const sampledStopEls = [0, 1, 2].map(() => {
    const s = document.createElement('span');
    s.className = 'sampled-stop';
    sampledStopsEl.appendChild(s);
    return s;
  });

  const sampledLabel = document.createElement('span');
  sampledLabel.className = 'sampled-label';
  const sampledTitle = document.createElement('span');
  sampledTitle.textContent = 'Sampled';
  const sampledSub = document.createElement('span');
  sampledSub.className = 'sampled-hue mono';
  sampledLabel.append(sampledTitle, sampledSub);

  sampledRow.append(sampledStopsEl, sampledLabel);
  sampledRow.setAttribute(
    'aria-label',
    'Sampled ground, derived automatically from the screenshot. Click to clear every manual override — hue and luminosity.',
  );
  section.appendChild(sampledRow);

  // --- Presets (Task 4's own swatch rendering, reused) --------------------
  const presetList = document.createElement('ul');
  presetList.className = 'preset-list';
  presetList.setAttribute('role', 'group');
  presetList.setAttribute('aria-label', 'Ground presets');
  section.appendChild(presetList);

  // --- Hue -----------------------------------------------------------
  const hueRow = document.createElement('div');
  hueRow.className = 'slider-row';
  hueRow.innerHTML = `
    <div class="slider-label"><span>Hue</span><span class="mono slider-value"></span></div>
  `;
  const hueInput = document.createElement('input');
  hueInput.type = 'range';
  hueInput.className = 'slider';
  hueInput.min = '0';
  hueInput.max = '360';
  hueInput.step = '1';
  hueInput.setAttribute('aria-label', 'Ground hue, in degrees — dragging forces a hue and leaves Sampled');
  const hueReset = makeResetButton('Reset hue to the sampled value');
  const hueResetTrack = document.createElement('div');
  hueResetTrack.className = 'slider-track-row';
  hueResetTrack.append(hueInput, hueReset);
  hueRow.appendChild(hueResetTrack);
  const hueValueEl = hueRow.querySelector('.slider-value');
  section.appendChild(hueRow);

  // --- Angle -----------------------------------------------------------
  const angleRow = document.createElement('div');
  angleRow.className = 'slider-row';
  angleRow.innerHTML = `
    <div class="slider-label"><span>Angle</span><span class="mono slider-value"></span></div>
  `;
  const angleInput = document.createElement('input');
  angleInput.type = 'range';
  angleInput.className = 'slider';
  angleInput.min = '0';
  angleInput.max = String(ANGLE_SLIDER_MAX);
  angleInput.step = '1';
  angleInput.setAttribute('aria-label', 'Gradient angle, in degrees');
  const angleReset = makeResetButton('Reset angle to the default');
  // THE DIAL (Task 7). A number cannot say which way 166° points, and an
  // arrow drawn from that number would only restate it. This is a circle of
  // the REAL ground, painted by paintGround from the stops the canvas itself
  // used, with a tick on the light end — so it cannot disagree with what it
  // is describing.
  const angleDial = document.createElement('canvas');
  angleDial.width = 44;
  angleDial.height = 44;
  angleDial.className = 'angle-dial';
  angleDial.setAttribute('aria-hidden', 'true');
  const angleResetTrack = document.createElement('div');
  angleResetTrack.className = 'slider-track-row';
  angleResetTrack.append(angleInput, angleDial, angleReset);
  angleRow.appendChild(angleResetTrack);
  const angleValueEl = angleRow.querySelector('.slider-value');
  section.appendChild(angleRow);

  // --- Type -----------------------------------------------------------
  const typeLabelRow = document.createElement('div');
  typeLabelRow.className = 'slider-label';
  typeLabelRow.innerHTML = '<span>Type</span>';
  section.appendChild(typeLabelRow);

  const typeSegmented = document.createElement('div');
  typeSegmented.className = 'segmented';
  typeSegmented.setAttribute('role', 'group');
  typeSegmented.setAttribute('aria-label', 'Background type');
  const typeButtons = UI_BG_TYPES.map((type) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'segmented-cell';
    btn.dataset.type = type;
    btn.textContent = TYPE_LABELS[type] || type;
    btn.setAttribute('aria-pressed', 'false');
    typeSegmented.appendChild(btn);
    return btn;
  });
  section.appendChild(typeSegmented);

  // --- Seed (mesh only) -----------------------------------------------------------
  const seedRow = document.createElement('div');
  seedRow.id = 'backgroundSeedRow';
  seedRow.className = 'inline-control-row';
  seedRow.hidden = true;
  const seedLabel = document.createElement('span');
  seedLabel.textContent = 'Seed';
  const seedStepper = document.createElement('div');
  seedStepper.className = 'zoom-stepper';
  const seedMinus = document.createElement('button');
  seedMinus.type = 'button';
  seedMinus.className = 'zoom-btn';
  seedMinus.setAttribute('aria-label', 'Decrease mesh seed');
  seedMinus.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-minus"></use></svg>';
  const seedValueEl = document.createElement('span');
  seedValueEl.className = 'zoom-value mono';
  const seedPlus = document.createElement('button');
  seedPlus.type = 'button';
  seedPlus.className = 'zoom-btn';
  seedPlus.setAttribute('aria-label', 'Increase mesh seed');
  seedPlus.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-plus"></use></svg>';
  seedStepper.append(seedMinus, seedValueEl, seedPlus);
  seedRow.append(seedLabel, seedStepper);
  section.appendChild(seedRow);

  // --- Stops and Spread (mesh only, Task 9) ---------------------------
  // Without these, `spread` and `stops` are unreachable - which is exactly
  // the state that made mesh useless in the first place, and there would be
  // no way for anyone to judge whether it is worth having. Deliberately
  // minimal; Cycle B's Background rework replaces them. Same idioms as the
  // Seed stepper above and the Angle slider below - no new control
  // vocabulary is invented here.
  const stopsRow = document.createElement('div');
  stopsRow.id = 'backgroundStopsRow';
  stopsRow.className = 'inline-control-row';
  stopsRow.hidden = true;
  const stopsLabel = document.createElement('span');
  stopsLabel.textContent = 'Stops';
  const stopsStepper = document.createElement('div');
  stopsStepper.className = 'zoom-stepper';
  const stopsMinus = document.createElement('button');
  stopsMinus.type = 'button';
  stopsMinus.className = 'zoom-btn';
  stopsMinus.setAttribute('aria-label', 'Fewer mesh colour stops');
  stopsMinus.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-minus"></use></svg>';
  const stopsValueEl = document.createElement('span');
  stopsValueEl.className = 'zoom-value mono';
  const stopsPlus = document.createElement('button');
  stopsPlus.type = 'button';
  stopsPlus.className = 'zoom-btn';
  stopsPlus.setAttribute('aria-label', 'More mesh colour stops');
  stopsPlus.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-plus"></use></svg>';
  stopsStepper.append(stopsMinus, stopsValueEl, stopsPlus);
  stopsRow.append(stopsLabel, stopsStepper);
  section.appendChild(stopsRow);

  const spreadRow = document.createElement('div');
  spreadRow.id = 'backgroundSpreadRow';
  spreadRow.className = 'slider-row';
  spreadRow.hidden = true;
  spreadRow.innerHTML = '<div class="slider-label"><span>Spread</span><span class="mono slider-value"></span></div>';
  const spreadInput = document.createElement('input');
  spreadInput.type = 'range';
  spreadInput.className = 'slider';
  spreadInput.min = String(MESH_SPREAD_RANGE[0]);
  spreadInput.max = String(MESH_SPREAD_RANGE[1]);
  spreadInput.step = '1';
  spreadInput.setAttribute('aria-label', 'Mesh hue spread, in degrees around the ground’s own hue');
  spreadRow.appendChild(spreadInput);
  const spreadValueEl = spreadRow.querySelector('.slider-value');
  section.appendChild(spreadRow);

  // --- Luminosity (Cycle C Task 1) -------------------------------------
  // Was a three-cell "Ground tone" segmented, Auto / Light / Mid. Both of
  // those were pale; this reaches a genuinely dark ground, and starts on
  // the sampled value rather than a fixed midpoint.
  const lumRow = document.createElement('div');
  lumRow.className = 'slider-row';
  lumRow.innerHTML =
    '<div class="slider-label"><span>Luminosity</span><span class="mono slider-value"></span></div>';
  const lumInput = document.createElement('input');
  lumInput.type = 'range';
  lumInput.className = 'slider';
  lumInput.min = String(LUMINOSITY_RANGE[0]);
  lumInput.max = String(LUMINOSITY_RANGE[1]);
  lumInput.step = '0.005';
  lumInput.setAttribute('aria-label', "Ground luminosity — how light or dark the background is");
  const lumReset2 = makeResetButton('Reset luminosity to the sampled value');
  const lumReset2Track = document.createElement('div');
  lumReset2Track.className = 'slider-track-row';
  lumReset2Track.append(lumInput, lumReset2);
  lumRow.appendChild(lumReset2Track);
  const lumValueEl = lumRow.querySelector('.slider-value');
  section.appendChild(lumRow);

  // The old standalone "Sampled"/"Reset" row under Luminosity is gone: every
  // slider carries its own reset now, in the same place, so no one control
  // is special. See makeResetButton.

  // NO HINT PARAGRAPH HERE. Cycle A put one under Padding explaining the
  // outset model and Rock cut it on sight; Cycle C put one under Luminosity
  // and he cut that too, with the general instruction: "stop putting
  // messages there". A paragraph under a slider is the control failing to
  // explain itself. If one is confusing, the fix is the control.

  // --- THE ORDER IS THE ARGUMENT (Cycle C Task 4) ----------------------
  //
  // Everything above was appended in the order it happened to be built.
  // This re-appends it in the order it should READ, in one place, so the
  // panel's structure is a statement rather than an accident of
  // construction. `appendChild` moves an existing node, so this reorders
  // rather than duplicating.
  //
  // Type first, because it decides what every control below it means.
  // Then the ground itself - sampled, then the presets - because that is
  // the choice. Then the adjustments to whatever was chosen. Mesh's own
  // controls sit last, gated on the type.
  //
  // SAMPLED LIVES INSIDE THE TYPE and is not a fourth option beside it:
  // there is a sampled gradient and a sampled solid, and switching type
  // keeps whichever you had.
  for (const el of [
    typeLabelRow, typeSegmented,
    sampledRow, presetList,
    hueRow, angleRow,
    lumRow,
    seedRow, stopsRow, spreadRow,
  ]) section.appendChild(el);

  // -----------------------------------------------------------------------
  // Sync functions: each updates exactly the DOM this panel's own state
  // affects, and nothing rebuilds the control elements themselves mid-drag
  // (only their value/label/fill/class) — a slider that got torn down and
  // recreated on its own 'input' event would abort the user's own drag
  // gesture. Rebuilding the (small, un-focused) preset <ul> on every hue
  // tick is fine: renderTile -> groundFromMeta is the CHEAP tail-only path
  // (a handful of hslToHex calls plus a 88px paintGround), never the
  // expensive analyse() pass — see the perf note further down.
  // -----------------------------------------------------------------------

  function syncGroundUI() {
    const cfg = state.config;
    const auto = isAutoGround(cfg);
    const meta = sampledCache.refresh(state.images, cfg, state.meta);

    // Sampled swatches: tone-aware (groundFromMeta with the CURRENT tone,
    // so the preview matches what clicking "Sampled" would actually
    // produce), but hue-locked to the true measured value (forceHue=null
    // keeps `meta.hue` — never the override) — see this file's header
    // comment on why `meta` here is NEVER `state.meta`.
    // `null` luminosity as well as `null` hue: this row previews what
    // clicking it would ACTUALLY produce, and clicking it now clears both.
    // Passing `cfg.luminosity` here would show the user's override in a
    // swatch labelled "from screenshot".
    const preview = groundFromMeta(meta, null, null);
    sampledStopEls.forEach((el, i) => { el.style.background = preview.ground[i]; });
    sampledSub.textContent = `from screenshot · ${Math.round(meta.hue)}°`;
    // Active only when EVERYTHING is sampled - the row's claim is about the
    // whole ground, so a forced luminosity makes it untrue just as a forced
    // hue does.
    const fully = isFullySampled(cfg);
    sampledRow.classList.toggle('is-active', fully);
    sampledRow.setAttribute('aria-pressed', String(fully));

    // Hue slider: the CURRENTLY EFFECTIVE hue — forced value if one is set,
    // else the sampled reading above (never `state.meta`, which already
    // has any override baked in and would make the slider silently snap
    // back to the override the instant Sampled is re-selected).
    const effective = forcedHueDeg(cfg) ?? Math.round(meta.hue);
    hueInput.value = String(effective);
    syncSliderFill(hueInput, hueValueEl, `${effective}°`);
    hueReset.disabled = isAutoGround(cfg);

    renderPresetTiles(meta);
  }

  /**
   * The preset grid — Cycle C Task 5.
   *
   * Each tile is a real <canvas> painted by web/preset-tiles.js through
   * core/'s own `paintGround`, at the current type, angle and luminosity.
   * It replaces eight 14x14 CSS chips whose gradient was an approximation
   * of what the canvas would draw: two of the eight were indistinguishable
   * at that size, and the approximation lied about `ash` the moment that
   * preset gained its own saturation.
   *
   * Rebuilt on every sync rather than mutated, like the swatches were: the
   * grid is eight small elements, nothing in it holds focus mid-drag, and
   * `groundFromMeta` is the cheap tail-only path, never `analyse()`.
   */
  function renderPresetTiles(meta) {
    presetList.innerHTML = '';
    const active = activeGroundKey(state.config);
    for (const name of Object.keys(GROUNDS)) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preset-tile' + (active === name ? ' is-selected' : '');
      btn.setAttribute('aria-pressed', String(active === name));

      const cv = document.createElement('canvas');
      // A fixed backing size, not the CSS size: the tile is drawn once per
      // sync and scaled by CSS, and a ground is smooth enough that this
      // costs nothing visible while keeping the paint cheap.
      cv.width = 88;
      cv.height = 88;
      cv.className = 'preset-tile-canvas';
      cv.setAttribute('aria-hidden', 'true');
      renderTile(cv, name, state.config, meta);

      const label = document.createElement('span');
      label.className = 'preset-tile-label';
      label.textContent = name.charAt(0).toUpperCase() + name.slice(1);

      btn.append(cv, label);
      btn.addEventListener('click', () => {
        selectGround(state.config, name);
        afterBackgroundChange();
      });
      li.appendChild(btn);
      presetList.appendChild(li);
    }
  }

  /**
   * EVERY BACKGROUND CHANGE GOES THROUGH HERE — Cycle C Task 5, fix round 1.
   *
   * Rock: *"HAL changes CT, and that's cool. but, A only updates CT after
   * you change H."* Exactly right. The preset tiles are painted at the
   * CURRENT type, angle and luminosity, so they go stale whenever one of
   * those changes — and only Hue and Luminosity happened to call
   * `syncGroundUI`. Angle, type and the mesh controls did not, so a tile
   * kept showing the angle you had before.
   *
   * Patching each listener would fix the three that are wrong today and
   * leave the next control someone adds to be wrong tomorrow. One function
   * that syncs everything removes the whole class instead.
   */
  function afterBackgroundChange() {
    syncTypeUI();
    syncGroundUI();
    syncAngleUI();
    syncLuminosityUI();
    scheduleRender();
  }

  function syncAngleUI() {
    const deg = Number.isFinite(state.config.angle) ? state.config.angle : DEFAULT_ANGLE;
    angleInput.value = String(deg);
    syncSliderFill(angleInput, angleValueEl, `${deg}°`);
    angleReset.disabled = isDefaultAngle(state.config);

    // The dial's stops come from the same call core/index.js makes for the
    // canvas — `groundFromMeta(meta, forceHue, luminosity, forceSat)`, with
    // every argument taken from `normalise()` rather than re-read by hand.
    // `state.meta.ground` would have been the same triple but one frame
    // stale, since it is only written after a render; this is the tiles'
    // arrangement, and it is not stale.
    const eff = normalise(state.config);
    const dialMeta = sampledCache.refresh(state.images, state.config, state.meta);
    const dialStops = dialMeta
      ? groundFromMeta(dialMeta, eff.forceHue, eff.luminosity, eff.forceSat).ground
      : null;
    const dialStyle = getComputedStyle(angleDial);
    renderGroundDial(angleDial, state.config, dialStops, {
      markInk: dialStyle.getPropertyValue('--dial-ink').trim(),
      markHalo: dialStyle.getPropertyValue('--dial-halo').trim(),
    });
    angleInput.setAttribute('aria-valuetext', `${deg} degrees, light from the ${lightEndLabel(deg)}`);
  }

  function syncTypeUI() {
    // UI_BG_TYPES, not BG_TYPES: a config carrying a type the panel does
    // not offer (mesh, today) must not leave the section showing that
    // type's own rows with no button selected to explain them.
    const type = UI_BG_TYPES.includes(state.config.bgType)
      ? state.config.bgType : DEFAULTS.bgType;
    typeButtons.forEach((btn) => {
      const active = btn.dataset.type === type;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    seedRow.hidden = type !== 'mesh';
    stopsRow.hidden = type !== 'mesh';
    spreadRow.hidden = type !== 'mesh';
    // Angle only means something for a gradient - see showsAngle.
    angleRow.hidden = !showsAngle(state.config);
    if (!seedRow.hidden) { syncSeedUI(); syncMeshUI(); }
  }

  function syncMeshUI() {
    const stops = activeMeshStops(state.config);
    stopsValueEl.textContent = String(stops);
    stopsMinus.disabled = stops <= MESH_STOPS_RANGE[0];
    stopsPlus.disabled = stops >= MESH_STOPS_RANGE[1];

    const spread = activeMeshSpread(state.config);
    spreadInput.value = String(spread);
    syncSliderFill(spreadInput, spreadValueEl, `${Math.round(spread)}°`);
  }

  function syncSeedUI() {
    const seed = Number.isFinite(state.config.seed) ? state.config.seed : DEFAULTS.seed;
    seedValueEl.textContent = String(seed);
    seedMinus.disabled = seed <= SEED_MIN;
    seedPlus.disabled = seed >= SEED_MAX;
  }

  function syncLuminosityUI() {
    const sampled = isSampledLuminosity(state.config);
    const l = activeLuminosity(state.config, state.meta);
    lumInput.value = String(l);
    syncSliderFill(lumInput, lumValueEl, `${Math.round(l * 100)}%`);
    lumReset2.disabled = sampled;
  }

  // --- Event wiring -----------------------------------------------------

  sampledRow.addEventListener('click', () => {
    resetToSampled(state.config);
    afterBackgroundChange();
  });

  hueInput.addEventListener('input', () => {
    setHue(state.config, hueInput.value);
    afterBackgroundChange();
  });

  // Angle NEVER touches `config.ground`/`config.luminosity` — web/state.js's
  // groundKeyFor (its cache key) doesn't read `angle` at all, so this is
  // the one slider in this panel guaranteed to hit the warm cache on every
  // drag tick rather than re-running core/ground.js's analyse() pass. See
  // task-5-report.md for the measured numbers.
  angleInput.addEventListener('input', () => {
    setAngle(state.config, angleInput.value);
    afterBackgroundChange();
  });

  hueReset.addEventListener('click', () => {
    resetHueToSampled(state.config);
    afterBackgroundChange();
  });

  angleReset.addEventListener('click', () => {
    resetAngle(state.config);
    afterBackgroundChange();
  });

  typeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      setBgType(state.config, btn.dataset.type);
      afterBackgroundChange();
    });
  });

  seedMinus.addEventListener('click', () => {
    const current = Number.isFinite(state.config.seed) ? state.config.seed : DEFAULTS.seed;
    setSeed(state.config, current - 1);
    afterBackgroundChange();
  });
  seedPlus.addEventListener('click', () => {
    const current = Number.isFinite(state.config.seed) ? state.config.seed : DEFAULTS.seed;
    setSeed(state.config, current + 1);
    afterBackgroundChange();
  });

  stopsMinus.addEventListener('click', () => {
    setMeshStops(state.config, activeMeshStops(state.config) - 1);
    afterBackgroundChange();
  });
  stopsPlus.addEventListener('click', () => {
    setMeshStops(state.config, activeMeshStops(state.config) + 1);
    afterBackgroundChange();
  });
  spreadInput.addEventListener('input', () => {
    setMeshSpread(state.config, spreadInput.value);
    afterBackgroundChange();
  });

  // Luminosity changes what every preset AND the Sampled swatch preview to,
  // even though it changes no hue - the presets are rendered at the current
  // luminosity, so both need a refresh here, not just this row.
  lumInput.addEventListener('input', () => {
    setLuminosity(state.config, lumInput.value);
    afterBackgroundChange();
  });

  lumReset2.addEventListener('click', () => {
    resetLuminosityToSampled(state.config);
    afterBackgroundChange();
  });

  syncGroundUI();
  syncAngleUI();
  syncTypeUI();
  syncLuminosityUI();

  // Returned so web/main.js can tell this panel to re-derive "Sampled" the
  // moment a screenshot decodes (see web/main.js's `handleFiles`). It also
  // re-renders the preset swatches, which is the whole of that handshake
  // now: the rail had its own copy (`refreshGrounds`) until Cycle A Task 2
  // removed its duplicate Ground group.
  return {
    refreshSampled: () => {
      sampledCache.invalidate(); // force the next refresh() below to recompute
      // AND the luminosity slider, which sits on the SAMPLED position when
      // nothing is set - so a new screenshot moves it. Missing this was a
      // real bug, caught by looking: the slider is built before any image
      // exists, syncs once at init against a null `state.meta`, and so sat
      // at the pale anchor over a dark screenshot whose sampled ground was
      // the mid one. Same shape as Cycle B Task 7's panel header reading
      // "Desktop" over a phone-only shot - a sync that only runs at init.
      syncLuminosityUI();
      syncGroundUI();
    },
  };
}
