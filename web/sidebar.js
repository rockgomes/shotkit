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
import { TEMPLATES, RATIOS, HUES, groundFor, groundFromMeta, normalise } from '../core/index.js';
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
// Ground swatch gradients.
//
// FIX ROUND 1: the first version of this fed groundFor a synthetic sample
// for EVERY swatch, always - including once a real screenshot was loaded.
// That produced a plausible-looking preview that could still be flatly
// WRONG: a synthetic sample built at HSL(hue, 50%, 70%) has luminance
// ~0.85-0.97 for every hue, comfortably clearing core/ground.js's `lum <
// 0.34` darkUI threshold every time - so every swatch rendered the PALE
// branch and none could ever show the mid-tone branch groundFor uses for a
// dark screenshot (the branch ground.py's own header calls out as the
// thing that stops dark-on-dark reading as mush). Measured on a real dark
// image (samples/karaoke-web.png, lum 0.097): the synthetic Lavender swatch
// showed `#f9f7fa/#ece7f1/#ddd4e7` (the PALE branch); actually SELECTING
// that preset against the real image produced `#dad4e1/#c6bdd0/#b5a8c3`
// instead — the MID-TONE branch, correctly chosen because the real image's
// own luminance (0.097) is well under the 0.34 darkUI threshold. Two
// different branches of the algorithm, not sampling noise — the swatch was
// confidently showing the wrong one. See task-4-report.md's fix-round-1
// section for the full before/after numbers. test/sidebar.test.js's
// "swatches tell the truth" case guards against this regressing again.
//
// THE FIX: derive each swatch from the user's CURRENTLY LOADED image, with
// only the hue forced - via groundFromMeta() (core/ground.js), the exact
// arithmetic tail groundFor() itself runs, fed `state.meta` (already
// computed by the one real render this app ever does - see web/state.js)
// instead of raw pixels. Calling the real groundFor() again, per swatch,
// against the actual decoded image was measured and rejected: 8 calls
// against samples/karaoke-web.png (800x519, the same thumbnail size
// composeWithMeta itself analyses) took ~700ms total (~87ms/call) - close
// to the cost of a full cold render, EIGHT TIMES on every image load. That
// is core/'s own colour maths (analyse() in core/ground.js) being the
// expensive part, so the fix does not reimplement it: groundFromMeta()
// skips analyse() entirely and reruns only the cheap tail (a handful of
// hslToHex calls) against each of the 8 named hues - see core/ground.js's
// own comment on that function, and test/ground.test.js's
// "groundFromMeta reproduces groundFor" case for the proof that this
// shortcut is exact, not approximate.
//
// Nothing here is cached or memoised across calls: gradientFor() reads
// `state.meta` FRESH every time renderGroundSwatches() runs. That is what
// keeps the "no image yet" fallback below from silently persisting once a
// real image loads - there is no stored value that could go stale, because
// nothing is stored. The Background panel re-runs renderGroundSwatches()
// on every interaction of its own (a preset click, the hue slider, tone)
// AND is explicitly refreshed the moment a screenshot is decoded
// (`refreshSampled()`, returned by initBackgroundInspector() and called
// from web/main.js's handleFiles() - see there), so the fallback is
// showing until the instant a real image exists, never a frame longer.
//
// The one remaining case IS a synthetic, representative sample: before any
// screenshot is loaded, `state.meta` is null and there genuinely is no
// truth to preview yet - a flat mid-grey sample fails even at that job
// (zero HSV saturation trips analyse()'s neutral-fallback branch, pinning
// chroma to 0 - see this file's git history for the measured near-white
// smear that produced), so a single, moderately-saturated pixel IN THE
// SAME HUE (HSL(hue, 50%, 70%)) is used instead - real math, still a
// genuine 3-stop gradient, just not derived from a real screenshot because
// there isn't one yet. This path calling groundFor() directly (not
// groundFromMeta()) is fine performance-wise regardless: analyse()'s cost
// scales with pixel COUNT, and a 1x1 sample is negligible - measured at
// microseconds, nothing like the ~87ms/call cost of a real decoded image.
// ---------------------------------------------------------------------

