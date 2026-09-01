import { describe, it, expect, beforeEach } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { TEMPLATES, RATIOS, HUES, normalise } from '../core/index.js';
import { state, bindCanvas, render } from '../web/state.js';
import {
  isCustomSize,
  activeTemplateKey,
  activeRatioKey,
  activeGroundKey,
  selectTemplate,
  selectRatio,
  applyCustomSize,
  selectGround,
} from '../web/sidebar.js';

// ---------------------------------------------------------------------
// Pure helpers: selection semantics without reimplementing normalise()'s
// precedence (explicit w/h > template > ratio). These prove the CLEARING
// behaviour that keeps the sidebar's own "selected" highlight honest —
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

  it('selectRatio clears BOTH explicit w/h and a lingering template — template beats ratio otherwise', () => {
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
    // template can never be "active" — exactly the mismatch the real
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
// — if the cache were hit, `meta` IS the literal cached object; if it were
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

    // Simulate exactly what web/sidebar.js's template row click does: set
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
