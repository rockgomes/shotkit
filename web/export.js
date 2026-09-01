// web/export.js — turn the current shot into a downloaded file.
//
// This module owns exactly two things core/ deliberately does NOT:
//   - `format`: core/ only ever paints pixels into a canvas; it has no idea
//     PNG/JPEG/WebP exist. Turning pixels into bytes is `canvas.toBlob`'s
//     job, called from here.
//   - the filename: derived from the source screenshot's own name plus the
//     resolved layout and scale (see filenameFor below).
//
// `scale`, by contrast, is NOT this module's to invent - it is a `core/`
// config field (see core/config.js's `normalise` and composeWithMeta's use
// of `c.scale` in core/index.js). A 2x/3x export is produced by temporarily
// pointing `state.config.scale` at the requested value and calling THE SAME
// `render()` web/state.js uses for the live preview - never by scaling a
// finished canvas after the fact, and never by calling `composeWithMeta`
// from here. That keeps the invariant Task 2 established intact: exactly one
// place in the app ever calls into core/'s compose path, so the exported
// pixels can never disagree with what the preview showed.
import { state, render } from './state.js';
import { normalise, SCALES } from '../core/index.js';

const MIME_TYPES = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };

// File extensions intentionally differ from the mime/format key for jpeg:
// ".jpg" is the extension people actually expect, even though the format
// key and MIME type both say "jpeg".
const EXTENSIONS = { png: 'png', jpeg: 'jpg', webp: 'webp' };

// canvas.toBlob's quality argument only affects lossy encoders; passing it
// for png/webp is harmless but meaningless, so it's applied to jpeg only.
const JPEG_QUALITY = 0.92;

/** Strip a filename down to its stem (no extension, no path). */
function stemOf(name) {
  if (!name) return null;
  const base = name.split(/[\\/]/).pop();
  const stem = base.replace(/\.[^.]+$/, '');
  return stem || null;
}

/** The name to build an export filename from: the web screenshot's own
 *  name if there is one, else the first phone's, else a plain fallback -
 *  never invented from nothing (see task brief). */
function sourceStem() {
  const web = state.images.web;
  if (web?.__name) return stemOf(web.__name) ?? 'shotkit';
  const phone = state.images.mobile[0];
  if (phone?.__name) return stemOf(phone.__name) ?? 'shotkit';
  return 'shotkit';
}

/** The same layout inference composeWithMeta itself will apply for this
 *  exact images/config pair (see core/config.js normalise) - read via the
 *  real function rather than re-implemented here, so the filename can never
 *  disagree with what actually got painted. This is a pure config read, not
 *  a second call into the compose/paint path - render() below remains the
 *  only thing in the app that calls composeWithMeta. */
function resolvedLayout() {
  const { layout } = normalise({
    ...state.config,
    hasWeb: !!state.images.web,
    mobileCount: state.images.mobile.length,
  });
  return layout;
}

function filenameFor(format, scale) {
  return `${sourceStem()}--${resolvedLayout()}@${scale}x.${EXTENSIONS[format]}`;
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error(`this browser could not encode ${mime}`));
    }, mime, quality);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick rather than immediately: some browsers drop an
  // in-flight download if its object URL is revoked before the click has
  // finished being processed.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Yield long enough for a caller's "exporting…" UI (aria-busy, disabled
 *  controls, spinner) to actually paint before the synchronous, CPU-heavy
 *  render() call below blocks the main thread. A 3x Dribbble export
 *  recomposes at 8400x6300px - real wall-clock work with nothing else async
 *  to interleave it against.
 *
 *  requestAnimationFrame alone is NOT enough here: browsers never fire rAF
 *  callbacks for a hidden/backgrounded tab (confirmed against a real
 *  Chromium tab while building this - a tab put in the background right
 *  after the Export click left the promise pending indefinitely, so the
 *  export never ran at all, with no error and no way out short of
 *  refocusing the tab). There's nothing to visibly paint in a hidden tab
 *  anyway, so racing rAF against a short timeout gets both: a same-frame
 *  paint when the tab is visible (the common case), and a bounded wait
 *  instead of an indefinite hang when it isn't. */
function nextFrame() {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(finish);
    setTimeout(finish, 50);
  });
}

/**
 * Export the shot currently on `canvas` (the same <canvas> web/main.js binds
 * to web/state.js via bindCanvas) as a downloaded file, at `scale`x, encoded
 * as `format`.
 *
 * `canvas` is passed in rather than looked up here because web/state.js
 * deliberately keeps its bound canvas element private - main.js already
 * holds the reference it used to call bindCanvas(), so it's the natural
 * place to hand it over from.
 */
export async function exportShot(canvas, { format, scale }) {
  if (!canvas) throw new Error('exportShot() needs the bound render canvas');
  const mime = MIME_TYPES[format];
  if (!mime) throw new Error(`unknown export format: ${format}`);
  if (!SCALES.includes(scale)) throw new Error(`unsupported export scale: ${scale}`);
  if (!state.images.web && state.images.mobile.length === 0) {
    throw new Error('nothing to export yet');
  }

  const filename = filenameFor(format, scale);
  // Whatever the preview's own scale was (always 1 today - nothing in the
  // app sets state.config.scale to anything else) - restored in `finally`
  // below regardless of how the render/encode below turns out, so a failed
  // or interrupted export can never leave the on-page preview stuck at
  // export resolution.
  const previousScale = state.config.scale;

  await nextFrame();

  try {
    state.config.scale = scale;
    // THE only render for this export: composeWithMeta re-runs layout,
    // ground and paint at scale x the canvas's own w/h (see its comment in
    // core/index.js) - this is a fresh composition at the larger pixel
    // count, never a stretched copy of a smaller one.
    render();

    // JPEG has no alpha channel, so canvas.toBlob silently drops it when
    // encoding to image/jpeg. That's safe here specifically because
    // paintGround (core/render.js, always the first paint call inside
    // composeWithMeta) fills the ENTIRE w x h canvas before anything else is
    // drawn - there is no transparent region anywhere in a shotkit
    // composition for JPEG's dropped alpha to lose. This stops being true
    // only if core/ ever grows a ground painter that leaves part of the
    // canvas untouched, which is exactly why this assumption is spelled out
    // here instead of assumed silently.
    const quality = format === 'jpeg' ? JPEG_QUALITY : undefined;
    const blob = await canvasToBlob(canvas, mime, quality);
    downloadBlob(blob, filename);
  } finally {
    state.config.scale = previousScale;
    render();
  }
}
