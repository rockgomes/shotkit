// web/inspector-frame.js — Task 6: the inspector's Frame and Finish
// sections, plus the text input that finally closes the browser pill's
// long-empty URL field.
//
// TWO SECTIONS, ONE FILE: the task brief creates exactly one new file for
// both (Frame: frameKind chips, chrome theme, the url field it gates;
// Finish: padding, corner radius, grain, shadow — strength, and from Cycle A
// Task 5 its distance, angle, blur and directional mode) — they're wired the
// same way and share no state with web/inspector-background.js, so there's
// no reason to split them further. Order within each section follows the
// brief's own ordering, not the design handoff's (which never designed a
// "Finish" section at all — padding/radius/grain/shadow are this
// app's own grouping of fields the handoff scattered or omitted).
//
// Cycle A Task 4 retired two of these controls: a Fit segmented control
// (Contain/Cover) and a Caption text input. Cover's only effect was to crop
// the screenshot, and the caption was never wanted; both are gone from
// core/ as well, so there is no config field left for either to write.
//
// ONE RENDER PATH: exactly like web/inspector-background.js and
// web/sidebar.js before it, every handler below mutates `state.config` and
// calls `scheduleRender()` — nothing here calls `composeWithMeta` directly.
//
// core/ IMPORTS: only from core/index.js (FRAME_KINDS, CHROME_THEMES,
// DEFAULTS, normalise) — never a deep import of core/presets.js. Reading
// `normalise(state.config)` to display an EFFECTIVE value (the corner
// radius's own default, in particular) is the same read-only pattern
// web/sidebar.js already established for "+ Custom size"'s prefill — never
// used here to decide what to WRITE, only what to show before the user has
// touched a control.
//
// PERFORMANCE: none of frameKind/chromeTheme/url/pad/radius/grain/
// shadowScale/shadow.* is part of web/state.js's `groundKeyFor` (images +
// config.ground + config.tone only) — every control in this file hits the
// warm ~3ms colour cache, never groundFor's ~90-200ms analysis. shadowScale
// (Task 6b) has nothing to do with the sampled ground even in principle — a
// shadow multiplier over a fixed rgba colour — so it belongs in this list
// for the same reason grain does, and so do Task 5's distance/angle/blur/
// directional, which only move where that same wash lands. See
// test/inspector-frame.test.js's "throwing canvas" guard for the proof, and
// task-6-report.md / task-6b-report.md for measured timings.
import {
  FRAME_KINDS, CHROME_THEMES, DEFAULTS, normalise, SHADOW_SCALE_RANGE,
  SHADOW_DEFAULTS, SHADOW_DISTANCE_RANGE, SHADOW_BLUR_RANGE,
} from '../core/index.js';
import { state, scheduleRender } from './state.js';

// ---------------------------------------------------------------------
// Pure state helpers — no DOM. Same split web/sidebar.js and
// web/inspector-background.js already established: these are what
// test/inspector-frame.test.js drives directly; the DOM-touching init
// functions are at the bottom of this file.
// ---------------------------------------------------------------------

// --- Frame ---------------------------------------------------------------

/** The effective frameKind, mirroring normalise()'s own fallback (anything
 *  not in FRAME_KINDS — including a stale "macos" — reads back as 'none')
 *  without running the whole normalise() pipeline just to read one field. */
export function activeFrameKind(config) {
  return FRAME_KINDS.includes(config.frameKind) ? config.frameKind : 'none';
}

export function setFrameKind(config, kind) {
  if (!FRAME_KINDS.includes(kind)) return;
  config.frameKind = kind;
}

export function activeChromeTheme(config) {
  // 'dark' literal, matching core/config.js's normalise() exactly — there
  // is no DEFAULTS.chromeTheme to read (core/presets.js's DEFAULTS covers
  // only the fields normalise() derives from it; frameKind/chromeTheme's
  // fallbacks are both inline literals there, same as here).
  return CHROME_THEMES.includes(config.chromeTheme) ? config.chromeTheme : 'dark';
}

