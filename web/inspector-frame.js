// web/inspector-frame.js — Task 6: the inspector's Frame and Finish
// sections, plus the text input that finally closes the browser pill's
// long-empty URL field.
//
// TWO SECTIONS, ONE FILE: the task brief creates exactly one new file for
// both (Frame: frameKind chips, chrome theme, the url field it gates;
// Finish: padding, corner radius, grain, shadow — strength, and behind Task
// 5b's disclosure its distance, angle, softness and directional mode) —
// they're wired the same way and share no state with
// web/inspector-background.js, so there's
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
// for the same reason grain does, and so do Task 5's distance/angle/
// softness/directional, which only move where that same wash lands. See
// test/inspector-frame.test.js's "throwing canvas" guard for the proof, and
// task-6-report.md / task-6b-report.md for measured timings.
import {
  FRAME_KINDS, CHROME_THEMES, DEFAULTS, normalise, SHADOW_SCALE_RANGE,
  SHADOW_DISTANCE_RANGE, SHADOW_BLUR_RANGE,
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

// Shadow strength (Task 6b) — a MULTIPLIER over paintShadow's verified
// alphas (core/render.js), 1 == frame.html's own values unchanged;
// SHADOW_SCALE_RANGE (core/presets.js, [0, 2]) is the bound this slider
// works to, imported rather than hardcoded here so the UI and normalise()'s
// own clamp can never drift apart. The percent round-trip below is the exact
// same *100/*0.01 pattern grain and padding already use, just over a wider
// [0,200] range — 100% reads back as the untouched default.
//
// IT WRITES `shadow.scale`, NOT `config.shadowScale` (Cycle A Task 5c).
//
// Rock: "the shadow control now only works until I open the advanced
// settings, then the slider doesn't do absolutely anything anymore." He was
// right. This slider used to write the top-level `config.shadowScale` while
// the Advanced controls wrote into `config.shadow`, and normalise() resolves
// the strength as "an explicit `shadow.scale` wins over `shadowScale` — the
// specific beats the legacy". `writableShadow` below seeded a missing block
// straight from SHADOW_DEFAULTS, `scale: 1` included, so the FIRST touch of
// any Advanced control manufactured an explicit `shadow.scale` of 1 that
// outranked this slider from then on: the handle moved, the number changed,
// and the render never saw either. (Worse in the other direction too — that
// same first touch silently snapped a chosen 40% strength back to 100%.)
//
// The precedence rule in core/config.js is not the bug and is unchanged.
// The bug was TWO PLACES holding one quantity. There is now one: everything
// this panel writes about the shadow goes into `config.shadow`, and
// `shadowScale` survives only as a legacy INPUT to normalise() — accepted
// from a jobs.json or the shipped CLI, folded into `shadow.scale`, and never
// written by the app again.
export function activeShadowPercent(config) {
  return Math.round(readShadow(config).scale * 100);
}

export function setShadowPercent(config, pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return;
  const [min, max] = SHADOW_SCALE_RANGE;
  writableShadow(config).scale = Math.min(max * 100, Math.max(min * 100, n)) / 100;
}

// --- Shadow shape (Task 5, reshaped by Task 5b) ---------------------------
//
// FOUR CONTROLS, ALL OF THEM BEHIND "Advanced shadow settings". Task 5 put
// Distance / Angle / Blur / Directional straight into Finish, under the
// Shadow strength slider, and Rock's answer was that Finish should still be
// "just one slider, and the other controls appear only after selecting some
// sort of 'advanced controls' for shadows" — which is also how the Screen
// Studio panel he supplied as reference is built. So Finish shows Shadow
// and a collapsed disclosure, and these four live inside it.
//
// They still follow the idiom already in this file exactly — a `slider-row`
// per number, and the same `segmented segmented--mini` for the toggle that
// Chrome theme uses. No new control idiom, and the disclosure itself hides
// with the global `[hidden]` rule rather than a second mechanism.
//
// ANGLE IS DISABLED, NOT HIDDEN, while Directional is off — see
// shadowAngleDisabled above for why that reversed.

/**
 * The effective shadow block for READING — resolved through the REAL
 * normalise(), which is the same function core/render.js's config went
 * through, so what a slider displays cannot disagree with what is drawn.
 *
 * IT IS normalise(), NOT A SPREAD OVER SHADOW_DEFAULTS (Cycle A Task 5c).
 * The spread it replaces was subtly the wrong shape three times over: it
 * ignored the legacy top-level `shadowScale` (so a jobs.json carrying one
 * read back as 100%), it showed unclamped values normalise() would then
 * move (distance 50% displayed, 20% drawn), and it showed unwrapped angles
 * (450 displayed, 90 drawn). Reading through normalise() makes all three
 * impossible by construction rather than by three matching clamps.
 *
 * This is the read-only `normalise(state.config)` pattern web/sidebar.js's
 * "+ Custom size" prefill and the corner-radius slider below already
 * established — never used to decide what to WRITE, only what to show.
 *
 * Deliberately non-mutating: a panel that wrote to `config` merely by
 * rendering itself would make `normalise({})` and `normalise(state.config)`
 * disagree the moment the inspector mounted.
 */
function readShadow(config) {
  return normalise(config || {}).shadow;
}

/**
 * The config's OWN shadow block, created on first write.
 *
 * IT SEEDS FROM THE RESOLVED BLOCK, NOT FROM SHADOW_DEFAULTS (Task 5c).
 * That one word is the whole fix, and the property it buys is worth
 * stating precisely:
 *
 *   seeding is render-neutral — normalise(config) is identical either side
 *   of the seed, for every field.
 *
 * It has to be, because `readShadow` IS normalise(), so the block written
 * here is by definition the block normalise() would have produced anyway;
 * feeding it back in is idempotent (already clamped, already wrapped,
 * already a real boolean). Seeding from SHADOW_DEFAULTS was not neutral:
 * it invented `scale: 1` for a config whose strength had been set through
 * the legacy `shadowScale`, and — since an explicit `shadow.scale` outranks
 * that legacy field in normalise() — the invention stuck. Touching Distance
 * changed the shadow's darkness. See test/inspector-frame.test.js's Task 5c
 * suite, which asserts the neutrality directly for every control.
 *
 * The copy is still the other point. `web/state.js` seeds `state.config`
 * with `{ ...DEFAULTS }` — a shallow copy — so handing out core/'s exported
 * SHADOW_DEFAULTS by reference would give every config in the process the
 * same mutable object, and one slider drag would rewrite core/'s own
 * defaults. normalise() builds a fresh object every call, so it cannot
 * alias anything. See test/inspector-frame.test.js's "never aliases" case.
 */
function writableShadow(config) {
  if (!config.shadow || typeof config.shadow !== 'object') {
    config.shadow = readShadow(config);
  }
  return config.shadow;
}

// Distance and Softness are fractions of the canvas height (core/presets.js's
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

// SOFTNESS, NOT BLUR (Task 5b). Screen Studio - Rock's own reference for
// this panel - also has a "Background blur", which blurs a wallpaper and is
// an unrelated feature (spec, Cycle B), so "Blur" here named the wrong
// thing. The CONFIG FIELD STAYS `shadow.blur`: it is `ctx.shadowBlur` one
// for one, and renaming a core config key would change normalise()'s
// contract and every jobs.json written against it without changing a pixel.
// The word is the panel's; the field is canvas's.
//
// SHADOW_BLUR_RANGE's lower bound is no longer 0 - see its comment in
// core/presets.js for the measurement. Because this clamps to the same
// exported bound, the bottom of this slider IS the floor: there is no value
// the UI can reach that normalise() would then quietly move.
export function activeShadowSoftnessPercent(config) {
  return Math.round(readShadow(config).blur * 1000) / 10;
}

export function setShadowSoftnessPercent(config, pct) {
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

/**
 * Angle is DISABLED while Directional is off, and stays visible (Task 5b).
 *
 * Task 5 left it enabled and argued the case in this file's header: "a
 * control that vanishes is more confusing than one that waits". Rock read
 * the same screen the other way round - "Angle only works when directional
 * is on, so why is it even there before the directional toggle?" - and a
 * control that moves while nothing changes reads as broken, which is worse
 * than one that reads as not-yet-available. So it keeps its place, keeps
 * its value, and goes disabled: the state that says "not now" rather than
 * "not here".
 *
 * A separate exported predicate rather than an inline `!activeShadow...`
 * inside the sync function, for the same reason showsBrowserOnlyControls
 * above is one: the gate is the claim, and a claim gets a test.
 */
export function shadowAngleDisabled(config) {
  return !activeShadowDirectional(config);
}

/**
 * What lives inside "Advanced shadow settings", in the order it appears.
 *
 * Directional leads and Angle follows it immediately, because Angle is
 * Directional's second half (see shadowAngleDisabled above); the two
 * lengths come after the direction they steer. Exported and iterated by
 * initFinishInspector rather than written out four times, so the order on
 * screen is this array and cannot drift from it.
 */
export const ADVANCED_SHADOW_CONTROLS = ['directional', 'angle', 'distance', 'softness'];

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
function addSliderRow(section, { label, min, max, step, aria, sub = false }) {
  const row = document.createElement('div');
  // `sub` indents the row under the control it belongs to — Angle under
  // Directional (Task 5b), the only one so far. Indentation only; the
  // "not now" part of that relationship is the input's own `disabled`.
  row.className = sub ? 'slider-row slider-row--sub' : 'slider-row';
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
  // Rounded to 3dp before they become attributes. These bounds arrive as
  // `RANGE[i] * 100` and binary floating point makes that ugly in the DOM -
  // 0.035 * 100 is 3.5000000000000004, and a range input's steps are
  // measured FROM its min, so every value it could produce carried that
  // tail. Rounding lands each bound exactly on the fraction core/ clamps
  // to (3.5 / 100 === 0.035), so the slider still cannot reach a value
  // normalise() would move.
  const attr = (n) => String(Math.round(n * 1000) / 1000);
  input.min = attr(min);
  input.max = attr(max);
  input.step = attr(step);
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

  // --- Advanced shadow settings (Cycle A Task 5b) -----------------------
  // A DISCLOSURE, not four more rows. Finish's own surface is the Shadow
  // strength slider above and this toggle; everything else about the shadow
  // is one click away. The shape is the sidebar's "+ Custom size"
  // disclosure — a button carrying `aria-expanded` and `aria-controls`, and
  // a panel that answers to it — except that the panel is built once and
  // hidden with the global `[hidden]` rule rather than torn down and
  // rebuilt, so the controls inside keep their DOM identity across opens.
  let advancedOpen = false;

  const advancedToggle = document.createElement('button');
  advancedToggle.type = 'button';
  advancedToggle.className = 'disclosure-toggle';
  advancedToggle.setAttribute('aria-expanded', 'false');
  advancedToggle.setAttribute('aria-controls', 'shadowAdvanced');
  advancedToggle.innerHTML =
    '<span>Advanced shadow settings</span>'
    + '<svg class="icon icon-sm" aria-hidden="true"><use href="#icon-chevron-down"></use></svg>';
  section.appendChild(advancedToggle);

  const advanced = document.createElement('div');
  advanced.className = 'disclosure-panel';
  advanced.id = 'shadowAdvanced';
  advanced.hidden = true;
  section.appendChild(advanced);

  // One builder per entry in ADVANCED_SHADOW_CONTROLS, called in that
  // array's order — so the order on screen is the order declared up there,
  // with no second list to keep in step.
  const build = {
    // The same `inline-control-row` + `segmented segmented--mini` pattern
    // the Frame section's Chrome theme uses, so this reads as one more of
    // the panel's existing switches rather than a new idiom.
    directional: () => {
      const row = document.createElement('div');
      row.className = 'inline-control-row';
      const label = document.createElement('span');
      label.textContent = 'Directional';
      const segmented = document.createElement('div');
      segmented.className = 'segmented segmented--mini';
      segmented.setAttribute('role', 'group');
      segmented.setAttribute('aria-label', 'Directional shadow');
      const buttons = [['off', 'Off'], ['on', 'On']].map(([value, text]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'segmented-cell';
        btn.dataset.directional = value;
        btn.textContent = text;
        btn.setAttribute('aria-pressed', 'false');
        segmented.appendChild(btn);
        return btn;
      });
      row.append(label, segmented);
      advanced.appendChild(row);
      return { row, buttons };
    },

    // Degrees, not percent — and 0-360 rather than 0-359 so both ends of
    // the travel land on "straight right". normalise() wraps 360 to 0, so
    // the two extremes are the same shadow, which is what a circular
    // quantity on a linear slider should do. `sub` indents it under
    // Directional; `disabled` (in syncShadowShapeUI below) is the rest of
    // that relationship.
    angle: () => addSliderRow(advanced, {
      label: 'Angle',
      min: 0,
      max: 360,
      step: 1,
      sub: true,
      aria: 'Shadow angle in degrees — 90 is straight down. Available when Directional is on',
    }),

    distance: () => addSliderRow(advanced, {
      label: 'Distance',
      min: SHADOW_DISTANCE_RANGE[0] * 100,
      max: SHADOW_DISTANCE_RANGE[1] * 100,
      step: 0.1,
      aria: 'Shadow distance, as a percentage of canvas height',
    }),

    // Softness, not Blur — see setShadowSoftnessPercent above. The slider's
    // MINIMUM is SHADOW_BLUR_RANGE[0], which is no longer 0: at 0 the two
    // shadow layers stop being a blur and become two hard-edged rectangles,
    // which is what Rock hit. There is no longer a position on this track
    // that draws that.
    softness: () => addSliderRow(advanced, {
      label: 'Softness',
      min: SHADOW_BLUR_RANGE[0] * 100,
      max: SHADOW_BLUR_RANGE[1] * 100,
      step: 0.1,
      aria: 'Shadow softness, as a percentage of canvas height',
    }),
  };

  const ctl = {};
  for (const key of ADVANCED_SHADOW_CONTROLS) ctl[key] = build[key]();
  const { angle: angleCtl, distance: distanceCtl, softness: softnessCtl } = ctl;
  const dirButtons = ctl.directional.buttons;

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

    const softness = activeShadowSoftnessPercent(state.config);
    softnessCtl.input.value = String(softness);
    syncSliderFill(softnessCtl.input, softnessCtl.valueEl, `${softness}%`);

    // Angle stays VISIBLE and goes DISABLED while Directional is off (Task
    // 5b) — the predicate is shared with the tests rather than inlined
    // here. `.slider:disabled` is already one of the selectors in
    // style.css's single off-state rule, and that rule now also carries
    // `.slider-row:has(.slider:disabled)` so the row's label dims with the
    // track instead of staying at full strength above a dead control.
    angleCtl.input.disabled = shadowAngleDisabled(state.config);

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

  softnessCtl.input.addEventListener('input', () => {
    setShadowSoftnessPercent(state.config, softnessCtl.input.value);
    syncShadowShapeUI();
    scheduleRender();
  });

  advancedToggle.addEventListener('click', () => {
    advancedOpen = !advancedOpen;
    advanced.hidden = !advancedOpen;
    advancedToggle.setAttribute('aria-expanded', String(advancedOpen));
    advancedToggle.classList.toggle('is-open', advancedOpen);
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
