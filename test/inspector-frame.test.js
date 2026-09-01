import { describe, it, expect, beforeEach } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { DEFAULTS, normalise, SHADOW_SCALE_RANGE } from '../core/index.js';
import { state, bindCanvas, render } from '../web/state.js';
import {
  activeFrameKind,
  setFrameKind,
  activeChromeTheme,
  setChromeTheme,
  showsBrowserOnlyControls,
  activeUrl,
  setUrl,
  activeFit,
  setFit,
  activePadPercent,
  setPadPercent,
  PAD_PERCENT_MAX,
  activeGrainPercent,
  setGrainPercent,
  activeShadowPercent,
  setShadowPercent,
  activeRadiusPercent,
  setRadiusPercent,
  RADIUS_PERCENT_MAX,
  activeCaption,
  setCaption,
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
// way `caption` does - not a duplicated coercion this file could drift from.
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

describe('fit', () => {
  it('defaults to contain', () => {
    expect(activeFit({})).toBe(DEFAULTS.fit);
    expect(activeFit({})).toBe('contain');
  });

  it('setFit accepts cover, rejects anything else', () => {
    const config = {};
    setFit(config, 'cover');
    expect(activeFit(config)).toBe('cover');
    setFit(config, 'stretch'); // not a real FITS value
    expect(activeFit(config)).toBe('cover');
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

  it('setShadowPercent writes a plain fraction normalise() reads directly', () => {
    const config = {};
    setShadowPercent(config, 160);
    expect(config.shadowScale).toBeCloseTo(1.6, 6);
    expect(activeShadowPercent(config)).toBe(160);
    expect(normalise(config).shadowScale).toBeCloseTo(1.6, 6);
  });

  it('clamps to [0, 200]% - matching SHADOW_SCALE_RANGE, never negative or runaway', () => {
    const config = {};
    setShadowPercent(config, -10);
    expect(config.shadowScale).toBe(SHADOW_SCALE_RANGE[0]);
    setShadowPercent(config, 999);
    expect(config.shadowScale).toBe(SHADOW_SCALE_RANGE[1]);
  });

  it('0% removes the shadow entirely (shadowScale 0), 200% is the range ceiling', () => {
    const config = {};
    setShadowPercent(config, 0);
    expect(config.shadowScale).toBe(0);
    setShadowPercent(config, 200);
    expect(config.shadowScale).toBe(2);
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

  it('setRadiusPercent writes a pixel value that normalise() reads back unchanged', () => {
    const config = { ratio: '4:3' }; // w = 2000
    setRadiusPercent(config, 2);
    expect(config.radius).toBe(40); // round(0.02 * 2000)
    expect(normalise(config).radius).toBe(40); // an explicit radius is honoured verbatim
  });

  it('clamps to [0, RADIUS_PERCENT_MAX]', () => {
    const config = { ratio: '3:2' }; // w = 1800
    setRadiusPercent(config, -1);
    expect(config.radius).toBe(0);
    setRadiusPercent(config, 999);
    expect(config.radius).toBe(Math.round((RADIUS_PERCENT_MAX / 100) * 1800));
  });
});

describe('caption', () => {
  it('activeCaption reads back what setCaption wrote, and empty coerces to null via normalise()', () => {
    const config = {};
    expect(activeCaption(config)).toBe('');
    setCaption(config, 'Fieldset — 2026');
    expect(activeCaption(config)).toBe('Fieldset — 2026');
    expect(normalise(config).caption).toBe('Fieldset — 2026');
    setCaption(config, '');
    expect(normalise(config).caption).toBe(null);
  });
});

// ---------------------------------------------------------------------
// PERFORMANCE: none of the fields this file writes (frameKind, chromeTheme,
// url, fit, pad, radius, grain, shadowScale, caption) is part of
// web/state.js's `groundKeyFor` - see that file's own comment for the exact
// field list. This drives the REAL web/state.js render(), the same harness
// test/web-export.test.js already established, and proves it with a
// throwing canvas factory rather than a timing number: if any Frame/Finish
// control ever needed a genuinely new scratch canvas (a fresh sample
// thumbnail - groundFor running again - or a differently-sized grain
// tile), this fails immediately and says which control did it, instead of
// merely running slower.
// ---------------------------------------------------------------------

beforeEach(() => {
  state.config = { ratio: '3:2' };
  state.images = { web: null, mobile: [] };
  state.meta = null;
});

describe('Task 6: Frame/Finish fields hit the warm colour cache, never groundFor', () => {
  it('a full sweep of frameKind/chromeTheme/url/fit/pad/radius/grain/shadow/caption allocates zero new scratch canvases', async () => {
    const web = await loadImage('samples/fieldset.png');
    let armed = false;
    const guardedFactory = (w, h) => {
      if (armed) {
        throw new Error(
          `a Frame/Finish control asked for a NEW ${w}x${h} scratch canvas - ` +
          'should have hit the warm colour cache instead (see web/state.js\'s groundKeyFor)',
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
    setFit(state.config, 'cover'); render();
    setPadPercent(state.config, 10); render();
    setRadiusPercent(state.config, 3); render();
    setGrainPercent(state.config, 80); render();
    setShadowPercent(state.config, 160); render();
    setCaption(state.config, 'Fieldset — 2026'); render();

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