/** Small, self-contained HSL→RGB conversion for the synthetic no-image
 *  fallback sample below — core/ only exports the reverse (hslToHex, and
 *  it isn't even exported outside core/ground.js), so this doesn't
 *  duplicate anything core/ already does. h in degrees, s/l in [0, 1]. */
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

/** The one hue a caller SEES matches the hue it FORCED, always — `tone`
 *  is `state.config.luminosity` (null = sampled, else a number), the exact same value
 *  composeWithMeta reads as `c.tone` — so a swatch previews not just the
 *  right hue but the right BRANCH of groundFor for whatever tone override
 *  (if any) is currently active, matching exactly what clicking the swatch
 *  would produce. */
export function gradientFor(hueName, meta, luminosity) {
  const hueDeg = HUES[hueName];
  const { ground } = meta
    ? groundFromMeta(meta, hueDeg, luminosity)
    : groundFor([{ width: 1, height: 1, data: [...hslToRgbByte(hueDeg, 0.5, 0.7), 255] }], hueDeg, luminosity);
  return `linear-gradient(135deg, ${ground[0]}, ${ground[1]}, ${ground[2]})`;
}

function titleCase(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function matchesQuery(label, query) {
  return !query || label.toLowerCase().includes(query);
}

/**
 * Build the eight named-hue preset rows (`.preset-row`/`.preset-swatch`,
 * the exact markup/gradient logic above) into `listEl` — an already-empty
 * `<ul>` (or similar) the caller owns. Originally factored out of this
 * file's own rail-side `renderGrounds()` so web/inspector-background.js's
 * Background panel (Task 5) could show the SAME eight presets, rendered the
 * SAME way, without a second implementation of the swatch/gradient logic —
 * the brief for that task is explicit that this must be reused, not
 * rewritten. Cycle A Task 2 then removed the rail's duplicate group, so the
 * Background panel is now the only caller; this stays here because the
 * gradient logic it depends on does.
 *
 * `onSelect()` runs after `selectGround` has already mutated
 * `state.config` for the clicked preset — the caller decides what needs to
 * re-render (this file's own `renderAll()` + `scheduleRender()` for the
 * sidebar; the Background panel's own sync + `scheduleRender()` there).
 * `scheduleRender()` itself is NOT called here, on purpose: this module
 * must not assume which single call site is the last thing that needs to
 * happen after a click.
 */
export function renderGroundSwatches(listEl, onSelect) {
  listEl.innerHTML = '';
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
    swatch.style.background = gradientFor(name, state.meta, state.config.luminosity);
    btn.append(swatch, titleCase(name));
    btn.addEventListener('click', () => {
      selectGround(state.config, name);
      onSelect();
    });
    li.appendChild(btn);
    listEl.appendChild(li);
  }
}

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

  const ratioSection = document.createElement('section');
  ratioSection.className = 'sidebar-section';
  ratioSection.innerHTML = '<h2 class="section-label">Ratios</h2><ul class="template-list ratio-list"></ul>';
  templateSection.insertAdjacentElement('afterend', ratioSection);
  const ratioList = ratioSection.querySelector('.ratio-list');

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

  function renderAll() {
    const query = currentQuery();
    renderTemplates(query);
    renderRatios(query);
  }

  searchInput?.addEventListener('input', renderAll);

  renderAll();

  // NO GROUND GROUP HERE, DELIBERATELY, and so nothing to return: the rail
  // used to render the same eight ground presets the inspector's Background
  // panel renders, which is the duplication this task removed. The panel
  // keeps its own screenshot-decoded handshake (`refreshSampled` in
  // web/inspector-background.js, called from web/main.js's handleFiles),
  // and it re-renders the presets through renderGroundSwatches — still
  // exported above — as part of it.
}
