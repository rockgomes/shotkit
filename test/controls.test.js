import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

function codeOf(path) {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// ---------------------------------------------------------------------
// Cycle D Task 4. STRUCTURAL GUARDS over the panel sources, in the same
// family as the `linear-gradient` guard in test/preset-tiles.test.js.
//
// They cannot show that a Reset WORKS — the browser check in this task's
// steps does that, slider by slider. What they buy is that the next slider
// someone adds cannot quietly skip it, which is exactly how Padding, Corner
// radius, Shadow and Stroke width came to have none: Cycle C built the
// Reset inside one panel's own closure.
// ---------------------------------------------------------------------
describe('every slider is built by the same function (Task 4)', () => {
  const panels = ['web/inspector-background.js', 'web/inspector-frame.js'];

  it('no panel builds a range input by hand any more', () => {
    for (const p of panels) {
      expect(codeOf(p), `${p} still builds a raw range input`)
        .not.toMatch(/\.type\s*=\s*'range'/);
    }
  });

  it('and every panel gets its rows from web/controls.js', () => {
    for (const p of panels) {
      expect(codeOf(p), `${p} does not import makeSliderRow`)
        .toContain("from './controls.js'");
    }
  });

  it('the shared row owns the Reset, so no panel can ship a slider without one', () => {
    const controls = codeOf('web/controls.js');
    expect(controls).toContain('slider-reset');
    expect(controls).toContain('#icon-reset');
    // Disabled, never hidden: a button that vanishes makes the row jump
    // mid-drag and hides that the control has a default at all.
    expect(controls).toMatch(/reset\.disabled\s*=/);
    expect(controls).not.toMatch(/reset\.hidden\s*=/);
  });

  it('and the two duplicate syncSliderFill copies are gone', () => {
    // Seven identical lines in each panel before this task. One home now.
    for (const p of panels) {
      expect(codeOf(p), `${p} still has its own syncSliderFill`)
        .not.toContain('function syncSliderFill');
    }
  });

  it('the fill reads the LIVE min/max, not the ones passed in', () => {
    // Corner radius rewrites its own maximum when the selected element
    // changes — a phone's corner range is not a browser's — so a fill
    // computed from the constructor's arguments would be wrong for it.
    const controls = codeOf('web/controls.js');
    expect(controls).toMatch(/Number\(input\.min\)/);
    expect(controls).toMatch(/Number\(input\.max\)/);
  });
});
