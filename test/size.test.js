import { describe, it, expect, beforeEach } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import { TEMPLATES, RATIOS, HUES, normalise } from '../core/index.js';
import { state, bindCanvas, render } from '../web/state.js';
import { renderTile } from '../web/preset-tiles.js';
import {
  isCustomSize,
  activeTemplateKey,
  activeRatioKey,
  activeGroundKey,
  selectTemplate,
  selectRatio,
  applyCustomSize,
  selectGround,
  SIZE_TABS,
  activeSizeTab,
  sizeLabel,
} from '../web/size.js';

// ---------------------------------------------------------------------
// Pure helpers: selection semantics without reimplementing normalise()'s
// precedence (explicit w/h > template > ratio). These prove the CLEARING
// behaviour that keeps the sidebar's own "selected" highlight honest,
// not the precedence rule itself, which belongs to core/config.js and is
// already covered by test/config.test.js.
// ---------------------------------------------------------------------

describe('sidebar selection helpers', () => {
  it('a fresh config (DEFAULTS shape) has the default ratio active, nothing else', () => {
    const config = { ratio: '3:2' };
    expect(isCustomSize(config)).toBe(false);
    expect(activeTemplateKey(config)).toBeNull();
    expect(activeRatioKey(config)).toBe('3:2');
  });

  it('selectTemplate sets template and clears any explicit w/h left by a custom size', () => {
    const config = { ratio: '3:2', w: 999, h: 999 };
    selectTemplate(config, 'dribbble');
    expect(config.template).toBe('dribbble');
    expect(config.w).toBeUndefined();
    expect(config.h).toBeUndefined();
    expect(activeTemplateKey(config)).toBe('dribbble');
    // normalise() (the real, unmodified core function) must now resolve to
    // the template's own size, proving the clearing actually mattered and
    // this isn't just a UI-only flag with no effect on the real output.
    expect(normalise(config)).toMatchObject({ w: TEMPLATES.dribbble.w, h: TEMPLATES.dribbble.h, template: 'dribbble' });
  });

  it('selectRatio clears BOTH explicit w/h and a lingering template, template beats ratio otherwise', () => {
    const config = { ratio: '3:2' };
    selectTemplate(config, 'app-store');
    selectRatio(config, '1:1');
    expect(config.template).toBeNull();
    expect(config.w).toBeUndefined();
    expect(activeRatioKey(config)).toBe('1:1');
    expect(activeTemplateKey(config)).toBeNull();
    // The property that actually matters: if selectRatio only set `ratio`
    // and left `template` in place, normalise() would still honour the
    // stale template (template beats ratio) and the canvas would silently
    // disagree with the row the sidebar highlights as selected.
    expect(normalise(config).w).toBe(RATIOS['1:1'][0]);
    expect(normalise(config).h).toBe(RATIOS['1:1'][1]);
  });

  it('BREAK IT: if selectTemplate forgot to clear w/h, the template would never show as selected', () => {
    // This is the "deliberately break the code and watch the test go red"
    // check the project's own process note asks for, kept in the suite as a
    // guard against a future regression rather than a one-off manual step.
    const config = { ratio: '3:2', w: 999, h: 999 };
    // Simulate the broken version: set template WITHOUT clearing w/h.
    config.template = 'dribbble';
    // With the bug, isCustomSize is still true (w/h never cleared), so the
    // template can never be "active", exactly the mismatch the real
    // selectTemplate() exists to prevent.
    expect(activeTemplateKey(config)).toBeNull();
    // The real function fixes this:
    selectTemplate(config, 'dribbble');
    expect(activeTemplateKey(config)).toBe('dribbble');
  });

  it('applyCustomSize accepts a valid pair and rejects invalid ones without mutating', () => {
    const config = { ratio: '3:2' };
    expect(applyCustomSize(config, '0', '500')).toBe(false);
    expect(applyCustomSize(config, 'not-a-number', '500')).toBe(false);
    expect(config.w).toBeUndefined();
    expect(applyCustomSize(config, '640.6', '480.2')).toBe(true);
    expect(config.w).toBe(641); // rounded
    expect(config.h).toBe(480);
    expect(isCustomSize(config)).toBe(true);
    expect(activeRatioKey(config)).toBeNull();
  });

  it('selectGround only accepts a real HUES name', () => {
    const config = {};
    selectGround(config, 'not-a-hue');
    expect(activeGroundKey(config)).toBeNull();
    selectGround(config, 'lavender');
    expect(activeGroundKey(config)).toBe('lavender');
    expect(HUES.lavender).toBe(268);
  });
});

