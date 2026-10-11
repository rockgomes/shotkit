import { describe, it, expect, beforeEach } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import { state, bindCanvas, render, removeImage, clearImages, hasContent } from '../web/state.js';

// REMOVING A SHOT.
//
// Rock, 2026-10-12: *"what if I wanna just delete one of the shots I
// uploaded?"* He could not. `addFiles` was the only thing that had ever
// written to `state.images`, and it only ever added: a phone shot dropped by
// mistake was stuck until a page reload, which also threw away every slider.
//
// This drives the REAL web/state.js, the same module the app calls, through
// @napi-rs/canvas under vitest's node environment - the pattern
// test/web-export.test.js established after a local fixture let a genuine
// leak through the production path go green.

const mk = (w, h) => createCanvas(w, h);

/** A stand-in for a decoded bitmap: a drawable with the two fields
 *  web/decode.js stamps on every one it produces. */
function shot(name, id, w = 1200, h = 800) {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4466cc';
  ctx.fillRect(0, 0, w, h);
  c.__id = id;
  c.__name = name;
  return c;
}

beforeEach(() => {
  state.config = { ratio: '3:2' };
  state.images.web = null;
  state.images.mobile = [];
  state.meta = null;
  state.lay = null;
  state.selection = null;
  state.surround = 'mid';
  bindCanvas(createCanvas(10, 10), mk);
});

describe('removeImage', () => {
  it('removes the desktop shot and leaves the phones alone', () => {
    state.images.web = shot('desk.png', 1);
    state.images.mobile = [shot('a.png', 2, 400, 800)];

    expect(removeImage(1)).toBe(true);
    expect(state.images.web).toBeNull();
    expect(state.images.mobile.map((m) => m.__name)).toEqual(['a.png']);
    expect(hasContent()).toBe(true);
  });

  it('removes THE ONE phone asked for, not the first', () => {
    // The whole point of the feature. An index-keyed remove passes a test
    // that only ever deletes from the front; this one deletes the middle.
    state.images.mobile = [
      shot('a.png', 10, 400, 800),
      shot('b.png', 11, 400, 800),
      shot('c.png', 12, 400, 800),
    ];

    expect(removeImage(11)).toBe(true);
    expect(state.images.mobile.map((m) => m.__name)).toEqual(['a.png', 'c.png']);
  });

  it('does nothing, and says so, for an id that is not loaded', () => {
    state.images.web = shot('desk.png', 1);
    expect(removeImage(999)).toBe(false);
    expect(state.images.web.__name).toBe('desk.png');
  });
});

describe('clearImages', () => {
  it('empties both slots', () => {
    state.images.web = shot('desk.png', 1);
    state.images.mobile = [shot('a.png', 2, 400, 800)];

    expect(clearImages()).toBe(true);
    expect(state.images.web).toBeNull();
    expect(state.images.mobile).toEqual([]);
    expect(hasContent()).toBe(false);
  });

  it('leaves the config alone: Clear means a new shot, not a new project', () => {
    state.config = { ratio: '16:9', pad: 9.5 };
    state.images.web = shot('desk.png', 1);
    clearImages();
    expect(state.config).toEqual({ ratio: '16:9', pad: 9.5 });
  });

  it('reports false when there was nothing to clear', () => {
    expect(clearImages()).toBe(false);
  });
});

describe('what a removal has to take with it', () => {
  it('drops a selection pointing at a shot that is gone', () => {
    state.images.web = shot('desk.png', 1);
    state.selection = 'web';
    removeImage(1);
    expect(state.selection).toBeNull();
  });

  it('keeps a selection whose class still has a shot in it', () => {
    state.images.mobile = [shot('a.png', 10, 400, 800), shot('b.png', 11, 400, 800)];
    state.selection = 'mobile';
    removeImage(10);
    expect(state.selection).toBe('mobile');
  });

  it('drops the sampled meta, so no hue outlives the picture it came from', () => {
    state.images.web = shot('desk.png', 1);
    render();
    expect(state.meta, 'the fixture never rendered, so this proves nothing').not.toBeNull();

    clearImages();
    expect(state.meta).toBeNull();
    expect(state.lay).toBeNull();
  });

  it('wipes the canvas when the last shot goes', () => {
    // THE PREVIEW CANVAS IS THE EXPORT CANVAS. render() returns early with
    // no images, so without an explicit clear the last shot stays painted in
    // the buffer every export reads from.
    const el = createCanvas(300, 200);
    bindCanvas(el, mk);
    state.images.web = shot('desk.png', 1);
    render();

    const painted = el.getContext('2d').getImageData(150, 100, 1, 1).data;
    expect(painted[3], 'nothing was painted, so the clear below proves nothing')
      .toBeGreaterThan(0);

    clearImages();
    const after = el.getContext('2d').getImageData(150, 100, 1, 1).data;
    expect(Array.from(after)).toEqual([0, 0, 0, 0]);
  });
});

// ---------------------------------------------------------------------
// THE CONTROLS THAT REACH IT
//
// A removal function with no button is a feature that cannot be previewed,
// which is the one thing this project's own rules forbid. These read the
// shipped markup and CSS, since there is no jsdom here.
// ---------------------------------------------------------------------

describe('the shot list is reachable', () => {
  const html = readFileSync('web/index.html', 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const css = readFileSync('web/style.css', 'utf8');

  it('ships the list, the Clear button and an X to draw in them', () => {
    expect(html).toContain('id="fileList"');
    expect(html).toContain('id="clearShotsBtn"');
    expect(html).toContain('<symbol id="icon-x"');
  });

  it('builds a named remove button per shot, not one for the lot', () => {
    const main = readFileSync('web/main.js', 'utf8');
    // The label has to name WHICH shot, or four identical "Remove" buttons
    // are four coin flips to a screen reader.
    expect(main).toMatch(/aria-label.*Remove \$\{kind\}, \$\{img\.__name\}/);
    expect(main).toContain("remove.dataset.id = String(img.__id)");
  });

  it('never hides a .btn-ghost on a narrow viewport again', () => {
    // A `@media (max-width: 559px) { .btn-ghost { display: none } }` rule
    // shipped for cycles. It was written for the toolbar's Copy button and
    // also hit the Custom size tab's "Apply", so committing a custom W/H
    // was impossible on a phone, and then it swallowed the Clear button
    // too: `hidden === false`, `display: none`, 0px wide.
    //
    // Comments stripped first, or this finds the post-mortem above the
    // deleted rule and fails on the fix.
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const offenders = [];
    for (const [, sel, body] of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/\.btn-ghost\s*[,{]|\.btn-ghost\s*$/.test(sel)) continue;
      if (/display:\s*none/.test(body)) offenders.push(sel.trim());
    }
    expect(offenders, '.btn-ghost is being hidden by a rule again').toEqual([]);
  });
});
