import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalise } from '../core/config.js';
import { layout } from '../core/layout.js';
import { hitTest } from '../web/selection.js';

const lay = (o = {}) => layout(
  normalise({ layout: 'web+mobile', ratio: '3:2', ...o }),
  { web: 1.6, mobile: [0.462] },
);

describe('hit-testing the canvas', () => {
  it('the middle of the web shot selects web', () => {
    const l = lay();
    expect(hitTest(l, l.web.x + l.web.w / 2, l.web.y + l.web.h / 2)).toBe('web');
  });

  it('the middle of the phone selects mobile', () => {
    const l = lay();
    const p = l.phones[0];
    expect(hitTest(l, p.x + p.w / 2, p.y + p.h / 2)).toBe('mobile');
  });

  // PAINTING ORDER DECIDES OVERLAPS, and this is the assertion that proves
  // the hit test knows it. core/index.js paints the web shot and then the
  // phones, and in the web+mobile layout the phone deliberately rises out of
  // the web shot's bottom-right corner - so there is a region inside BOTH
  // boxes. Testing the web box first would select the thing underneath the
  // one you clicked.
  it('the phone wins where it overlaps the web shot — it is drawn on top', () => {
    const l = lay();
    const p = l.phones[0];
    const x = p.x + 4, y = p.y + p.h * 0.25;
    // The point really is inside both, or this proves nothing.
    expect(x).toBeGreaterThan(l.web.x);
    expect(x).toBeLessThan(l.web.x + l.web.w);
    expect(y).toBeGreaterThan(l.web.y);
    expect(y).toBeLessThan(l.web.y + l.web.h);
    expect(hitTest(l, x, y)).toBe('mobile');
  });

  // The composite's OUTER box, not the screenshot inside it: a browser bar
  // and a phone's bezel are part of the element you are selecting, and
  // clicking a phone's bezel plainly means the phone.
  it('the frame counts as part of the element', () => {
    const l = lay({ elements: { web: { frameKind: 'browser' } } });
    const barY = l.web.y + l.web.chrome.barH / 2;
    expect(barY).toBeLessThan(l.web.chrome.screen.y);
    expect(hitTest(l, l.web.x + l.web.w * 0.3, barY)).toBe('web');
  });

  it('the bare ground selects nothing', () => {
    const l = lay();
    expect(hitTest(l, 4, 4)).toBeNull();
  });

  it('an empty layout selects nothing rather than throwing', () => {
    expect(hitTest({ web: null, phones: [] }, 100, 100)).toBeNull();
    expect(hitTest(null, 100, 100)).toBeNull();
  });
});

// Strip comments, so the guard below reads CODE and not prose. It earned
// this the moment it was written: the first run failed on the word
// `getContext` inside this module's own doc comment explaining why it must
// never call it. That is a false positive, and it is also evidence the
// guard is live rather than decorative.
function codeOf(path) {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('the selection never reaches the canvas', () => {
  it('web/selection.js does not touch a canvas at all', () => {
    // Structural, and deliberately so: the preview canvas IS the export
    // canvas, so an outline painted into it would ship inside every PNG. A
    // pixel test would only catch the compositions someone thought to
    // render; this catches the capability.
    const src = codeOf('web/selection.js');
    for (const banned of ['getContext', 'drawImage', 'fillRect', 'putImageData']) {
      expect(src, `web/selection.js must not contain "${banned}"`).not.toContain(banned);
    }
  });

  it('and the guard can actually fail', () => {
    // The comment-stripping above could have been written so loosely that
    // it swallowed the code too, leaving a guard that passes on anything.
    // core/render.js is a file that unquestionably calls getContext.
    expect(codeOf('core/render.js')).toContain('getContext');
  });
});

// --- The canvas carries no focus ring (Cycle B Task 6, fix round 1) ------
//
// A `tabindex` and a `:focus-visible` ring were added to the canvas and
// removed the same day. Pressing Escape made a 2px ring appear around the
// whole shot - indistinguishable from the selection outline - so it read as
// "the entire composition is selected", and clicking an element afterwards
// looked like two selections at once. Rock found it on the preview.
//
// This pins the decision rather than the pixels, because the pixels need a
// real browser and a real key press to reproduce at all: `:focus-visible`
// only matches after genuine keyboard interaction, which is why the first
// synthetic probe of this bug came back clean.
//
// DELETE THIS TEST when keyboard selection is built. At that point the
// canvas SHOULD be focusable - but its indicator must be the selection
// outline itself, never a second ring beside it.
describe('the canvas has no focus ring that could pass for a selection', () => {
  it('is not focusable while there is no keyboard way to select', () => {
    const html = readFileSync('web/index.html', 'utf8');
    const canvasTag = html.match(/<canvas[^>]*id="renderCanvas"[^>]*>/)[0];
    expect(canvasTag).not.toContain('tabindex');
  });

  it('has no focus-visible rule of its own', () => {
    expect(codeOf('web/style.css')).not.toContain('.render-canvas:focus-visible');
  });
});
