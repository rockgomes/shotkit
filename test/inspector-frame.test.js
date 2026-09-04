import { describe, it, expect, beforeEach } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import {
  DEFAULTS, normalise, layout, SHADOW_SCALE_RANGE, STROKE_WIDTH_RANGE, STROKE_DEFAULTS,
  BROWSER_RADIUS_RATIO, PHONE_RADIUS_RATIO, BROWSER_RADIUS_RANGE, PHONE_RADIUS_RANGE,
} from '../core/index.js';
import { state, bindCanvas, render } from '../web/state.js';
import {
  editingElement,
  activeFrameKind,
  setFrameKind,
  activeChromeTheme,
  setChromeTheme,
  showsBrowserOnlyControls,
  activeUrl,
  setUrl,
  activePadPercent,
  setPadPercent,
  PAD_PERCENT_MAX,
  activeGrainPercent,
  setGrainPercent,
  activeShadowPercent,
  setShadowPercent,
  activeRadiusPercent,
  setRadiusPercent,
  radiusRangeFor,
  RADIUS_PERCENT_MAX,
  activeStrokeStyle,
  setStrokeStyle,
  activeStrokeWidthPercent,
  setStrokeWidthPercent,
  STROKE_PERCENT_MAX,
  activeStrokeColor,
  setStrokeColor,
  showsStrokeWidth,
  showsStrokeColor,
} from '../web/inspector-frame.js';

const mkCanvas = (w, h) => createCanvas(w, h);

// ---------------------------------------------------------------------
// Pure helpers — no DOM. Same split web/sidebar.js and
// web/inspector-background.js already established.
// ---------------------------------------------------------------------

describe('frameKind', () => {
  it('defaults to none, same fallback normalise() itself uses', () => {
    expect(activeFrameKind({})).toBe('none');
    expect(activeFrameKind({ frameKind: 'macos' })).toBe('none'); // a stale/invalid value
  });

  it('setFrameKind accepts browser and phone, rejects anything else', () => {
    const config = {};
    setFrameKind(config, 'browser');
    expect(activeFrameKind(config)).toBe('browser');
    setFrameKind(config, 'phone');
    expect(activeFrameKind(config)).toBe('phone');
    setFrameKind(config, 'macos'); // rejected - stays at the last valid value
    expect(activeFrameKind(config)).toBe('phone');
  });
});

describe('chromeTheme', () => {
  it('defaults to dark', () => {
    expect(activeChromeTheme({})).toBe('dark');
  });

  it('setChromeTheme accepts light, rejects anything else', () => {
    const config = {};
    setChromeTheme(config, 'light');
    expect(activeChromeTheme(config)).toBe('light');
    setChromeTheme(config, 'nonsense');
    expect(activeChromeTheme(config)).toBe('light'); // unchanged, not reset to dark
  });
});

// Fix round 1 (Task 6): a reviewer found the chrome-theme control visible
// (and toggleable) for frameKind 'phone', even though core/render.js's
// paintPhoneChrome never receives `theme` at all - a segmented control
// that appears to work and does nothing. This is the regression test for
// that fix: ONE visibility rule for both browser-only secondary controls
// (chrome theme and url), asserted directly against the pure helper
// web/inspector-frame.js's DOM layer actually calls, not just eyeballed
// in a browser.
describe('showsBrowserOnlyControls - the chrome-theme/url visibility gate', () => {
  it('is true ONLY for frameKind browser - false for phone and none alike', () => {
    expect(showsBrowserOnlyControls({ frameKind: 'browser' })).toBe(true);
    expect(showsBrowserOnlyControls({ frameKind: 'phone' })).toBe(false);
    expect(showsBrowserOnlyControls({ frameKind: 'none' })).toBe(false);
    expect(showsBrowserOnlyControls({})).toBe(false); // unset -> 'none' via activeFrameKind
  });
});

