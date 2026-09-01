// shotkit editor shell — Task 1 wiring, plus Task 2's pipeline.
//
// The top section (unchanged from Task 1) is chrome-only interaction: it
// makes the control primitives behave like the components they are without
// touching any application data. The bottom section (marked "Task 2") is
// where a drop/browse/surround click actually reaches `state` and the
// on-page canvas — see web/state.js for the render() pipeline itself.

import { state, SURROUNDS, bindCanvas, addFiles, hasContent } from './state.js';
import { exportShot } from './export.js';
import { initSidebar } from './sidebar.js';
import { initBackgroundInspector } from './inspector-background.js';
import { initFrameInspector, initFinishInspector } from './inspector-frame.js';
// `normalise` only — read-only, to learn the canvas's EFFECTIVE size for the
// empty-state frame below (Task 7). Never used to decide what to write; see
// updateEmptyFrame()'s own comment. Same read-only pattern web/sidebar.js's
// "+ Custom size" prefill and web/inspector-frame.js's radius display
// already established.
import { normalise } from '../core/index.js';

/** Toggle `.is-active`/aria-pressed among sibling cells of a single-select
 *  group (segmented controls, chips, swatches all follow this shape). */
function wireSingleSelectGroup(container, { activeClass, selector }) {
  container.addEventListener('click', (event) => {
    const cell = event.target.closest(selector);
    if (!cell || cell.disabled || !container.contains(cell)) return;

    for (const sibling of container.querySelectorAll(selector)) {
      const isTarget = sibling === cell;
      sibling.classList.toggle(activeClass, isTarget);
      sibling.setAttribute('aria-pressed', String(isTarget));
    }
  });
}

document.querySelectorAll('.segmented').forEach((el) => {
  wireSingleSelectGroup(el, { activeClass: 'is-active', selector: '.segmented-cell' });
});

// `.chip-row` (Frame's frameKind chips) and `.swatch-row` (a gradient-colour
// picker, Background's) were both part of the design handoff's own static
// markup — Task 5 replaced Background with web/inspector-background.js's
// own markup, and Task 6 does the same for Frame with
// web/inspector-frame.js (frameKind chips carry real application state,
// state.config.frameKind, and need to funnel through scheduleRender() plus
// conditionally show/hide the chrome-theme and url controls — the generic
// class-toggle-only wiring above can't do either). So there is no longer a
// `.chip-row` or `.swatch-row` anywhere in index.html at load time for the
// loops above to find, by the same reasoning Task 5 already established.

// Templates/Ratios/Ground presets (Task 4) are NOT wired with the generic
// wireSingleSelectGroup helper above: those rows carry real application
// state (state.config.template/ratio/ground), not just a CSS toggle, and
// need to funnel through scheduleRender() — see web/sidebar.js's header
// comment for why that file owns its own click handling instead.
const sidebar = initSidebar();

/** Sliders: keep the mono value label and the track fill in sync with the
 *  input's own value. Angle gets a ° suffix; everything else gets %. */
document.querySelectorAll('.slider-row').forEach((row) => {
  const input = row.querySelector('.slider');
  const value = row.querySelector('.slider-value');
  if (!input || !value) return;

  const suffix = value.textContent.trim().endsWith('°') ? '°' : '%';
  const sync = () => {
    const min = Number(input.min) || 0;
    const max = Number(input.max) || 100;
    const pct = ((Number(input.value) - min) / (max - min)) * 100;
    input.style.setProperty('--slider-fill', `${pct}%`);
    value.textContent = `${input.value}${suffix}`;
  };

  input.addEventListener('input', sync);
  sync();
});

// Background inspector (Task 5) is called AFTER the generic `.slider-row`/
// `.segmented` wiring above finishes, not before: it builds its own Hue/
// Angle sliders and Type/Tone segmented controls from scratch, wires its
// own listeners directly (mutating `state.config` and calling
// `scheduleRender()` — the generic loops above only ever toggle a CSS
// class or a --slider-fill percentage, never real state), and needs those
// elements to NOT be present yet when the generic, one-time
// `querySelectorAll` passes above ran, so nothing double-wires them. See
// web/inspector-background.js's own header comment.
const background = initBackgroundInspector();

