// web/selection.js — which element the pointer is over, and the DOM outline
// that says so.
//
// THIS FILE MUST NEVER TOUCH A CANVAS. The preview canvas is the export
// canvas (see web/state.js's header comment), so anything painted into it
// ships inside every exported PNG — a selection outline included. The
// outline is therefore an absolutely-positioned DOM element over the canvas,
// scaled by the same factor the browser is already using to display it.
//
// test/selection.test.js enforces this by reading this file's source for
// `getContext` and friends. A structural guard rather than a pixel one,
// deliberately: a pixel test would only cover the compositions someone
// thought to render, where this covers the capability.

/**
 * Which element covers canvas-space point (x, y), or null.
 *
 * PAINTING ORDER DECIDES OVERLAPS, so phones are tested first: core/index.js
 * paints the web shot and then the phones, and in the web+mobile layout the
 * phone deliberately rises out of the web shot's bottom-right corner.
 * Testing the web box first would select the thing underneath the one you
 * clicked.
 *
 * The test is the composite's OUTER box, not the screenshot inside it. A
 * browser bar and a phone's bezel are part of the element you are selecting,
 * and clicking a phone's bezel plainly means the phone.
 *
 * A rectangle, not the rounded path: the corners are the only disagreement,
 * they are a few pixels across, and a click that lands in one is far more
 * likely to be aimed at the shot than at the ground behind it.
 */
export function hitTest(lay, x, y) {
  if (!lay) return null;
  for (const box of (lay.phones || [])) {
    if (within(box, x, y)) return 'mobile';
  }
  if (lay.web && within(lay.web, x, y)) return 'web';
  return null;
}

function within(box, x, y) {
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
}

/**
 * The box for one element name, or null. Kept here rather than inlined at
 * the call site so `hitTest` and the outline can never disagree about what
 * 'mobile' refers to — it is the FIRST phone, which is also the one a
 * mobile-layout click is most likely to have meant.
 *
 * A `mobile` selection means the phones as a class (see ELEMENT_KINDS in
 * core/presets.js: per-phone settings are not a goal), so the outline marks
 * one of them rather than all three. That is a deliberate simplification,
 * and it is why the inspector labels what it is editing.
 */
export function boxFor(lay, which) {
  if (!lay || !which) return null;
  if (which === 'mobile') return (lay.phones && lay.phones[0]) || null;
  return lay.web || null;
}

/**
 * Place the outline over one box.
 *
 * `scale` is the canvas's CSS width divided by its pixel width — the same
 * number the browser is already using to display it — so the outline tracks
 * the shot at any display size without anyone recomputing the layout.
 *
 * `originX`/`originY` are the canvas's own offset inside whatever the
 * outline is positioned against. They are needed because the canvas is
 * CENTRED inside a padded surface: box coordinates are relative to the
 * canvas, and the outline is relative to the surface. Defaulting them to 0
 * would put the outline a padding's width off, which is the kind of bug
 * that looks like a rounding error and is not.
 *
 * Hidden via the `hidden` property, which is the app's single global
 * `[hidden] { display: none !important }` rule. No second hiding mechanism.
 */
export function placeOutline(el, box, scale, originX = 0, originY = 0) {
  if (!el) return;
  if (!box) { el.hidden = true; return; }
  el.hidden = false;
  el.style.left = `${originX + box.x * scale}px`;
  el.style.top = `${originY + box.y * scale}px`;
  el.style.width = `${box.w * scale}px`;
  el.style.height = `${box.h * scale}px`;
  el.style.borderRadius = `${(box.radius || 0) * scale}px`;
}