// Task 6's actual gap-closer: the panel's own read/write pair for
// core/config.js's new `url` field. normalise() (real, unmodified) is what
// proves this file's raw pass-through actually reaches the pill the same
// way core/config.js does - not a duplicated coercion this file could drift from.
describe('the browser URL field', () => {
  it('activeUrl reads back what setUrl wrote', () => {
    const config = {};
    expect(activeUrl(config)).toBe(''); // unset -> empty input, not "null"
    setUrl(config, 'app.acme.dev');
    expect(activeUrl(config)).toBe('app.acme.dev');
  });

  it('an emptied field round-trips through normalise() to the empty-pill default, null', () => {
    const config = {};
    setUrl(config, 'app.acme.dev');
    setUrl(config, ''); // the user selected all and deleted it
    expect(activeUrl(config)).toBe('');
    expect(normalise(config).url).toBe(null); // core/config.js's own coercion, not duplicated here
  });
});

describe('padding percent <-> config.pad fraction', () => {
  it('an unset config reads back the shipped default, as a percent', () => {
    expect(activePadPercent({})).toBeCloseTo(DEFAULTS.pad * 100, 5);
  });

  it('setPadPercent writes a plain fraction normalise() reads directly', () => {
    const config = {};
    setPadPercent(config, 10);
    expect(config.pad).toBeCloseTo(0.10, 6);
    expect(activePadPercent(config)).toBeCloseTo(10, 5);
    expect(normalise(config).pad).toBeCloseTo(0.10, 6);
  });

  it('clamps to [0, PAD_PERCENT_MAX] - never a negative or runaway pad', () => {
    const config = {};
    setPadPercent(config, -5);
    expect(config.pad).toBe(0);
    setPadPercent(config, 999);
    expect(config.pad).toBeCloseTo(PAD_PERCENT_MAX / 100, 6);
  });
});

describe('grain percent <-> config.grain fraction', () => {
  it('an unset config reads back the shipped default, as a percent', () => {
    expect(activeGrainPercent({})).toBe(Math.round(DEFAULTS.grain * 100));
  });

  it('setGrainPercent clamps to [0, 100]', () => {
    const config = {};
    setGrainPercent(config, -10);
    expect(config.grain).toBe(0);
    setGrainPercent(config, 250);
    expect(config.grain).toBe(1);
    setGrainPercent(config, 60);
    expect(config.grain).toBeCloseTo(0.60, 6);
  });
});

// Task 6b: shadowScale is a MULTIPLIER over paintShadow's verified alphas
// (core/render.js) - this file only covers the percent<->fraction round
// trip and its clamp; the actual darkening effect is covered directly in
// test/render-screen.test.js and via the golden in test/compose.test.js.
describe('shadow percent <-> config.shadowScale fraction (Task 6b)', () => {
  it('an unset config reads back 100% - the shipped default, unchanged', () => {
    expect(activeShadowPercent({})).toBe(100);
    expect(activeShadowPercent({})).toBe(DEFAULTS.shadowScale * 100);
  });

  // CYCLE B TASK 5 MOVED THE WRITE onto the element. The claims are the same;
  // the destination is `elements[which].shadowScale`, and the flat field is
  // deliberately left alone so there is exactly one place a control writes.
  it('setShadowPercent writes a plain fraction normalise() reads directly', () => {
    const config = {};
    setShadowPercent(config, 160);
    expect(config.elements.web.shadowScale).toBeCloseTo(1.6, 6);
    expect(config.shadowScale).toBeUndefined();
    expect(activeShadowPercent(config)).toBe(160);
    expect(normalise(config).elements.web.shadowScale).toBeCloseTo(1.6, 6);
  });

  it('clamps to [0, 200]% - matching SHADOW_SCALE_RANGE, never negative or runaway', () => {
    const config = {};
    setShadowPercent(config, -10);
    expect(config.elements.web.shadowScale).toBe(SHADOW_SCALE_RANGE[0]);
    setShadowPercent(config, 999);
    expect(config.elements.web.shadowScale).toBe(SHADOW_SCALE_RANGE[1]);
  });

  it('0% removes the shadow entirely (shadowScale 0), 200% is the range ceiling', () => {
    const config = {};
    setShadowPercent(config, 0);
    expect(config.elements.web.shadowScale).toBe(0);
    setShadowPercent(config, 200);
    expect(config.elements.web.shadowScale).toBe(2);
  });

  it('still READS a flat shadowScale, so an old config or jobs.json is honoured', () => {
    // Reading has to accept every input shape; only writing has one home.
    expect(activeShadowPercent({ shadowScale: 0.4 })).toBe(40);
  });
});