export function setChromeTheme(config, theme) {
  if (!CHROME_THEMES.includes(theme)) return;
  config.chromeTheme = theme;
}

/**
 * ONE rule for BOTH secondary Frame controls (chrome theme and the url
 * field): visible only for `frameKind === 'browser'`.
 *
 * Fix round 1 (Task 6): chrome theme originally had its OWN, looser rule
 * (visible for 'phone' too, reasoned as a legitimate pre-set for later).
 * A reviewer rendered a phone frame at both chrome themes and found the
 * output byte-identical — `paintPhoneChrome` (core/render.js) never
 * receives `theme` at all, and `paintDeviceBody`/`paintDeviceHairline`
 * hardcode their own colours regardless of it. So the control visibly
 * toggled while nothing it claims to control moved: a segmented control
 * that appears to work and doesn't. `core/render.js` only ever consults
 * `chromeTheme`/`url` along the browser-only code path (`paintWebChrome`/
 * `paintChrome`) — `paintPhoneChrome` receives neither — so this file now
 * gates both the same way too, extracted as one pure, directly-testable
 * function instead of two inline conditions that could drift apart again.
 * See test/inspector-frame.test.js.
 */
export function showsBrowserOnlyControls(config) {
  return activeFrameKind(config) === 'browser';
}

/** The browser URL pill's own text (core/config.js's `url`, Task 6's
 *  authorised core/ change). Raw pass-through, on purpose: normalise()
 *  already coerces an empty string to null, so this file doesn't need to
 *  duplicate that here — see core/config.js. */
export function setUrl(config, value) {
  config.url = value;
}

export function activeUrl(config) {
  return typeof config.url === 'string' ? config.url : '';
}

// --- Finish ----------------------------------------------------------------

// Padding sliders (and the corner-radius one below) work in PERCENT in the
// UI — `config.pad` itself is already a 0..1 fraction of the shorter canvas
// side (core/presets.js's DEFAULTS.pad), so this is a direct *100/*0.01
// round trip, not a unit this file invents. Bounded to keep the slider
// meaningful (a comfortable range either side of the 5.2% default), not
// because normalise() itself enforces a ceiling.
export const PAD_PERCENT_MAX = 20;

export function activePadPercent(config) {
  const pad = Number.isFinite(config.pad) ? config.pad : DEFAULTS.pad;
  return Math.round(pad * 1000) / 10; // one decimal place, e.g. 5.2
}

export function setPadPercent(config, pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return;
  config.pad = Math.min(PAD_PERCENT_MAX, Math.max(0, n)) / 100;
}

export function activeGrainPercent(config) {
  const grain = Number.isFinite(config.grain) ? config.grain : DEFAULTS.grain;
  return Math.round(grain * 100);
}

export function setGrainPercent(config, pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return;
  config.grain = Math.min(100, Math.max(0, n)) / 100;
}

// Shadow strength (Task 6b) — the one authorised core/ field this task adds.
// `config.shadowScale` is a MULTIPLIER over paintShadow's verified alphas
// (core/render.js), 1 == frame.html's own values unchanged; SHADOW_SCALE_RANGE
// (core/presets.js, [0, 2]) is the bound this slider works to, imported
// rather than hardcoded here so the UI and normalise()'s own clamp can never
// drift apart. The percent round-trip below is the exact same *100/*0.01
// pattern grain and padding already use, just over a wider [0,200] range —
// 100% reads back as the untouched default.
export function activeShadowPercent(config) {
  const scale = Number.isFinite(config.shadowScale) ? config.shadowScale : DEFAULTS.shadowScale;
  return Math.round(scale * 100);
}

export function setShadowPercent(config, pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return;
  const [min, max] = SHADOW_SCALE_RANGE;
  config.shadowScale = Math.min(max * 100, Math.max(min * 100, n)) / 100;
}

