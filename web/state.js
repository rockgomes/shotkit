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
  // The layout core/ just composed with - boxes in canvas space. Read-only
  // to everything outside state.js. The inspector needs it to know an
  // element's real width (Cycle B Task 3: a corner radius is a fraction of
  // the element, and the panel cannot guess it), and Task 6's hit-testing
  // needs the boxes themselves. Null until the first render.
  lay: null,
  // Which element the canvas has selected: 'web' | 'mobile' | null.
  // STATE ONLY - state.js holds state and calls core/, and knows nothing
  // about what an outline looks like. That lives in web/selection.js, which
  // may never touch a canvas: the preview canvas is the export canvas.
  selection: null,
};

// --- Scratch canvases -------------------------------------------------
//
// composeWithMeta never creates a canvas itself — it asks `makeCanvas(w, h)`
// for one every time it needs scratch space: the full-resolution target, one
// down-sampled (<=800px) thumbnail per source image for its colour analysis,
// a tile for the grain pass, and (Cycle A Task 4d) one tile per shot, which
// is where the shot is composed and cut before it is stamped onto the
// canvas. Those shot tiles are the only ones whose size follows the
// geometry, so they are the only ones a padding drag can ask for a new size
// of; core/ rounds their allocation up to a 64px grid (`TILE_QUANTUM`)
// precisely so that this pool stays small instead of growing by one
// multi-megabyte canvas per frame. During a slider drag this can run at up to
// 60fps (see the rAF debounce below), so reusing canvas elements by size —
// instead of allocating a fresh one on every single call — avoids garbage
// pressure that has nothing to do with core/'s own per-render work. This is
// pure plumbing on our side of the makeCanvas hook; it changes nothing about
// what gets painted.
//
// The factory itself is injectable (default: real DOM canvases, via
// `bindCanvas`'s second argument) rather than hardcoded to
// `document.createElement` — that's what lets test/web-export.test.js import
// and drive THIS module's actual `render()` under vitest's node environment
// (no `document` there) instead of maintaining a separate fixture that only
// tests its own copy of the logic. See that file's header comment.
function defaultMakeCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

const canvasPool = new Map();
let makeScratchCanvas = defaultMakeCanvas;

function pooledCanvas(w, h) {
  const key = `${w}x${h}`;
  let cv = canvasPool.get(key);
  if (!cv) {
    cv = makeScratchCanvas(w, h);
    canvasPool.set(key, cv);
  }
  cv.width = w;
  cv.height = h;
  return cv;
}

let canvasEl = null;

/** Point state.js at the <canvas> element render() paints into, and
 *  (optionally) at the factory it should use for scratch canvases —
 *  defaults to real DOM canvases, which is what main.js relies on by
 *  calling this with one argument. Called once from main.js during setup;
 *  a test passes both, wired to @napi-rs/canvas, to drive the real pipeline
 *  under Node. */
export function bindCanvas(el, canvasFactory = defaultMakeCanvas) {
  canvasEl = el;
  makeScratchCanvas = canvasFactory;
  canvasPool.clear();
  // Also drops any cached ground: a new canvas/factory is a new session,
  // and there is no reason a meta cached against whatever was bound before
  // should survive a rebind. (Fix round 1 originally leaned on this AS THE
  // way test/web-export.test.js forced two independent composeWithMeta
  // calls; fix round 2 removed that dependency - the guard no longer needs
  // any help from bindCanvas to catch a leak, see groundKeyFor's comment
  // below - so this line now exists purely for its own reason, not as
  // test choreography.)
  metaCache = null;
}

// --- Ground caching -----------------------------------------------------
//
// groundFor (core/ground.js) is the slow step inside composeWithMeta: it
// re-derives hue, luminance and chroma from the screenshot's own pixels
// every time it runs — measured, ~200ms of a ~216ms full render; layout,
// painting and grain together are single-digit ms. Padding, radius, angle,
// frame, shadow etc. never touch it — only the images themselves,
// `config.ground` (which normalise() turns into forceHue) and `config.tone`
// do.
//
// core/'s composeWithMeta now accepts an optional precomputed `meta` (Task 2
// fix round 1's authorised core/ change — see core/index.js) and skips its
// own groundFor call entirely when given one. This is the cache that makes
// that safe to use: `metaCache` remembers the meta returned by the last
// render KEYED on exactly the inputs that determine it.
//
// Fix round 2: `groundKeyFor` used to be called as `groundKey(state)`,
// reading `state.config`/`state.images` independently of what render()
// actually passed to composeWithMeta a few lines later. That is two sources
// of truth for the same thing, and a reviewer showed exactly why that is
// fragile: a version of render() that built a SEPARATE, transformed config
// object for the compose call (e.g. one that folded `state.surround` into
// `tone`) left the key computation looking at the untouched original — the
// leak was invisible to the cache, which kept returning a stale-but-matching
// meta and made the bug undetectable no matter how the test called render().
//
// The fix is not a sharper key, it is not having two objects to disagree in
// the first place: `images` and `config` below are declared ONCE, passed to
// groundKeyFor AND to composeWithMeta as the literal same references, with
// nothing in between that could rebuild either one differently for the two
// call sites. Any transformation applied while producing them — a real
// design decision, or a future bug — is read by the key exactly as it will
// be read by compose, because it is the same read. This is what lets
// test/web-export.test.js catch a leak with a warm cache and no cooperation
// from the test itself; see that file's header comment for the proof.
let metaCache = null; // { key, meta } | null

/** The only fields that can change what groundFor computes: the images
 *  themselves (by identity — `__id`, tagged in decode.js) and whichever of
 *  `config`'s fields normalise() turns into forceHue/tone. Everything else
 *  in `config` (pad, radius, angle, frame, shadow, scale, template, ...)
 *  is deliberately absent from this key — including any of those would
 *  bust the cache on every layout-only change and throw away the whole
 *  point of caching groundFor's result at all. */
function groundKeyFor(images, config) {
  const mobileIds = images.mobile.map((m) => m.__id).join(',');
  return `${images.web ? images.web.__id : ''}|${mobileIds}|${config.ground ?? ''}|${config.tone ?? ''}`;
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

  // `images` and `config` are what this render ACTUALLY composes with —
  // read once, right here, and handed to both groundKeyFor and
  // composeWithMeta below unchanged. See the comment above metaCache for
  // why that (not a sharper key) is the fix.
  const images = state.images;
  const config = state.config;

  const key = groundKeyFor(images, config);
  const cachedMeta = metaCache && metaCache.key === key ? metaCache.meta : null;

  const { meta, layout } = composeWithMeta(canvasEl, config, images, pooledCanvas, cachedMeta);
  state.meta = meta;
  state.lay = layout;
  state._groundKey = key;
  metaCache = { key, meta };
  for (const fn of afterRender) fn();
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

// --- After-render subscribers -------------------------------------------
//
// render() is the one path from config to pixels, and a few things in the
// shell have to run right after it - Cycle B Task 6's selection outline
// needs the layout render() just used. A subscriber list keeps that
// inversion here, where render() lives, rather than making every caller
// remember to do it, and keeps state.js free of any knowledge about what
// those subscribers do.
const afterRender = [];

export function onRender(fn) {
  afterRender.push(fn);
}

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
