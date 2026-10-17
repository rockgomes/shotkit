import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { state } from '../web/state.js';
import { exportFilenameFor } from '../web/export.js';

// THE EXPORT FILENAME IS CHOSEN BY WHOEVER NAMED THE SCREENSHOT.
//
// Audit finding S2. Measured on the live app, 2026-10-17: a screenshot
// loaded under a hostile name put 348 characters into the `download`
// attribute, including `<`, `>` and U+202E, the right-to-left override.
//
// Nothing executes - the file is a PNG blob either way - so this is
// deception, not code execution: a bidi override makes the name in the
// download shelf read as a different extension than the one saved.

const shot = (name) => ({ __name: name, __id: 1 });

beforeEach(() => {
  state.config = { ratio: '3:2' };
  state.images.web = null;
  state.images.mobile = [];
});

describe('the stem taken from a source filename', () => {
  const nameFor = () => exportFilenameFor('png', 2);

  it('keeps an ordinary name intact', () => {
    state.images.web = shot('Screenshot 2026-10-17 at 09.14.22.png');
    expect(nameFor()).toBe('Screenshot 2026-10-17 at 09.14.22--web@2x.png');
  });

  it('drops the path, including a Windows one', () => {
    state.images.web = shot('C:\\Users\\rock\\shot.png');
    expect(nameFor()).toBe('shot--web@2x.png');
  });

  it('strips every bidi control, which is the actual attack', () => {
    state.images.web = shot('shot\u202Egnp.exe.png');
    const out = nameFor();
    expect(out).not.toMatch(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/);
    expect(out).toBe('shotgnp.exe--web@2x.png');
  });

  it('strips control characters, newlines included', () => {
    state.images.web = shot('a\nb\tc.png');
    expect(nameFor()).toBe('abc--web@2x.png');
  });

  it('strips the characters a filesystem would rather not see', () => {
    state.images.web = shot('<img src=x onerror=alert(1)>.png');
    expect(nameFor()).not.toMatch(/[<>:"/\\|?*]/);
  });

  it('cannot make the saved file hidden', () => {
    state.images.web = shot('...hidden.png');
    expect(nameFor()).toBe('hidden--web@2x.png');
  });

  it('caps the length', () => {
    state.images.web = shot(`${'A'.repeat(500)}.png`);
    const out = nameFor();
    // 348 characters was the measured reading before this existed.
    expect(out.length).toBeLessThan(200);
  });

  it('falls back when nothing usable survives the stripping', () => {
    state.images.web = shot('\u202E\u202E\u202E.png');
    expect(nameFor()).toBe('shotkit--web@2x.png');
  });

  it('still names the format and the scale', () => {
    state.images.web = shot('a.png');
    expect(exportFilenameFor('jpeg', 3)).toBe('a--web@3x.jpg');
    expect(exportFilenameFor('webp', 1)).toBe('a--web@1x.webp');
  });
});

describe('the sanitiser is the only way a name reaches a download', () => {
  it('exportShot builds its filename through it', () => {
    const src = readFileSync('web/export.js', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src).toContain('const filename = exportFilenameFor(format, scale)');
  });
});
