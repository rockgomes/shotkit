// web/state.js — the single place that holds shotkit's editor state and the
// single place that calls into core/. Every later task (4, 5, 6) mutates
// `state.config` and then calls `scheduleRender()` (or `render()` directly);
// none of them may call `composeWithMeta` themselves — see Ruling 2 in
// progress.md. That is what keeps the preview canvas and the export canvas
// from ever disagreeing: there is exactly one path from config to pixels.
//
// core/ must never learn the surround exists (see below) — it is not part
// of `config`, it is never passed to composeWithMeta, and no painter in
// core/ reads it. It lives on `state.surround` and is applied by main.js as
// a CSS background on the stage element sitting behind the <canvas>.
import { composeWithMeta, DEFAULTS } from '../core/index.js';
import { decodeFiles } from './decode.js';

export const SURROUNDS = ['dark', 'mid', 'light'];
const MAX_PHONES = 3;

export const state = {
  config: { ...DEFAULTS },
  images: { web: null, mobile: [] },
  meta: null,
  surround: 'mid',
};

// --- Scratch canvases -------------------------------------------------
//
// composeWithMeta never creates a canvas itself — it asks `makeCanvas(w, h)`
// for one every time it needs scratch space: the full-resolution target, one
// down-sampled (<=800px) thumbnail per source image for its colour analysis,
// and a tile for the grain pass. During a slider drag this can run at up to
// 60fps (see the rAF debounce below), so reusing DOM canvas elements by size
// — instead of allocating a fresh one on every single call — avoids garbage
// pressure that has nothing to do with core/'s own (unavoidable) per-render
// work. This is pure plumbing on our side of the makeCanvas hook; it changes
// nothing about what gets painted.
const canvasPool = new Map();
function pooledCanvas(w, h) {
  const key = `${w}x${h}`;
  let cv = canvasPool.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    canvasPool.set(key, cv);
  }
  cv.width = w;
  cv.height = h;
  return cv;
}

let canvasEl = null;

/** Point state.js at the <canvas> element render() paints into. Called once
 *  from main.js during setup. */
export function bindCanvas(el) {
  canvasEl = el;
}

// --- The ground-recompute key ------------------------------------------
//
// groundFor (core/ground.js) is the slow step inside composeWithMeta: it
// re-derives hue, luminance and chroma from the screenshot's own pixels
// every time it runs. Padding, radius, angle, frame, caption etc. never
// touch it — only the images themselves, `config.ground` (which normalise()
// turns into forceHue) and `config.tone` do.
//
// composeWithMeta has no parameter for a precomputed ground/meta and no way
// to skip its internal groundFor call — it is a single, monolithic pipeline
// by design (that IS the "one render path" guarantee). So this key cannot
// stop that recomputation from happening on every render() call; nothing on
// our side of the makeCanvas/config boundary can. What it DOES give later
// code (the swatches in Task 5, say) is a cheap, correct answer to "did the
// ground actually change since the last render", without re-deriving it —
// composeWithMeta already computed and returned `meta` as part of doing its
// job, so nothing here calls groundFor a second time. See task-2-report.md,
// "Concerns", for the fuller version of this note.
function groundKey(s) {
  const mobileIds = s.images.mobile.map((m) => m.__id).join(',');
  return `${s.images.web ? s.images.web.__id : ''}|${mobileIds}|${s.config.ground ?? ''}|${s.config.tone ?? ''}`;
}

/**
 * Recompose the on-page canvas from the current state and return the fresh
 * `meta`. This is the ONLY function in the app that calls composeWithMeta.
 * A no-op (returns null, leaves the canvas exactly as it was) when there is
 * nothing to draw yet.
 */
export function render() {
  if (!canvasEl) throw new Error('render() called before bindCanvas()');
  if (!state.images.web && state.images.mobile.length === 0) return null;

  const { meta } = composeWithMeta(canvasEl, state.config, state.images, pooledCanvas);
  state.meta = meta;
  state._groundKey = groundKey(state);
  return meta;
}

// --- Debounce: one requestAnimationFrame per burst ----------------------
//
// A slider fires many 'input' events while it drags. Calling render() from
// every single one would call composeWithMeta (a full recompose, including
// the groundFor pass above) far more often than the screen can even show a
// new frame. Collapsing every call within one animation frame into a single
// render() call is the standard fix, and is enough on its own to keep a drag
// smooth regardless of how many 'input' events the browser fires.
let rafHandle = null;

export function scheduleRender() {
  if (rafHandle !== null) return;
  rafHandle = requestAnimationFrame(() => {
    rafHandle = null;
    render();
  });
}

/**
 * Decode and adopt a batch of dropped/browsed files.
 *
 * - A landscape file becomes the web screenshot (the last one wins, if the
 *   batch somehow contains more than one).
 * - Portrait files are appended to the phone list, kept in drop order and
 *   capped at MAX_PHONES total (existing + new) — extras are silently
 *   dropped, matching core/'s own "phone that overflows the max is never
 *   drawn" behaviour rather than erroring.
 * - Files that fail to decode never touch `state.images` at all: if EVERY
 *   file in the batch is bad, state.images (and therefore the last good
 *   render) is untouched. That is the whole point of collecting errors
 *   instead of throwing — a bad drop is an inline message, never a wiped
 *   canvas.
 *
 * Returns an array of human-readable error strings (empty if every file in
 * the batch decoded).
 */
export async function addFiles(files) {
  const { web, mobile, errors } = await decodeFiles(files);

  if (web) state.images.web = web;
  if (mobile.length) {
    state.images.mobile = [...state.images.mobile, ...mobile].slice(0, MAX_PHONES);
  }

  if (web || mobile.length) render();
  return errors;
}

export function hasContent() {
  return !!(state.images.web || state.images.mobile.length);
}