// ---------------------------------------------------------------------
// The property that matters most in this task: a size-only change (picking
// a different template) must hit web/state.js's meta cache and skip
// groundFor entirely, while a ground-relevant change must still bust it.
//
// This drives the REAL render() in web/state.js (see test/web-export.test.js's
// header comment for why that matters and why a local re-implementation of
// the cache logic would not catch a real leak). The proof is reference
// identity of the returned `meta` object, not a byte/visual diff or a timing
// threshold: composeWithMeta's own code is
// `const meta = precomputedMeta || (() => { ...fresh groundFor()... })();`
//, if the cache were hit, `meta` IS the literal cached object; if it were
// missed, a brand new object is always built. Two renders returning the
// identical reference is only possible if groundFor was never called the
// second time, which is a stronger and less flaky guarantee than measuring
// wall-clock time (this repo's report captures the actual ms numbers by
// hand instead, since a hard timing threshold in the suite would be
// machine-dependent).
// ---------------------------------------------------------------------

const mkCanvas = (w, h) => createCanvas(w, h);

describe('sidebar size changes reuse the ground cache; ground changes bust it', () => {
  beforeEach(() => {
    state.config = { ratio: '3:2' };
    state.images = { web: null, mobile: [] };
    state.meta = null;
    state.surround = 'mid';
  });

  it('selecting a different template does not re-run groundFor (same meta object)', async () => {
    const web = await loadImage('samples/fieldset.png');
    const target = createCanvas(10, 10);
    bindCanvas(target, mkCanvas);
    state.images.web = web;

    render();
    const firstMeta = state.meta;
    expect(firstMeta).toBeTruthy();

    // Simulate exactly what web/size.js's template row click does: set
    // `template`, clear any explicit w/h. Ground/tone are untouched.
    selectTemplate(state.config, 'app-store');
    render();

    // Reference equality, not a deep-equals: this can only pass if
    // composeWithMeta's `precomputedMeta ||` branch was taken, i.e. the
    // cache was hit and groundFor was never called the second time.
    expect(state.meta).toBe(firstMeta);

    // Sanity: the size actually changed (this wasn't a no-op click).
    expect(target.width).toBe(TEMPLATES['app-store'].w);
  });

  it('BREAK IT: a key that ignored config.ground would wrongly call this a cache hit too', () => {
    // This documents what a broken key would look like, without touching
    // web/state.js's real groundKeyFor (core/ and web/state.js's cache are
    // out of scope to modify for this task). A key built from images alone
    // (no ground/tone) would treat the next two configs as identical:
    const configA = { ratio: '3:2', ground: 'lavender' };
    const configB = { ratio: '3:2', ground: 'rose' };
    const brokenKey = (c) => 'images-only'; // what a broken key would do
    expect(brokenKey(configA)).toBe(brokenKey(configB)); // wrongly equal
    // The real groundKeyFor (web/state.js) includes `config.ground`, so the
    // very next test proves the real cache does NOT collapse these two.
  });

  it('selecting a different ground preset DOES re-run groundFor (a new meta object)', async () => {
    const web = await loadImage('samples/fieldset.png');
    const target = createCanvas(10, 10);
    bindCanvas(target, mkCanvas);
    state.images.web = web;

    render();
    const firstMeta = state.meta;
    const firstKey = state._groundKey;

    selectGround(state.config, 'rose');
    render();

    expect(state._groundKey).not.toBe(firstKey);
    expect(state.meta).not.toBe(firstMeta);
    expect(state.meta.hue).not.toBe(firstMeta.hue);
  });
});

// ---------------------------------------------------------------------
// FIX ROUND 1: a ground preset swatch must tell the truth about what
// clicking it will actually produce, including on a DARK screenshot,
// where core/ground.js's mid-tone branch applies. The first version of
// gradientFor() always fed groundFor() a synthetic, always-pale sample
// (HSL(hue, 50%, 70%), luminance ~0.85-0.97 for every hue), so no swatch
// could ever preview the mid-tone branch: it rendered the pale-tint
// preview even for an image whose OWN luminance would force mid-tone once
// applied. That is a different branch of the algorithm, not sampling
// noise, see web/size.js's "Ground swatch gradients" header comment
// for the measured before/after hex values.
//
// This drives the REAL app pipeline (decode a real dark image, render it,
// ask gradientFor() for a swatch, then actually select that preset and
// re-render) and asserts the swatch's own colours are the exact ones
// render() then produces, not merely "a" plausible gradient. Confirmed
// failing against the pre-fix implementation before the fix landed (see
// task-4-report.md's fix-round-1 section for the run log), it must fail
// there, since demonstrating the bug is the entire point of this test.
// ---------------------------------------------------------------------