// Corner radius is the one field here that ISN'T a stored fraction (see
// web/inspector-frame.js's header comment on RADIUS_PERCENT_MAX) - these
// tests go through normalise() (real, unmodified) on both sides of the
// round trip specifically to prove this file's percent<->px conversion
// actually agrees with what core/config.js resolves, not just with itself.
describe('corner radius percent <-> config.radius pixels', () => {
  it('an unset config reads back normalise()\'s own default radius, as a percent of width', () => {
    const eff = normalise({});
    expect(activeRadiusPercent({})).toBeCloseTo((eff.radius / eff.w) * 100, 1);
  });

  // CYCLE B TASK 3 MOVED THE WRITE. It used to set the flat `config.radius`,
  // which core/ read only on the unframed path - so the slider moved and,
  // under a frame, nothing happened. It now writes the ELEMENT, and core/
  // resolves it against whichever frame is on.
  it('setRadiusPercent writes a pixel value on the element, not the flat field', () => {
    const config = { ratio: '4:3' }; // w = 2000
    setRadiusPercent(config, 2);
    expect(config.elements.web.radius).toBe(40); // round(0.02 * 2000)
    expect(config.radius).toBeUndefined();
    expect(normalise(config).elements.web.radius).toBe(40);
  });

  it('never writes a negative radius', () => {
    const config = { ratio: '3:2' }; // w = 1800
    setRadiusPercent(config, -1);
    expect(config.elements.web.radius).toBe(0);
  });
});

// --- Cycle B Task 3: the radius control under a frame --------------------
describe('the corner radius control follows the frame (Task 3)', () => {
  it("reads back each frame's own default when nothing is set", () => {
    const eff = normalise({});
    // Unframed: normalise()'s own canvas-derived radius, unchanged.
    expect(activeRadiusPercent({})).toBeCloseTo((eff.radius / eff.w) * 100, 1);
    // Framed: the frame's own ratio, against the element width supplied.
    const W = 1675.2;
    expect(activeRadiusPercent({ frameKind: 'browser' }, 'web', W))
      .toBeCloseTo((W * BROWSER_RADIUS_RATIO / eff.w) * 100, 1);
    expect(activeRadiusPercent({ frameKind: 'phone' }, 'web', W))
      .toBeCloseTo((W * PHONE_RADIUS_RATIO / eff.w) * 100, 1);
  });

  it('the slider bounds follow the frame', () => {
    const eff = normalise({});
    const W = 1675.2;
    expect(radiusRangeFor({ frameKind: 'none' })).toEqual([0, RADIUS_PERCENT_MAX]);
    const [bLo, bHi] = radiusRangeFor({ frameKind: 'browser' }, 'web', W);
    expect(bLo).toBeCloseTo(0, 6);
    expect(bHi).toBeCloseTo(BROWSER_RADIUS_RANGE[1] * W / eff.w * 100, 1);
    const [pLo, pHi] = radiusRangeFor({ frameKind: 'phone' }, 'web', W);
    expect(pLo).toBeCloseTo(PHONE_RADIUS_RANGE[0] * W / eff.w * 100, 1);
    expect(pHi).toBeCloseTo(PHONE_RADIUS_RANGE[1] * W / eff.w * 100, 1);
    // A phone's floor is NOT zero - a square-cornered phone is not a phone.
    expect(pLo).toBeGreaterThan(1);
  });

  it('what the slider writes actually reaches the rendered corner', () => {
    // The end-to-end claim, and the one the old test could not make: write
    // through the panel, then read the corner core/ actually lays out.
    const config = { layout: 'web', ratio: '3:2', frameKind: 'browser' };
    const before = layout(normalise(config), { web: 1.6, mobile: [] }).web.chrome.radius;
    setRadiusPercent(config, 3);
    const after = layout(normalise(config), { web: 1.6, mobile: [] }).web.chrome.radius;
    expect(after).toBeGreaterThan(before * 2);
  });

  it('changing the frame does not silently move a radius the user set', () => {
    const config = { ratio: '3:2' };
    setRadiusPercent(config, 2);
    const set = config.elements.web.radius;
    setFrameKind(config, 'browser');
    expect(config.elements.web.radius).toBe(set);
  });
});

