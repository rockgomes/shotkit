// web/sidebar.js — Task 4: templates and ratios in the sidebar, plus the
// ground-swatch rendering the inspector's Background panel reuses (the rail
// itself no longer shows a Ground group — Cycle A Task 2).
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
// second, different interaction model living in the same sidebar as the
// groups that already work by Tab+Enter, and with two short groups (6
// templates, 4 ratios, one custom-size toggle) plain Tab order is
// not a burden. A bespoke widget buys nothing here and adds real failure
// surface (wrap-around, Home/End, orientation) for a keyboard user who
// already has a working, consistent way to reach every row.
import { TEMPLATES, RATIOS, HUES, normalise } from '../core/index.js';
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

/** The size control's three tabs. Templates, ratios and a custom size are
 *  one decision — every one of them writes nothing but `w` and `h` — so
 *  they are three views of a control, not three controls. */
export const SIZE_TABS = ['templates', 'ratios', 'custom'];

/**
 * Which tab the CURRENT size came from.
 *
 * The order is core/config.js's own precedence, read the same way
 * `isCustomSize` and `activeTemplateKey` above already read it: explicit
 * w/h wins, then a template, then a ratio. A tab rule that disagreed with
 * normalise() would open the panel on a list with nothing highlighted while
 * the canvas used a size from somewhere else.
 */
export function activeSizeTab(config) {
  if (isCustomSize(config)) return 'custom';
  if (activeTemplateKey(config)) return 'templates';
  return 'ratios';
}

export function selectGround(config, key) {
  if (HUES[key] === undefined) return;
  config.ground = key;
}
/** Case-insensitive substring match for the sidebar's search box. An
 *  empty query matches everything.
 *
 *  RESTORED, not new. Cycle C Task 5 deleted `gradientFor` and
 *  `renderGroundSwatches` from this file by removing the block they sat in
 *  - and took this with them, because it lived between the two. `node
 *  --check` passed (the syntax was fine), the whole suite passed (nothing
 *  in it drives the search box), and the app threw
 *  "matchesQuery is not defined" on load. Caught by opening it. */
function matchesQuery(label, query) {
  return !query || label.toLowerCase().includes(query);
}

// CYCLE C TASK 5 REMOVED THE SWATCH GRADIENTS FROM THIS FILE.
//
// `gradientFor` built a CSS `linear-gradient` string that APPROXIMATED what
// `paintGround` draws, and `renderGroundSwatches` painted eight 14x14 chips
// with it. It was a second implementation of the ground, in a different
// language, kept in step by hand — and it lied twice: once before Cycle A,
// and again within an hour of `ash` gaining its own saturation, when it
// previewed a blue tint for a preset that renders grey.
//
// Both are gone. web/preset-tiles.js paints a preset into a real canvas with
// the real generator, and web/inspector-background.js renders the grid.
// `hslToRgbByte` went with them; it existed only to build a synthetic pixel
// for the no-image case, which preset-tiles.js now does with a canvas.

// ---------------------------------------------------------------------
// DOM wiring. Reuses Task 1's existing sidebar markup and CSS classes
// (.template-list / .template-row / .section-label) rather than inventing
// new ones — the list this file finds by class (`.template-list` for
// Templates) is exactly the one index.html already ships; nothing about the
// shell's DOM structure changes. The Ratios group has no placeholder to
// reuse — the mockup only shows Templates (see task-4-report.md) — so it's
// built fresh here from the same markup/classes as Templates, inserted as a
// sibling section right after it. The rail's third group used to be Ground,
// a second copy of the Background panel's eight presets; Cycle A Task 2
// removed it (see the note at the end of initSidebar).
// ---------------------------------------------------------------------