// --- Shadow shape (Cycle A Task 5): distance, angle, blur, directional ----
//
// FOUR DELIBERATELY MINIMAL CONTROLS. Cycle B restyles this whole section;
// these exist so the render feature can be dragged, seen and approved,
// because a feature with no way to reach it in the UI cannot be approved at
// all. They follow the idiom already in this file exactly — a `slider-row`
// per number, and the same `segmented segmented--mini` for the toggle that
// Chrome theme uses. No new control idiom, no restyling of anything around
// them.
//
// ANGLE IS NEVER DISABLED OR HIDDEN, including while Directional is off,
// where it does nothing. A control that vanishes is more confusing than one
// that waits, and this section already carries one fix round about a
// control that appeared to work and didn't — the answer there was to remove
// the control, not to hide it. Here the control is real; it is simply the
// second half of a pair.

/**
 * The effective shadow block for READING — core/'s defaults with whatever
 * the config actually carries laid over them. Deliberately non-mutating: a
 * panel that wrote to `config` merely by rendering itself would make
 * `normalise({})` and `normalise(state.config)` disagree the moment the
 * inspector mounted.
 */
function readShadow(config) {
  return { ...SHADOW_DEFAULTS, ...(config && config.shadow) };
}

/**
 * The config's OWN shadow block, created on first write.
 *
 * The spread is the point. `web/state.js` seeds `state.config` with
 * `{ ...DEFAULTS }` — a shallow copy — so handing out core/'s exported
 * SHADOW_DEFAULTS by reference would give every config in the process the
 * same mutable object, and one slider drag would rewrite core/'s own
 * defaults. See test/inspector-frame.test.js's "never aliases" case.
 */
function writableShadow(config) {
  if (!config.shadow || typeof config.shadow !== 'object') {
    config.shadow = { ...SHADOW_DEFAULTS };
  }
  return config.shadow;
}

// Distance and Blur are fractions of the canvas height (core/presets.js's
// SHADOW_DEFAULTS), so the UI shows them as percentages — the same *100 /
// *0.01 round trip padding, grain and shadow strength already use. Bounds
// come from core/ rather than being retyped here, so this slider and
// normalise()'s clamp cannot drift apart.
export function activeShadowDistancePercent(config) {
  return Math.round(readShadow(config).distance * 1000) / 10;
}

export function setShadowDistancePercent(config, pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return;
  const [min, max] = SHADOW_DISTANCE_RANGE;
  writableShadow(config).distance = Math.min(max, Math.max(min, n / 100));
}

export function activeShadowBlurPercent(config) {
  return Math.round(readShadow(config).blur * 1000) / 10;
}

export function setShadowBlurPercent(config, pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return;
  const [min, max] = SHADOW_BLUR_RANGE;
  writableShadow(config).blur = Math.min(max, Math.max(min, n / 100));
}

// Angle is degrees, and WRAPS rather than clamps — the exact expression
// core/config.js's normalise() applies. Clamping would let this panel
// display a number normalise() then renders as something else (450 shown,
// 90 drawn), which is precisely the "control that appears to work" failure
// showsBrowserOnlyControls above exists to document.
export function activeShadowAngle(config) {
  return readShadow(config).angle;
}

export function setShadowAngle(config, deg) {
  const n = Number(deg);
  if (!Number.isFinite(n)) return;
  writableShadow(config).angle = ((n % 360) + 360) % 360;
}

// Strictly boolean, because normalise() accepts `directional === true` and
// nothing else — a panel that stored the string 'true' would read ON here
// and render OFF.
export function activeShadowDirectional(config) {
  return readShadow(config).directional === true;
}

export function setShadowDirectional(config, on) {
  writableShadow(config).directional = on === true || on === 'true';
}

// Corner radius is the one field here that ISN'T stored as a fraction —
// core/config.js's normalise() resolves an unset `config.radius` to
// `Math.round(w * RADIUS_RATIO)` (a fraction of canvas WIDTH, ~1.33%), but
// an EXPLICIT radius is a literal pixel count from then on, applied as-is
// regardless of any later template/ratio change — that is the field's own
// existing semantics (core/config.js), not something this file changes.
// The slider still works in percent-of-width, matching the proportional
// feel every other Finish control has and RADIUS_RATIO's own convention
// (core/presets.js) — `normalise(state.config)` (read-only; the exact
// pattern web/sidebar.js's "+ Custom size" prefill already uses) supplies
// both the CURRENT effective radius and width, so this file never needs
// RADIUS_RATIO's raw value and never deep-imports core/presets.js for it.
export const RADIUS_PERCENT_MAX = 6;