// Cycle A Task 4: the Fit segmented control and the Caption text input are
// gone from the Finish section. This asserts the MODULE SURFACE rather than
// the DOM (this suite runs under vitest's node environment, with no
// document): those four helpers were the only state path either control
// had, so a control still on screen would either import a name that no
// longer exists or duplicate the coercion this file deliberately never
// duplicates. Verified in the browser as well - see the task report.
describe('retired Finish controls', () => {
  it('exports no fit or caption helpers', async () => {
    const mod = await import('../web/inspector-frame.js');
    for (const name of ['activeFit', 'setFit', 'activeCaption', 'setCaption']) {
      expect(mod[name], `${name} is still exported`).toBeUndefined();
    }
  });

  it('still exports the Finish controls that stay', async () => {
    const mod = await import('../web/inspector-frame.js');
    for (const name of ['activePadPercent', 'setPadPercent', 'activeRadiusPercent',
      'activeGrainPercent', 'activeShadowPercent', 'initFinishInspector']) {
      expect(typeof mod[name], `${name} went missing`).toBe('function');
    }
  });
});

// ---------------------------------------------------------------------
// PERFORMANCE: none of the fields this file writes (frameKind, chromeTheme,
// url, pad, radius, grain, shadowScale) is part of
// web/state.js's `groundKeyFor` - see that file's own comment for the exact
// field list. This drives the REAL web/state.js render(), the same harness
// test/web-export.test.js already established, and proves it with a
// throwing canvas factory rather than a timing number: if any Frame/Finish
// control ever needed a genuinely new scratch canvas (a fresh sample
// thumbnail - groundFor running again - or a differently-sized grain
// tile), this fails immediately and says which control did it, instead of
// merely running slower.
//
// THE GUARD NAMES THE TWO SIZES IT CARES ABOUT rather than refusing every
// allocation (Task 4d). Shots are now composed in per-shot offscreen tiles,
// and a tile's size follows the shot's own box - so `pad` legitimately asks
// for a canvas size it has never asked for before, and refusing all
// allocation would fail on a change that costs a buffer rather than a
// colour analysis. The expensive thing has always been groundFor, and its
// fingerprint is a request for the SAMPLE THUMBNAIL's exact size; the grain
// tile's is 240 at scale 1. Those two are what must never be re-requested,
// and those two are what throw. `state._groundKey` below is the same claim
// made structurally, and neither assertion is load-bearing alone.
// ---------------------------------------------------------------------

beforeEach(() => {
  state.config = { ratio: '3:2' };
  state.images = { web: null, mobile: [] };
  state.meta = null;
});