describe('preset tiles tell the truth about a loaded (dark) image', () => {
  // CYCLE C TASK 5 MOVED WHAT THIS DRIVES, NOT WHAT IT CLAIMS. It used to
  // compare `gradientFor`'s CSS string against the gradient render()
  // actually produced. That function is gone - it was a second
  // implementation of the ground, in a different language - and the tile is
  // now painted by core/'s own paintGround. So the claim is made against
  // PIXELS instead of a string: paint the tile, select the preset, render,
  // and compare the tile's own centre to the ground the shot actually got.
  //
  // The guarantee is unchanged and is the reason this suite exists: a
  // swatch that misrepresents what selecting it produces is worse than no
  // swatch, because it is trusted.
  beforeEach(() => {
    state.config = { ratio: '3:2' };
    state.images = { web: null, mobile: [] };
    state.meta = null;
    state.surround = 'mid';
  });

  const centreOf = (cv) => {
    const d = cv.getContext('2d').getImageData(
      Math.round(cv.width / 2), Math.round(cv.height / 2), 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  const hexToRgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

  it('every tile, computed for the loaded dark image, matches what selecting it renders', async () => {
    const web = await loadImage('samples/karaoke-web.png');
    const target = createCanvas(10, 10);
    bindCanvas(target, mkCanvas);
    state.images.web = web;

    render(); // populates state.meta from the real, dark image
    // Sanity: this really is a dark-UI sample (lum ~0.097, well under the
    // 0.34 threshold). If it were not, a tile that ALWAYS previews pale
    // could accidentally still match and this test would prove nothing.
    expect(state.meta.darkUI).toBe(true);

    for (const name of Object.keys(HUES)) {
      const tile = createCanvas(64, 64);
      renderTile(tile, name, state.config, state.meta, mkCanvas);
      const previewed = centreOf(tile);

      selectGround(state.config, name);
      render(); // a real, fresh groundFor() call - the ground actually changed
      const produced = hexToRgb(state.meta.ground[1]);   // the middle stop

      // The tile's centre is the gradient's own midpoint, which is the
      // middle stop. Within a level or two for the gradient's
      // interpolation across 64px; a WRONG preview is off by far more -
      // the ash bug this caught earlier was a blue tint against a grey.
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(previewed[i] - produced[i]),
          `${name} channel ${i}: tile ${previewed.join()} vs render ${produced.join()}`)
          .toBeLessThanOrEqual(3);
      }
      // And the branch itself, not just incidental colour equality: a dark
      // image must stay on the less-pale ground for every forced hue.
      expect(state.meta.darkUI).toBe(true);
    }
  });

  it('falls back to a synthetic sample before any image is loaded, and stops the moment one is', async () => {
    // No image yet: the tile must still paint a real ground rather than a
    // flat nothing, even with no state.meta to draw truth from.
    expect(state.meta).toBeNull();
    const before = createCanvas(64, 64);
    renderTile(before, 'rose', state.config, null, mkCanvas);
    const beforeCentre = centreOf(before);
    expect(beforeCentre.some(v => v > 0)).toBe(true);

    // Load a real dark image - the regression this guards is the fallback
    // silently OUTLIVING this moment.
    const web = await loadImage('samples/karaoke-web.png');
    const target = createCanvas(10, 10);
    bindCanvas(target, mkCanvas);
    state.images.web = web;
    render();

    const after = createCanvas(64, 64);
    renderTile(after, 'rose', state.config, state.meta, mkCanvas);
    // The real image is dark, so its "rose" ground is the less-pale one;
    // the synthetic pre-image fallback can only ever produce the pale one.
    // These must therefore differ - if they did not, the fallback would
    // still be in charge after an image had loaded.
    expect(centreOf(after)).not.toEqual(beforeCentre);
  });
});

