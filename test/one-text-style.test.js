import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ONE TEXT STYLE.
//
// Rock, 2026-09-07, after I claimed "Stroke" was the only heading styled
// wrong and he told me to look again: *"Your design has one text style. Mine
// has nine."* He was right. Node 7:130 is 12px Inter Medium white almost
// everywhere - section names, chips, tabs, segmented cells, slider labels AND
// their values. The app had four font sizes and five greys.
//
// The base is now on `body`, and this file is what stops the nine coming
// back: every rule that sets font-size or font-weight must be on the list
// below, and every entry names why. A new one fails until someone either
// deletes it or writes down which node it comes from.

const css = readFileSync('web/style.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const ALLOWED = new Map([
  ['body', 'the base: 12px Inter Medium'],
  ['button,\ninput', 'form controls do not inherit type on their own'],
  ['.section-label', 'a heading does not inherit either, it has UA defaults'],
  ['.btn-block', '12.5px, node 7:291 (the Export button)'],
  ['.template-row .dim', '10.5px Regular, node 7:693'],
  ['.size-trigger-dims', '9px Regular, node 7:661'],
  ['.export-footnote', '10.5px Regular, node 7:292'],
  ['.preset-tile-label', '11px Medium, node 7:184'],
  // Not in Rock's frame: the brand glyphs are letterforms in a box, and the
  // empty state is a screen his design does not draw.
  ['.brand-mark', 'the S glyph, a mark not a label'],
  ['.brand-name', 'the wordmark'],
  ['.rail-mark', 'the S glyph in the rail'],
  ['.dropzone-title', 'the empty state, which the design does not draw'],
  ['.dropzone-sub', 'the empty state'],
  ['.dropzone-dims', 'the empty state'],
  ['.cli-command', 'the CLI card, which is on its way out'],
  ['.cli-status', 'the CLI card'],
]);

/** Every `selector { ... }` in the file, at-rule bodies included. */
function rules() {
  const out = [];
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push([sel.trim().split('\n').slice(-2).join('\n').trim(), body]);
  }
  return out;
}

describe('the app has one text style', () => {
  it('sets font-size and font-weight nowhere but the listed exceptions', () => {
    const strays = [];
    for (const [sel, body] of rules()) {
      if (!/font-size:|font-weight:/.test(body)) continue;
      if (ALLOWED.has(sel)) continue;
      strays.push(sel);
    }
    expect(
      strays,
      'each of these needs a design node to justify it, or the base is enough',
    ).toEqual([]);
  });

  it('states the base on body, so everything else can inherit it', () => {
    const decls = rules().filter(([sel]) => sel === 'body').map(([, b]) => b).join('');
    expect(decls).toContain('font-size: 12px');
    expect(decls).toContain('font-weight: 500');
  });

  it('never paints UI text in a grey the design does not use', () => {
    // Rock's frame has exactly three non-white text colours: --text-muted on
    // the sampled subtitle and the two pixel readouts, and --text-inert on
    // "Ready to export". --text-secondary is used for no text at all.
    const users = [];
    for (const [sel, body] of rules()) {
      if (/color:\s*var\(--text-secondary\)/.test(body)) users.push(sel);
    }
    expect(users, '--text-secondary is not a text colour in node 7:130').toEqual([]);
  });
});
