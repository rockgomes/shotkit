import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { EXPORT_FORMATS } from '../web/export.js';

// THE FORMAT CONTROL IS A MENU, and this file is what keeps it one.
//
// It shipped as a button that swapped its own label PNG -> JPEG -> WEBP on
// click. Nothing opened, so two of the three formats were never visible and
// the control read as dead. Rock, 2026-09-07: *"it should 100% be [a
// dropdown] and I have already complained about this before."*
//
// There is no jsdom in this project (vitest.config.js runs the node
// environment), so these read the shipped markup as text. That is enough for
// the contract that actually broke: the options the menu offers are the
// formats web/export.js can encode, and the button is wired to a listbox.

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

/** The whole `<div class="select" id="exportFormatField">…</div>` block. */
function formatField() {
  const start = html.indexOf('id="exportFormatField"');
  expect(start, 'the format field is gone from web/index.html').toBeGreaterThan(-1);
  const end = html.indexOf('</div>', html.indexOf('</div>', start) + 1);
  return html.slice(start, end);
}

describe('the export format menu', () => {
  it('offers exactly the formats web/export.js can encode, in order', () => {
    const offered = Array.from(formatField().matchAll(/data-format="([a-z0-9]+)"/g)).map(
      (m) => m[1],
    );
    expect(offered).toEqual(EXPORT_FORMATS);
  });

  it('is a listbox the button opens, not a button that cycles', () => {
    const field = formatField();
    expect(field).toContain('aria-haspopup="listbox"');
    expect(field).toContain('aria-expanded="false"');
    expect(field).toContain('role="listbox"');
    // aria-controls must name the menu that is actually there.
    const controls = field.match(/aria-controls="([^"]+)"/);
    expect(controls, 'the button does not point at a menu').not.toBeNull();
    expect(field).toContain(`id="${controls[1]}"`);
    // The menu is closed on load: `hidden`, which the global
    // `[hidden] { display: none !important }` rule enforces.
    expect(field).toMatch(/role="listbox"[^>]*hidden/);
  });

  it('marks exactly one option selected, and it is the format the button shows', () => {
    const field = formatField();
    const selected = Array.from(field.matchAll(/data-format="([a-z0-9]+)" aria-selected="true"/g));
    expect(selected.length, 'a listbox with no single selected option').toBe(1);
    expect(selected[0][1]).toBe(EXPORT_FORMATS[0]);
    // The button's own label and accessible name agree with it.
    expect(field).toContain(`aria-label="Export format: ${EXPORT_FORMATS[0].toUpperCase()}"`);
  });
});

describe('the format menu behaviour in web/main.js', () => {
  const main = readFileSync(new URL('../web/main.js', import.meta.url), 'utf8');

  it('closes on Escape and on a click outside', () => {
    expect(main).toContain("'Escape'");
    expect(main).toContain("addEventListener('pointerdown'");
  });

  it('never cycles the format on click again', () => {
    // The old behaviour, exactly: an index walked with %.
    expect(main).not.toMatch(/indexOf\(exportFormat\)/);
  });
});
