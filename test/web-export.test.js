import { describe, it, expect, beforeEach } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { state, bindCanvas, render } from '../web/state.js';

// This imports and drives the REAL web/state.js render() - not a local
// fixture that mirrors its logic. A first version of this test defined its
// own local `render({ surround })` helper that called composeWithMeta
// directly, mirroring test/compose.test.js's `run()` pattern. That helper
// only ever exercised its own copy of the "don't thread the surround into
// config" logic: a reviewer broke the REAL render() in web/state.js (folded
// state.surround into config.tone before calling composeWithMeta - a
// genuine leak through the actual pipeline) and the suite stayed green,
// because nothing here ever called that code. The sixth test in this
// project that could not fail. Fixed by making web/state.js's canvas
// factory injectable (`bindCanvas(el, canvasFactory)`, defaulting to
// `document.createElement` for the real app, overridable here) so this file
// can import the production module under vitest's node environment (no
// `document`) and call its actual `render()`, driven by @napi-rs/canvas.
//
// Fix round 1 also gave render() a ground-meta cache (composeWithMeta skips
// groundFor when handed a matching precomputed meta). The FIRST version of
// this test's fix called `bindCanvas` a second time between the two renders
// below purely to flush that cache - otherwise both renders shared a cache
// key (nothing but state.surround differs between them) and the second one
// silently reused the first's cached meta, masking the exact leak this test
// exists to catch. A reviewer deleted that one line - reasonably: it looked
// like a redundant rebind of the same canvas to itself - and the false
// green came right back, with no cooperation from web/state.js's actual
// code needed.
//
// Fix round 2 removed the dependency on that line instead of relying on it:
// render()'s cache key is now derived from the EXACT `images`/`config`
// references it hands to composeWithMeta (see groundKeyFor's comment in
// web/state.js), not from a separate read of `state.config`. A leak that
// changes what reaches composeWithMeta necessarily changes what the key
// sees too, because they are the same read - so the cache busts itself the
// moment a leak like this exists, and this test needs no choreography
// (no extra bindCanvas, no manual cache reset) to catch it. See
// task-2-report.md's fix-round-2 section for the failing run this was
// re-verified against, with that extra bindCanvas call gone for good.
const mkCanvas = (w, h) => createCanvas(w, h);

beforeEach(() => {
  // Fresh state for every test - state.js's `state`/`metaCache`/canvas pool
  // are module-level singletons (by design: there is exactly one editor).
  state.config = { ratio: '3:2' };
  state.images = { web: null, mobile: [] };
  state.meta = null;
  state.surround = 'mid';
});

describe('web export - the canvas surround never reaches the exported pixels', () => {
  it('the surround never reaches the exported pixels (warm cache, no test choreography)', async () => {
    const web = await loadImage('samples/fieldset.png');
    const target = createCanvas(10, 10);
    bindCanvas(target, mkCanvas);
    state.images.web = web;

    // compose twice with identical config; the surround is not a compose
    // input at all (see web/state.js's header comment: it lives only on
    // state.surround, never in state.config, never passed to
    // composeWithMeta), so this asserts the API shape as much as the output.
    // No bindCanvas (or any other reset) between the two renders - the
    // second one runs with a WARM cache on purpose, which is exactly the
    // condition that used to hide a leak.
    state.surround = 'dark';
    render();
    const keyAfterFirst = state._groundKey;
    const a = target.toBuffer('image/png');

    state.surround = 'light';
    render();
    const b = target.toBuffer('image/png');

    // Self-check that this test is actually exercising the warm path it
    // claims to: both renders used the same web image and the same
    // config.ground/tone (only state.surround differs, and that's not part
    // of the key), so the cache key must be identical across both calls -
    // if it weren't, this test would be silently testing the cold path
    // again and the "no choreography" claim above would be false.
    expect(state._groundKey).toBe(keyAfterFirst);

    expect(Buffer.compare(a, b)).toBe(0);
  });
});
