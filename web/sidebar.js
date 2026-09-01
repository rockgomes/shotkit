// web/sidebar.js — Task 4: templates, ratios and ground presets in the
// sidebar.
//
// THE RULE THAT MATTERS MOST HERE: every row/button below does exactly one
// thing when activated — mutate a field on `state.config`, then call
// scheduleRender(). Nothing in this file calls composeWithMeta, and nothing
// in this file re-normalises a size or a ground itself. web/state.js's
// render() is the only place composeWithMeta is called (see its header
// comment); this file only ever hands it new inputs to work from.
//
// Precedence between an explicit size, a template and a ratio is entirely
// core/config.js's normalise() job (explicit w/h beats template beats
// ratio) — this file never re-implements that check. What it DOES own is
// making sure only ONE of those three ever *looks* selected in the sidebar
// at a time, by clearing the fields normalise() would otherwise let a stale
// earlier choice win through:
//   - picking a template clears any explicit w/h a "Custom size" entry left
//     behind (explicit beats template — a lingering w/h would silently keep
//     controlling the canvas while the template row looked selected);
//   - picking a ratio clears BOTH explicit w/h and `template` (template
//     beats ratio — a lingering template would do the same thing to a
//     ratio pick).
// See selectTemplate/selectRatio/applyCustomSize below. Read the field back
// with normalise() (imported, not reimplemented) only where this file needs
// to *display* the effective size — the "+ Custom size" prefill — never to
// decide which field wins.
//
// Keyboard semantics: every row is a real <button> with aria-pressed, the
// same pattern Task 1 already used for the segmented control, chips and
// swatches elsewhere in this shell (see web/main.js's wireSingleSelectGroup).
// That makes every row Tab-reachable and Enter/Space-activatable for free,
// with a visible :focus-visible ring inherited from .template-row/
// .preset-row (style.css) — real keyboard semantics, not a pile of
// clickable <div>s. A roving-tabindex listbox with arrow-key navigation
// (the brief's other option) was deliberately NOT used: it would be a
// second, different interaction model living in the same sidebar as three
// groups that already work by Tab+Enter, and with three short groups (6
// templates, 4 ratios, 8 grounds, one custom-size toggle) plain Tab order is
// not a burden. A bespoke widget buys nothing here and adds real failure
// surface (wrap-around, Home/End, orientation) for a keyboard user who
// already has a working, consistent way to reach every row.
import { TEMPLATES, RATIOS, HUES, groundFor, normalise } from '../core/index.js';
import { state, scheduleRender } from './state.js';

// ---------------------------------------------------------------------
// Pure state helpers — no DOM. These are what test/sidebar.test.js drives
// directly; initSidebar() below is the only DOM-touching part of this file.
// ---------------------------------------------------------------------

/** Explicit w/h is only ever present on `config` when a "+ Custom size" pick
 *  put it there (see applyCustomSize) — DEFAULTS has no w/h field at all, and
 *  selectTemplate/selectRatio always delete both. So "both are finite
 *  numbers" is a reliable signal that the user's last size pick was custom,
 *  without needing a separate "mode" flag that could disagree with it. */
export function isCustomSize(config) {
  return Number.isFinite(config.w) && Number.isFinite(config.h);
}

export function activeTemplateKey(config) {
  if (isCustomSize(config)) return null;
  return config.template && TEMPLATES[config.template] ? config.template : null;
}

export function activeRatioKey(config) {
  if (isCustomSize(config) || activeTemplateKey(config)) return null;
  return config.ratio && RATIOS[config.ratio] ? config.ratio : null;
}

export function activeGroundKey(config) {
  return config.ground && HUES[config.ground] !== undefined ? config.ground : null;
}

export function selectTemplate(config, key) {
  if (!TEMPLATES[key]) return;
  config.template = key;
  delete config.w;
  delete config.h;
}

