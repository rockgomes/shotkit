import { describe, it, expect, beforeEach } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import {
  HUES, normalise, groundFor, BG_TYPES,
  LUMINOSITY_RANGE, LUM_ANCHOR_LIGHT,
} from '../core/index.js';
import { state, bindCanvas, render } from '../web/state.js';
import { selectGround, activeGroundKey } from '../web/sidebar.js';
import {
  UI_BG_TYPES,
  TYPE_LABELS,
  showsAngle,
  isAutoGround,
  forcedHueDeg,
  setHue,
  resetToSampled,
  setAngle,
  setBgType,
  isSampledLuminosity,
  lightEndLabel,
  ANGLE_SLIDER_MAX,
  isFullySampled,
  activeLuminosity,
  setLuminosity,
  resetLuminosityToSampled,
  computeSampledMeta,
  sampledMetaFor,
  createSampledCache,
} from '../web/inspector-background.js';

const mkCanvas = (w, h) => createCanvas(w, h);

// ---------------------------------------------------------------------
// Pure helpers — no DOM. Same split web/sidebar.js already established.
// ---------------------------------------------------------------------

describe('ground auto/forced reading', () => {
  it('an unset, null or "auto" config.ground is auto; anything else is forced', () => {
    expect(isAutoGround({})).toBe(true);
    expect(isAutoGround({ ground: null })).toBe(true);
    expect(isAutoGround({ ground: 'auto' })).toBe(true);
    expect(isAutoGround({ ground: 'lavender' })).toBe(false);
    expect(isAutoGround({ ground: 200 })).toBe(false);
    expect(isAutoGround({ ground: 0 })).toBe(false); // 0 is a real hue, not "unset"
  });

  it('forcedHueDeg resolves a named preset OR a raw numeric degree, and is null when auto', () => {
    expect(forcedHueDeg({})).toBeNull();
    expect(forcedHueDeg({ ground: 'lavender' })).toBe(HUES.lavender);
    expect(forcedHueDeg({ ground: 200 })).toBe(200);
    expect(forcedHueDeg({ ground: '200' })).toBe(200);
  });
});

// ---------------------------------------------------------------------
// THE PROPERTY THAT MATTERS MOST IN THIS TASK: the preset row and the hue
// slider must write the SAME field, or the panel can show one control as
// selected while the other (or the render itself) disagrees. selectGround
// is web/sidebar.js's real, unmodified preset-click helper (Task 4); setHue
// is this file's real hue-slider helper (Task 5). Both are driven here
// exactly as their own control would drive them.
// ---------------------------------------------------------------------

describe('the preset row and the hue slider agree, because they write the same field', () => {
  it('selectGround (preset) and setHue (slider) both land on config.ground', () => {
    const config = {};
    selectGround(config, 'rose');
    expect(config.ground).toBe('rose');
    expect(forcedHueDeg(config)).toBe(HUES.rose);

    setHue(config, 200);
    expect(config.ground).toBe(200); // the SAME field, now holding a raw degree
    expect(forcedHueDeg(config)).toBe(200);
    // No preset is falsely "selected" just because a numeric value happens
    // to exist — activeGroundKey (web/sidebar.js) keys off the NAME, not
    // numeric equality, so a slider value never masquerades as a preset.
    expect(activeGroundKey(config)).toBeNull();
  });

  it('resetToSampled clears the override and both readers agree it is auto again', () => {
    const config = { ground: 'ember' };
    resetToSampled(config);
    expect(isAutoGround(config)).toBe(true);
    expect(forcedHueDeg(config)).toBeNull();
    expect(activeGroundKey(config)).toBeNull();
    // And normalise() (core/config.js, real and unmodified) resolves this
    // exactly the same way — not just this file's own bookkeeping.
    expect(normalise(config).forceHue).toBeNull();
  });

  it('setHue wraps out-of-range degrees the same way normalise() would', () => {
    const config = {};
    setHue(config, 370);
    expect(config.ground).toBe(10);
    setHue(config, -10);
    expect(config.ground).toBe(350);
  });

  it('BREAK IT: a hue control that wrote a DIFFERENT field than the preset row would silently disagree with the real render', () => {
    // This is the exact class of bug the brief calls out: two controls
    // that look like they set "the hue" but actually write different
    // fields. Simulate a hue slider that (wrongly) wrote `config.hue`
    // instead of `config.ground`.
    const config = {};
    config.hue = 200; // the bug: NOT config.ground
    // This file's own reader sees no override at all...
    expect(forcedHueDeg(config)).toBeNull();
    expect(isAutoGround(config)).toBe(true);
    // ...and neither does the real core/config.js normalise() that
    // actually drives the render — the slider would visibly show 200°
    // while the canvas kept rendering the sampled hue, exactly the "panel
    // lies about its own state" failure this task explicitly warns about.
    expect(normalise(config).forceHue).toBeNull();
    // The real setHue() (this file) does not have this bug:
    setHue(config, 200);
    expect(normalise(config).forceHue).toBe(200);
  });
});