describe('Task 6: Frame/Finish fields hit the warm colour cache, never groundFor', () => {
  it('a full sweep of frameKind/chromeTheme/url/pad/radius/grain/shadow allocates zero new scratch canvases', async () => {
    const web = await loadImage('samples/fieldset.png');
    // core/index.js's sampleOf: the source, scaled to fit inside 800px.
    const s = Math.min(1, 800 / web.width, 800 / web.height);
    const thumb = `${Math.max(1, Math.floor(web.width * s))}x${Math.max(1, Math.floor(web.height * s))}`;
    const coldSizes = new Set([thumb, '240x240']);   // sample thumbnail, grain tile
    let armed = false;
    const guardedFactory = (w, h) => {
      if (armed && coldSizes.has(`${w}x${h}`)) {
        throw new Error(
          `a Frame/Finish control asked for a NEW ${w}x${h} scratch canvas - that is ` +
          'the sample thumbnail or the grain tile, so the colour cache went cold ' +
          '(see web/state.js\'s groundKeyFor)',
        );
      }
      return mkCanvas(w, h);
    };

    const target = createCanvas(10, 10);
    bindCanvas(target, guardedFactory);
    state.images.web = web;
    render(); // cold: builds the sample thumbnail and the grain tile once

    const keyAfterFirst = state._groundKey;
    expect(keyAfterFirst).toBeTruthy();
    armed = true; // any further canvas allocation now throws

    setFrameKind(state.config, 'browser'); render();
    setChromeTheme(state.config, 'light'); render();
    setUrl(state.config, 'app.acme.dev'); render();
    setPadPercent(state.config, 10); render();
    setRadiusPercent(state.config, 3); render();
    setGrainPercent(state.config, 80); render();
    setShadowPercent(state.config, 160); render();

    // Structural, not just "didn't throw": the ground key genuinely never
    // changed, so every render() above actually took the precomputed-meta
    // path (core/index.js's composeWithMeta) rather than recomputing it.
    expect(state._groundKey).toBe(keyAfterFirst);
  });

  // Break-it check: frameKind DOES belong in the key's INPUT to
  // composeWithMeta (it's part of `config`), so this proves the test above
  // isn't vacuously true because render() stopped reading state.config at
  // all - a real visual change (browser chrome appearing) still happens
  // even though the cache stayed warm.
  it('the render output still actually changes, proving the warm cache is not a no-op', async () => {
    const web = await loadImage('samples/fieldset.png');
    const target = createCanvas(10, 10);
    bindCanvas(target, mkCanvas);
    state.images.web = web;
    render();
    const before = target.toBuffer('image/png');

    setFrameKind(state.config, 'browser');
    render();
    const after = target.toBuffer('image/png');

    expect(Buffer.compare(before, after)).not.toBe(0);
  });

  // Task 6b's own explicit ask: prove, in isolation, that dragging the
  // Shadow slider alone never busts the colour cache. The sweep above
  // already includes setShadowPercent among eight other controls; this
  // isolates it so a future change that only breaks shadowScale can't hide
  // behind the other seven passing.
  it('a shadow-only drag never constructs a new scratch canvas (throwing-canvas proof)', async () => {
    const web = await loadImage('samples/fieldset.png');
    let armed = false;
    const guardedFactory = (w, h) => {
      if (armed) {
        throw new Error(
          `setShadowPercent asked for a NEW ${w}x${h} scratch canvas - shadow has ` +
          'nothing to do with the sampled ground, so it should have hit the warm ' +
          "colour cache instead (see web/state.js's groundKeyFor)",
        );
      }
      return mkCanvas(w, h);
    };

    const target = createCanvas(10, 10);
    bindCanvas(target, guardedFactory);
    state.images.web = web;
    render(); // cold: builds the sample thumbnail and the grain tile once

    const keyAfterFirst = state._groundKey;
    expect(keyAfterFirst).toBeTruthy();
    armed = true; // any further canvas allocation now throws

    setShadowPercent(state.config, 0); render();
    setShadowPercent(state.config, 160); render();
    setShadowPercent(state.config, 200); render();

    expect(state._groundKey).toBe(keyAfterFirst);
  });

  // Break-it check, matching the frameKind one above: proves the warm cache
  // in the test just above isn't hiding a shadowScale that render() stopped
  // reading - the pixels actually move when shadowScale changes even though
  // groundFor never reruns.
  it('a shadow-only drag still actually changes the rendered pixels', async () => {
    const web = await loadImage('samples/fieldset.png');
    const target = createCanvas(10, 10);
    bindCanvas(target, mkCanvas);
    state.images.web = web;
    render();
    const before = target.toBuffer('image/png');

    setShadowPercent(state.config, 200);
    render();
    const after = target.toBuffer('image/png');

    expect(Buffer.compare(before, after)).not.toBe(0);
  });
});

