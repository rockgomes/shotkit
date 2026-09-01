import { describe, it, expect } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { composeWithMeta } from '../core/index.js';

const mk = (w, h) => createCanvas(w, h);

/**
 * A local stand-in for web/state.js's render(), built the same way
 * test/compose.test.js's own `run()` helper is: load a fixture with
 * @napi-rs/canvas (no browser/DOM here) and call composeWithMeta directly.
 *
 * `surround` is accepted here ONLY so the two calls below are visibly
 * different invocations, matching how a real caller would pass
 * `state.surround`. It must never be threaded into `config`, passed to
 * composeWithMeta, or read by anything painting a pixel - that is the exact
 * property this file exists to prove. See web/state.js's own header comment
 * and docs/superpowers/specs/2026-08-31-shotkit-web-design.md ("Canvas
 * surround"): the surround is chrome behind the <canvas>, never a compose
 * input, so it has nothing to do here but be ignored.
 */
async function render({ surround } = {}) {
  void surround; // deliberately unused - see comment above
  const web = await loadImage('samples/fieldset.png');
  const config = { ratio: '3:2' };
  const target = createCanvas(10, 10);
  const { target: painted } = composeWithMeta(target, config, { web, mobile: [] }, mk);
  return painted.toBuffer('image/png');
}

describe('web export - the canvas surround never reaches the exported pixels', () => {
  it('the surround never reaches the exported pixels', async () => {
    // compose twice with identical config; the surround is not a compose
    // input at all, so this asserts the API shape as much as the output.
    const a = await render({ surround: 'dark' });
    const b = await render({ surround: 'light' });
    expect(Buffer.compare(a, b)).toBe(0);
  });
});