describe('angle, background type, seed and luminosity helpers', () => {
  it('setAngle wraps degrees the same way setHue does', () => {
    const config = {};
    setAngle(config, 370);
    expect(config.angle).toBe(10);
  });

  it('setBgType only accepts a real BG_TYPES value', () => {
    const config = {};
    setBgType(config, 'not-a-type');
    expect(config.bgType).toBeUndefined();
    setBgType(config, 'solid');
    expect(config.bgType).toBe('solid');
    // Rejects a value that looks plausible but was never a member of
    // BG_TYPES, and does not clobber the last good value while doing so —
    // this exercises setBgType's own guard, not BG_TYPES' own contents.
    setBgType(config, 'gradient');
    expect(config.bgType).toBe('solid');
  });

  // Cycle C Task 1: the Auto/Light/Mid segmented became a luminosity
  // slider with a Sampled reset. `null` still means sampled, exactly as
  // 'auto' did - and it is still null rather than a number that happens to
  // equal the sampled value, because the difference is whether the ground
  // follows the NEXT screenshot.
  it('setLuminosity/resetLuminosityToSampled round-trip through null', () => {
    const config = {};
    expect(isSampledLuminosity(config)).toBe(true);
    setLuminosity(config, 0.4);
    expect(config.luminosity).toBeCloseTo(0.4, 12);
    expect(isSampledLuminosity(config)).toBe(false);
    resetLuminosityToSampled(config);
    expect(config.luminosity).toBeNull();   // NOT 0.4, and not the sampled number
    expect(isSampledLuminosity(config)).toBe(true);
    // Rejects a value that is not a number at all, leaving what was there.
    setLuminosity(config, 0.4);
    setLuminosity(config, 'not-a-number');
    expect(config.luminosity).toBeCloseTo(0.4, 12);
  });

  it('clamps to LUMINOSITY_RANGE at both ends', () => {
    const config = {};
    setLuminosity(config, 9);
    expect(config.luminosity).toBe(LUMINOSITY_RANGE[1]);
    setLuminosity(config, -9);
    expect(config.luminosity).toBe(LUMINOSITY_RANGE[0]);
  });

  it('shows the SAMPLED position when nothing is set, not a fixed midpoint', () => {
    // The requirement, in one assertion: with no override, the slider sits
    // where core/ground.js's own inference put it. A fixed midpoint would
    // discard that on every shot.
    expect(activeLuminosity({}, { luminosity: 0.855 })).toBeCloseTo(0.855, 12);
    expect(activeLuminosity({}, { luminosity: 0.975 })).toBeCloseTo(0.975, 12);
    // An explicit value wins over the sampled one.
    expect(activeLuminosity({ luminosity: 0.3 }, { luminosity: 0.975 })).toBeCloseTo(0.3, 12);
    // And with no meta at all - before the first render - it falls back to
    // the pale anchor rather than to NaN.
    expect(activeLuminosity({})).toBeCloseTo(LUM_ANCHOR_LIGHT.l, 12);
  });

  // The same guard, aimed at the shape luminosity can go wrong in. The old
  // version asked what happened if `tone` held the string "auto"; a number
  // cannot hold a sentinel string, so the equivalent trap is a value that
  // is not a number at all reaching the clamp.
  it('BREAK IT: a non-numeric luminosity must fall back to sampled, not to the floor', () => {
    // The bug this catches is one line of arithmetic: clamping with
    // `Math.max(LUMINOSITY_RANGE[0], null)` returns the FLOOR, so a garbage
    // value would silently produce the darkest ground in the range instead
    // of sampling the screenshot. Written after making exactly that
    // mistake.
    expect(normalise({ luminosity: 'nonsense' }).luminosity).toBeNull();
    expect(normalise({ luminosity: NaN }).luminosity).toBeNull();
    expect(normalise({ luminosity: '' }).luminosity).toBeNull();
    // And a real 0 is NOT garbage - it clamps to the floor, deliberately.
    expect(normalise({ luminosity: 0 }).luminosity).toBe(LUMINOSITY_RANGE[0]);
  });
});

