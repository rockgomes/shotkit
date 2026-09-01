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
  HUES, TONES, BG_TYPES, DEFAULT_ANGLE, DEFAULTS, groundFor, groundFromMeta,
} from '../core/index.js';
import { state, scheduleRender } from './state.js';
import { activeGroundKey, renderGroundSwatches } from './sidebar.js';

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
export function resetToSampled(config) {
  config.ground = null;
}

export function setAngle(config, deg) {
  const n = Number(deg);
  if (!Number.isFinite(n)) return;
  config.angle = ((Math.round(n) % 360) + 360) % 360;
}

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

/** `tone` is 'auto' | 'light' | 'mid' from the UI; `config.tone` (what
 *  core/ actually reads) is null | 'light' | 'mid' — 'auto' IS null, not a
 *  string core/config.js would recognise (TONES, imported above, is only
 *  `['light', 'mid']`). */
export function setTone(config, tone) {
  config.tone = TONES.includes(tone) ? tone : null;
}

export function activeToneUi(config) {
  return TONES.includes(config.tone) ? config.tone : 'auto';
}

// ---------------------------------------------------------------------
// "Sampled": the TRUE, unforced ground reading for the loaded image(s) —
// independent of whatever override (if any) is currently active.
//
// Why this can't just read `state.meta`: state.meta is composeWithMeta's
// (core/index.js) own return value, and once a hue is forced, `meta.hue`
// IS the forced value — core/ground.js's tail() overwrites it before
// returning (see that function's own comment). There is nowhere else in
// the running app that remembers what the screenshot's OWN accent hue was
// once an override has been applied, because nothing needed to until this
// panel had to show it ANYWAY, permanently, right at the top, regardless
// of override state. So this module keeps its own reading, computed the
// exact same way core/index.js's composeWithMeta computes its own
// UNFORCED meta (same 800px thumbnail step, same groundFor call with
// forceHue=null/mode=null) — just cached independently, keyed on image
// identity ONLY (never on config.ground/config.tone), so an override can
// never touch it.
//
// `computeSampledMeta` takes an injectable `makeCanvas` (default: a real
// DOM canvas) for the exact reason web/state.js's `bindCanvas` does: it
// lets test/inspector-background.test.js drive this with @napi-rs/canvas
// under Node, against real decoded images, instead of a browser `document`.
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
 *  invented placeholder colour). Exported so tests can call it directly
 *  with a real image and a Node canvas factory. */
export function computeSampledMeta(images, makeCanvas = defaultMakeCanvas) {
  const list = [images.web, ...(images.mobile || [])].filter(Boolean);
  const samples = list.length
    ? list.map((im) => sampleOf(im, makeCanvas))
    : [{ width: 1, height: 1, data: [128, 128, 128, 255] }];
  return groundFor(samples, null, null);
}

let sampledMeta = null;
let sampledKey = null;

function sampledKeyFor(images) {
  const mobileIds = (images.mobile || []).map((m) => m.__id).join(',');
  return `${images.web ? images.web.__id : ''}|${mobileIds}`;
}

/** Recomputes `sampledMeta` only when the loaded image SET actually
 *  changed — this is a real analyse() pass (core/ground.js), the same
 *  ~87-200ms cost as a cold render, so it must not run on every panel
 *  redraw, only when there is genuinely a new screenshot to read. */
