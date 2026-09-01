import { describe, it, expect, beforeEach } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { HUES, TONES, BG_TYPES, normalise, groundFor } from '../core/index.js';
import { state, bindCanvas, render } from '../web/state.js';
import { selectGround, activeGroundKey } from '../web/sidebar.js';
import {
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
    expect(BG_TYPES).toContain('mesh');
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
    expect(TONES).toContain('mid');
    expect(activeToneUi(config)).toBe('mid');
    setTone(config, 'auto');
    expect(config.tone).toBeNull(); // NOT the string 'auto' — core/config.js's TONES is only ['light','mid']
    expect(activeToneUi(config)).toBe('auto');
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
