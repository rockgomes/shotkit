import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalise } from '../core/index.js';
import { activeGrainPercent, setGrainPercent } from '../web/inspector-canvas.js';

function codeOf(path) {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// ---------------------------------------------------------------------
// Cycle D Task 3. Grain paints on the GROUND and only on the ground —
// Cycle A Task 4b moved it under the shots for exactly that reason — so it
// describes the canvas, not whichever element you clicked. It was living
// in a section headed "Finish · Desktop", which names one.
//
// Padding is deliberately still in web/inspector-frame.js. Rock, 2026-09-06:
// "Padding to me still makes sense on the right, since visually it moves
// the elements."
// ---------------------------------------------------------------------
describe('grain belongs to the canvas (Task 3)', () => {
  it('round-trips through the real normalise(), so the panel agrees with core/', () => {
    const config = {};
    setGrainPercent(config, 42);
    expect(activeGrainPercent(config)).toBe(42);
    expect(normalise(config).grain).toBeCloseTo(0.42, 6);
  });

  it('clamps at both ends', () => {
    const config = {};
    setGrainPercent(config, -10);
    expect(activeGrainPercent(config)).toBe(0);
    setGrainPercent(config, 250);
    expect(activeGrainPercent(config)).toBe(100);
  });

  it('and is gone from the element module, not merely re-exported', () => {
    // A second home for one value is the defect that killed the shadow
    // slider in Cycle A Task 5b. Moving means moving.
    const frame = codeOf('web/inspector-frame.js');
    expect(frame).not.toContain('setGrainPercent');
    expect(frame).not.toContain('activeGrainPercent');
  });

  it('while padding stays with the element panel, on purpose', () => {
    // Not an oversight, and not the spec's original plan either — the spec
    // put both on the left. Rock reversed it for padding on 2026-09-06.
    const frame = codeOf('web/inspector-frame.js');
    expect(frame).toContain('setPadPercent');
    expect(codeOf('web/inspector-canvas.js')).not.toContain('setPadPercent');
  });

  it('the Canvas section sits in the left panel', () => {
    const html = readFileSync('web/index.html', 'utf8');
    const at = (id) => {
      const i = html.indexOf(`id="${id}"`);
      expect(i, `${id} not found`).toBeGreaterThan(-1);
      return i;
    };
    expect(at('canvasSection')).toBeGreaterThan(at('sidebar'));
    expect(at('canvasSection')).toBeLessThan(at('stage'));
  });
});
