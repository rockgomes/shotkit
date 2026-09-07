import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// THE RESET BUTTON, after Rock looked at it (2026-09-07):
//   "the 'reset' button doesn't look like the design. in my design is it
//    inverted when it is active. also this icon looks broken"
//
// Both were true, and the second one was true for a reason worth writing
// down. The old glyph was:
//
//     <path d="M3 10a9 9 0 1 1 2.2 5.9" />   a 319-degree arc, centre (12,10)
//     <path d="M3 4.5V10h5.5" />             a corner bracket at (3,10)
//
// The arc STARTS at (3,10) and ENDS at (5.2,15.9). The bracket sits on the
// start, where the stroke continues in both directions, so its upright hung
// off the outside of the ring and its arm cut into the middle of it - while
// the ring's own gap sat 40 degrees away, at the end. A rotate icon reads
// only when the bracket IS the arc's termination.

const html = readFileSync('web/index.html', 'utf8');
const css = readFileSync('web/style.css', 'utf8');

function resetSymbol() {
  const start = html.indexOf('<symbol id="icon-reset"');
  expect(start, 'the reset icon is gone').toBeGreaterThan(-1);
  return html.slice(start, html.indexOf('</symbol>', start));
}

describe('the reset icon', () => {
  it('is not the broken glyph again', () => {
    const svg = resetSymbol();
    expect(svg).not.toContain('M3 10a9 9 0 1 1 2.2 5.9');
    expect(svg).not.toContain('M3 4.5V10h5.5');
  });

  it('ends its arc where the arrow bracket turns', () => {
    const svg = resetSymbol();
    // Lucide's rotate-ccw. The arc's last command is `L3 8`; the bracket is
    // `M3 3v5h5`, whose corner is (3,8). Same point, which is the whole
    // property the old pair failed.
    const arc = svg.match(/d="(M3 12a9 9[^"]*)"/);
    const bracket = svg.match(/d="(M3 3v5h5)"/);
    expect(arc, 'the arc path changed shape').not.toBeNull();
    expect(bracket, 'the arrow bracket changed shape').not.toBeNull();
    expect(arc[1].endsWith('L3 8'), `arc ends at ${arc[1].slice(-6)}, not (3,8)`).toBe(true);
  });
});

describe('the reset button is inverted while it can do something', () => {
  function rule(selector) {
    const at = css.indexOf(`\n${selector} {`);
    expect(at, `${selector} is not in web/style.css`).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf('}', at));
  }

  it('is white with a window-dark glyph when live', () => {
    const live = rule('.slider-reset');
    expect(live).toContain('background: var(--text-primary)');
    expect(live).toContain('color: var(--surface-window)');
  });

  it('goes back to the dark box when off, in BOTH off states', () => {
    // `[inert]` is not `:disabled`: an inert section's buttons never match
    // the pseudo-class, and the app opens with the whole Background panel
    // inert. Asserting only the pseudo-class is how the app shipped a panel
    // of inert-grey FILLED resets for one commit.
    const off = rule('.inspector-section[inert] .slider-reset,\n.slider-reset:disabled');
    expect(off).toContain('background: var(--surface-control)');
    expect(off).toContain('color: var(--text-inert)');
  });

  it('never dims with opacity, like every other off state here', () => {
    const at = css.indexOf('.slider-reset {');
    const block = css.slice(at, css.indexOf('.slider-reset:focus-visible', at));
    expect(block).not.toMatch(/opacity:/);
  });
});