// Frame and Finish (Task 6), same reasoning and sequencing as Background
// immediately above: each builds its own section from scratch, so both run
// after the generic `.slider-row`/`.segmented` loops so nothing double-wires
// controls that don't exist in the DOM yet when those loops ran.
initFrameInspector();
initFinishInspector();

/** Rail items marked aria-disabled render dimmed but stay focusable (per
 *  ARIA authoring practice) so keyboard/screen-reader users can discover
 *  what's coming. They must still do nothing when activated. */
document.querySelectorAll('.rail-item[aria-disabled="true"]').forEach((el) => {
  el.addEventListener('click', (event) => event.preventDefault());
});

/** Narrow-viewport drawers for the sidebar and inspector.
 *
 * Below 900px the sidebar/inspector are off-canvas drawers; at 900px and
 * above they're the normal always-visible panes of the four-pane layout, and
 * must never be touched by anything below.
 *
 * A closed drawer being merely off-screen (`transform: translateX(±100%)`)
 * is not enough — CSS transforms don't remove an element from the tab
 * order, so sequential Tab presses walk straight into a closed drawer's
 * controls with no visible focus ring. `inert` is what actually makes a
 * closed drawer unreachable: one attribute pulls its whole subtree out of
 * both the tab order and the accessibility tree, instead of a per-element
 * `tabindex="-1"` patch that Task 2's new controls could silently slip
 * past. Closing a drawer — by Escape, backdrop click, or its own toggle —
 * always returns focus to the toggle that opened it (the standard
 * disclosure-widget pattern); without that, focus is left on a control
 * that's either about to be invisible or about to be forced out of an
 * inert subtree to who-knows-where by the browser itself.
 *
 * Sequencing matters: applying `inert` at the same instant the drawer
 * starts sliding away would cut the animation short (this is especially
 * true of the `display: none` some browsers fall back to for `inert`
 * rendering — that's an instant layout change, not an animatable one), so
 * the close path always moves focus first, then waits for the slide-out
 * transition (or a timeout standing in for it when transitions are
 * disabled, e.g. prefers-reduced-motion) before marking the pane inert.
 */

const drawerBackdrop = document.getElementById('drawerBackdrop');
const NARROW_QUERY = '(max-width: 899px)';
const isNarrowViewport = () => window.matchMedia(NARROW_QUERY).matches;

/** Run `run` once the pane's transform transition ends, or after a timeout
 *  slightly longer than the CSS transition (200ms) — the fallback covers
 *  prefers-reduced-motion, where style.css strips the transition entirely
 *  and `transitionend` would otherwise never fire. */
function afterCloseTransition(pane, run) {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    pane.removeEventListener('transitionend', onEnd);
    run();
  };
  const onEnd = (event) => {
    if (event.target === pane && event.propertyName === 'transform') finish();
  };
  pane.addEventListener('transitionend', onEnd);
  setTimeout(finish, 250);
}

function makeDrawer(toggleId, paneId) {
  const toggle = document.getElementById(toggleId);
  const pane = document.getElementById(paneId);
  if (!toggle || !pane || !drawerBackdrop) return null;
  return { toggle, pane };
}

const allDrawers = [makeDrawer('panelToggleLeft', 'sidebar'), makeDrawer('panelToggleRight', 'inspector')].filter(
  Boolean,
);

const isDrawerOpen = (drawer) => drawer.pane.classList.contains('is-open');

/** The single source of truth for whether a pane should be `inert` right
 *  now: only ever true for a *closed drawer*, i.e. narrow viewport AND not
 *  open. A pane that's open, or that isn't currently a drawer at all
 *  (>=900px), must always be interactive. */
function settleInertState(drawer) {
  if (isNarrowViewport() && !isDrawerOpen(drawer)) {
    drawer.pane.setAttribute('inert', '');
  } else {
    drawer.pane.removeAttribute('inert');
  }
}