// ---------------------------------------------------------------------
// "Sampled" must not lie: it has to keep reporting the screenshot's TRUE
// measured hue even after the user forces a different one. This drives
// the REAL render() pipeline (web/state.js) exactly like
// test/sidebar.test.js's own cache tests, plus this file's
// computeSampledMeta() called directly against the same real, decoded
// image — proving the two stay independent.
// ---------------------------------------------------------------------

describe('computeSampledMeta reproduces the real unforced reading, independent of any override', () => {
  beforeEach(() => {
    state.config = { ratio: '3:2' };
    state.images = { web: null, mobile: [] };
    state.meta = null;
    state.surround = 'mid';
  });

  it('matches a direct, unforced groundFor() call on the same image', async () => {
    const web = await loadImage('samples/karaoke-web.png');
    const sampled = computeSampledMeta({ web, mobile: [] }, mkCanvas);
    const direct = groundFor(
      [(() => {
        const scale = Math.min(1, 800 / web.width, 800 / web.height);
        const w = Math.max(1, Math.floor(web.width * scale));
        const h = Math.max(1, Math.floor(web.height * scale));
        const cv = mkCanvas(w, h);
        const ctx = cv.getContext('2d');
        ctx.drawImage(web, 0, 0, w, h);
        return ctx.getImageData(0, 0, w, h);
      })()],
      null,
      null,
    );
    expect(sampled).toEqual(direct);
  });

  it('does NOT change once a hue is forced and a real render has run with the override', async () => {
    const web = await loadImage('samples/karaoke-web.png');
    web.__id = 'karaoke-web';
    const target = createCanvas(10, 10);
    bindCanvas(target, mkCanvas);
    state.images.web = web;

    render(); // unforced: state.meta.hue is the screenshot's own measured hue
    expect(state.meta.darkUI).toBe(true); // sanity, same fixture as sidebar.test.js

    const sampledBefore = computeSampledMeta(state.images, mkCanvas);

    // Force a hue, exactly like the preset row or the hue slider would.
    selectGround(state.config, 'rose');
    render();
    expect(state.meta.hue).toBeCloseTo(HUES.rose, 0);
    // The override is really in the real meta now, not just requested —
    // sanity that this test is actually exercising the override path.
    expect(state.meta.hue).not.toBeCloseTo(sampledBefore.hue, 0);

    const sampledAfter = computeSampledMeta(state.images, mkCanvas);

    // The measured reading is EXACTLY the same as before the override —
    // this is the "must not lie" property. If Sampled were reading off
    // `state.meta` instead of its own independent computation, it would
    // have silently become 'rose' here instead of staying the screenshot's
    // real accent.
    expect(sampledAfter).toEqual(sampledBefore);
    expect(sampledAfter.hue).not.toBeCloseTo(state.meta.hue, 0);
  });

  it('BREAK IT: reading off state.meta instead of an independent sample would regress this', async () => {
    const web = await loadImage('samples/karaoke-web.png');
    const target = createCanvas(10, 10);
    bindCanvas(target, mkCanvas);
    state.images.web = web;
    render();
    const trueHue = state.meta.hue;

    selectGround(state.config, 'rose');
    render();

    // Simulating the bug: "Sampled" implemented as `state.meta.hue` directly.
    const buggyReading = state.meta.hue;
    expect(buggyReading).not.toBeCloseTo(trueHue, 0); // proves the bug would show 'rose', not the truth

    // The real implementation does not do this:
    const correctReading = computeSampledMeta(state.images, mkCanvas).hue;
    expect(correctReading).toBeCloseTo(trueHue, 0);
  });

  it('falls back to core/index.js\'s own no-image neutral sample when nothing is loaded', () => {
    const sampled = computeSampledMeta({ web: null, mobile: [] }, mkCanvas);
    const direct = groundFor([{ width: 1, height: 1, data: [128, 128, 128, 255] }], null, null);
    expect(sampled).toEqual(direct);
  });
});