function refreshSampledCache() {
  const key = sampledKeyFor(state.images);
  if (sampledKey !== key || !sampledMeta) {
    sampledMeta = computeSampledMeta(state.images);
    sampledKey = key;
  }
  return sampledMeta;
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
    'Sampled ground, derived automatically from the screenshot. Click to clear a manual hue override.',
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
  hueRow.appendChild(hueInput);
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
  angleInput.max = '360';
  angleInput.step = '1';
  angleInput.setAttribute('aria-label', 'Gradient angle, in degrees');
  angleRow.appendChild(angleInput);
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
  const TYPE_LABELS = { linear: 'Linear', solid: 'Solid', mesh: 'Mesh' };
  const typeButtons = BG_TYPES.map((type) => {
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

  // --- Tone -----------------------------------------------------------
  // Labelled deliberately so the RULE reads, not a vibe: a dark UI gets a
  // MID-TONE ground (never a dark one) so the shot separates from it — see
  // core/ground.js's own header comment. "Light"/"Mid" here force one of
  // those two branches regardless of the screenshot's own luminance;
  // "Auto" is the default (infer from the screenshot, per-image).
  const toneLabelRow = document.createElement('div');
  toneLabelRow.className = 'slider-label';
  toneLabelRow.innerHTML = '<span>Ground tone</span>';
  section.appendChild(toneLabelRow);

  const toneSegmented = document.createElement('div');
  toneSegmented.className = 'segmented segmented--mini';
  toneSegmented.setAttribute('role', 'group');
  toneSegmented.setAttribute('aria-label', 'Ground tone override');
  const TONE_UI = ['auto', 'light', 'mid'];
  const TONE_LABELS = { auto: 'Auto', light: 'Light', mid: 'Mid' };
  const toneButtons = TONE_UI.map((tone) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'segmented-cell';
    btn.dataset.tone = tone;
    btn.textContent = TONE_LABELS[tone];
    btn.setAttribute('aria-pressed', 'false');
    toneSegmented.appendChild(btn);
    return btn;
  });
  section.appendChild(toneSegmented);

  const toneHint = document.createElement('p');
  toneHint.className = 'control-hint';
  toneHint.textContent =
    'A dark screenshot gets a mid-tone ground, never a dark one, so the shot still separates from it — this is a correctness rule, not a mood setting.';
  section.appendChild(toneHint);

  // -----------------------------------------------------------------------
  // Sync functions: each updates exactly the DOM this panel's own state
  // affects, and nothing rebuilds the control elements themselves mid-drag
  // (only their value/label/fill/class) — a slider that got torn down and
  // recreated on its own 'input' event would abort the user's own drag
  // gesture. Rebuilding the (small, un-focused) preset <ul> on every hue
  // tick is fine: renderGroundSwatches -> gradientFor -> groundFromMeta is
  // the CHEAP tail-only path (a handful of hslToHex calls), never the
  // expensive analyse() pass — see the perf note further down.
  // -----------------------------------------------------------------------

  function syncGroundUI() {
    const cfg = state.config;
    const auto = isAutoGround(cfg);
    const meta = refreshSampledCache();

    // Sampled swatches: tone-aware (groundFromMeta with the CURRENT tone,
    // so the preview matches what clicking "Sampled" would actually
    // produce), but hue-locked to the true measured value (forceHue=null
    // keeps `meta.hue` — never the override) — see this file's header
    // comment on why `meta` here is NEVER `state.meta`.
    const preview = groundFromMeta(meta, null, cfg.tone);
    sampledStopEls.forEach((el, i) => { el.style.background = preview.ground[i]; });
    sampledSub.textContent = `from screenshot · ${Math.round(meta.hue)}°`;
    sampledRow.classList.toggle('is-active', auto);
    sampledRow.setAttribute('aria-pressed', String(auto));

    // Hue slider: the CURRENTLY EFFECTIVE hue — forced value if one is set,
    // else the sampled reading above (never `state.meta`, which already
    // has any override baked in and would make the slider silently snap
    // back to the override the instant Sampled is re-selected).
    const effective = forcedHueDeg(cfg) ?? Math.round(meta.hue);
    hueInput.value = String(effective);
    syncSliderFill(hueInput, hueValueEl, `${effective}°`);

    // Presets: Task 4's own rendering, reused rather than reimplemented.
    renderGroundSwatches(presetList, () => {
      syncGroundUI();
      scheduleRender();
    });
  }

  function syncAngleUI() {
    const deg = Number.isFinite(state.config.angle) ? state.config.angle : DEFAULT_ANGLE;
    angleInput.value = String(deg);
    syncSliderFill(angleInput, angleValueEl, `${deg}°`);
  }

  function syncTypeUI() {
    const type = BG_TYPES.includes(state.config.bgType) ? state.config.bgType : DEFAULTS.bgType;
    typeButtons.forEach((btn) => {
      const active = btn.dataset.type === type;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    seedRow.hidden = type !== 'mesh';
    if (!seedRow.hidden) syncSeedUI();
  }

  function syncSeedUI() {
    const seed = Number.isFinite(state.config.seed) ? state.config.seed : DEFAULTS.seed;
    seedValueEl.textContent = String(seed);
    seedMinus.disabled = seed <= SEED_MIN;
    seedPlus.disabled = seed >= SEED_MAX;
  }

  function syncToneUI() {
    const tone = activeToneUi(state.config);
    toneButtons.forEach((btn) => {
      const active = btn.dataset.tone === tone;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  // --- Event wiring -----------------------------------------------------

  sampledRow.addEventListener('click', () => {
    resetToSampled(state.config);
    syncGroundUI();
    scheduleRender();
  });

  hueInput.addEventListener('input', () => {
    setHue(state.config, hueInput.value);
    syncGroundUI();
    scheduleRender();
  });

  // Angle NEVER touches `config.ground`/`config.tone` — web/state.js's
  // groundKeyFor (its cache key) doesn't read `angle` at all, so this is
  // the one slider in this panel guaranteed to hit the warm cache on every
  // drag tick rather than re-running core/ground.js's analyse() pass. See
  // task-5-report.md for the measured numbers.
  angleInput.addEventListener('input', () => {
    setAngle(state.config, angleInput.value);
    syncAngleUI();
    scheduleRender();
  });

  typeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      setBgType(state.config, btn.dataset.type);
      syncTypeUI();
      scheduleRender();
    });
  });

  seedMinus.addEventListener('click', () => {
    const current = Number.isFinite(state.config.seed) ? state.config.seed : DEFAULTS.seed;
    setSeed(state.config, current - 1);
    syncSeedUI();
    scheduleRender();
  });
  seedPlus.addEventListener('click', () => {
    const current = Number.isFinite(state.config.seed) ? state.config.seed : DEFAULTS.seed;
    setSeed(state.config, current + 1);
    syncSeedUI();
    scheduleRender();
  });

  toneButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      setTone(state.config, btn.dataset.tone);
      syncToneUI();
      // Tone changes what every preset AND the Sampled swatch preview to
      // (groundFromMeta's darkUI branch) even though it changes no hue —
      // both need a refresh here, not just the tone row itself.
      syncGroundUI();
      scheduleRender();
    });
  });

  syncGroundUI();
  syncAngleUI();
  syncTypeUI();
  syncToneUI();

  // Returned so web/main.js can tell this panel to re-derive "Sampled" the
  // moment a screenshot decodes — the same handshake Task 4's
  // `refreshGrounds` already uses for the sidebar's own preset previews
  // (see web/main.js's `handleFiles`).
  return {
    refreshSampled: () => {
      sampledKey = null; // force refreshSampledCache() to recompute below
      syncGroundUI();
    },
  };
}