function closeDrawer(drawer, { returnFocus = true } = {}) {
  const wasOpen = isDrawerOpen(drawer);
  drawer.pane.classList.remove('is-open');
  drawer.toggle.setAttribute('aria-expanded', 'false');
  // Move focus BEFORE the pane goes inert, not after — inert content can't
  // hold focus, and we want a deterministic destination (the toggle), not
  // whatever the browser picks (usually <body>) when it evicts focus from
  // a subtree that just went inert out from under it.
  if (returnFocus) drawer.toggle.focus();
  if (!allDrawers.some(isDrawerOpen)) drawerBackdrop.hidden = true;
  if (wasOpen) afterCloseTransition(drawer.pane, () => settleInertState(drawer));
  else settleInertState(drawer);
}

function openDrawer(drawer) {
  // Only one drawer is meaningful at a time on a narrow viewport; closing
  // the other is a side effect of this click, not a user-directed close,
  // so it must not steal focus onto its own toggle.
  allDrawers.forEach((other) => {
    if (other !== drawer && isDrawerOpen(other)) closeDrawer(other, { returnFocus: false });
  });
  drawer.pane.removeAttribute('inert');
  drawer.pane.classList.add('is-open');
  drawer.toggle.setAttribute('aria-expanded', 'true');
  drawerBackdrop.hidden = false;
}

allDrawers.forEach((drawer) => {
  drawer.toggle.addEventListener('click', () => {
    if (isDrawerOpen(drawer)) closeDrawer(drawer);
    else openDrawer(drawer);
  });
});