// ---------------------------------------------------------------------
// FIX ROUND 1: the first version of this file ran computeSampledMeta (a
// real analyse() pass, ~90-300ms) unconditionally on every image load,
// duplicating work render() (web/state.js) had just finished doing for the
// SAME image whenever the ground was auto — the common case. sampledMetaFor
// is the fix: reuse `state.meta` when auto (an already-known, exact
// answer), only pay for an independent analysis once a hue is actually
// forced. These tests were absent from the original 18 — the caching
// wrapper (createSampledCache) was unexported and untested, which is
// exactly how the redundant analysis slipped through review.
// ---------------------------------------------------------------------

describe('sampledMetaFor: reuse state.meta when auto, analyse independently only when forced', () => {
  it('auto + a currentMeta present: returns that EXACT object — proven by a canvas factory that throws if an analysis is attempted', () => {
    const explodingCanvas = () => {
      throw new Error('computeSampledMeta ran even though the ground is auto — the whole point of this fix is that it must not');
    };
    const currentMeta = { lum: 0.5, hue: 123, chroma: 0.4, ground: ['#111', '#222', '#333'], darkUI: false };
    const result = sampledMetaFor({ web: null, mobile: [] }, { ground: null }, currentMeta, explodingCanvas);
    expect(result).toBe(currentMeta); // reference identity: the SAME object, not a recomputed copy
  });

  it('a forced hue: ignores currentMeta entirely and falls back to an independent computeSampledMeta', async () => {
    const web = await loadImage('samples/fieldset.png');
    // Deliberately implausible, so if this leaked through it could not be
    // mistaken for a coincidentally-correct real analysis.
    const staleForcedMeta = { lum: 0, hue: 999, chroma: 0, ground: ['#000000', '#000000', '#000000'], darkUI: true };
    const result = sampledMetaFor({ web, mobile: [] }, { ground: 'rose' }, staleForcedMeta, mkCanvas);
    expect(result).not.toBe(staleForcedMeta);
    expect(result).toEqual(computeSampledMeta({ web, mobile: [] }, mkCanvas));
  });

  it('auto but no currentMeta yet (panel init before any real render has happened): falls back to the independent path', () => {
    const direct = computeSampledMeta({ web: null, mobile: [] }, mkCanvas);
    const result = sampledMetaFor({ web: null, mobile: [] }, {}, null, mkCanvas);
    expect(result).toEqual(direct);
  });

  it('BREAK IT: trusting currentMeta even when forced would leak the override into "Sampled"', async () => {
    const web = await loadImage('samples/karaoke-web.png');
    const trueHue = computeSampledMeta({ web, mobile: [] }, mkCanvas).hue;
    // Simulate what `state.meta` looks like right after a forced-hue
    // render — this is a REAL shape (hue overwritten by tail()), not a
    // fabricated one.
    const forcedMeta = { lum: 0.097, hue: HUES.rose, chroma: 1, ground: ['#e1d4d8', '#d0bdc4', '#c3a8b1'], darkUI: true };
    // The bug: `sampledMetaFor` that trusted `currentMeta` unconditionally.
    const buggyResult = forcedMeta;
    expect(buggyResult.hue).not.toBeCloseTo(trueHue, 0); // this IS the leak, if it happened
    // The real function does not do this — it recognises `ground: 'rose'`
    // as forced and analyses independently instead:
    const correctResult = sampledMetaFor({ web, mobile: [] }, { ground: 'rose' }, forcedMeta, mkCanvas);
    expect(correctResult.hue).toBeCloseTo(trueHue, 0);
  });

  it('in the real render pipeline, reusing state.meta while auto costs nothing extra — proven by object identity', async () => {
    const web = await loadImage('samples/fieldset.png');
    web.__id = 'fix-round-1-fieldset';
    const target = createCanvas(10, 10);
    bindCanvas(target, mkCanvas);
    state.config = {};
    state.images = { web, mobile: [] };
    state.meta = null;
    state.surround = 'mid';

    render(); // auto — state.meta IS the unforced reading already
    const cache = createSampledCache();
    const sampled = cache.refresh(state.images, state.config, state.meta, mkCanvas);
    expect(sampled).toBe(state.meta); // the literal object render() produced — zero extra analysis
  });
});

