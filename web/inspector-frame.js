// web/inspector-frame.js — Task 6: the inspector's Frame and Finish
// sections, plus the text input that finally closes the browser pill's
// long-empty URL field.
//
// TWO SECTIONS, ONE FILE: the task brief creates exactly one new file for
// both (Frame: frameKind chips, chrome theme, the url field it gates;
// Finish: padding, corner radius, grain, shadow) — they're wired the
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
// shadowScale is part of web/state.js's `groundKeyFor` (images +
// config.ground + config.tone only) — every control in this file hits the
// warm ~3ms colour cache, never groundFor's ~90-200ms analysis. shadowScale
// (Task 6b) has nothing to do with the sampled ground even in principle — a
// shadow multiplier over a fixed rgba colour — so it belongs in this list
// for the same reason grain does. See test/inspector-frame.test.js's
// "throwing canvas" guard for the proof, and task-6-report.md /
// task-6b-report.md for measured timings.
import {
  FRAME_KINDS, CHROME_THEMES, DEFAULTS, normalise, SHADOW_SCALE_RANGE,
  STROKE_STYLES, STROKE_WIDTH_RANGE, STROKE_DEFAULTS,
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

// Stroke (Task 7) — the opt-in mat around the shot. `config.stroke` is a
// NESTED block ({ style, width, color }), not three flat fields, matching
// core/config.js: the spec's per-element model (Cycle B) gives the web
// element and the phone element one each, and a nested value moves there
// as a unit.
//
// EVERY WRITER BELOW SEEDS FROM STROKE_DEFAULTS AND THEN THE CURRENT VALUE,
// in that order, so an untouched sibling field keeps whatever the user set
// and an absent one lands on exactly the value normalise() would have
// resolved for it anyway. Task 5b is the reason that ordering is spelled
// out: its shadow rewrite seeded a block with the defaults spread LAST,
// which silently reset the user's strength to 100% while the slider went
// on displaying the old number. Defaults first, current second, the one
// field being changed last.
export function activeStrokeStyle(config) {
  const s = config.stroke || {};
  return STROKE_STYLES.includes(s.style) ? s.style : STROKE_DEFAULTS.style;
}

export function setStrokeStyle(config, style) {
  if (!STROKE_STYLES.includes(style)) return;
  config.stroke = { ...STROKE_DEFAULTS, ...(config.stroke || {}), style };
}

// Width is a fraction of the SHORTER canvas side (core/presets.js), so the
// slider is the same *100 / *0.01 percent round trip padding and grain
// already use. The maximum comes from STROKE_WIDTH_RANGE rather than a
// literal, so this slider and normalise()'s own clamp cannot drift apart.
export const STROKE_PERCENT_MAX = STROKE_WIDTH_RANGE[1] * 100;

export function activeStrokeWidthPercent(config) {
  const s = config.stroke || {};
  const width = Number.isFinite(s.width) ? s.width : STROKE_DEFAULTS.width;
  return Math.round(width * 1000) / 10;
}

export function setStrokeWidthPercent(config, pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return;
  const width = Math.min(STROKE_PERCENT_MAX, Math.max(0, n)) / 100;
  config.stroke = { ...STROKE_DEFAULTS, ...(config.stroke || {}), width };
}

export function activeStrokeColor(config) {
  const s = config.stroke || {};
  return /^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : STROKE_DEFAULTS.color;
}

export function setStrokeColor(config, value) {
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) return;
  config.stroke = { ...STROKE_DEFAULTS, ...(config.stroke || {}), color: value };
}

/** Width only means something once a style paints; colour only means
 *  something for 'custom' (light and glass are fixed fills — see
 *  paintStroke in core/render.js). Same shape as showsBrowserOnlyControls
 *  above, and hidden the same way: the global `[hidden]` rule, never a
 *  second mechanism. */
export function showsStrokeWidth(config) {
  return activeStrokeStyle(config) !== 'none';
}

