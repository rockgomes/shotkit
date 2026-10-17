import { describe, it, expect, beforeEach } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import {
  state, bindCanvas, render, removeImage, clearImages, hasContent,
  undoRemoval, undoableRemoval, addFiles,
} from '../web/state.js';

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
  // The canvas first: draining the undo below can call render().
  bindCanvas(createCanvas(10, 10), mk);
  // `lastRemoval` is module state with no reset of its own, deliberately -
  // in the app a page load is the reset, and an exported clearUndo() would
  // exist only for these tests. Draining it is the honest way to isolate
  // them.
  while (undoRemoval());
  state.config = { ratio: '3:2' };
  state.images.web = null;
  state.images.mobile = [];
  state.meta = null;
  state.lay = null;
  state.selection = null;
  state.surround = 'mid';
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


// ---------------------------------------------------------------------
// FOCUS SURVIVES A REMOVAL
//
// Measured 2026-10-17: focus the second chip's remove button, activate it,
// and document.activeElement became <body>. renderFileList rebuilds every
// chip on each change, so the focused button stops existing. A keyboard
// user clearing three shots had to Tab from the top of the page each time.
//
// Verified in the browser after the fix: removing the middle chip lands on
// the chip that took its place, removing the last lands on the one before
// it, removing every chip lands on the drop zone, Clear lands on the drop
// zone, and a MOUSE removal leaves focus exactly where it was.
//
// There is no jsdom here, so these guard the two things that were actually
// wrong, in the source.
// ---------------------------------------------------------------------

