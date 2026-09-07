// web/controls.js, the slider row, once.
//
// EVERY SLIDER IN THIS APP HAS THE SAME SHAPE AND THE SAME RESET. That is
// this file's whole reason to exist, and it is not a style preference.
//
// Cycle C built a Reset for the Background panel's sliders inside that
// panel's own init closure, so Padding, Corner radius, Shadow and Stroke
// width did not get one. Rock: *"I'm not sure I follow the logic of that
// reset button that only activates for luminosity."* He was right, one
// slider having a reset and the others not is arbitrary, and it was
// arbitrary because of where the code lived, not because anyone decided it.
//
// The same two files also each carried their own copy of `syncSliderFill`,
// seven identical lines in web/inspector-background.js and
// web/inspector-frame.js. `sync` below is that function, once.
//
// THE RESET IS DISABLED, NEVER HIDDEN, when the value is already the app's
// own choice. A button that vanishes makes the row jump mid-drag and hides
// the fact that the control has a default to go back to. `.slider-reset:
// disabled` is registered in the single off-state selector list at the top
// of web/style.css, which test/contrast.test.js enforces.

/**
 * Build a labelled slider with its own Reset.
 *
 * @param {object} spec
 * @param {string} spec.label        the visible name, e.g. "Padding"
 * @param {number} spec.min
 * @param {number} spec.max
 * @param {number|string} spec.step
 * @param {string} spec.ariaLabel    the slider's own accessible name
 * @param {string} [spec.resetLabel] the Reset's accessible name
 * @param {(v:number)=>string} spec.format    the readout, e.g. v => `${v}%`
 * @param {(v:number)=>boolean} spec.isDefault  true when Reset should be off
 * @param {(raw:string)=>void} spec.onInput     the raw input value, on drag
 * @param {()=>void} spec.onReset               what the Reset button does
 * @returns {{row:HTMLElement, input:HTMLInputElement, value:HTMLElement,
 *            reset:HTMLButtonElement, sync:(v:number)=>void}}
 */
export function makeSliderRow({
  label, min, max, step, ariaLabel, resetLabel, format, isDefault, onInput, onReset,
}) {
  const row = document.createElement('div');
  row.className = 'slider-row';
  row.innerHTML =
    '<div class="slider-label"><span></span><span class="mono slider-value"></span></div>';
  row.querySelector('.slider-label span').textContent = label;

  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'slider';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.setAttribute('aria-label', ariaLabel);

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'slider-reset';
  reset.setAttribute('aria-label', resetLabel || `Reset ${label.toLowerCase()}`);
  reset.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-reset"></use></svg>';

  const track = document.createElement('div');
  track.className = 'slider-track-row';
  track.append(input, reset);
  row.appendChild(track);

  const valueEl = row.querySelector('.slider-value');

  /**
   * Paint the row from a value: position, readout, fill and reset state.
   *
   * `--slider-fill` is the CSS custom property the track's gradient reads.
   * It is computed from the CURRENT min/max rather than the ones passed in,
   * because one slider, Corner radius, rewrites its own maximum when the
   * selected element changes (a phone's corner range is not a browser's).
   */
  function sync(current) {
    input.value = String(current);
    valueEl.textContent = format(current);
    const lo = Number(input.min) || 0;
    const hi = Number(input.max) || 100;
    const pct = hi === lo ? 0 : ((Number(input.value) - lo) / (hi - lo)) * 100;
    input.style.setProperty('--slider-fill', `${pct}%`);
    reset.disabled = isDefault(Number(input.value));
  }

  input.addEventListener('input', () => onInput(input.value));
  reset.addEventListener('click', () => onReset());

  return { row, input, value: valueEl, reset, sync };
}

// -------------------------------------------------------------------------
// THE POPOVER, once.
//
// Two controls open a panel from a button: the export format menu and the
// canvas's Size control. They owe the same six things - aria-expanded on the
// trigger, the panel hidden when closed, Escape, an outside click, focus put
// somewhere useful on open and returned to the trigger on close - and the
// second one is where a second copy would have been written.
//
// `void panel.offsetHeight` is not a tic. `[hidden] { display: none }` has
// not recomputed at the moment the attribute comes off, and focus() on a
// display:none element silently does nothing: verified on the format menu,
// where the options never took focus and Escape went to the trigger instead.
// Reading a layout property forces the recalculation first.
// -------------------------------------------------------------------------

/**
 * Wire a button to a panel it opens.
 *
 * @param {object} spec
 * @param {HTMLElement} spec.trigger   the button
 * @param {HTMLElement} spec.panel     the thing it opens
 * @param {HTMLElement} [spec.field]   the element both live in; defaults to
 *                                     the trigger's closest `.select`. This is
 *                                     what "outside" is measured against.
 * @param {(panel:HTMLElement)=>void} [spec.onOpen] where to put focus
 * @returns {{isOpen:()=>boolean, setOpen:(open:boolean, refocus?:boolean)=>void,
 *            field:HTMLElement}}
 */
export function makePopover({ trigger, panel, field, onOpen }) {
  const host = field || trigger.closest('.select') || panel.parentElement;

  function isOpen() {
    return trigger.getAttribute('aria-expanded') === 'true';
  }

  function setOpen(open, refocus = true) {
    trigger.setAttribute('aria-expanded', String(open));
    trigger.classList.toggle('is-open', open);
    panel.hidden = !open;
    if (open) {
      void panel.offsetHeight;
      onOpen?.(panel);
    } else if (refocus) {
      trigger.focus();
    }
  }

  trigger.addEventListener('click', () => {
    if (trigger.disabled) return;
    setOpen(!isOpen());
  });

  host.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
  });

  /** `pointerdown`, not `click`, so the panel is gone before whatever was
   *  pressed reacts. Focus does NOT return to the trigger here: the pointer
   *  is already somewhere else. */
  document.addEventListener('pointerdown', (event) => {
    if (!isOpen()) return;
    if (host.contains(event.target)) return;
    setOpen(false, false);
  });

  return { isOpen, setOpen, field: host };
}