// --- Stroke (Cycle A Task 7) ---------------------------------------------
//
// The round trip goes through the REAL normalise() on both sides, like the
// corner-radius block above, so these prove the panel agrees with
// core/config.js rather than only with itself.
describe('stroke style, width and colour (Task 7)', () => {
  it('an unset config reads back the shipped default: no stroke', () => {
    expect(activeStrokeStyle({})).toBe('none');
    expect(activeStrokeStyle({})).toBe(STROKE_DEFAULTS.style);
    expect(normalise({}).stroke.style).toBe('none');
  });

  it('setStrokeStyle writes a block normalise() reads back unchanged', () => {
    const config = {};
    setStrokeStyle(config, 'glass');
    expect(activeStrokeStyle(config)).toBe('glass');
    expect(normalise(config).elements.web.stroke.style).toBe('glass');
    expect(config.stroke).toBeUndefined();
  });

  it('ignores a style that is not a stroke style, leaving the config alone', () => {
    const config = {};
    setStrokeStyle(config, 'light');
    setStrokeStyle(config, 'embossed');
    expect(activeStrokeStyle(config)).toBe('light');
  });

  it('changing the style keeps a width the user already set', () => {
    const config = {};
    setStrokeWidthPercent(config, 3.4);
    setStrokeStyle(config, 'glass');
    // Task 5b reset the user's value here by spreading defaults LAST while
    // the slider went on showing the old number. It must not happen again.
    expect(activeStrokeWidthPercent(config)).toBe(3.4);
    expect(normalise(config).elements.web.stroke.width).toBeCloseTo(0.034, 6);
  });

  it('setStrokeWidthPercent writes a fraction of the shorter canvas side', () => {
    const config = {};
    setStrokeWidthPercent(config, 2);
    expect(config.elements.web.stroke.width).toBeCloseTo(0.02, 9);
    expect(activeStrokeWidthPercent(config)).toBe(2);
    expect(normalise(config).elements.web.stroke.width).toBeCloseTo(0.02, 9);
  });

  it('clamps the width at both ends, to STROKE_WIDTH_RANGE', () => {
    const config = {};
    setStrokeWidthPercent(config, -5);
    expect(config.elements.web.stroke.width).toBe(STROKE_WIDTH_RANGE[0]);
    setStrokeWidthPercent(config, 999);
    expect(config.elements.web.stroke.width).toBeCloseTo(STROKE_WIDTH_RANGE[1], 9);
    expect(STROKE_PERCENT_MAX).toBe(STROKE_WIDTH_RANGE[1] * 100);
  });

  it('takes a six-digit hex colour and refuses anything else', () => {
    const config = {};
    setStrokeColor(config, '#3311ff');
    expect(activeStrokeColor(config)).toBe('#3311ff');
    expect(normalise(config).elements.web.stroke.color).toBe('#3311ff');
    setStrokeColor(config, 'rebeccapurple');
    setStrokeColor(config, '#fff');
    expect(activeStrokeColor(config)).toBe('#3311ff');
  });

  it('shows width only once a style paints, and colour only for custom', () => {
    const config = {};
    expect(showsStrokeWidth(config)).toBe(false);
    expect(showsStrokeColor(config)).toBe(false);
    setStrokeStyle(config, 'light');
    expect(showsStrokeWidth(config)).toBe(true);
    expect(showsStrokeColor(config)).toBe(false);
    setStrokeStyle(config, 'custom');
    expect(showsStrokeWidth(config)).toBe(true);
    expect(showsStrokeColor(config)).toBe(true);
  });
});

