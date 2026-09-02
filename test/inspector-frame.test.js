import { describe, it, expect, beforeEach } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { DEFAULTS, normalise, SHADOW_SCALE_RANGE } from '../core/index.js';
import {
  SHADOW_DEFAULTS, SHADOW_DISTANCE_RANGE, SHADOW_BLUR_RANGE,
} from '../core/presets.js';
import { readFileSync } from 'node:fs';
import { state, bindCanvas, render } from '../web/state.js';
import {
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
  RADIUS_PERCENT_MAX,
  activeShadowDistancePercent,
  setShadowDistancePercent,
  activeShadowBlurPercent,
  setShadowBlurPercent,
  activeShadowAngle,
  setShadowAngle,
  activeShadowDirectional,
  setShadowDirectional,
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

// Cycle A Task 5: the four new shadow controls — Distance, Angle, Blur and
// the Directional toggle. Every assertion below goes through the REAL
// normalise() on the far side of the round trip, not just this file's own
// helpers, so a percent<->fraction convention that agreed only with itself
// would still fail here.
describe('Task 5: shadow distance', () => {
  it("an unset config reads back core/'s own default, as a percent of canvas height", () => {
    expect(activeShadowDistancePercent({})).toBeCloseTo(SHADOW_DEFAULTS.distance * 100, 5);
    expect(activeShadowDistancePercent({})).toBe(4);
  });

  it('writes a fraction normalise() reads back unchanged', () => {
    const config = {};
    setShadowDistancePercent(config, 12);
    expect(config.shadow.distance).toBeCloseTo(0.12, 6);
    expect(normalise(config).shadow.distance).toBeCloseTo(0.12, 6);
    expect(activeShadowDistancePercent(config)).toBeCloseTo(12, 5);
  });

  it('clamps at BOTH ends, to SHADOW_DISTANCE_RANGE', () => {
    const config = {};
    setShadowDistancePercent(config, -40);
    expect(config.shadow.distance).toBe(SHADOW_DISTANCE_RANGE[0]);
    setShadowDistancePercent(config, 999);
    expect(config.shadow.distance).toBe(SHADOW_DISTANCE_RANGE[1]);
  });

  it('leaves the other shadow fields alone', () => {
    const config = {};
    setShadowDistancePercent(config, 8);
    expect(config.shadow.blur).toBe(SHADOW_DEFAULTS.blur);
    expect(config.shadow.angle).toBe(SHADOW_DEFAULTS.angle);
    expect(config.shadow.directional).toBe(false);
  });
});

describe('Task 5: shadow blur', () => {
  it("an unset config reads back core/'s own default", () => {
    expect(activeShadowBlurPercent({})).toBeCloseTo(SHADOW_DEFAULTS.blur * 100, 5);
    expect(activeShadowBlurPercent({})).toBe(10.5);
  });

  it('writes a fraction normalise() reads back unchanged', () => {
    const config = {};
    setShadowBlurPercent(config, 25);
    expect(config.shadow.blur).toBeCloseTo(0.25, 6);
    expect(normalise(config).shadow.blur).toBeCloseTo(0.25, 6);
  });

  it('clamps at BOTH ends, to SHADOW_BLUR_RANGE', () => {
    const config = {};
    setShadowBlurPercent(config, -1);
    expect(config.shadow.blur).toBe(SHADOW_BLUR_RANGE[0]);
    setShadowBlurPercent(config, 999);
    expect(config.shadow.blur).toBe(SHADOW_BLUR_RANGE[1]);
  });
});

describe('Task 5: shadow angle', () => {
  it('an unset config reads back 90 — straight down, the shipped direction', () => {
    expect(activeShadowAngle({})).toBe(SHADOW_DEFAULTS.angle);
    expect(activeShadowAngle({})).toBe(90);
  });

  it('writes a value normalise() reads back unchanged', () => {
    const config = {};
    setShadowAngle(config, 217);
    expect(config.shadow.angle).toBe(217);
    expect(normalise(config).shadow.angle).toBe(217);
    expect(activeShadowAngle(config)).toBe(217);
  });

  // Angle WRAPS rather than clamps, and does so with exactly the expression
  // core/config.js uses. Clamping would let the panel display a value
  // normalise() then disagrees with (450 shown, 90 rendered), which is the
  // "control that appears to work" failure this file already has one fix
  // round for. The ends still behave: nothing out of range survives.
  it('wraps at both ends, agreeing with normalise() rather than clamping', () => {
    const config = {};
    setShadowAngle(config, -90);
    expect(config.shadow.angle).toBe(270);
    expect(normalise(config).shadow.angle).toBe(270);
    setShadowAngle(config, 450);
    expect(config.shadow.angle).toBe(90);
    setShadowAngle(config, 360);
    expect(config.shadow.angle).toBe(0);
  });
});

describe('Task 5: the directional toggle', () => {
  it('is off by default — the shipped, non-directional shadow', () => {
    expect(activeShadowDirectional({})).toBe(false);
    expect(normalise({}).shadow.directional).toBe(false);
  });

  it('round-trips true and false through normalise()', () => {
    const config = {};
    setShadowDirectional(config, true);
    expect(config.shadow.directional).toBe(true);
    expect(normalise(config).shadow.directional).toBe(true);
    expect(activeShadowDirectional(config)).toBe(true);
    setShadowDirectional(config, false);
    expect(normalise(config).shadow.directional).toBe(false);
  });

  it('coerces to a real boolean — never stores a truthy string normalise() would reject', () => {
    // core/config.js accepts `directional === true` and nothing else, so a
    // panel that stored 'true' would show ON and render OFF.
    const config = {};
    setShadowDirectional(config, 'true');
    expect(config.shadow.directional).toBe(true);
    expect(normalise(config).shadow.directional).toBe(true);
  });
});

// The shadow block must be the config's OWN object, never core/'s exported
// SHADOW_DEFAULTS handed out by reference — web/state.js seeds state.config
// with `{ ...DEFAULTS }`, a shallow copy, so a shared nested object would be
// mutated by the panel for every config in the process at once.
describe('Task 5: the lazily-created shadow block', () => {
  it("never aliases core/presets.js's SHADOW_DEFAULTS", () => {
    const config = {};
    setShadowDistancePercent(config, 15);
    expect(config.shadow).not.toBe(SHADOW_DEFAULTS);
    expect(SHADOW_DEFAULTS.distance).toBe(0.040); // untouched
  });

  it('two configs do not share one block', () => {
    const a = {};
    const b = {};
    setShadowAngle(a, 10);
    setShadowAngle(b, 200);
    expect(a.shadow.angle).toBe(10);
    expect(b.shadow.angle).toBe(200);
  });

  it('reading never mutates the config', () => {
    const config = {};
    activeShadowDistancePercent(config);
    activeShadowAngle(config);
    activeShadowDirectional(config);
    expect(config.shadow).toBeUndefined();
  });
});

// EVERY CONTROL MUST SCHEDULE A RENDER. This suite runs on vitest's `node`
// environment with no DOM (see the note in test/sidebar.test.js), so the
// claim is asserted where it lives — in initFinishInspector's own source —
// rather than by standing up a jsdom nobody else in test/ uses. Each
// listener block is isolated by splitting on `addEventListener(`, so a
// handler that forgot scheduleRender() cannot borrow the next handler's.
describe('Task 5: every new Finish control schedules a render', () => {
  const SRC = readFileSync('web/inspector-frame.js', 'utf8');
  const FINISH = SRC.slice(SRC.indexOf('export function initFinishInspector'));
  expect(FINISH.length).toBeGreaterThan(0);

  function handlerCalling(setter) {
    return FINISH.split('addEventListener(').slice(1)
      .find((block) => block.includes(`${setter}(state.config`));
  }

  for (const setter of [
    'setShadowDistancePercent',
    'setShadowAngle',
    'setShadowBlurPercent',
    'setShadowDirectional',
  ]) {
    it(`${setter} is wired to a listener that calls scheduleRender()`, () => {
      const handler = handlerCalling(setter);
      expect(handler, `no listener in initFinishInspector calls ${setter}`).toBeDefined();
      expect(handler, `${setter}'s listener never calls scheduleRender()`)
        .toMatch(/scheduleRender\(\)/);
    });
  }

  // Break-it check: the same search for a setter that does not exist must
  // come up empty, so the four passes above are not an artefact of a
  // `find` that matches anything.
  it('the same search finds nothing for a control that does not exist', () => {
    expect(handlerCalling('setShadowNonsense')).toBeUndefined();
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
      'activeGrainPercent', 'activeShadowPercent', 'initFinishInspector',
      'activeShadowDistancePercent', 'setShadowDistancePercent',
      'activeShadowBlurPercent', 'setShadowBlurPercent',
      'activeShadowAngle', 'setShadowAngle',
      'activeShadowDirectional', 'setShadowDirectional']) {
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
    // Cycle A Task 5's four: none of them touches config.ground or
    // config.tone either, so the sweep must stay warm across all of them.
    setShadowDistancePercent(state.config, 9); render();
    setShadowAngle(state.config, 215); render();
    setShadowBlurPercent(state.config, 22); render();
    setShadowDirectional(state.config, true); render();

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