export function selectRatio(config, key) {
  if (!RATIOS[key]) return;
  config.ratio = key;
  config.template = null;
  delete config.w;
  delete config.h;
}

/** Returns true and mutates `config` iff both values are finite positive
 *  numbers — an invalid pair is silently rejected (the caller, the Apply
 *  button, stays disabled until both fields are valid, so in practice this
 *  guard is a second line of defence, not the primary one). */
export function applyCustomSize(config, rawW, rawH) {
  const w = Math.round(Number(rawW));
  const h = Math.round(Number(rawH));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return false;
  config.w = w;
  config.h = h;
  return true;
}

export function selectGround(config, key) {
  if (HUES[key] === undefined) return;
  config.ground = key;
}

// ---------------------------------------------------------------------
// Ground swatch gradients — one real groundFor() call per named hue,
// memoised (HUES never changes at runtime, so this never needs to be
// recomputed after the first paint).
//
// A swatch has no source image, but groundFor still needs SOME pixel data
// to read a chroma/luminance from (see analyse() in core/ground.js) —
// `forceHue` below overrides the OUTPUT hue regardless, so the sample's own
// hue never leaks into the result. What the sample DOES determine is chroma
// and luminance. The first version of this fed groundFor the flat mid-grey
// sample composeWithMeta's own no-images fallback uses
// ([128,128,128,255]) — that has zero HSV saturation, which trips
// analyse()'s `total < 1e-6` neutral-fallback branch before a single hue
// bin is ever populated, forcing chroma to 0 and `sat` to its 0.16 floor.
// The result technically satisfies "not a flat colour" (it IS a real
// 3-stop gradient) but fails the actual POINT of a swatch: all eight came
// out as an almost indistinguishable near-white smear — see
// task-4-report.md for the measured RGB values.
//
// Feeding a single, moderately-saturated pixel IN THAT SAME HUE instead
// (HSL(hue, 50%, 70%)) keeps every one of analyse()'s gates open: HSV
// saturation works out to ~0.35 for every hue (HSL sat/lightness fixed at
// 50%/70% means the chroma magnitude is hue-independent — only which
// channel leads rotates), clearing the 0.22 threshold, and value ~0.85
// sits inside (0.16, 0.98) — so groundFor derives a real, non-zero chroma
// (a single flat colour always reads as fully "concentrated", i.e.
// chroma = 1 — see the `near / total` ratio in analyse()) instead of
// bailing out to the neutral fallback. Luminance stays safely above the
// 0.34 darkUI threshold for all eight hues too (the lowest, at hue 240, is
// ≈0.57 — verified by hand, see the report), so every swatch resolves
// through the SAME pale-tint branch groundFor uses for a light screenshot —
// the "real light-tint gradient" the brief asks for — rather than whichever
// branch a given hue's sample luminance happened to land on.
// ---------------------------------------------------------------------

/** Small, self-contained HSL→RGB conversion for the synthetic swatch
 *  sample above — core/ only exports the reverse (hslToHex, and it isn't
 *  even exported outside core/ground.js), so this doesn't duplicate
 *  anything core/ already does. h in degrees, s/l in [0, 1]. */