export function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const searchInput = sidebar.querySelector('.sidebar-search input');
  const templateList = sidebar.querySelector('.template-list');
  const templateSection = templateList?.closest('.sidebar-section');
  if (!templateList || !templateSection) return;

  // ONE section, not two stacked ones plus a disclosure. Templates, ratios
  // and a custom size all write nothing but `w` and `h`, so they are three
  // views of one control. The tab strip is the same `.segmented` primitive
  // the Background type control uses - no new control vocabulary is
  // invented here.
  const sizeSection = document.createElement('section');
  sizeSection.className = 'sidebar-section';
  sizeSection.innerHTML =
    '<h2 class="section-label">Size</h2>'
    + '<div class="segmented segmented--tabs" role="tablist" aria-label="Size"></div>'
    + '<ul class="template-list size-list"></ul>';
  templateSection.replaceWith(sizeSection);
  const tabStrip = sizeSection.querySelector('.segmented--tabs');
  const sizeList = sizeSection.querySelector('.size-list');

  // Which tab is SHOWING. Seeded from the config so the panel opens on the
  // list the current size came from, then owned by the user's clicks - a
  // tab that snapped back to the config's tab on every render would fight
  // anyone browsing templates while a ratio is applied.
  let openTab = activeSizeTab(state.config);

  const TAB_LABELS = { templates: 'Templates', ratios: 'Ratios', custom: 'Custom' };
  const tabButtons = SIZE_TABS.map((tab) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'segmented-cell';
    btn.dataset.tab = tab;
    btn.setAttribute('role', 'tab');
    btn.textContent = TAB_LABELS[tab];
    btn.addEventListener('click', () => {
      openTab = tab;
      renderAll();
    });
    tabStrip.appendChild(btn);
    return btn;
  });

  if (searchInput) searchInput.placeholder = 'Search sizes…';

  // The custom size fields' contents — kept outside the render functions so
  // they survive the innerHTML rebuild every re-render does (typing in the
  // search box, selecting a row, applying a size all call renderAll()).
  //
  // There is no `customOpen` any more: the Custom TAB is the disclosure that
  // the "+ Custom size" toggle row used to be.
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

    // Prefill with the canvas's CURRENT effective size the first time the
    // tab is shown. normalise() is read-only here — a display convenience,
    // not a precedence decision: applyCustomSize below is what actually
    // sets w/h. Once the user has typed, their value stands.
    if (customW === '' && customH === '') {
      const eff = normalise(state.config);
      customW = String(eff.w);
      customH = String(eff.h);
    }

    {
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
          afterSizeChange();
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

  function renderAll() {
    const query = currentQuery();
    for (const btn of tabButtons) {
      const active = btn.dataset.tab === openTab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    }
    sizeList.innerHTML = '';

    if (openTab === 'templates') {
      const active = activeTemplateKey(state.config);
      for (const [key, tpl] of Object.entries(TEMPLATES)) {
        if (!matchesQuery(tpl.label, query)) continue;
        sizeList.appendChild(sizeRow({
          key,
          label: tpl.label,
          sizeText: `${tpl.w}×${tpl.h}`,
          selected: active === key,
          onSelect: () => {
            selectTemplate(state.config, key);
            afterSizeChange();
          },
        }));
      }
      return;
    }

    if (openTab === 'ratios') {
      const active = activeRatioKey(state.config);
      for (const [key, [w, h]] of Object.entries(RATIOS)) {
        if (!matchesQuery(key, query)) continue;
        sizeList.appendChild(sizeRow({
          key,
          label: key,
          sizeText: `${w}×${h}`,
          selected: active === key,
          onSelect: () => {
            selectRatio(state.config, key);
            afterSizeChange();
          },
        }));
      }
      return;
    }

    // Custom. The tab IS the disclosure, so the form is always open here -
    // the "+ Custom size" toggle row that used to hang under Templates is
    // gone with it.
    sizeList.appendChild(customSizeItem());
  }

  /** One place every size change goes through, so nothing can update the
   *  canvas and forget the list, or the other way round. Same reasoning as
   *  `afterBackgroundChange` in web/inspector-background.js, which exists
   *  because three listeners had been patched and a fourth was still wrong. */
  function afterSizeChange() {
    renderAll();
    scheduleRender();
  }

  searchInput?.addEventListener('input', renderAll);

  renderAll();

  // NO GROUND GROUP HERE, DELIBERATELY, and so nothing to return: the rail
  // used to render the same eight ground presets the inspector's Background
  // panel renders, which is the duplication this task removed. The panel
  // keeps its own screenshot-decoded handshake (`refreshSampled` in
  // web/inspector-background.js, called from web/main.js's handleFiles),
  // and it re-renders the presets itself, through web/preset-tiles.js
  // (Cycle C Task 5), as part of it.
}