describe('createSampledCache: only recomputes when the loaded image SET changes', () => {
  it('reuses the cached value across calls with the same image identity, even once the ground is forced and currentMeta would otherwise mislead it', () => {
    const web = { width: 10, height: 10, __id: 'same-image' };
    const cache = createSampledCache();
    const autoMeta = { lum: 0.5, hue: 42, chroma: 0.3 };
    const first = cache.refresh({ web, mobile: [] }, { ground: null }, autoMeta);
    expect(first).toBe(autoMeta);

    // Same image, but now forced — a currentMeta with the override baked
    // in. Because the image identity hasn't changed, the cache must NOT
    // re-derive anything from this (untrustworthy, once forced) meta — it
    // returns the value it already cached while auto.
    const forcedMeta = { lum: 0.5, hue: 340, chroma: 0.3 };
    const second = cache.refresh({ web, mobile: [] }, { ground: 'rose' }, forcedMeta);
    expect(second).toBe(first);
    expect(second).not.toBe(forcedMeta);
  });

  it('recomputes once the image identity actually changes', () => {
    const webA = { width: 10, height: 10, __id: 'image-a' };
    const webB = { width: 10, height: 10, __id: 'image-b' };
    const cache = createSampledCache();
    const metaA = { lum: 0.5, hue: 1, chroma: 0.1 };
    const metaB = { lum: 0.6, hue: 2, chroma: 0.2 };

    const first = cache.refresh({ web: webA, mobile: [] }, {}, metaA);
    const second = cache.refresh({ web: webB, mobile: [] }, {}, metaB);

    expect(first).toBe(metaA);
    expect(second).toBe(metaB); // a genuinely new image, auto — reuses the NEW currentMeta
    expect(second).not.toBe(first);
  });

  it('invalidate() forces the next refresh() to recompute even though the image key is unchanged', () => {
    const web = { width: 10, height: 10, __id: 'invalidate-me' };
    const cache = createSampledCache();
    const metaA = { lum: 0.1, hue: 10, chroma: 0.1 };
    const metaB = { lum: 0.2, hue: 20, chroma: 0.2 };

    expect(cache.refresh({ web, mobile: [] }, {}, metaA)).toBe(metaA);
    // Same key, not invalidated: the cache stays on metaA, ignoring metaB.
    expect(cache.refresh({ web, mobile: [] }, {}, metaB)).toBe(metaA);

    cache.invalidate();
    // Now it re-evaluates and picks up the freshly-passed metaB.
    expect(cache.refresh({ web, mobile: [] }, {}, metaB)).toBe(metaB);
  });

  it('BREAK IT: a cache that recomputed on every call would re-run the expensive path needlessly', async () => {
    // Forced ground + a real image: computeSampledMeta's sampleOf() step
    // calls `makeCanvas` for its 800px thumbnail — counting those calls is
    // a direct measure of how many times the expensive path actually ran.
    const web = await loadImage('samples/fieldset.png');
    let calls = 0;
    const countingCanvas = (w, h) => {
      calls++;
      return mkCanvas(w, h);
    };
    const cache = createSampledCache();
    const config = { ground: 'rose' }; // forced — every refresh() would hit computeSampledMeta if uncached
    const first = cache.refresh({ web, mobile: [] }, config, null, countingCanvas);
    const second = cache.refresh({ web, mobile: [] }, config, null, countingCanvas);
    expect(first).toEqual(second);
    expect(calls).toBe(1); // would be 2 if the cache recomputed on the second, unchanged-key call
  });
});

