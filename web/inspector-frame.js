// web/inspector-frame.js — Task 6: the inspector's Frame and Finish
// sections, plus the text input that finally closes the browser pill's
// long-empty URL field.
//
// TWO SECTIONS, ONE FILE: the task brief creates exactly one new file for
// both (Frame: frameKind chips, chrome theme, the url field it gates;
// Finish: fit, padding, corner radius, grain, caption) — they're wired the
// same way and share no state with web/inspector-background.js, so there's
// no reason to split them further. Order within each section follows the
// brief's own ordering, not the design handoff's (which never designed a
// "Finish" section at all — fit/padding/radius/grain/caption are this
// app's own grouping of fields the handoff scattered or omitted).
//
// ONE RENDER PATH: exactly like web/inspector-background.js and
// web/sidebar.js before it, every handler below mutates `state.config` and
// calls `scheduleRender()` — nothing here calls `composeWithMeta` directly.
//
// core/ IMPORTS: only from core/index.js (FRAME_KINDS, CHROME_THEMES, FITS,
// DEFAULTS, normalise) — never a deep import of core/presets.js. Reading
// `normalise(state.config)` to display an EFFECTIVE value (the corner
// radius's own default, in particular) is the same read-only pattern
// web/sidebar.js already established for "+ Custom size"'s prefill — never
// used here to decide what to WRITE, only what to show before the user has
// touched a control.
//
// PERFORMANCE: none of frameKind/chromeTheme/url/fit/pad/radius/grain/
// caption is part of web/state.js's `groundKeyFor` (images + config.ground +
// config.tone only) — every control in this file hits the warm ~3ms colour
// cache, never groundFor's ~90-200ms analysis. See
// test/inspector-frame.test.js's "throwing canvas" guard for the proof, and
// task-6-report.md for measured timings.
import { FRAME_KINDS, CHROME_THEMES, FITS, DEFAULTS, normalise } from '../core/index.js';
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
 *  already coerces an empty string to null (the same treatment `caption`
 *  gets), so this file doesn't need to duplicate that here — see
 *  core/config.js. */
export function setUrl(config, value) {
  config.url = value;
}

export function activeUrl(config) {
  return typeof config.url === 'string' ? config.url : '';
}

// --- Finish ----------------------------------------------------------------

export function activeFit(config) {
  return FITS.includes(config.fit) ? config.fit : DEFAULTS.fit;
}

export function setFit(config, fit) {
  if (!FITS.includes(fit)) return;
  config.fit = fit;
}

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

/** Same empty-string-is-no-value coercion as `caption` gets in
 *  core/config.js's normalise() — this file passes the raw value through
 *  and lets normalise() do it, exactly like `setUrl` above. */
export function setCaption(config, value) {
  config.caption = value;
}

export function activeCaption(config) {
  return typeof config.caption === 'string' ? config.caption : '';
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

const FIT_LABELS = { contain: 'Contain', cover: 'Cover' };

/**
 * The Finish section: fit, padding, corner radius, grain, caption — the
 * task brief's own order. None of these five touches `config.ground` or
 * `config.tone`, so none of them busts web/state.js's ground-meta cache;
 * see this file's header comment and test/inspector-frame.test.js.
 */
export function initFinishInspector() {
  const section = document.getElementById('finishSection');
  if (!section) return null;

  section.innerHTML = '<h2 class="section-label">Finish</h2>';

  // --- fit ---------------------------------------------------------------
  const fitLabelRow = document.createElement('div');
  fitLabelRow.className = 'slider-label';
  fitLabelRow.innerHTML = '<span>Fit</span>';
  section.appendChild(fitLabelRow);

  const fitSegmented = document.createElement('div');
  fitSegmented.className = 'segmented';
  fitSegmented.setAttribute('role', 'group');
  fitSegmented.setAttribute('aria-label', 'Fit');
  const fitButtons = FITS.map((fit) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'segmented-cell';
    btn.dataset.fit = fit;
    btn.textContent = FIT_LABELS[fit] || fit;
    btn.setAttribute('aria-pressed', 'false');
    fitSegmented.appendChild(btn);
    return btn;
  });
  section.appendChild(fitSegmented);

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

  // --- caption ----------------------------------------------------------
  const captionRow = document.createElement('div');
  captionRow.className = 'slider-row';
  const captionLabelRow = document.createElement('div');
  captionLabelRow.className = 'slider-label';
  captionLabelRow.innerHTML = '<span>Caption</span>';
  const captionInput = document.createElement('input');
  captionInput.type = 'text';
  captionInput.className = 'custom-size-input';
  captionInput.placeholder = 'Optional caption';
  captionInput.setAttribute('aria-label', 'Caption text, shown bottom-left of the shot — left empty, none is drawn');
  captionRow.append(captionLabelRow, captionInput);
  section.appendChild(captionRow);

  function syncFitUI() {
    const fit = activeFit(state.config);
    fitButtons.forEach((btn) => {
      const active = btn.dataset.fit === fit;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

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

  function syncCaptionUI() {
    if (document.activeElement !== captionInput) captionInput.value = activeCaption(state.config);
  }

  fitButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      setFit(state.config, btn.dataset.fit);
      syncFitUI();
      scheduleRender();
    });
  });

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

  captionInput.addEventListener('input', () => {
    setCaption(state.config, captionInput.value);
    scheduleRender();
  });

  syncFitUI();
  syncPadUI();
  syncRadiusUI();
  syncGrainUI();
  syncCaptionUI();

  return { syncFitUI, syncPadUI, syncRadiusUI, syncGrainUI, syncCaptionUI };
}