describe('focus after a removal', () => {
  const main = readFileSync('web/main.js', 'utf8');

  it('reads the chip order BEFORE the list is rebuilt', () => {
    // Taken after renderFileList runs, the index means nothing: the button
    // it refers to has already been destroyed.
    const handler = main.slice(main.indexOf("fileList?.addEventListener('click'"));
    const body = handler.slice(0, handler.indexOf('});'));
    expect(body.indexOf('indexOf(btn)')).toBeLessThan(body.indexOf('afterImagesChanged()'));
  });

  it('falls through to the drop zone, never to the hidden Clear button', () => {
    // Clear hides itself the moment the last shot goes, and a hidden
    // element cannot take focus. A first version focused it and left focus
    // on <body> anyway.
    const fn = main.slice(main.indexOf('function restoreFocusAfterRemoval'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toContain('dropzone?.focus()');
    expect(body, 'focusing Clear here does nothing, it is hidden by now')
      .not.toContain('clearShotsBtn.focus()');
  });

  it('leaves focus alone when the removal came from the mouse', () => {
    const fn = main.slice(main.indexOf('function restoreFocusAfterRemoval'));
    expect(fn.slice(0, fn.indexOf('\n}'))).toContain('document.body');
  });
});


// ---------------------------------------------------------------------
// A REMOVAL CAN BE TAKEN BACK
//
// Audit finding U4: Clear removed up to four screenshots on one click,
// with no confirmation and no way back, and the files then had to be found
// and dropped again. A confirmation would make the common case worse to
// avoid a rare mistake. An undo makes the mistake free.
//
// It holds the decoded bitmaps, so undoing is an assignment, not a
// re-decode: the pictures never left memory, only the list pointing at
// them did.
// ---------------------------------------------------------------------

describe('undo', () => {
  it('puts a removed phone back WHERE IT WAS', () => {
    // Order is the point. Pushing it onto the end would "work" and be
    // wrong: Phone 2 would come back as Phone 3.
    state.images.mobile = [shot('a.png', 10, 400, 800), shot('b.png', 11, 400, 800),
      shot('c.png', 12, 400, 800)];
    removeImage(11);
    expect(state.images.mobile.map((m) => m.__name)).toEqual(['a.png', 'c.png']);

    expect(undoRemoval()).toBe(true);
    expect(state.images.mobile.map((m) => m.__name)).toEqual(['a.png', 'b.png', 'c.png']);
  });

  it('puts everything back after a clear', () => {
    state.images.web = shot('desk.png', 1);
    state.images.mobile = [shot('a.png', 10, 400, 800)];
    clearImages();
    expect(hasContent()).toBe(false);

    expect(undoRemoval()).toBe(true);
    expect(state.images.web.__name).toBe('desk.png');
    expect(state.images.mobile.map((m) => m.__name)).toEqual(['a.png']);
  });

  it('names what it would put back, for the message offering it', () => {
    state.images.web = shot('desk.png', 1);
    state.images.mobile = [shot('a.png', 10, 400, 800), shot('b.png', 11, 400, 800)];

    removeImage(11);
    expect(undoableRemoval()).toBe('Removed "b.png".');

    clearImages();
    expect(undoableRemoval()).toBe('Cleared 2 screenshots.');
  });

  it('uses the singular for one screenshot', () => {
    state.images.web = shot('only.png', 1);
    clearImages();
    expect(undoableRemoval()).toBe('Cleared 1 screenshot.');
  });

  it('offers nothing before anything has been removed', () => {
    expect(undoableRemoval()).toBeNull();
    expect(undoRemoval()).toBe(false);
  });

  it('is spent after one use', () => {
    state.images.web = shot('desk.png', 1);
    removeImage(1);
    expect(undoRemoval()).toBe(true);
    expect(undoableRemoval()).toBeNull();
    expect(undoRemoval()).toBe(false);
  });

  it('is not offered for a removal that did not happen', () => {
    state.images.web = shot('desk.png', 1);
    expect(removeImage(999)).toBe(false);
    expect(undoableRemoval()).toBeNull();
  });

  it('still clears the canvas and the meta on the clear it can undo', () => {
    state.images.web = shot('desk.png', 1);
    render();
    clearImages();
    expect(state.meta).toBeNull();
    undoRemoval();
    // and brings them back
    expect(state.meta).not.toBeNull();
  });
});

describe('a drop retires the undo', () => {
  it('because "undo" has to mean the last thing that happened', async () => {
    // Restoring the pre-removal list after a drop would silently throw
    // away whatever was just added.
    state.images.web = shot('desk.png', 1);
    removeImage(1);
    expect(undoableRemoval()).not.toBeNull();

    // addFiles cannot run here (no createImageBitmap under node), so this
    // asserts the line that does it rather than the behaviour.
    const src = readFileSync('web/state.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const fn = src.slice(src.indexOf('export async function addFiles'));
    expect(fn.slice(0, fn.indexOf('\n}'))).toContain('lastRemoval = null');
    expect(typeof addFiles).toBe('function');
  });
});


// ---------------------------------------------------------------------
// DELETE REMOVES THE SELECTED SHOT
//
// Audit finding U5. Clicking a shot selected it and the right panel
// edited it, but Delete and Backspace did nothing: the selection knew
// what you meant and the keyboard did not use it.
//
// Verified in the browser: click the desktop shot, press Delete, it goes
// and the undo appears. Click a PHONE and press Delete, nothing happens.
// Press Backspace while typing in the Custom width field, nothing
// happens. No jsdom here, so these guard the two decisions in the source.
// ---------------------------------------------------------------------

describe('the Delete key', () => {
  // BOTH comment forms. Stripping only /* */ left the `//` note explaining
  // what was removed, and the test failed on the fix. Fourth time in this
  // suite: a test that greps source has to read code, not prose.
  const main = readFileSync('web/main.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const handler = (() => {
    const at = main.indexOf("if (event.key !== 'Delete' && event.key !== 'Backspace') return;");
    return main.slice(at, main.indexOf('\n});', at));
  })();

  it('is wired at all', () => {
    expect(handler.length).toBeGreaterThan(0);
  });

  it('refuses to guess which phone, because the selection is the class', () => {
    // boxFor in web/selection.js: a 'mobile' selection means the phones as
    // a group. Deleting "the first one" would be a guess, and destructive.
    // The chip's own X is exact, and that is where it belongs.
    expect(handler).toContain("state.selection === 'web' ? state.images.web : null");
  });

  it('does not fire while someone is typing', () => {
    expect(handler).toContain('isContentEditable');
    expect(handler).toContain('textarea');
  });

  it('checks the input TYPE, not just the tag', () => {
    // `tagName === 'INPUT'` was too broad: the file input is an <input>
    // and can hold focus after a browse, which would have switched Delete
    // off with nothing on screen to explain why.
    expect(handler, 'a blanket INPUT check disables Delete after a file browse')
      .not.toMatch(/tagName\s*===\s*'INPUT'/);
    expect(handler).toContain('[type=text]');
  });

  it('offers the same undo a chip removal does', () => {
    expect(handler).toContain('undoableRemoval()');
  });
});