export function showsStrokeColor(config) {
  return activeStrokeStyle(config) === 'custom';
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
 * and close this section; Cycle A Task 4 retired both. Task 7 adds Stroke
 * at the end - style, then width and colour, each shown only when it can
 * act (showsStrokeWidth / showsStrokeColor above).
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

  // NO HINT UNDER PADDING. Task 6 added a two-sentence note here explaining
  // that a frame grows into this padding, so the visible gap can be smaller
  // than the number. Rock cut it on sight: the behaviour reads fine from
  // the canvas, and a paragraph of prose under a slider is the kind of
  // explaining a control should not need. If padding ever does become
  // confusing, the fix is the control, not a caption.

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

  // --- stroke (Task 7) ---------------------------------------------------
  // Deliberately minimal, and Cycle B replaces it: a render feature with no
  // way to invoke it cannot be previewed, and a feature Rock cannot test is
  // a feature he cannot approve. Same row idioms as everything above — no
  // new control vocabulary is invented here.
  const strokeRow = document.createElement('div');
  strokeRow.className = 'slider-row';
  strokeRow.innerHTML = '<div class="slider-label"><span>Stroke</span></div>';
  const strokeChips = document.createElement('div');
  strokeChips.className = 'chip-row';
  strokeChips.setAttribute('role', 'group');
  strokeChips.setAttribute('aria-label', 'Stroke style');
  const STROKE_LABELS = { none: 'None', light: 'Light', glass: 'Glass', custom: 'Custom' };
  const strokeButtons = STROKE_STYLES.map((style) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.dataset.stroke = style;
    btn.textContent = STROKE_LABELS[style] || style;
    btn.setAttribute('aria-pressed', 'false');
    strokeChips.appendChild(btn);
    return btn;
  });
  strokeRow.appendChild(strokeChips);
  section.appendChild(strokeRow);

  const strokeWidthRow = document.createElement('div');
  strokeWidthRow.className = 'slider-row';
  strokeWidthRow.innerHTML = '<div class="slider-label"><span>Stroke width</span><span class="mono slider-value"></span></div>';
  const strokeWidthInput = document.createElement('input');
  strokeWidthInput.type = 'range';
  strokeWidthInput.className = 'slider';
  strokeWidthInput.min = '0';
  strokeWidthInput.max = String(STROKE_PERCENT_MAX);
  strokeWidthInput.step = '0.1';
  strokeWidthInput.setAttribute('aria-label', 'Stroke width, as a percentage of the shorter canvas side');
  strokeWidthRow.appendChild(strokeWidthInput);
  const strokeWidthValueEl = strokeWidthRow.querySelector('.slider-value');
  section.appendChild(strokeWidthRow);

  const strokeColorRow = document.createElement('div');
  strokeColorRow.className = 'inline-control-row';
  const strokeColorLabel = document.createElement('span');
  strokeColorLabel.textContent = 'Stroke colour';
  const strokeColorInput = document.createElement('input');
  strokeColorInput.type = 'color';
  strokeColorInput.className = 'colour-well';
  strokeColorInput.setAttribute('aria-label', 'Stroke colour');
  strokeColorRow.append(strokeColorLabel, strokeColorInput);
  section.appendChild(strokeColorRow);

  function syncStrokeUI() {
    const style = activeStrokeStyle(state.config);
    strokeButtons.forEach((btn) => {
      const active = btn.dataset.stroke === style;
      btn.classList.toggle('is-selected', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    strokeWidthRow.hidden = !showsStrokeWidth(state.config);
    strokeColorRow.hidden = !showsStrokeColor(state.config);

    const pct = activeStrokeWidthPercent(state.config);
    strokeWidthInput.value = String(pct);
    syncSliderFill(strokeWidthInput, strokeWidthValueEl, `${pct}%`);

    const colour = activeStrokeColor(state.config);
    if (document.activeElement !== strokeColorInput) strokeColorInput.value = colour;
  }

  strokeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      setStrokeStyle(state.config, btn.dataset.stroke);
      syncStrokeUI();
      scheduleRender();
    });
  });

  strokeWidthInput.addEventListener('input', () => {
    setStrokeWidthPercent(state.config, strokeWidthInput.value);
    syncStrokeUI();
    scheduleRender();
  });

  strokeColorInput.addEventListener('input', () => {
    setStrokeColor(state.config, strokeColorInput.value);
    syncStrokeUI();
    scheduleRender();
  });

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

  syncPadUI();
  syncRadiusUI();
  syncGrainUI();
  syncShadowUI();
  syncStrokeUI();

  return { syncPadUI, syncRadiusUI, syncGrainUI, syncShadowUI, syncStrokeUI };
}