// ---------------------------------------------------------------------
// Cycle A Task 2: the rail's Ground group is gone, because it was a second
// copy of the inspector's Background presets.
//
// THIS SUITE HAS NO DOM. Every test file in test/ runs on vitest's `node`
// environment (vitest.config.js) and this file's own split is explicit
// about it: "Pure helpers: ... no DOM". There is no jsdom, no mount
// helper, and adding one for two assertions would be a second harness
// nobody else uses. So the removal is asserted where it actually lives,
// the shipped markup, and the module's exports, rather than by
// simulating a browser.
// ---------------------------------------------------------------------

describe('the rail does not duplicate the Background panel', () => {
  it('ships no ground swatch list in the sidebar markup', () => {
    const html = readFileSync('web/index.html', 'utf8');
    const start = html.indexOf('<aside id="sidebar"');
    const rail = html.slice(start, html.indexOf('</aside>', start));
    expect(start).toBeGreaterThan(-1);
    // .preset-list / .preset-row is the ground swatch markup (built by
    // renderGroundSwatches, and previously seeded by a static placeholder
    // in the rail). The Background panel builds its own at runtime; the
    // rail must ship none.
    expect(rail).not.toMatch(/preset-list|preset-row|preset-swatch/);
  });

  it('initSidebar no longer renders ground swatches', () => {
    const src = readFileSync('web/size.js', 'utf8');
    const init = src.slice(src.indexOf('export function initSidebar'));
    expect(init).not.toMatch(/renderGroundSwatches\(/);
  });

  it('no longer renders the presets at all, the panel does, with real tiles', async () => {
    // Cycle A Task 2 removed the rail's duplicate Ground group and this
    // asserted the shared renderer survived for the inspector. Cycle C Task
    // 5 retired that renderer: it built a CSS gradient approximating the
    // real one, and the panel now paints canvases through core/ instead.
    // Kept, aimed at the current architecture, so nothing quietly grows a
    // second ground implementation here again.
    const mod = await import('../web/size.js');
    expect(mod.renderGroundSwatches).toBeUndefined();
    expect(mod.gradientFor).toBeUndefined();
    expect(readFileSync('web/inspector-background.js', 'utf8')).toMatch(
      /renderTile\(cv, name/,
    );
  });
});

// ---------------------------------------------------------------------
// Cycle D Task 1. Templates, ratios and a custom size are ONE decision,
// every one of them writes nothing but `w` and `h`, and they read as two
// stacked lists plus a disclosure. Tabs make the truth visible, and
// showing one at a time is where the left panel's new space comes from.
// ---------------------------------------------------------------------
describe('the size control is one decision, shown one tab at a time', () => {
  it('offers exactly three tabs', () => {
    expect(SIZE_TABS).toEqual(['templates', 'ratios', 'custom']);
  });

  it('opens on the tab the current size actually came from', () => {
    // Opening on Templates while a ratio is applied would show a list with
    // nothing highlighted, and read as "nothing is chosen".
    expect(activeSizeTab({ ratio: '3:2' })).toBe('ratios');
    expect(activeSizeTab({ template: 'dribbble' })).toBe('templates');
    expect(activeSizeTab({ w: 1234, h: 567 })).toBe('custom');
  });

  it("and follows normalise()'s own precedence, not its own", () => {
    // core/config.js resolves explicit w/h over template over ratio. A tab
    // rule that disagreed would open on a list the canvas is not using.
    expect(activeSizeTab({ ratio: '3:2', template: 'dribbble' })).toBe('templates');
    expect(activeSizeTab({ ratio: '3:2', template: 'dribbble', w: 800, h: 600 })).toBe('custom');
    // Proven against the real normalise() rather than against the helper's
    // own opinion: the tab must name where the canvas's size came from.
    expect(normalise({ ratio: '3:2', template: 'dribbble', w: 800, h: 600 }))
      .toMatchObject({ w: 800, h: 600 });
  });

  it('ignores a template or ratio key that is not real', () => {
    // Same guard activeTemplateKey/activeRatioKey already carry: a stale
    // jobs.json naming a template that no longer exists must not highlight
    // a tab whose list cannot show it.
    expect(activeSizeTab({ template: 'not-a-template' })).toBe('ratios');
  });
});


// ---------------------------------------------------------------------
// SIZE LEFT THE LEFT PANEL (2026-09-07)
//
// It is a dropdown in the strip above the canvas now, because that is where
// Rock's own design puts it: the size IS the canvas. The control itself did
// not change - same tabs, same rows, same custom form - so what is worth
// asserting is the move, and the one new thing the move needed: a label for
// the trigger, which must never name a size the open list has not selected.
// ---------------------------------------------------------------------

describe('sizeLabel, the dropdown trigger', () => {
  it('names the template when one is selected', () => {
    const config = {};
    selectTemplate(config, 'dribbble');
    const { name, dims } = sizeLabel(config);
    expect(name).toBe(TEMPLATES.dribbble.label);
    expect(dims).toBe(`${TEMPLATES.dribbble.w}\u00d7${TEMPLATES.dribbble.h}`);
  });

  it('names the ratio when one is selected', () => {
    const config = {};
    selectRatio(config, '16:9');
    const { name, dims } = sizeLabel(config);
    expect(name).toBe('16:9');
    expect(dims).toBe(`${RATIOS['16:9'][0]}\u00d7${RATIOS['16:9'][1]}`);
  });

  it('says Custom for an explicit size, and gives its real pixels', () => {
    const config = {};
    expect(applyCustomSize(config, '1234', '567')).toBe(true);
    expect(sizeLabel(config)).toEqual({ name: 'Custom', dims: '1234\u00d7567' });
  });

  it('agrees with the list: an explicit size wins over a template', () => {
    // applyCustomSize leaves the template key on the config; isCustomSize is
    // what breaks the tie for the list, and the trigger must break it the
    // same way or the strip names one size while a different row is lit.
    const config = {};
    selectTemplate(config, 'dribbble');
    applyCustomSize(config, '800', '600');
    expect(activeTemplateKey(config)).toBeNull();
    expect(sizeLabel(config).name).toBe('Custom');
  });

  it('reports the pixels core/ will actually render', () => {
    const config = {};
    selectRatio(config, '1:1');
    const eff = normalise(config);
    expect(sizeLabel(config).dims).toBe(`${eff.w}\u00d7${eff.h}`);
  });
});

describe('the size control lives in the canvas strip', () => {
  // Comments stripped first: this reads the MARKUP, and the comment that
  // records the move names the ids it moved to.
  const html = readFileSync('web/index.html', 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const sidebar = html.slice(html.indexOf('<aside id="sidebar"'), html.indexOf('</aside>'));
  const strip = html.slice(
    html.indexOf('<div class="canvas-toolbar">'),
    html.indexOf('<p id="dropError"'),
  );

  it('is not in the left panel any more, and neither is its search box', () => {
    expect(sidebar).not.toContain('sidebar-search');
    expect(sidebar).not.toContain('template-list');
    expect(sidebar).not.toContain('sizeHost');
  });

  it('is in the strip above the canvas, with a host web/size.js can find', () => {
    expect(strip).toContain('id="sizeField"');
    expect(strip).toContain('id="sizeSelect"');
    expect(strip).toContain('id="sizeMenu"');
    expect(strip).toContain('id="sizeHost"');
    expect(strip).toContain('sidebar-search');
    // web/size.js reads exactly these two ids; a rename in one place only
    // would leave the control silently unbuilt.
    const src = readFileSync('web/size.js', 'utf8');
    expect(src).toContain("getElementById('sizeMenu')");
    expect(src).toContain("getElementById('sizeHost')");
  });

  it('calls the right-hand control Table, not Surround', () => {
    expect(strip).toContain('>Table<');
    expect(strip).not.toMatch(/>Surround</);
    // Only the WORD changed. The config field, the data attribute and the
    // tokens still say surround, and renaming those would reach into core/.
    expect(strip).toContain('data-surround="dark"');
  });
});

describe('the inspector names its subject once', () => {
  const html = readFileSync('web/index.html', 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const inspector = html.slice(html.indexOf('<aside id="inspector"'));

  it('has one subject line at the top of the panel', () => {
    expect(inspector).toContain('id="selectedElementName"');
    expect((inspector.match(/id="selectedElementName"/g) || []).length).toBe(1);
  });

  it('no longer tags each section heading with the element', () => {
    const src = readFileSync('web/inspector-frame.js', 'utf8');
    expect(src).not.toContain('section-subject');
    expect(src).not.toContain('frameSubject');
    expect(src).not.toContain('finishSubject');
  });
});