if (drawerBackdrop) {
  drawerBackdrop.addEventListener('click', () => {
    allDrawers.forEach((drawer) => {
      if (isDrawerOpen(drawer)) closeDrawer(drawer);
    });
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const open = allDrawers.find(isDrawerOpen);
  if (open) closeDrawer(open);
});

// Crossing the 900px boundary itself: going wide makes both panes normal
// static content again (never inert, is-open meaningless); going narrow
// makes whichever isn't open inert immediately — there's no transition to
// wait for here, since the offscreen transform and the transition rule
// both live in the same media query and only start applying at this exact
// moment, so nothing was visibly open to animate shut.
function reconcileForViewport() {
  allDrawers.forEach((drawer) => {
    if (!isNarrowViewport()) closeDrawer(drawer, { returnFocus: false });
    settleInertState(drawer);
  });
}

// Two independent signals, not one: a `matchMedia` "change" listener is the
// standard, semantically-correct way to react to a breakpoint, but a stuck
// `inert` on a pane that's supposed to be a normal, fully-interactive static
// panel again is bad enough (it would silently remove the whole sidebar or
// inspector from the tab order and the accessibility tree at a width where
// both should just work) that it isn't worth trusting to a single event
// path. `resize` is the oldest, most universally-fired signal for "the
// viewport changed" there is. Both call the same idempotent reconciliation,
// so whichever fires first wins and the other is a harmless no-op.
window.matchMedia(NARROW_QUERY).addEventListener('change', reconcileForViewport);
window.addEventListener('resize', reconcileForViewport);

// Initial state on load, whichever side of the breakpoint we start on.
allDrawers.forEach((drawer) => settleInertState(drawer));

/* -------------------------------------------------------------------------
   Task 2: the pipeline (drop a file, see a shot) and the canvas surround.

   Everything that touches `state` or calls into core/ lives in state.js —
   this section is DOM wiring only: turning drops/clicks/keypresses into
   `addFiles()`/`render()` calls, and reflecting the result (a canvas to
   show, an error to say, a surround to paint) back into the page.
   ---------------------------------------------------------------------- */

const stage = document.getElementById('stage');
const canvasSurface = document.getElementById('canvas');
const renderCanvas = document.getElementById('renderCanvas');
const dropzone = document.getElementById('dropzone');
const dropzoneDims = document.getElementById('dropzoneDims');
const dropError = document.getElementById('dropError');
const fileInput = document.getElementById('fileInput');
const toolbarFileSlot = document.querySelector('#toolbarFile .file-slot');
const exportFootnote = document.querySelector('.export-footnote');
const sidebarEl = document.getElementById('sidebar');

// The three inspector sections that describe properties OF a loaded shot —
// greyed and `inert` (index.html's static default) until one exists. The
// Export section is deliberately not in this list; see index.html's and
// style.css's own comments on why it's handled differently (the button
// disables, the format/scale pickers don't).
const propertySections = ['backgroundSection', 'frameSection', 'finishSection'].map((id) =>
  document.getElementById(id),
);

bindCanvas(renderCanvas);

const isReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Matches style.css's `dropzone-exit` animation duration exactly — this is
// the ONE place that number is authored twice, so a future change to one
// without the other would show up immediately as a visible flash (the
// dropzone hidden mid-animation, or hanging around after it finishes)
// rather than silently drifting.
const DROPZONE_EXIT_MS = 220;

/** Restart a CSS animation by removing its class, forcing a reflow, then
 *  re-adding it — the standard technique for "play this animation again"
 *  when merely re-adding an already-present class is a no-op. Shared by
 *  the arrival sequence below and a later replace-while-loaded drop. */
function restartAnimation(el, className) {
  el.classList.remove(className);
  void el.offsetWidth; // force reflow
  el.classList.add(className);
}

/** The one authored moment (Task 7): the drop zone gives way, the ground
 *  blooms in (a pure-CSS `background-color` transition on `.canvas-surface`
 *  itself — see style.css — needs no JS timing at all), the shot settles.
 *  Called from `syncContentUI()` below on the ONE transition that matters —
 *  `hasContent()` going from false to true — never on a later drop that
 *  replaces an already-loaded shot (see `resettleCanvas()` for that case).
 *
 *  Reduced motion is handled here, not just left to style.css's
 *  `@media (prefers-reduced-motion: reduce)` block: that block is the
 *  belt-and-suspenders guarantee (an animation class that slipped through
 *  would still be neutralised there), but the actual, primary fix is this
 *  function never adding `.is-leaving`/`.is-settling` at all when reduced
 *  motion is on, and hiding the dropzone immediately instead of on a
 *  timer — there is no animation to wait for. */
function playArrival() {
  renderCanvas.classList.add('is-visible');

  if (isReducedMotion()) {
    dropzone.hidden = true;
    dropzone.classList.remove('is-leaving');
    renderCanvas.classList.remove('is-settling');
    return;
  }

  dropzone.classList.add('is-leaving');
  restartAnimation(renderCanvas, 'is-settling');
  setTimeout(() => {
    dropzone.hidden = true;
    dropzone.classList.remove('is-leaving');
  }, DROPZONE_EXIT_MS);
}

/** A later drop that REPLACES an already-loaded shot: the drop zone is long
 *  gone, so there's nothing for it to give way from, but the new shot still
 *  gets its own "settles" beat — same animation, restarted, never under
 *  reduced motion (style.css's media block would neutralise it anyway, but
 *  there's no reason to even ask for a restart that has to be thrown away). */
function resettleCanvas() {
  if (isReducedMotion()) return;
  restartAnimation(renderCanvas, 'is-settling');
}

/** The empty-state frame's size and dimension label (Task 7) — kept in sync
 *  with whatever ratio/template/custom-size the SIDEBAR currently has
 *  selected, even with nothing loaded yet and render() a no-op (see
 *  web/state.js). `normalise()` (core/index.js) is a read-only lookup of
 *  the canvas's EFFECTIVE size, the exact same pattern web/sidebar.js's
 *  "+ Custom size" prefill and web/inspector-frame.js's radius display
 *  already use — never used here to decide what to write.
 *
 *  Sized in JS, not left to a pure-CSS `aspect-ratio`: the box has to fit
 *  BOTH axes of whatever room `.canvas-surface` has left after its own
 *  padding, and CSS has no built-in "shrink to fit both width and height,
 *  preserving a ratio" behaviour for an arbitrary element the way replaced
 *  elements (img/canvas/video) get for free from `width:auto;height:auto`
 *  plus max-width/max-height — that's exactly how `.render-canvas` itself
 *  gets away with no JS sizing at all. The 160/120 floor trades EXACT
 *  proportionality for a still-usable box at an extreme ratio or a very
 *  narrow viewport; re-clamping to `availW`/`availH` right after is what
 *  stops that floor from ever being the thing that causes the
 *  horizontal-scroll failure Step 4 checks for. */
function updateEmptyFrame() {
  if (hasContent() || !dropzoneDims) return;

  const eff = normalise(state.config);
  dropzoneDims.textContent = `${eff.w} × ${eff.h}`;
  dropzone.setAttribute(
    'aria-label',
    `Drop a screenshot here, or press Enter to browse for a file. Canvas ${eff.w} by ${eff.h} pixels.`,
  );

  const rect = canvasSurface.getBoundingClientRect();
  const stagePad = 28 * 2; // .canvas-surface's own padding (style.css)
  const availW = Math.max(1, rect.width - stagePad);
  const availH = Math.max(1, rect.height - stagePad);
  const ratio = eff.w / eff.h;

  let w = Math.min(availW, availH * ratio);
  let h = w / ratio;
  w = Math.min(availW, Math.max(160, w));
  h = Math.min(availH, Math.max(120, h));

  dropzone.style.width = `${Math.round(w)}px`;
  dropzone.style.height = `${Math.round(h)}px`;
}

/** Reflect `state.images`/`hasContent()` into the parts of the shell that
 *  aren't the canvas itself: which of canvas/dropzone is showing, the
 *  toolbar's filename slot, the export footnote, the inspector's greyed
 *  "Properties" state (Task 7), and the arrival animation. */
function syncContentUI() {
  const loaded = hasContent();
  const wasLoaded = renderCanvas.classList.contains('is-visible');

  if (loaded) {
    if (wasLoaded) resettleCanvas();
    else playArrival();
  } else {
    // Not a path state.js's own logic can currently reach (images are only
    // ever added, never cleared) — kept correct anyway rather than assumed
    // unreachable, exactly like showDropErrors() below being written to
    // handle zero errors even though most callers only ever pass one.
    dropzone.hidden = false;
    dropzone.classList.remove('is-leaving');
    renderCanvas.classList.remove('is-visible', 'is-settling');
    updateEmptyFrame();
  }

  canvasSurface.classList.toggle('has-content', loaded);

  for (const section of propertySections) {
    if (!section) continue;
    if (loaded) section.removeAttribute('inert');
    else section.setAttribute('inert', '');
  }

  if (toolbarFileSlot) {
    const names = [];
    if (state.images.web) names.push(state.images.web.__name);
    for (const m of state.images.mobile) names.push(m.__name);
    toolbarFileSlot.textContent = loaded ? names.join(' + ') : 'No screenshot loaded';
    toolbarFileSlot.classList.toggle('file-slot--empty', !loaded);
  }

  if (exportFootnote) {
    exportFootnote.textContent = loaded ? 'Ready to export' : 'No screenshot loaded yet';
  }

  // Export stays disabled until there's a shot to export - but never fight
  // an export actually in flight (setExportBusy below owns `disabled` for
  // the duration of one): syncContentUI can run mid-export (e.g. a drop
  // replacing the source image while a previous export's encode is still
  // pending), and re-enabling here on top of setExportBusy's freeze would
  // let a second export start against a render() that's about to be
  // stomped by the first export's own restore-scale call in its `finally`.
  if (!exporting) {
    for (const btn of [exportBtnToolbar, exportBtnPanel]) {
      if (btn) btn.disabled = !loaded;
    }
  }
}

// The empty frame tracks the sidebar's Templates/Ratios/"+ Custom size"
// controls even though none of those write through `scheduleRender()`'s
// normal path in any way this file can hook directly (web/sidebar.js owns
// that wiring, and Task 7's brief scopes this file to web/index.html,
// web/style.css and web/main.js only — not a second file to touch for one
// more call). A `click`/`keydown` listener on `#sidebar` itself, scoped to
// only matter while there's nothing loaded, is what keeps this synced
// without reaching into that file: every one of those controls' own
// handlers already runs (and finishes mutating `state.config`) before the
// same event finishes bubbling up here.
sidebarEl?.addEventListener('click', () => {
  if (!hasContent()) updateEmptyFrame();
});
sidebarEl?.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && !hasContent()) updateEmptyFrame();
});
window.addEventListener('resize', updateEmptyFrame);

