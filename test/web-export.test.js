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
// See the fix-round section of task-2-report.md for the failing run this
// was re-verified against.
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
  it('the surround never reaches the exported pixels', async () => {
    const web = await loadImage('samples/fieldset.png');
    const target = createCanvas(10, 10);
    state.images.web = web;

    // compose twice with identical config; the surround is not a compose
    // input at all (see web/state.js's header comment: it lives only on
    // state.surround, never in state.config, never passed to
    // composeWithMeta), so this asserts the API shape as much as the output.
    //
    // `bindCanvas` is called again between the two renders SPECIFICALLY to
    // drop state.js's ground-meta cache (see its doc comment) and force two
    // genuinely independent composeWithMeta calls. Without that, both calls
    // share the same cache key here (nothing about the images or
    // config.ground/tone differs between them - only state.surround does,
    // and that is exactly the field under test), so the second render would
    // silently reuse the first's cached meta regardless of whether a bug
    // had made it depend on the surround - passing for the wrong reason.
    // Confirmed: with this reset removed, the "prove it fails" experiment
    // below (folding state.surround into config.tone) stayed GREEN, because
    // the leaked tone only reached the first of the two calls; put back,
    // the same break goes red. See task-2-report.md's fix-round section.
    state.surround = 'dark';
    bindCanvas(target, mkCanvas);
    render();
    const a = target.toBuffer('image/png');

    state.surround = 'light';
    bindCanvas(target, mkCanvas);
    render();
    const b = target.toBuffer('image/png');

    expect(Buffer.compare(a, b)).toBe(0);
  });
});