export function activeRadiusPercent(config) {
  const eff = normalise(config);
  if (!eff.w) return 0;
  return Math.round((eff.radius / eff.w) * 1000) / 10;
}

export function setRadiusPercent(config, pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return;
  const eff = normalise(config);
  config.radius = Math.round((Math.min(RADIUS_PERCENT_MAX, Math.max(0, n)) / 100) * eff.w);
}

// ---------------------------------------------------------------------
// DOM wiring. Fully self-contained, like web/inspector-background.js: each
// init function builds its own section content from scratch and wires its
// own listeners, rather than relying on web/main.js's generic
// wireSingleSelectGroup/slider-fill loops — see that file's header comment
// for why those loops run BEFORE these, and touch none of this section's
// controls at all.
// ---------------------------------------------------------------------

/**
 * One labelled range row — the exact markup the four hand-written sliders in
 * initFinishInspector already use, factored out when Task 5 added three
 * more. Returns the pieces the caller needs to sync and listen; it wires no
 * listener itself, so every handler stays visible in one place at the bottom
 * of that function.
 */
function addSliderRow(section, { label, min, max, step, aria }) {
  const row = document.createElement('div');
  row.className = 'slider-row';
  const labelRow = document.createElement('div');
  labelRow.className = 'slider-label';
  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  const valueEl = document.createElement('span');
  valueEl.className = 'mono slider-value';
  labelRow.append(labelEl, valueEl);
  row.appendChild(labelRow);

  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'slider';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.setAttribute('aria-label', aria);
  row.appendChild(input);

  section.appendChild(row);
  return { row, input, valueEl };
}

function syncSliderFill(input, valueEl, text) {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 100;
  const pct = ((Number(input.value) - min) / (max - min)) * 100;
  input.style.setProperty('--slider-fill', `${pct}%`);
  if (valueEl) valueEl.textContent = text;
}

const FRAME_LABELS = { none: 'None', browser: 'Browser', phone: 'Phone' };

/**
 * The Frame section: frameKind chips, the chrome-theme mini-segmented, and
 * the browser URL text field.
 *
 * Both secondary controls are hidden via `showsBrowserOnlyControls` above
 * (Task 5's global `[hidden]` rule — no per-element hidden CSS here); see
 * that function's own header comment for the fix-round-1 history of why
 * this is now ONE rule instead of two.
 */