// ---------------------------------------------------------------------
// Angle must hit the warm ground cache; hue and tone must bust it. Same
// reference-identity technique as test/sidebar.test.js (not a timing
// threshold — see that file's header comment for why).
// ---------------------------------------------------------------------

describe('angle hits the warm ground cache; hue and luminosity bust it', () => {
  beforeEach(() => {
    state.config = { ratio: '3:2' };
    state.images = { web: null, mobile: [] };
    state.meta = null;
    state.surround = 'mid';
  });

  it('changing angle does not re-run groundFor (same meta object)', async () => {
    const web = await loadImage('samples/fieldset.png');
    const target = createCanvas(10, 10);
    bindCanvas(target, mkCanvas);
    state.images.web = web;

    render();
    const firstMeta = state.meta;

    setAngle(state.config, 40);
    render();

    expect(state.meta).toBe(firstMeta);
  });

  it('changing hue via setHue DOES re-run groundFor (a new meta object)', async () => {
    const web = await loadImage('samples/fieldset.png');
    const target = createCanvas(10, 10);
    bindCanvas(target, mkCanvas);
    state.images.web = web;

    render();
    const firstMeta = state.meta;

    setHue(state.config, 40);
    render();

    expect(state.meta).not.toBe(firstMeta);
    expect(state.meta.hue).not.toBe(firstMeta.hue);
  });

  it('changing luminosity DOES re-run groundFor (a new meta object)', async () => {
    const web = await loadImage('samples/fieldset.png');
    const target = createCanvas(10, 10);
    bindCanvas(target, mkCanvas);
    state.images.web = web;

    render();
    const firstMeta = state.meta;

    setLuminosity(state.config, 0.4);
    render();

    expect(state.meta).not.toBe(firstMeta);
  });
});

// --- Mesh withheld from the panel (2026-09-03) ---------------------------
//
// Rock's call after using the rebuilt mesh: it cannot carry a shot on a pale
// palette, and the palette is Cycle B's work. These assert the shape of that
// decision - the way IN is closed, the feature is not deleted - so that
// restoring it later is one line rather than an archaeology exercise.
// `mesh is withheld from the Background panel, not removed` stood here, and
// its own name is why it is gone: the type was deleted in Cycle C Task 8
// rather than hidden a second time. What is left of it is the assertion
// below — the panel offers exactly what core/ can render, with nothing held
// back.
describe('the panel offers exactly what core/ renders', () => {
  it('UI_BG_TYPES and BG_TYPES say the same thing', () => {
    expect([...UI_BG_TYPES].sort()).toEqual([...BG_TYPES].sort());
  });

  it('and mesh is gone from both, not merely hidden from one', () => {
    expect(BG_TYPES).not.toContain('mesh');
    const config = {};
    setBgType(config, 'mesh');
    expect(config.bgType).toBeUndefined();
    expect(normalise({ bgType: 'mesh' }).bgType).toBe('linear');
  });
});

