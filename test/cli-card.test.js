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