export function initFrameInspector() {
  const section = document.getElementById('frameSection');
  if (!section) return null;

  section.innerHTML = '<h2 class="section-label">Frame</h2>';

  // --- frameKind chips -----------------------------------------------
  const chipRow = document.createElement('div');
  chipRow.className = 'chip-row';
  chipRow.setAttribute('role', 'group');
  chipRow.setAttribute('aria-label', 'Frame style');
  const chips = FRAME_KINDS.map((kind) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.dataset.kind = kind;
    btn.textContent = FRAME_LABELS[kind] || kind;
    btn.setAttribute('aria-pressed', 'false');
    chipRow.appendChild(btn);
    return btn;
  });
  section.appendChild(chipRow);

  // --- chrome theme ----------------------------------------------------
  const themeRow = document.createElement('div');
  themeRow.className = 'inline-control-row';
  const themeLabel = document.createElement('span');
  themeLabel.textContent = 'Chrome theme';
  const themeSegmented = document.createElement('div');
  themeSegmented.className = 'segmented segmented--mini';
  themeSegmented.setAttribute('role', 'group');
  themeSegmented.setAttribute('aria-label', 'Chrome theme');
  const THEME_LABELS = { dark: 'Dark', light: 'Light' };
  const themeButtons = CHROME_THEMES.map((theme) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'segmented-cell';
    btn.dataset.theme = theme;
    btn.textContent = THEME_LABELS[theme] || theme;
    btn.setAttribute('aria-pressed', 'false');
    themeSegmented.appendChild(btn);
    return btn;
  });
  themeRow.append(themeLabel, themeSegmented);
  section.appendChild(themeRow);

  // --- browser URL ----------------------------------------------------
  // Closes the gap: core/render.js's paintChrome draws this in the pill,
  // in fUrlTxt, clipped, whenever it's non-empty — left blank, the pill
  // stays blank (see core/config.js's normalise() and this task's report).
  // The placeholder attribute below is a greyed-out UI hint the browser
  // never submits as a value (it vanishes the instant the field is
  // focused or has any real content) — it is not text drawn into anyone's
  // export, so it doesn't reopen the "no fabricated placeholder copy"
  // question that field exists to answer.
  const urlRow = document.createElement('div');
  urlRow.className = 'slider-row';
  const urlLabelRow = document.createElement('div');
  urlLabelRow.className = 'slider-label';
  urlLabelRow.innerHTML = '<span>URL</span>';
  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.className = 'custom-size-input';
  urlInput.placeholder = 'app.acme.dev';
  urlInput.setAttribute('aria-label', 'Browser URL pill text — left empty, the pill stays empty');
  urlRow.append(urlLabelRow, urlInput);
  section.appendChild(urlRow);

  function syncFrameUI() {
    const kind = activeFrameKind(state.config);
    chips.forEach((btn) => {
      const active = btn.dataset.kind === kind;
      btn.classList.toggle('is-selected', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    const showsSecondary = showsBrowserOnlyControls(state.config);
    themeRow.hidden = !showsSecondary;

    const theme = activeChromeTheme(state.config);
    themeButtons.forEach((btn) => {
      const active = btn.dataset.theme === theme;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });

    urlRow.hidden = !showsSecondary;
  }

  function syncUrlUI() {
    const value = activeUrl(state.config);
    if (document.activeElement !== urlInput) urlInput.value = value;
  }

  chips.forEach((btn) => {
    btn.addEventListener('click', () => {
      setFrameKind(state.config, btn.dataset.kind);
      syncFrameUI();
      scheduleRender();
    });
  });

  themeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      setChromeTheme(state.config, btn.dataset.theme);
      syncFrameUI();
      scheduleRender();
    });
  });

  urlInput.addEventListener('input', () => {
    setUrl(state.config, urlInput.value);
    scheduleRender();
  });

  syncFrameUI();
  syncUrlUI();

  return { syncFrameUI, syncUrlUI };
}

/**
 * The Finish section: padding, corner radius, grain, shadow — the task
 * brief's own order, with Shadow (Task 6b) slotted in right after Grain:
 * both are "material" finishing touches over the composed shot rather than
 * layout, and neither touches `config.ground` or `config.tone`, so none of
 * these four busts web/state.js's ground-meta cache; see this file's header
 * comment and test/inspector-frame.test.js. Fit and Caption used to open
 * and close this section; Cycle A Task 4 retired both.
 */
