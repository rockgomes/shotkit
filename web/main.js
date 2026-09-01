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

/** Narrow-viewport drawers for the sidebar and inspector. Only the open/
 *  closed presentation lives here — the panes' content is unaffected. */
function wireDrawer({ toggleId, paneId }) {
  const toggle = document.getElementById(toggleId);
  const pane = document.getElementById(paneId);
  const backdrop = document.getElementById('drawerBackdrop');
  if (!toggle || !pane || !backdrop) return;

  const close = () => {
    pane.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    if (!document.querySelector('#sidebar.is-open, #inspector.is-open')) {
      backdrop.hidden = true;
    }
  };

  const open = () => {
    document.querySelectorAll('#sidebar.is-open, #inspector.is-open').forEach((other) => {
      if (other !== pane) other.classList.remove('is-open');
    });
    document.querySelectorAll('.drawer-toggle[aria-expanded="true"]').forEach((other) => {
      if (other !== toggle) other.setAttribute('aria-expanded', 'false');
    });
    pane.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    backdrop.hidden = false;
  };

  toggle.addEventListener('click', () => {
    if (pane.classList.contains('is-open')) close();
    else open();
  });

  backdrop.addEventListener('click', close);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && pane.classList.contains('is-open')) close();
  });

  // Crossing back over the 900px breakpoint should reset drawer state so a
  // resize (or rotating a tablet) never leaves a pane stuck open/hidden.
  const mql = window.matchMedia('(min-width: 900px)');
  mql.addEventListener('change', (event) => {
    if (event.matches) close();
  });
}

wireDrawer({ toggleId: 'panelToggleLeft', paneId: 'sidebar' });
wireDrawer({ toggleId: 'panelToggleRight', paneId: 'inspector' });