// --- "Sampled" means the WHOLE ground (Task 1, fix round 1) --------------
//
// Rock, on the preview: "I was hoping that clicking on 'sampled' would
// reset everything, including luminosity. am I thinking wrong about it?" He
// was not. The first version shipped a SECOND button also labelled
// "Sampled" beside the luminosity slider, so two controls carried the same
// word and meant different-sized things. "Sampled" is now the whole ground;
// a single control's own reset is "Reset".
describe('Sampled clears every override, not just the hue', () => {
  it('resetToSampled clears hue AND luminosity', () => {
    const config = {};
    setHue(config, 200);
    setLuminosity(config, 0.3);
    expect(isFullySampled(config)).toBe(false);

    resetToSampled(config);
    expect(config.ground).toBeNull();
    expect(config.luminosity).toBeNull();
    expect(isFullySampled(config)).toBe(true);
  });

  it('is not fully sampled while EITHER is overridden', () => {
    const hueOnly = {};
    setHue(hueOnly, 200);
    expect(isFullySampled(hueOnly)).toBe(false);

    const lumOnly = {};
    setLuminosity(lumOnly, 0.3);
    // The half that was missing: a forced luminosity used to leave the
    // Sampled row still claiming the ground came from the screenshot.
    expect(isFullySampled(lumOnly)).toBe(false);
  });

  it('and the per-control reset still clears only its own control', () => {
    const config = {};
    setHue(config, 200);
    setLuminosity(config, 0.3);
    resetLuminosityToSampled(config);
    expect(config.luminosity).toBeNull();
    expect(forcedHueDeg(config)).toBe(200);   // the hue is untouched
  });
});