/** A bad drop is an inline message, never a wiped canvas — addFiles() never
 *  touches state.images for files it couldn't decode, so whatever was last
 *  rendered stays exactly as it was; this just surfaces what went wrong. */
function showDropErrors(errors) {
  if (!errors.length) {
    dropError.hidden = true;
    dropError.textContent = '';
    return;
  }
  dropError.hidden = false;
  dropError.textContent = errors.length === 1
    ? errors[0]
    : `${errors.length} files were skipped — ${errors.join(' ')}`;
}

async function handleFiles(fileList) {
  if (!fileList || !fileList.length) return;
  const errors = await addFiles(fileList);
  showDropErrors(errors);
  syncContentUI();
  // addFiles() above calls render() synchronously when it decodes anything,
  // so state.meta already reflects the new image(s) by this point — this is
  // what tells the Ground group's swatches to stop showing the synthetic
  // no-image fallback and start previewing the real thing (see
  // web/sidebar.js's "Ground swatch gradients" header comment).
  sidebar?.refreshGrounds();
  // Same handshake for the inspector's own "Sampled" swatches (Task 5) —
  // see web/inspector-background.js's "Sampled" header comment for why it
  // keeps an independent cache that only this call invalidates.
  background?.refreshSampled();
}

/** Drop anywhere on the stage — not just the dropzone box — so a shot can be
 *  replaced (or a phone added) after the first one loads, once the dropzone
 *  overlay itself is no longer showing. `dragenter`/`dragleave` fire on
 *  every element the pointer crosses, including children, so a plain depth
 *  counter is what keeps the drag-over highlight from flickering off while
 *  the pointer passes over the dropzone or the canvas inside the stage. */
