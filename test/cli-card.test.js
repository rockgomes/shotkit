import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// NOTHING CLAIMS A CONNECTION THAT DOES NOT EXIST
//
// The sidebar's CLI card showed a green dot and the words "CLI connected"
// while the README's own "Not built yet" list said there is no CLI. Hidden
// on 2026-09-07, not deleted: the CLI is still planned and this is its
// design. Rock: "we are supposed to have CLI at some point, no?"
//
// This guard is about the CLAIM, not the card. Un-hiding it fails, and so
// does a second indicator growing somewhere else.
// ---------------------------------------------------------------------

describe('the app claims no live connection', () => {
  const html = readFileSync('web/index.html', 'utf8');

  it('keeps the CLI card hidden', () => {
    const at = html.indexOf('<div class="cli-card"');
    expect(at, 'the card was deleted; it is meant to be hidden').toBeGreaterThan(-1);
    expect(html.slice(at, at + 60)).toContain('hidden');
  });

  it('has no other visible status indicator', () => {
    const markup = html.replace(/<!--[\s\S]*?-->/g, '');
    // Every place the word appears must be inside the one hidden card.
    const card = markup.slice(markup.indexOf('<div class="cli-card"'));
    const cardEnd = card.indexOf('</div>');
    const inside = card.slice(0, cardEnd);
    const total = (markup.match(/connected|status-dot/g) || []).length;
    const here = (inside.match(/connected|status-dot/g) || []).length;
    expect(total, 'something outside the hidden card claims a connection').toBe(here);
  });
});

// ---------------------------------------------------------------------
// NOTHING SHIPS A CONTROL THAT GOES NOWHERE
//
// Rock, 2026-09-07: *"more things to hide from live, since we don't have
// anything there yet: the top-right actions - zoom, copy, export. the first
// left navigation bar, since we don't have those other areas yet."*
//
// Same rule as the CLI card, applied twice more. Rendering a disabled control
// for a feature that does not exist is a promise the app cannot keep, and
// "disabled" does not read as "not built" to anyone using it.
//
// Export is the one that WORKS, and it is hidden only because the right
// panel carries the same action next to the format and scale it uses. That
// is why the last test here exists: hiding the toolbar copy is safe exactly
// as long as the panel's own button is still there.
// ---------------------------------------------------------------------

describe('the unbuilt areas are hidden', () => {
  const html = readFileSync('web/index.html', 'utf8').replace(/<!--[\s\S]*?-->/g, '');

  it('hides the left rail, whose destinations do not exist', () => {
    const at = html.indexOf('<nav id="rail"');
    expect(at, 'the rail was deleted; it is meant to be hidden').toBeGreaterThan(-1);
    expect(html.slice(at, html.indexOf('>', at))).toContain('hidden');
  });

  it('hides the toolbar zoom / Copy / Export group', () => {
    const at = html.indexOf('<div class="toolbar-actions"');
    expect(at, 'the toolbar actions were deleted; they are meant to be hidden')
      .toBeGreaterThan(-1);
    expect(html.slice(at, html.indexOf('>', at))).toContain('hidden');
  });

  it('still leaves ONE way to export', () => {
    const at = html.indexOf('id="exportBtnPanel"');
    expect(at, 'the panel Export button is gone, so nothing can export').toBeGreaterThan(-1);
    // It lives in the right panel, not in the toolbar group that was hidden.
    expect(at, 'the only Export left is inside the hidden toolbar')
      .toBeGreaterThan(html.indexOf('</header>'));
    // And its own section is not hidden either.
    const sectionAt = html.lastIndexOf('<section', at);
    expect(html.slice(sectionAt, html.indexOf('>', sectionAt))).not.toContain('hidden');
  });
});
