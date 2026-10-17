import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dropNotes, MAX_PHONES } from '../web/state.js';

// THE APP SAYS WHAT IT DID WITH YOUR FILES.
//
// Measured on the live app, 2026-10-17: five phone screenshots dropped in
// one go, three kept, two discarded, NOTHING said. `addFiles` capped the
// list with `.slice(0, MAX_PHONES)` and returned only decode errors, so a
// truncation was not an error and never reached the message strip. The app
// knew exactly what it had thrown away and chose not to mention it.
// Replacing the desktop screenshot was the same silence, smaller.
//
// `addFiles` itself cannot be tested here: it hangs off `createImageBitmap`,
// which node does not have. So the DECISION is a pure function and this
// drives that; the plumbing around it is two assignments.

describe('dropNotes', () => {
  const drop = (over) => dropNotes({
    replacingWeb: false, webName: undefined, incomingPhones: 0, existingPhones: 0, ...over,
  });

  it('says nothing when everything fit', () => {
    expect(drop({ incomingPhones: MAX_PHONES })).toEqual([]);
  });

  it('says how many phone shots did not fit', () => {
    // The measured case: five dropped onto an empty canvas.
    expect(drop({ incomingPhones: 5 })).toEqual([
      `Only ${MAX_PHONES} phone screenshots fit, so 2 were not added.`,
    ]);
  });

  it('uses the singular for exactly one', () => {
    expect(drop({ incomingPhones: 4 })[0]).toMatch(/so 1 was not added/);
  });

  it('counts what is already loaded, not just the batch', () => {
    // Two loaded, two more dropped: one fits, one does not.
    expect(drop({ incomingPhones: 2, existingPhones: 2 })[0]).toMatch(/so 1 was not added/);
  });

  it('does not go negative when the list is already full', () => {
    expect(drop({ incomingPhones: 1, existingPhones: MAX_PHONES })[0])
      .toMatch(/so 1 was not added/);
  });

  it('names the desktop screenshot it replaced', () => {
    expect(drop({ replacingWeb: true, webName: 'second.png' })).toEqual([
      'Replaced the desktop screenshot with "second.png".',
    ]);
  });

  it('says nothing about replacement on the first desktop shot', () => {
    expect(drop({ replacingWeb: false, webName: 'first.png' })).toEqual([]);
  });

  it('reports a replacement AND a truncation from one drop', () => {
    const notes = drop({ replacingWeb: true, webName: 'a.png', incomingPhones: 9 });
    expect(notes).toHaveLength(2);
  });
});

describe('the strip that shows them', () => {
  const main = readFileSync('web/main.js', 'utf8');
  const html = readFileSync('web/index.html', 'utf8');
  // Comments stripped, or this finds the note explaining the removal and
  // fails on the fix. Third time this file pattern has caught me out.
  const code = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('no longer calls everything a skipped file', () => {
    // A truncation is not a skipped file, and the old prefix said it was.
    expect(code).not.toContain('files were skipped');
  });

  it('passes addFiles\' whole return value to the strip', () => {
    // Not `errors` any more: the notes ride along in the same array, and a
    // caller that destructured only the errors would drop them silently,
    // which is the exact bug this commit exists to remove.
    expect(code).toContain('showDropNotes(await addFiles(fileList))');
  });

  it('announces, so a screen reader hears it', () => {
    expect(html).toMatch(/id="dropError"[^>]*role="alert"/);
  });
});