let dragDepth = 0;
const isFileDrag = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');

stage.addEventListener('dragover', (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
});

stage.addEventListener('dragenter', (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  dragDepth += 1;
  canvasSurface.classList.add('is-drag-over');
});

stage.addEventListener('dragleave', (event) => {
  if (!isFileDrag(event)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) canvasSurface.classList.remove('is-drag-over');
});

stage.addEventListener('drop', (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  dragDepth = 0;
  canvasSurface.classList.remove('is-drag-over');
  handleFiles(event.dataTransfer.files);
});

/** The accessible equivalent of a drop: the dropzone is a real button
 *  (role="button", tabindex="0" — set in index.html) that opens a native
 *  file picker, reachable and operable with only a keyboard. */
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  handleFiles(fileInput.files);
  fileInput.value = '';
});

/** The canvas surround: three neutral steps behind the shot, so a pale
 *  ground can be judged honestly. This sets ONLY `canvasSurface`'s own
 *  background (via `data-surround`, read by style.css) and `state.surround`
 *  — core/ never sees this value; see state.js's header comment and
 *  test/web-export.test.js. The segmented control's own `.is-active`/
 *  aria-pressed toggling is already handled by the generic
 *  `wireSingleSelectGroup` wiring above (`.surround-control` is a
 *  `.segmented`), so this only needs to react to the resulting click. */
document.querySelector('.surround-control')?.addEventListener('click', (event) => {
  const cell = event.target.closest('.surround-cell');
  if (!cell) return;
  const value = cell.dataset.surround;
  if (!SURROUNDS.includes(value)) return;
  state.surround = value;
  canvasSurface.dataset.surround = value;
});

/* -------------------------------------------------------------------------
   Task 3: export. Reads the format/scale the inspector's export controls
   are currently showing, hands them to web/export.js's exportShot() (the
   only thing in the app allowed to touch state.config.scale or call
   render() for a purpose other than the live preview), and reflects the
   in-flight state back onto both Export buttons - the generic one in the
   toolbar and the format-specific one at the foot of the inspector's Export
   section. Neither button, nor export.js, ever calls composeWithMeta
   directly; see export.js's header comment.
   ---------------------------------------------------------------------- */