// --- Cycle B Task 5: stroke and shadow belong to an element --------------
describe('stroke and shadow are written per element (Task 5)', () => {
  it('writes the element named, and no other', () => {
    const config = {};
    setStrokeStyle(config, 'glass', 'mobile');
    setShadowPercent(config, 160, 'mobile');
    const eff = normalise(config);
    expect(eff.elements.mobile.stroke.style).toBe('glass');
    expect(eff.elements.mobile.shadowScale).toBeCloseTo(1.6, 9);
    // The web element keeps the defaults - the whole point.
    expect(eff.elements.web.stroke.style).toBe('none');
    expect(eff.elements.web.shadowScale).toBe(1);
  });

  it('the two elements hold different values at the same time', () => {
    const config = {};
    setStrokeStyle(config, 'light', 'web');
    setStrokeWidthPercent(config, 2, 'web');
    setStrokeStyle(config, 'custom', 'mobile');
    setStrokeColor(config, '#ff00aa', 'mobile');
    const eff = normalise(config);
    expect(eff.elements.web.stroke).toMatchObject({ style: 'light', width: 0.02 });
    expect(eff.elements.mobile.stroke).toMatchObject({ style: 'custom', color: '#ff00aa' });
  });

  it('changing one element\'s style does not reset the other\'s width', () => {
    const config = {};
    setStrokeWidthPercent(config, 3.4, 'mobile');
    setStrokeStyle(config, 'glass', 'web');
    expect(activeStrokeWidthPercent(config, 'mobile')).toBe(3.4);
  });

  it('the show/hide gates follow the element too', () => {
    const config = {};
    setStrokeStyle(config, 'custom', 'mobile');
    expect(showsStrokeColor(config, 'mobile')).toBe(true);
    expect(showsStrokeColor(config, 'web')).toBe(false);
    expect(showsStrokeWidth(config, 'web')).toBe(false);
  });
});

// --- Cycle B Task 7: the inspector edits the SELECTED element ------------
describe('the inspector edits the selected element (Task 7)', () => {
  it('edits web by default', () => {
    expect(editingElement({ selection: null, images: { web: {}, mobile: [] } })).toBe('web');
  });

  // The case that matters, and the reason "always web" is not good enough:
  // a mobile-only shot has no web element at all, so a panel hard-wired to
  // 'web' writes somewhere nothing reads. That is exactly the dead control
  // Rock hit while testing Task 3.
  it('edits mobile when that is the only thing on the canvas', () => {
    expect(editingElement({ selection: null, images: { web: null, mobile: [{}] } }))
      .toBe('mobile');
  });

  it('edits web when both are present and nothing is selected', () => {
    expect(editingElement({ selection: null, images: { web: {}, mobile: [{}] } })).toBe('web');
  });

  it('an explicit selection wins over both', () => {
    expect(editingElement({ selection: 'web', images: { web: null, mobile: [{}] } }))
      .toBe('web');
    expect(editingElement({ selection: 'mobile', images: { web: {}, mobile: [] } }))
      .toBe('mobile');
  });

  it('survives a state with nothing in it', () => {
    expect(editingElement({})).toBe('web');
    expect(editingElement()).toBe('web');
  });

  it('writes the frame to the element named, and no other', () => {
    const config = {};
    setFrameKind(config, 'browser', 'mobile');
    expect(config.elements.mobile.frameKind).toBe('browser');
    expect(config.elements.web).toBeUndefined();
    expect(config.frameKind).toBeUndefined();
  });

  it('reads back the element named, not always web', () => {
    const config = { elements: { web: { frameKind: 'none' }, mobile: { frameKind: 'browser' } } };
    expect(activeFrameKind(config, 'web')).toBe('none');
    expect(activeFrameKind(config, 'mobile')).toBe('browser');
    expect(showsBrowserOnlyControls(config, 'mobile')).toBe(true);
    expect(showsBrowserOnlyControls(config, 'web')).toBe(false);
  });

  it('the chrome theme and url are per element too', () => {
    const config = {};
    setChromeTheme(config, 'light', 'mobile');
    setUrl(config, 'phone.dev', 'mobile');
    expect(activeChromeTheme(config, 'mobile')).toBe('light');
    expect(activeUrl(config, 'mobile')).toBe('phone.dev');
    expect(activeChromeTheme(config, 'web')).toBe('dark');
    expect(activeUrl(config, 'web')).toBe('');
  });

  it('the corner radius follows the element as well', () => {
    const config = {};
    setRadiusPercent(config, 2, 'mobile');
    expect(config.elements.mobile.radius).toBeGreaterThan(0);
    expect(config.elements.web).toBeUndefined();
  });
});
