// shotkit editor shell — Task 1 wiring.
//
// This is chrome-only interaction: it makes the control primitives behave
// like the components they are (a segmented control has one active cell, a
// slider shows its own value, a drawer opens and closes) without touching
// any application data. There is no document, template, background, frame,
// or export model here — that arrives in Task 2. Nothing below persists,
// renders to #canvas, or survives a reload.

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

wireSingleSelectGroup(document.querySelector('.chip-row'), {
  activeClass: 'is-selected',
  selector: '.chip',
});

wireSingleSelectGroup(document.querySelector('.swatch-row'), {
  activeClass: 'is-selected',
  selector: '.swatch:not(.swatch--add)',
});

wireSingleSelectGroup(document.querySelector('.template-list'), {
  activeClass: 'is-selected',
  selector: '.template-row:not(.template-row--add)',
});

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