const exportBtnToolbar = document.getElementById('exportBtnToolbar');
const exportBtnPanel = document.getElementById('exportBtnPanel');
const exportFormatSelect = document.getElementById('exportFormatSelect');
const exportScaleControl = document.getElementById('exportScaleControl');

const FORMAT_ORDER = ['png', 'jpeg', 'webp'];
const FORMAT_LABELS = { png: 'PNG', jpeg: 'JPEG', webp: 'WEBP' };
let exportFormat = 'png';
let exporting = false;

/** Every control an in-flight export must freeze - not just whichever
 *  button was clicked. Format and scale are read fresh at the moment
 *  Export is pressed (see handleExportClick), so letting either change
 *  mid-export would make "what got exported" disagree with what these
 *  controls now show; freezing all four for the duration is what keeps
 *  that from ever happening. */
function exportControls() {
  return [
    exportBtnToolbar,
    exportBtnPanel,
    exportFormatSelect,
    ...(exportScaleControl ? exportScaleControl.querySelectorAll('.segmented-cell') : []),
  ].filter(Boolean);
}

/** `select-control` is chrome-only markup from Task 1 (a static "PNG ▾"
 *  label, no working dropdown behind it). Rather than build a full listbox
 *  popup for a fixed 3-item set - more surface area than this control needs,
 *  and not what "reuse Task 1's primitives" asks for - clicking it simply
 *  cycles PNG → JPEG → WebP → PNG, updating its own leading text node (the
 *  chevron <svg> after it is untouched) and the panel Export button's label
 *  to match. */
function updateFormatUI() {
  const label = FORMAT_LABELS[exportFormat];
  const textNode = Array.from(exportFormatSelect?.childNodes ?? []).find(
    (node) => node.nodeType === Node.TEXT_NODE,
  );
  if (textNode) textNode.data = `${label} `;
  exportFormatSelect?.setAttribute('aria-label', `Export format: ${label}. Click to change.`);
  if (exportBtnPanel && !exporting) exportBtnPanel.textContent = `Export ${label}`;
}

exportFormatSelect?.addEventListener('click', () => {
  const next = FORMAT_ORDER[(FORMAT_ORDER.indexOf(exportFormat) + 1) % FORMAT_ORDER.length];
  exportFormat = next;
  updateFormatUI();
});

/** The 1x/2x/3x segmented control's `.is-active` toggling is already
 *  handled by the generic `wireSingleSelectGroup` wiring at the top of this
 *  file (`#exportScaleControl` is a `.segmented`) - this just reads back
 *  whichever cell that left active, at the moment Export is pressed. */
function selectedScale() {
  const cell = exportScaleControl?.querySelector('.segmented-cell.is-active');
  const n = cell ? parseInt(cell.textContent, 10) : 2;
  return Number.isFinite(n) ? n : 2;
}

/** aria-busy plus a visible "Exporting…" label on both Export buttons, and
 *  every export control disabled for the duration - a 3x export is a real,
 *  human-perceptible wait (see export.js), not something a click should be
 *  able to fire twice into or race a format/scale change against. */
function setExportBusy(busy) {
  for (const btn of [exportBtnToolbar, exportBtnPanel]) {
    if (!btn) continue;
    btn.setAttribute('aria-busy', String(busy));
    btn.classList.toggle('is-loading', busy);
  }
  if (exportBtnPanel) {
    exportBtnPanel.textContent = busy ? 'Exporting…' : `Export ${FORMAT_LABELS[exportFormat]}`;
  }
  for (const el of exportControls()) el.disabled = busy || !hasContent();
}

async function handleExportClick() {
  if (exporting || !hasContent()) return;
  exporting = true;
  setExportBusy(true);
  try {
    await exportShot(renderCanvas, { format: exportFormat, scale: selectedScale() });
    showDropErrors([]);
  } catch (err) {
    showDropErrors([`Export failed: ${err.message || err}.`]);
  } finally {
    exporting = false;
    setExportBusy(false);
  }
}

exportBtnToolbar?.addEventListener('click', handleExportClick);
exportBtnPanel?.addEventListener('click', handleExportClick);

updateFormatUI();
syncContentUI();