function hslToRgbByte(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    hp < 1 ? [c, x, 0] :
    hp < 2 ? [x, c, 0] :
    hp < 3 ? [0, c, x] :
    hp < 4 ? [0, x, c] :
    hp < 5 ? [x, 0, c] :
    [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

const swatchGradients = new Map();

function gradientFor(hueName) {
  if (!swatchGradients.has(hueName)) {
    const hueDeg = HUES[hueName];
    const [r, g, b] = hslToRgbByte(hueDeg, 0.5, 0.7);
    const sample = [{ width: 1, height: 1, data: [r, g, b, 255] }];
    const { ground } = groundFor(sample, hueDeg, null);
    swatchGradients.set(hueName, `linear-gradient(135deg, ${ground[0]}, ${ground[1]}, ${ground[2]})`);
  }
  return swatchGradients.get(hueName);
}

function titleCase(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function matchesQuery(label, query) {
  return !query || label.toLowerCase().includes(query);
}

// ---------------------------------------------------------------------
// DOM wiring. Reuses Task 1's existing sidebar markup and CSS classes
// (.template-list / .template-row / .preset-list / .preset-row /
// .section-label) rather than inventing new ones — the two lists this file
// finds by class (`.template-list` for Templates, `.preset-list` for what
// was a static "Presets" placeholder and becomes the Ground group here) are
// exactly the ones index.html already ships; nothing about the shell's DOM
// structure changes. The Ratios group has no placeholder to reuse — the
// mockup only shows Templates (see task-4-report.md) — so it's built fresh
// here from the same markup/classes as Templates, inserted as a sibling
// section right after it.
// ---------------------------------------------------------------------

export function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const searchInput = sidebar.querySelector('.sidebar-search input');
  const templateList = sidebar.querySelector('.template-list');
  const templateSection = templateList?.closest('.sidebar-section');
  const groundList = sidebar.querySelector('.preset-list');
  const groundSection = groundList?.closest('.sidebar-section');
  if (!templateList || !templateSection || !groundList || !groundSection) return;

  const ratioSection = document.createElement('section');
  ratioSection.className = 'sidebar-section';
  ratioSection.innerHTML = '<h2 class="section-label">Ratios</h2><ul class="template-list ratio-list"></ul>';
  templateSection.insertAdjacentElement('afterend', ratioSection);
  const ratioList = ratioSection.querySelector('.ratio-list');

  const groundLabel = groundSection.querySelector('.section-label');
  if (groundLabel) groundLabel.textContent = 'Ground';

  if (searchInput) searchInput.placeholder = 'Search templates and ratios…';

  // "+ Custom size" disclosure state — kept outside render functions so it
  // survives the innerHTML rebuild every re-render does (search input,
  // selecting a row, applying a custom size all call renderAll()).
  let customOpen = false;
  let customW = '';
  let customH = '';

  function currentQuery() {
    return (searchInput?.value || '').trim().toLowerCase();
  }

  function sizeRow({ key, label, sizeText, selected, onSelect }) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'template-row' + (selected ? ' is-selected' : '');
    btn.setAttribute('aria-pressed', String(selected));
    btn.dataset.key = key;
    const nameSpan = document.createElement('span');
    nameSpan.textContent = label;
    const sizeSpan = document.createElement('span');
    sizeSpan.className = 'mono dim';
    sizeSpan.textContent = sizeText;
    btn.append(nameSpan, sizeSpan);
    btn.addEventListener('click', onSelect);
    li.appendChild(btn);
    return li;
  }

  function customSizeItem() {
    const li = document.createElement('li');
    li.className = 'custom-size-item';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'template-row template-row--add' + (isCustomSize(state.config) ? ' is-selected' : '');
    toggle.textContent = '+ Custom size';
    toggle.setAttribute('aria-expanded', String(customOpen));
    toggle.setAttribute('aria-controls', 'sidebarCustomSizeForm');
    toggle.addEventListener('click', () => {
      customOpen = !customOpen;
      if (customOpen) {
        // Prefill with the canvas's CURRENT effective size (normalise() is
        // read-only here — a display convenience, not a precedence
        // decision: applyCustomSize below is what actually sets w/h).
        const eff = normalise(state.config);
        customW = String(eff.w);
        customH = String(eff.h);
      }
      renderTemplates(currentQuery());
    });
    li.appendChild(toggle);

    if (customOpen) {
      const form = document.createElement('div');
      form.className = 'custom-size-form';
      form.id = 'sidebarCustomSizeForm';

      const fields = document.createElement('div');
      fields.className = 'custom-size-fields';

      const wLabel = document.createElement('label');
      wLabel.className = 'custom-size-field';
      wLabel.append('W');
      const wInput = document.createElement('input');
      wInput.type = 'number';
      wInput.min = '1';
      wInput.step = '1';
      wInput.className = 'custom-size-input';
      wInput.value = customW;
      wInput.setAttribute('aria-label', 'Custom width in pixels');
      wLabel.appendChild(wInput);

      const hLabel = document.createElement('label');
      hLabel.className = 'custom-size-field';
      hLabel.append('H');
      const hInput = document.createElement('input');
      hInput.type = 'number';
      hInput.min = '1';
      hInput.step = '1';
      hInput.className = 'custom-size-input';
      hInput.value = customH;
      hInput.setAttribute('aria-label', 'Custom height in pixels');
      hLabel.appendChild(hInput);

      fields.append(wLabel, hLabel);

      const applyBtn = document.createElement('button');
      applyBtn.type = 'button';
      applyBtn.className = 'btn btn-ghost custom-size-apply';
      applyBtn.textContent = 'Apply';

      const syncApplyDisabled = () => {
        const w = Number(wInput.value);
        const h = Number(hInput.value);
        applyBtn.disabled = !(Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0);
      };
      wInput.addEventListener('input', () => {
        customW = wInput.value;
        syncApplyDisabled();
      });
      hInput.addEventListener('input', () => {
        customH = hInput.value;
        syncApplyDisabled();
      });
      syncApplyDisabled();

      const apply = () => {
        if (applyBtn.disabled) return;
        if (applyCustomSize(state.config, wInput.value, hInput.value)) {
          customOpen = false;
          renderAll();
          scheduleRender();
        }
      };
      applyBtn.addEventListener('click', apply);
      const onEnter = (event) => {
        if (event.key === 'Enter') apply();
      };
      wInput.addEventListener('keydown', onEnter);
      hInput.addEventListener('keydown', onEnter);

      form.append(fields, applyBtn);
      li.appendChild(form);
    }

    return li;
  }

  function renderTemplates(query) {
    templateList.innerHTML = '';
    const active = activeTemplateKey(state.config);
    for (const [key, tpl] of Object.entries(TEMPLATES)) {
      if (!matchesQuery(tpl.label, query)) continue;
      templateList.appendChild(
        sizeRow({
          key,
          label: tpl.label,
          sizeText: `${tpl.w}×${tpl.h}`,
          selected: active === key,
          onSelect: () => {
            selectTemplate(state.config, key);
            renderAll();
            scheduleRender();
          },
        }),
      );
    }
    templateList.appendChild(customSizeItem());
  }

  function renderRatios(query) {
    ratioList.innerHTML = '';
    const active = activeRatioKey(state.config);
    for (const [key, [w, h]] of Object.entries(RATIOS)) {
      if (!matchesQuery(key, query)) continue;
      ratioList.appendChild(
        sizeRow({
          key,
          label: key,
          sizeText: `${w}×${h}`,
          selected: active === key,
          onSelect: () => {
            selectRatio(state.config, key);
            renderAll();
            scheduleRender();
          },
        }),
      );
    }
    ratioSection.hidden = ratioList.children.length === 0;
  }

  function renderGrounds() {
    groundList.innerHTML = '';
    const active = activeGroundKey(state.config);
    for (const name of Object.keys(HUES)) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preset-row' + (active === name ? ' is-selected' : '');
      btn.setAttribute('aria-pressed', String(active === name));
      const swatch = document.createElement('span');
      swatch.className = 'preset-swatch';
      swatch.setAttribute('aria-hidden', 'true');
      swatch.style.background = gradientFor(name);
      btn.append(swatch, titleCase(name));
      btn.addEventListener('click', () => {
        selectGround(state.config, name);
        renderAll();
        scheduleRender();
      });
      li.appendChild(btn);
      groundList.appendChild(li);
    }
  }

  function renderAll() {
    const query = currentQuery();
    renderTemplates(query);
    renderRatios(query);
    renderGrounds();
  }

  searchInput?.addEventListener('input', renderAll);

  renderAll();
}
