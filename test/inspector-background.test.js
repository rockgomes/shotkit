import { describe, it, expect, beforeEach } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import {
  HUES, normalise, groundFor, MESH_STOPS_RANGE, MESH_SPREAD_RANGE, MESH_DEFAULTS,
} from '../core/index.js';
import { state, bindCanvas, render } from '../web/state.js';
import { selectGround, activeGroundKey } from '../web/sidebar.js';
import {
  UI_BG_TYPES,
  activeMeshStops,
  setMeshStops,
  activeMeshSpread,
  setMeshSpread,
  isAutoGround,
  forcedHueDeg,
  setHue,
  resetToSampled,
  setAngle,
  setBgType,
  clampSeed,
  setSeed,
  SEED_MIN,
  SEED_MAX,
  setTone,
  activeToneUi,
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

describe('angle, background type, seed and tone helpers', () => {
  it('setAngle wraps degrees the same way setHue does', () => {
    const config = {};
    setAngle(config, 370);
    expect(config.angle).toBe(10);
  });

  it('setBgType only accepts a real BG_TYPES value', () => {
    const config = {};
    setBgType(config, 'not-a-type');
    expect(config.bgType).toBeUndefined();
    setBgType(config, 'mesh');
    expect(config.bgType).toBe('mesh');
    // Rejects a value that looks plausible but was never a member of
    // BG_TYPES, and does not clobber the last good value while doing so —
    // this exercises setBgType's own guard, not BG_TYPES' own contents.
    setBgType(config, 'gradient');
    expect(config.bgType).toBe('mesh');
  });

  it('clampSeed/setSeed keep the seed inside [SEED_MIN, SEED_MAX]', () => {
    expect(clampSeed(0)).toBe(SEED_MIN);
    expect(clampSeed(500)).toBe(SEED_MAX);
    expect(clampSeed(12.6)).toBe(13);
    const config = {};
    setSeed(config, -5);
    expect(config.seed).toBe(SEED_MIN);
  });

  it('setTone/activeToneUi round-trip auto <-> null correctly', () => {
    const config = {};
    expect(activeToneUi(config)).toBe('auto');
    setTone(config, 'mid');
    expect(config.tone).toBe('mid');
    expect(activeToneUi(config)).toBe('mid');
    setTone(config, 'auto');
    expect(config.tone).toBeNull(); // NOT the string 'auto' — core/config.js's TONES is only ['light','mid']
    expect(activeToneUi(config)).toBe('auto');
    // Rejects a value that isn't a real tone at all — falls back to auto,
    // not to whatever was there a moment ago.
    setTone(config, 'not-a-tone');
    expect(config.tone).toBeNull();
  });

  it('BREAK IT: if setTone stored the string "auto" instead of null, core would silently ignore it AND keep it forever', () => {
    const config = {};
    config.tone = 'auto'; // the bug
    // core/config.js's normalise(): TONES.includes(input.tone) ? input.tone : DEFAULTS.tone
    expect(normalise(config).tone).toBe(null); // falls back correctly here...
    // ...but activeToneUi would misreport it as staying forced, because
    // TONES.includes('auto') is false, the same false as for `undefined` -
    // so a naive reader could wrongly treat this as a THIRD distinct tone.
    // The real setTone() never produces this value in the first place:
    setTone(config, 'auto');
    expect(config.tone).toBeNull();
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

describe('angle hits the warm ground cache; hue and tone bust it', () => {
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

  it('changing tone DOES re-run groundFor (a new meta object)', async () => {
    const web = await loadImage('samples/fieldset.png');
    const target = createCanvas(10, 10);
    bindCanvas(target, mkCanvas);
    state.images.web = web;

    render();
    const firstMeta = state.meta;

    setTone(state.config, 'mid');
    render();

    expect(state.meta).not.toBe(firstMeta);
  });
});

// --- Mesh stops and spread (Cycle A Task 9) ------------------------------
//
// The round trip goes through the REAL normalise() on both sides, so these
// prove the panel agrees with core/config.js rather than only with itself.
describe('mesh stops and spread (Task 9)', () => {
  it('an unset config reads back the shipped defaults', () => {
    expect(activeMeshStops({})).toBe(MESH_DEFAULTS.stops);
    expect(activeMeshSpread({})).toBe(MESH_DEFAULTS.spread);
    expect(normalise({}).mesh).toEqual(MESH_DEFAULTS);
  });

  it('setMeshStops writes a block normalise() reads back unchanged', () => {
    const config = {};
    setMeshStops(config, 5);
    expect(activeMeshStops(config)).toBe(5);
    expect(normalise(config).mesh.stops).toBe(5);
  });

  it('setMeshSpread writes degrees normalise() reads back unchanged', () => {
    const config = {};
    setMeshSpread(config, 130);
    expect(activeMeshSpread(config)).toBe(130);
    expect(normalise(config).mesh.spread).toBe(130);
  });

  it('clamps both at each end of their range', () => {
    const config = {};
    setMeshStops(config, 0);
    expect(config.mesh.stops).toBe(MESH_STOPS_RANGE[0]);
    setMeshStops(config, 99);
    expect(config.mesh.stops).toBe(MESH_STOPS_RANGE[1]);
    setMeshSpread(config, -40);
    expect(config.mesh.spread).toBe(MESH_SPREAD_RANGE[0]);
    setMeshSpread(config, 999);
    expect(config.mesh.spread).toBe(MESH_SPREAD_RANGE[1]);
  });

  it('changing one field leaves the other alone', () => {
    // Task 5b reset the user's value here by spreading defaults LAST while
    // the control went on showing the old number. It must not happen again.
    const config = {};
    setMeshSpread(config, 130);
    setMeshStops(config, 5);
    expect(activeMeshSpread(config)).toBe(130);
    setMeshSpread(config, 20);
    expect(activeMeshStops(config)).toBe(5);
  });

  it('never moves the seed, which lives at the top level and not in the block', () => {
    // One value, one home. A `seed` inside `config.mesh` would be a second
    // writable source for it - the shape of the Task 5b failure.
    const config = { seed: 12 };
    setMeshStops(config, 5);
    setMeshSpread(config, 90);
    expect(config.seed).toBe(12);
    expect(config.mesh.seed).toBeUndefined();
    expect(normalise(config).mesh.seed).toBeUndefined();
  });

  it('ignores a non-numeric value rather than corrupting the block', () => {
    const config = {};
    setMeshStops(config, 4);
    setMeshStops(config, 'lots');
    setMeshSpread(config, 'wide');
    expect(activeMeshStops(config)).toBe(4);
    expect(activeMeshSpread(config)).toBe(MESH_DEFAULTS.spread);
  });
});

// --- Mesh withheld from the panel (2026-09-03) ---------------------------
//
// Rock's call after using the rebuilt mesh: it cannot carry a shot on a pale
// palette, and the palette is Cycle B's work. These assert the shape of that
// decision - the way IN is closed, the feature is not deleted - so that
// restoring it later is one line rather than an archaeology exercise.
describe('mesh is withheld from the Background panel, not removed', () => {
  it('the panel does not offer mesh', () => {
    expect(UI_BG_TYPES).not.toContain('mesh');
    expect(UI_BG_TYPES).toContain('linear');
    expect(UI_BG_TYPES).toContain('solid');
  });

  it('core still accepts and renders it, so nothing was thrown away', () => {
    expect(normalise({ bgType: 'mesh' }).bgType).toBe('mesh');
    const config = {};
    setBgType(config, 'mesh');
    expect(config.bgType).toBe('mesh');
  });

  it('and the mesh controls still work for whatever does set it', () => {
    const config = {};
    setMeshStops(config, 5);
    setMeshSpread(config, 120);
    expect(normalise(config).mesh).toEqual({ stops: 5, spread: 120 });
  });
});