// --- Cycle C Task 4: the Background panel is type-first ------------------
//
// From the spec: type is the top control, and SAMPLED LIVES INSIDE EACH TYPE
// rather than being a fourth option beside them. The panel now reads
// top-down - pick the kind of background, then which one, then adjust it.
describe('the Background panel is type-first (Task 4)', () => {
  it('offers the types under their user-facing names', () => {
    // "Gradient", not "Linear": the label changes, the stored value does
    // not - `bgType` is still 'linear' everywhere in core/ and in every
    // jobs.json ever written.
    expect(TYPE_LABELS.linear).toBe('Gradient');
    expect(TYPE_LABELS.solid).toBe('Solid');
  });

  it('stores the internal value, not the label', () => {
    const config = {};
    setBgType(config, 'linear');
    expect(config.bgType).toBe('linear');
    expect(normalise(config).bgType).toBe('linear');
  });

  it('sampled belongs to the type, so switching type keeps it sampled', () => {
    const config = {};
    expect(isAutoGround(config)).toBe(true);
    setBgType(config, 'solid');
    expect(isAutoGround(config)).toBe(true);
  });

  it('and switching type keeps an explicit hue explicit', () => {
    const config = {};
    setHue(config, 200);
    setBgType(config, 'solid');
    expect(forcedHueDeg(config)).toBe(200);
  });

  it('and keeps an explicit luminosity too', () => {
    const config = {};
    setLuminosity(config, 0.3);
    setBgType(config, 'solid');
    expect(config.luminosity).toBeCloseTo(0.3, 12);
  });

  // Angle is a GRADIENT control. paintSolid fills flat with the middle stop
  // and never reads it, so on Solid it is a slider that moves and changes
  // nothing - the defect Cycle B spent eight tasks removing, sitting in
  // this panel the whole time.
  it('hides Angle for a type that cannot use it', () => {
    expect(showsAngle({ bgType: 'linear' })).toBe(true);
    expect(showsAngle({})).toBe(true);                 // linear is the default
    expect(showsAngle({ bgType: 'solid' })).toBe(false);
    // A type core/ does not know falls back to the default, which is linear.
    expect(showsAngle({ bgType: 'mesh' })).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Task 6 - equal click targets among peers.
//
// STRUCTURAL GUARDS. These read web/style.css as text, the same way
// test/selection.test.js and test/preset-tiles.test.js hold their own
// rules. Vitest has no layout engine, so the real measurement was taken in
// Chromium and recorded in docs/verification-2026-09-01.md; what a source
// guard buys is that nobody puts the old rule back without reading why.
// ---------------------------------------------------------------------
describe('a segmented cell is never sized by its own label (Task 6)', () => {
  const css = readFileSync('web/style.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

  it('mini segmented controls share their width equally between cells', () => {
    // Rock, 2026-09-02: "short names have also a short click target."
    // `.segmented--mini` shrink-wraps, so flex-grow has no free space to
    // share; grid columns are the mechanism that works on such a box.
    const block = css.match(/\.segmented--mini\s*\{([^}]*)\}/);
    expect(block, '.segmented--mini rule not found').toBeTruthy();
    expect(block[1]).toMatch(/grid-auto-columns:\s*1fr/);
  });

  it('and no rule anywhere lets a segmented cell size to its content', () => {
    // The exact declaration that caused it. `flex: none` on a cell means
    // "be as wide as your label", which is the defect itself.
    const cellRules = [...css.matchAll(/\.segmented-cell[^{]*\{([^}]*)\}/g)];
    expect(cellRules.length).toBeGreaterThan(0);
    for (const [, body] of cellRules) {
      expect(body, `a .segmented-cell rule sets flex: none:\n${body}`)
        .not.toMatch(/flex:\s*none/);
    }
  });

  it('and its cells clear the 24px target minimum', () => {
    // 26px on the control, because the cells sit inside its 1px border.
    // WCAG 2.2 AA 2.5.8 wants 24x24, and adjacent cells touch, so the
    // spacing exception does not apply to these. Measured at 24px in
    // Chromium after the change; every other undersized target in the app
    // was measured to PASS the spacing exception - see
    // docs/verification-2026-09-01.md.
    const block = css.match(/\.segmented--mini\s*\{([^}]*)\}/);
    expect(block[1]).toMatch(/height:\s*26px/);
  });

  it('the retired .control-hint is gone, not merely unused', () => {
    // Removed with the Luminosity paragraph in Task 5's fix round. A rule
    // with no user is the thing that gets reattached later.
    expect(css).not.toMatch(/\.control-hint\s*\{/);
  });
});

describe('the angle says which way it points (Task 7)', () => {
  it('names the light end in words, from the measured behaviour', () => {
    // 0 deg travels UP, so the light is at the bottom. Rising numbers turn
    // clockwise. The default, 166 deg, travels nearly straight down, so the
    // light end is at 346 deg - 14 deg off the top, and named 'top'. The
    // wording is deliberately eight-way and coarse; the dial beside it
    // carries the exact direction, and a label that claimed more precision
    // than eight names would be inventing it.
    expect(lightEndLabel(0)).toBe('bottom');
    expect(lightEndLabel(90)).toBe('left');
    expect(lightEndLabel(180)).toBe('top');
    expect(lightEndLabel(270)).toBe('right');
    expect(lightEndLabel(166)).toBe('top');
    expect(lightEndLabel(135)).toBe('top left');
    expect(lightEndLabel(210)).toBe('top right');
  });

  it('and wraps rather than running off either end', () => {
    expect(lightEndLabel(360)).toBe(lightEndLabel(0));
    expect(lightEndLabel(-90)).toBe(lightEndLabel(270));
  });
});

describe('the angle slider cannot wrap under the thumb (Task 7, fix round 1)', () => {
  it('stops one degree short of a full turn', () => {
    // Rock: "dragging the slider to 360 makes it jump to 0." setAngle wraps
    // a full turn to zero - right for every caller - and the panel wrote
    // that zero back into the input, so the thumb jumped to the far left
    // mid-drag. The slider's maximum must therefore be a value setAngle
    // leaves alone.
    const at = {};
    setAngle(at, ANGLE_SLIDER_MAX);
    expect(at.angle).toBe(ANGLE_SLIDER_MAX);

    // And the value that caused it, to show the rule has teeth.
    const wrapped = {};
    setAngle(wrapped, 360);
    expect(wrapped.angle).toBe(0);
  });

  it('and still covers the whole turn between its ends', () => {
    // 0 and 359 are one degree apart on the dial, not 359 - nothing is out
    // of reach, which is why capping is the right fix rather than a loss.
    expect(lightEndLabel(0)).toBe('bottom');
    expect(lightEndLabel(ANGLE_SLIDER_MAX)).toBe('bottom');
  });
});