export function initFinishInspector() {
  const section = document.getElementById('finishSection');
  if (!section) return null;

  section.innerHTML = '<h2 class="section-label">Finish</h2>';

  // --- padding -------------------------------------------------------
  const padRow = document.createElement('div');
  padRow.className = 'slider-row';
  padRow.innerHTML = '<div class="slider-label"><span>Padding</span><span class="mono slider-value"></span></div>';
  const padInput = document.createElement('input');
  padInput.type = 'range';
  padInput.className = 'slider';
  padInput.min = '0';
  padInput.max = String(PAD_PERCENT_MAX);
  padInput.step = '0.1';
  padInput.setAttribute('aria-label', 'Padding, as a percentage of the shorter canvas side');
  padRow.appendChild(padInput);
  const padValueEl = padRow.querySelector('.slider-value');
  section.appendChild(padRow);

  // --- corner radius ---------------------------------------------------
  const radiusRow = document.createElement('div');
  radiusRow.className = 'slider-row';
  radiusRow.innerHTML = '<div class="slider-label"><span>Corner radius</span><span class="mono slider-value"></span></div>';
  const radiusInput = document.createElement('input');
  radiusInput.type = 'range';
  radiusInput.className = 'slider';
  radiusInput.min = '0';
  radiusInput.max = String(RADIUS_PERCENT_MAX);
  radiusInput.step = '0.1';
  radiusInput.setAttribute('aria-label', 'Screenshot corner radius, as a percentage of canvas width');
  radiusRow.appendChild(radiusInput);
  const radiusValueEl = radiusRow.querySelector('.slider-value');
  section.appendChild(radiusRow);

  // --- grain -----------------------------------------------------------
  const grainRow = document.createElement('div');
  grainRow.className = 'slider-row';
  grainRow.innerHTML = '<div class="slider-label"><span>Grain</span><span class="mono slider-value"></span></div>';
  const grainInput = document.createElement('input');
  grainInput.type = 'range';
  grainInput.className = 'slider';
  grainInput.min = '0';
  grainInput.max = '100';
  grainInput.step = '1';
  grainInput.setAttribute('aria-label', 'Grain strength');
  grainRow.appendChild(grainInput);
  const grainValueEl = grainRow.querySelector('.slider-value');
  section.appendChild(grainRow);

  // --- shadow (Task 6b) --------------------------------------------------
  // A STRENGTH, not a colour — see setShadowPercent's header comment above
  // for why this multiplies core/render.js's already-verified shadow
  // alphas instead of picking a new one. 0–200%, default 100% (== exactly
  // frame.html's own values, unchanged).
  const shadowRow = document.createElement('div');
  shadowRow.className = 'slider-row';
  shadowRow.innerHTML = '<div class="slider-label"><span>Shadow</span><span class="mono slider-value"></span></div>';
  const shadowInput = document.createElement('input');
  shadowInput.type = 'range';
  shadowInput.className = 'slider';
  shadowInput.min = '0';
  shadowInput.max = String(SHADOW_SCALE_RANGE[1] * 100);
  shadowInput.step = '1';
  shadowInput.setAttribute('aria-label', 'Shadow strength, as a percentage of the default');
  shadowRow.appendChild(shadowInput);
  const shadowValueEl = shadowRow.querySelector('.slider-value');
  section.appendChild(shadowRow);

  // --- shadow shape (Cycle A Task 5) ------------------------------------
  // Distance / Angle / Blur / Directional, in that order: the two lengths
  // bracket the direction they share, and the toggle that switches the
  // direction on sits last, next to what it gates. Built with the same
  // helper the four sliders above use rather than four more copies of the
  // same fifteen lines.
  const distanceCtl = addSliderRow(section, {
    label: 'Distance',
    min: SHADOW_DISTANCE_RANGE[0] * 100,
    max: SHADOW_DISTANCE_RANGE[1] * 100,
    step: 0.1,
    aria: 'Shadow distance, as a percentage of canvas height',
  });

  // Degrees, not percent — and 0-360 rather than 0-359 so both ends of the
  // travel land on "straight right". normalise() wraps 360 to 0, so the two
  // extremes are the same shadow, which is what a circular quantity on a
  // linear slider should do.
  const angleCtl = addSliderRow(section, {
    label: 'Angle',
    min: 0,
    max: 360,
    step: 1,
    aria: 'Shadow angle in degrees — 90 is straight down. Takes effect when Directional is on',
  });

  const blurCtl = addSliderRow(section, {
    label: 'Blur',
    min: SHADOW_BLUR_RANGE[0] * 100,
    max: SHADOW_BLUR_RANGE[1] * 100,
    step: 0.1,
    aria: 'Shadow blur, as a percentage of canvas height',
  });

  // The same `inline-control-row` + `segmented segmented--mini` pattern the
  // Frame section's Chrome theme uses, so this reads as one more of the
  // panel's existing switches rather than a new idiom.
  const dirRow = document.createElement('div');
  dirRow.className = 'inline-control-row';
  const dirLabel = document.createElement('span');
  dirLabel.textContent = 'Directional';
  const dirSegmented = document.createElement('div');
  dirSegmented.className = 'segmented segmented--mini';
  dirSegmented.setAttribute('role', 'group');
  dirSegmented.setAttribute('aria-label', 'Directional shadow');
  const dirButtons = [['off', 'Off'], ['on', 'On']].map(([value, label]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'segmented-cell';
    btn.dataset.directional = value;
    btn.textContent = label;
    btn.setAttribute('aria-pressed', 'false');
    dirSegmented.appendChild(btn);
    return btn;
  });
  dirRow.append(dirLabel, dirSegmented);
  section.appendChild(dirRow);

  function syncPadUI() {
    const pct = activePadPercent(state.config);
    padInput.value = String(pct);
    syncSliderFill(padInput, padValueEl, `${pct}%`);
  }

  function syncRadiusUI() {
    const pct = activeRadiusPercent(state.config);
    radiusInput.value = String(pct);
    syncSliderFill(radiusInput, radiusValueEl, `${pct}%`);
  }

  function syncGrainUI() {
    const pct = activeGrainPercent(state.config);
    grainInput.value = String(pct);
    syncSliderFill(grainInput, grainValueEl, `${pct}%`);
  }

  function syncShadowUI() {
    const pct = activeShadowPercent(state.config);
    shadowInput.value = String(pct);
    syncSliderFill(shadowInput, shadowValueEl, `${pct}%`);
  }

  function syncShadowShapeUI() {
    const distance = activeShadowDistancePercent(state.config);
    distanceCtl.input.value = String(distance);
    syncSliderFill(distanceCtl.input, distanceCtl.valueEl, `${distance}%`);

    const angle = activeShadowAngle(state.config);
    angleCtl.input.value = String(angle);
    syncSliderFill(angleCtl.input, angleCtl.valueEl, `${angle}°`);

    const blur = activeShadowBlurPercent(state.config);
    blurCtl.input.value = String(blur);
    syncSliderFill(blurCtl.input, blurCtl.valueEl, `${blur}%`);

    // Angle stays ENABLED and visible whether or not this is on — see the
    // header comment on this file's shadow-shape helpers. The toggle's own
    // pressed state is the only thing that moves here.
    const on = activeShadowDirectional(state.config);
    dirButtons.forEach((btn) => {
      const active = (btn.dataset.directional === 'on') === on;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  padInput.addEventListener('input', () => {
    setPadPercent(state.config, padInput.value);
    syncPadUI();
    scheduleRender();
  });

  radiusInput.addEventListener('input', () => {
    setRadiusPercent(state.config, radiusInput.value);
    syncRadiusUI();
    scheduleRender();
  });

  grainInput.addEventListener('input', () => {
    setGrainPercent(state.config, grainInput.value);
    syncGrainUI();
    scheduleRender();
  });

  shadowInput.addEventListener('input', () => {
    setShadowPercent(state.config, shadowInput.value);
    syncShadowUI();
    scheduleRender();
  });

  distanceCtl.input.addEventListener('input', () => {
    setShadowDistancePercent(state.config, distanceCtl.input.value);
    syncShadowShapeUI();
    scheduleRender();
  });

  angleCtl.input.addEventListener('input', () => {
    setShadowAngle(state.config, angleCtl.input.value);
    syncShadowShapeUI();
    scheduleRender();
  });

  blurCtl.input.addEventListener('input', () => {
    setShadowBlurPercent(state.config, blurCtl.input.value);
    syncShadowShapeUI();
    scheduleRender();
  });

  dirButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      setShadowDirectional(state.config, btn.dataset.directional === 'on');
      syncShadowShapeUI();
      scheduleRender();
    });
  });

  syncPadUI();
  syncRadiusUI();
  syncGrainUI();
  syncShadowUI();
  syncShadowShapeUI();

  return { syncPadUI, syncRadiusUI, syncGrainUI, syncShadowUI, syncShadowShapeUI };
}
