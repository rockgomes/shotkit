import { describe, it, expect } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import pixelmatch from 'pixelmatch';
import { existsSync } from 'node:fs';
import { composeWithMeta } from '../core/index.js';

const mk = (w, h) => createCanvas(w, h);

async function run(config, files, precomputedMeta) {
  const web = files.web ? await loadImage(files.web) : null;
  const mobile = [];
  for (const m of files.mobile || []) mobile.push(await loadImage(m));
  const first = createCanvas(10, 10);
  const { target, meta, config: resolved, layout } = composeWithMeta(first, config, { web, mobile }, mk, precomputedMeta);
  return { target, meta, config: resolved, layout };
}

function pngBytes(target) {
  return target.toBuffer('image/png');
}

describe('composeWithMeta', () => {
  it('sizes the target from the ratio', async () => {
    const { target } = await run({ ratio: '4:3' }, { web: 'samples/fieldset.png' });
    expect(target.width).toBe(2000);
    expect(target.height).toBe(1500);
  });

  it('returns the ground meta for chrome tinting', async () => {
    const { meta } = await run({ ratio: '3:2' }, { web: 'samples/fieldset.png' });
    expect(meta.ground).toHaveLength(3);
    expect(meta.ground[0]).toMatch(/^#[0-9a-f]{6}$/);
    expect(typeof meta.hue).toBe('number');
    expect(typeof meta.darkUI).toBe('boolean');
  });

  it('renders the mobile layout', async () => {
    const files = { mobile: ['samples/karaoke-mobile.png', 'samples/karaoke-mobile-2.png'] };
    const withPhones = await run({ layout: 'mobile', ratio: '3:2' }, files);
    // Comparing against `mobile: []` would be contaminated: composeWithMeta
    // feeds every supplied mobile image into groundFor's colour sampling
    // regardless of layout, so dropping the images would also shift the
    // ground tint - the buffers would differ even with paintPhone fully
    // stubbed out, for a reason that has nothing to do with the phone.
    // `layout: 'web'` keeps the exact same images (so the exact same
    // sampled ground tint - composeWithMeta samples web+mobile before
    // layout() ever runs), but with no `web` image supplied, layout()'s
    // 'web' branch never fires (it requires sources.web) and its 'mobile'
    // branch doesn't match `c.layout`, so `lay.web` and `lay.phones` both
    // stay empty and nothing but ground+grain gets painted - an
    // apples-to-apples "no phone" baseline. (A bare invalid string like the
    // former `layout: 'none'` no longer reaches layout() at all - config.js
    // now validates `layout` and falls back to inference for anything
    // unrecognised - so this is the legitimate way to ask for it.) Verified:
    // with paintPhone stubbed to a no-op, this comparison collapses to
    // byte-identical (renders are proven deterministic above), so it can
    // only pass for real when the phone was actually painted.
    const withoutPhones = await run({ layout: 'web', ratio: '3:2' }, files);
    expect(withPhones.target.width).toBe(1800);
    // A pixel-alpha check at a point inside the ground (e.g. 900,600) proves
    // nothing here - paintGround alone already fills the whole canvas
    // opaquely, phones or not.
    expect(Buffer.compare(pngBytes(withPhones.target), pngBytes(withoutPhones.target))).not.toBe(0);
  });

  it('renders web+mobile', async () => {
    const files = { web: 'samples/karaoke-web.png', mobile: ['samples/karaoke-mobile.png'] };
    const withPhone = await run({ layout: 'web+mobile', ratio: '3:2' }, files);
    // `mobile: []` would again be contaminated (see above) - it changes the
    // ground sample set AND stops the web box from getting a phone drawn
    // over part of it, conflating two effects. `layout: 'web'` keeps the
    // exact same images (same ground tint) and paints the exact same web
    // box (webBox() is computed identically in both the 'web' and
    // 'web+mobile' branches of layout()), but never pushes a phone. So this
    // isolates the phone specifically: with paintPhone stubbed, this
    // comparison collapses to byte-identical (verified), so a real
    // difference can only come from the phone having been painted over the
    // web screen.
    const withoutPhone = await run({ layout: 'web', ratio: '3:2' }, files);
    expect(withPhone.target.width).toBe(1800);
    expect(Buffer.compare(pngBytes(withPhone.target), pngBytes(withoutPhone.target))).not.toBe(0);
  });

  it('is byte-identical across two runs', async () => {
    const a = await run({ ratio: '3:2' }, { web: 'samples/fieldset.png' });
    const b = await run({ ratio: '3:2' }, { web: 'samples/fieldset.png' });
    expect(Buffer.compare(a.target.toBuffer('image/png'), b.target.toBuffer('image/png'))).toBe(0);
  });
});

describe('composeWithMeta - scale', () => {
  it('renders the target at scale × the composition size, not just at c.w/c.h', async () => {
    const { target, config } = await run({ ratio: '3:2', scale: 2 }, { web: 'samples/fieldset.png' });
    // config (normalise()'s output) reports the unscaled composition, exactly
    // as test/config.test.js pins - the assertion here is on the TARGET,
    // which is where scale is actually meant to land.
    expect(config).toMatchObject({ w: 1800, h: 1200 });
    expect(target.width).toBe(1800 * 2);
    expect(target.height).toBe(1200 * 2);
  });

  it('is a faithful enlargement at scale 2 - ground and grain both, not just canvas size', async () => {
    // The EXACT property (grain at matching coordinates comes from the same
    // octave grid cell when the tile is genuinely scaled) is proven at the
    // pixel level, unconditionally, by the noiseTile unit tests in
    // test/render-ground.test.js. This test instead proves it survives the
    // full composited pipeline - ground, soft-light blending, scale - and
    // that it is a MEANINGFUL survival, not a coincidence of where it's
    // measured.
    //
    // A first version of this test sampled a handful of points on the
    // default pale, near-white ground at the default grain (0.34). That
    // config does not discriminate: soft-light's sensitivity to the blend
    // value is `2*b*(1-b)` (b = base lightness 0-1), which goes to ~0 as
    // b->1, so on a near-white ground a genuine per-pixel grain difference
    // and a reverted-to-unscaled-tile bug both compress to a couple of RGB
    // levels - a reviewer confirmed a deliberately-reverted `paintGrain`
    // (hardcoded 240px tile regardless of `c.scale`, the exact "same shot,
    // finer grain" bug this is meant to catch) still passed that version.
    //
    // `bgType: 'solid'` + `tone: 'mid'` gives a flat, genuinely mid-lightness
    // fill (b roughly 0.7-0.85, materially further from 1 than the default
    // pale ground's ~0.87-0.98) where soft-light is far more sensitive, and
    // `grain: 1` maximises the blend's own contribution. Measured directly,
    // 228 points spread across the canvas (see below), scale 1 vs scale 2:
    // this (correct) implementation: max per-channel drift 7, avg 1.22.
    // The same reverted `paintGrain` (fixed 240px tile at both scales): max
    // 53, avg 11.99. 20 sits with real margin on both sides of that gap.
    const config = { ratio: '3:2', bgType: 'solid', tone: 'mid', grain: 1 };
    const at1x = await run(config, {});
    const at2x = await run({ ...config, scale: 2 }, {});
    expect(at2x.target.width).toBe(at1x.target.width * 2);
    expect(at2x.target.height).toBe(at1x.target.height * 2);

    const ctx1 = at1x.target.getContext('2d');
    const ctx2 = at2x.target.getContext('2d');

    // A grid spread across the whole canvas, margined off the edges, at a
    // step (97px) that isn't a multiple of the grain tile's octave cell
    // sizes (2/4/8px) or of common canvas fractions, so sample points land
    // at a genuine mix of grid-cell interiors and boundaries rather than
    // all landing on the same lucky (or unlucky) phase.
    const points1x = [];
    for (let y = 20; y < at1x.target.height - 20; y += 97) {
      for (let x = 20; x < at1x.target.width - 20; x += 97) points1x.push([x, y]);
    }
    expect(points1x.length).toBeGreaterThan(100);

    for (const [x1, y1] of points1x) {
      // The scale-2 canvas is sampled at EXACTLY double the scale-1 pixel
      // coordinate - not re-derived from the relative fraction against the
      // (twice as big) canvas width, which would round differently and
      // could land on a different grain cell by construction, not because
      // of a real bug.
      const [x2, y2] = [x1 * 2, y1 * 2];
      const p1 = ctx1.getImageData(x1, y1, 1, 1).data;
      const p2 = ctx2.getImageData(x2, y2, 1, 1).data;
      for (let k = 0; k < 3; k++) {
        expect(Math.abs(p1[k] - p2[k])).toBeLessThanOrEqual(20);
      }
    }
  });

  it('scales box geometry (position, size, radius) exactly with the canvas', async () => {
    const files = { web: 'samples/fieldset.png' };
    const at1x = await run({ ratio: '3:2', layout: 'web' }, files);
    const at2x = await run({ ratio: '3:2', layout: 'web', scale: 2 }, files);

    const w1 = at1x.layout.web, w2 = at2x.layout.web;
    expect(w2.x).toBeCloseTo(w1.x * 2, 6);
    expect(w2.y).toBeCloseTo(w1.y * 2, 6);
    expect(w2.w).toBeCloseTo(w1.w * 2, 6);
    expect(w2.h).toBeCloseTo(w1.h * 2, 6);
    expect(w2.radius).toBeCloseTo(w1.radius * 2, 6);
  });
});

// Every frameKind x chromeTheme combination composeWithMeta can produce.
// frameKind: 'none' never builds a chrome object at all (layout.js's
// chromeFor() returns null before ever reading chromeTheme), and the phone
// frame's body/hairline are the same phone colours regardless of theme (see
// core/render.js's paintPhoneChrome) - by design, exactly like the mobile
// layout's own phones never take a theme. So chromeTheme only has a visible
// effect for frameKind: 'browser', and the "differs from its neighbours"
// assertions below are scoped to the pairs that are actually expected to
// differ, rather than asserting a false inequality for 'none' or 'phone'
// across themes.
describe('composeWithMeta - frameKind x chromeTheme matrix', () => {
  const FRAME_KINDS = ['none', 'browser', 'phone'];
  const THEMES = ['dark', 'light'];

  it('renders every combination without throwing, at the right canvas size', async () => {
    for (const frameKind of FRAME_KINDS) {
      for (const chromeTheme of THEMES) {
        const { target } = await run({ ratio: '3:2', frameKind, chromeTheme }, { web: 'samples/fieldset.png' });
        expect(target.width).toBe(1800);
        expect(target.height).toBe(1200);
      }
    }
  });

  it('differs across frameKind, at each theme (none vs browser vs phone)', async () => {
    for (const chromeTheme of THEMES) {
      const renders = {};
      for (const frameKind of FRAME_KINDS) {
        renders[frameKind] = (await run({ ratio: '3:2', frameKind, chromeTheme }, { web: 'samples/fieldset.png' })).target;
      }
      expect(Buffer.compare(pngBytes(renders.none), pngBytes(renders.browser))).not.toBe(0);
      expect(Buffer.compare(pngBytes(renders.browser), pngBytes(renders.phone))).not.toBe(0);
      expect(Buffer.compare(pngBytes(renders.none), pngBytes(renders.phone))).not.toBe(0);
    }
  });

  it('differs across chromeTheme for frameKind: browser, the one kind with a theme', async () => {
    const dark = await run({ ratio: '3:2', frameKind: 'browser', chromeTheme: 'dark' }, { web: 'samples/fieldset.png' });
    const light = await run({ ratio: '3:2', frameKind: 'browser', chromeTheme: 'light' }, { web: 'samples/fieldset.png' });
    expect(Buffer.compare(pngBytes(dark.target), pngBytes(light.target))).not.toBe(0);
  });

  it('frameKind: none and phone are theme-invariant (documented, not accidental)', async () => {
    for (const frameKind of ['none', 'phone']) {
      const dark = await run({ ratio: '3:2', frameKind, chromeTheme: 'dark' }, { web: 'samples/fieldset.png' });
      const light = await run({ ratio: '3:2', frameKind, chromeTheme: 'light' }, { web: 'samples/fieldset.png' });
      expect(Buffer.compare(pngBytes(dark.target), pngBytes(light.target))).toBe(0);
    }
  });
});

// The PNGs under test/golden/render were produced by
// scripts/make-render-goldens.js, running under @napi-rs/canvas - the same
// engine this test file runs under. As documented on paintShadow and
// paintWeb in core/render.js, @napi-rs/canvas renders shadowBlur measurably
// fainter than a real browser at the alpha/blur values the phone and web
// screen shadows use. So these goldens encode a fainter shadow than a real
// browser (the actual shipping surface) produces - that is expected and
// correct, not a bug.
//
// This suite is a napi-rs-vs-napi-rs regression baseline: it proves this
// renderer's output hasn't drifted from its own last-accepted render. It
// does NOT prove, and must never be used to argue, that the code matches
// frame.html/browser output - a faint-looking shadow here is not evidence of
// a rendering defect.
describe('pixel-diff against frozen renders', () => {
  const CASES = [
    ['web',        { ratio: '3:2' },                       { web: 'samples/fieldset.png' }],
    ['mobile',     { layout: 'mobile', ratio: '3:2' },     { mobile: ['samples/karaoke-mobile.png', 'samples/karaoke-mobile-2.png'] }],
    ['web-mobile', { layout: 'web+mobile', ratio: '3:2' }, { web: 'samples/karaoke-web.png', mobile: ['samples/karaoke-mobile.png'] }],
    ['mesh',       { ratio: '3:2', bgType: 'mesh', seed: 7 },   { web: 'samples/fieldset.png' }],
    // Task 6: the browser chrome in both themes, and the phone frame - the
    // last three cases before core/ is done. macOS is deliberately absent
    // (see FRAME_KINDS in core/presets.js): no design exists for it in v1.
    ['browser-dark',  { ratio: '3:2', frameKind: 'browser', chromeTheme: 'dark' },  { web: 'samples/fieldset.png' }],
    ['browser-light', { ratio: '3:2', frameKind: 'browser', chromeTheme: 'light' }, { web: 'samples/fieldset.png' }],
    ['phone',         { ratio: '3:2', frameKind: 'phone' },                         { web: 'samples/fieldset.png' }],
    // Task 5b: every golden above is 3:2 at 1800x1200 - "everything is
    // proportional to the canvas" (see the doc comment atop core/layout.js)
    // has never been pixel-verified at another ratio/size. 1:1 (1500x1500)
    // is the ratio furthest from 3:2, so a stray fixed-pixel value (a
    // hardcoded radius, a literal bar height) would show up here most
    // clearly. Uses the web layout with a browser frame so geometry, chrome
    // and grain are all exercised together in one image.
    ['square-browser', { ratio: '1:1', frameKind: 'browser', chromeTheme: 'dark' }, { web: 'samples/fieldset.png' }],
    // Task 6: the browser pill's own URL text. This is a NEW golden, not a
    // regeneration of any of the 9 above - every one of those omits `url`
    // (DEFAULTS.url is null, core/config.js), so they stay byte-identical
    // whether or not this line exists. See scripts/make-render-goldens.js's
    // matching comment for the regeneration proof.
    ['browser-url',   { ratio: '3:2', frameKind: 'browser', chromeTheme: 'dark', url: 'app.acme.dev' }, { web: 'samples/fieldset.png' }],
    // Task 6b: shadowScale at a clearly non-default value. Every case above
    // omits shadowScale (default 1, byte-identical to before this field
    // existed - proven by every case above staying green), so this is the
    // only golden in the suite that would catch paintShadow's new scale
    // parameter being a no-op or silently clamped away. See the "actually
    // discriminates" check right after this loop for the injection proof.
    ['shadow-heavy',  { ratio: '3:2', shadowScale: 1.6 }, { web: 'samples/fieldset.png' }],
    // Task 7: the three stroke styles that paint anything. Every case above
    // omits `stroke` and STROKE_DEFAULTS.style is 'none' (core/presets.js),
    // so all eleven stayed byte-identical when these were added - the same
    // regeneration proof scripts/make-render-goldens.js records. 'light'
    // and 'glass' differ in kind (opaque fill vs translucent fill plus an
    // outer hairline); 'custom' is 'light' with another fillStyle, so it
    // needs no third canvas. The browser case is the one that proves the
    // mat wraps a frame instead of replacing its border.
    ['stroke-light',   { ratio: '3:2', stroke: { style: 'light', width: 0.02 } },  { web: 'samples/fieldset.png' }],
    ['stroke-glass',   { ratio: '3:2', stroke: { style: 'glass', width: 0.02 } },  { web: 'samples/fieldset.png' }],
    ['stroke-browser', { ratio: '3:2', frameKind: 'browser', stroke: { style: 'light', width: 0.015 } }, { web: 'samples/fieldset.png' }],
    // Task 9: the `mesh` case above uses the defaults, so it would freeze
    // the default field and prove nothing about `spread` or `stops`
    // reaching the canvas. This is the wide, five-stop end of the range.
    ['mesh-wide', { ratio: '3:2', bgType: 'mesh', seed: 7, mesh: { stops: 5, spread: 140 } }, { web: 'samples/fieldset.png' }],
  ];

  for (const [name, cfg, files] of CASES) {
    it(name, async () => {
      const path = `test/golden/render/${name}.png`;
      expect(existsSync(path), `missing ${path} - run scripts/make-render-goldens.js`).toBe(true);

      const { target } = await run(cfg, files);
      const ref = await loadImage(path);
      const rc = createCanvas(ref.width, ref.height);
      rc.getContext('2d').drawImage(ref, 0, 0);

      const a = target.getContext('2d').getImageData(0, 0, target.width, target.height);
      const b = rc.getContext('2d').getImageData(0, 0, ref.width, ref.height);
      // threshold: 0 - exact per-pixel comparison, no perceptual tolerance.
      // Renders are byte-deterministic (see "is byte-identical across two
      // runs" above), so a genuine match should differ by ~0 pixels; this
      // budget only exists to absorb incidental cross-machine/cross-version
      // antialiasing noise, not to tolerate real rendering changes. The
      // original threshold: 0.1 / <0.001 budget was too loose: a review
      // swept four real rendering regressions (doubled phone-shadow alpha,
      // a 1-alpha-step nudge, a phone body colour change, a halved phone
      // corner radius) against it and every single one passed undetected -
      // three with zero reported differing pixels. Confirmed the tightened
      // bound below now fails all four; exact diff ratios recorded in the
      // Task 7 fix-round report.
      const diff = pixelmatch(a.data, b.data, null, ref.width, ref.height, { threshold: 0 });
      expect(diff / (ref.width * ref.height)).toBeLessThan(1e-5);
    });
  }

  // Task 6, "break it and watch it go red": the loop above only proves the
  // populated-pill golden matches ITSELF. This proves it isn't a rubber
  // stamp - a render with a DIFFERENT url string against the exact same
  // golden must fail the identical byte comparison, comfortably clear of
  // the <1e-5 pass threshold every case above uses.
  //
  // Measured 1,763 of 2,160,000 pixels (ratio ~0.000816, ~80x the pass
  // threshold) - recorded here, not just asserted, so a future change to
  // this test can't silently loosen it back to noise-level and still
  // "pass".
  //
  // That number was ~0.00201 before Cycle A Task 4b, and the drop is NOT a
  // weakening of the guard - it is pixelmatch's `includeAA: false` default
  // finally working as designed. Grain used to be painted over the finished
  // shot, the URL text included; per-pixel noise defeats pixelmatch's
  // antialias heuristic (which classifies a pixel as AA from its
  // neighbours' spread), so glyph edges were counted as real differences.
  // With grain confined to the ground the text is clean again and its AA
  // edges are correctly skipped. The pixels that still differ are the
  // glyph BODIES, which is the stricter measurement of the two.
  it('the browser-url golden actually discriminates on the url text, not just presence', async () => {
    const { target } = await run(
      { ratio: '3:2', frameKind: 'browser', chromeTheme: 'dark', url: 'totally-different.example' },
      { web: 'samples/fieldset.png' },
    );
    const ref = await loadImage('test/golden/render/browser-url.png');
    const rc = createCanvas(ref.width, ref.height);
    rc.getContext('2d').drawImage(ref, 0, 0);

    const a = target.getContext('2d').getImageData(0, 0, target.width, target.height);
    const b = rc.getContext('2d').getImageData(0, 0, ref.width, ref.height);
    const diff = pixelmatch(a.data, b.data, null, ref.width, ref.height, { threshold: 0 });
    // Lowered twice by Task 8, and BOTH TIMES only because the text got
    // smaller - never to make a failing render pass. The pill font went
    // from 5/224 of the frame width to 14/1280 (the measured reference),
    // then to 14/1706.67 when Rock asked for the whole chrome a quarter
    // shorter. Measured at each step, out of 2,160,000 pixels:
    //
    //   before Task 8   ~1080 px   5.00e-4  (the original bound)
    //   after remeasure    704 px   3.26e-4
    //   after 3/4 chrome   514 px   2.38e-4  <- now, against 1.8e-4
    //
    // A bound that keeps being lowered is a bound worth distrusting, so the
    // second assertion below does not depend on glyph COUNT at all.
    expect(diff / (ref.width * ref.height)).toBeGreaterThan(1.8e-4);

    // The size-independent half: the same config with NO url must differ
    // from this golden too. That is the claim the golden actually exists to
    // make - it carries drawn text - and it cannot be eroded by the text
    // getting smaller, only by the text disappearing.
    const empty = await run(
      { ratio: '3:2', frameKind: 'browser', chromeTheme: 'dark' },
      { web: 'samples/fieldset.png' },
    );
    const e = empty.target.getContext('2d').getImageData(0, 0, ref.width, ref.height);
    const emptyDiff = pixelmatch(e.data, b.data, null, ref.width, ref.height, { threshold: 0 });
    expect(emptyDiff).toBeGreaterThan(0);
  });

  // Task 6b, the same "break it and watch it go red" discipline: the loop
  // above only proves shadow-heavy.png matches ITSELF at shadowScale 1.6.
  // This proves the golden actually GUARDS that value - rendering the exact
  // same config at the DEFAULT scale (1) instead must fail the identical
  // byte comparison, and by a wide margin. This is precisely the quantity
  // the task brief warns about: a prior golden in this project sat at a
  // threshold so loose it passed a doubled shadow alpha undetected (see
  // test/render-screen.test.js's matching comment) - shadowScale is the
  // adjustable version of that exact same quantity, so this suite proves,
  // rather than assumes, that this golden would have caught it.
  // Measured: 378,076 of 2,160,000 pixels differ (ratio ~0.175, ~175x the
  // <1e-5 pass threshold every case in the loop above uses) - recorded here
  // so a future loosening of the bound below can't silently pass.
  it('the shadow-heavy golden actually discriminates on shadowScale, not just presence', async () => {
    const { target } = await run({ ratio: '3:2', shadowScale: 1 }, { web: 'samples/fieldset.png' });
    const ref = await loadImage('test/golden/render/shadow-heavy.png');
    const rc = createCanvas(ref.width, ref.height);
    rc.getContext('2d').drawImage(ref, 0, 0);

    const a = target.getContext('2d').getImageData(0, 0, target.width, target.height);
    const b = rc.getContext('2d').getImageData(0, 0, ref.width, ref.height);
    const diff = pixelmatch(a.data, b.data, null, ref.width, ref.height, { threshold: 0 });
    expect(diff / (ref.width * ref.height)).toBeGreaterThan(0.05);
  });

  // Task 7, the same discipline again. The loop only proves
  // stroke-light.png matches itself; these prove the two goldens actually
  // guard what they are named for. First: the same config with the style
  // switched back to 'none' must differ by a wide margin - that is the
  // whole feature. Second: 'glass' rendered against the 'light' golden must
  // differ too, so the two styles are not quietly the same fill.
  it('the stroke-light golden actually discriminates on the stroke, not just presence', async () => {
    const { target } = await run(
      { ratio: '3:2', stroke: { style: 'none', width: 0.02 } },
      { web: 'samples/fieldset.png' },
    );
    const ref = await loadImage('test/golden/render/stroke-light.png');
    const rc = createCanvas(ref.width, ref.height);
    rc.getContext('2d').drawImage(ref, 0, 0);

    const a = target.getContext('2d').getImageData(0, 0, target.width, target.height);
    const b = rc.getContext('2d').getImageData(0, 0, ref.width, ref.height);
    const diff = pixelmatch(a.data, b.data, null, ref.width, ref.height, { threshold: 0 });
    expect(diff / (ref.width * ref.height)).toBeGreaterThan(0.02);
  });

  it('glass and light are different fills, not the same one twice', async () => {
    const { target } = await run(
      { ratio: '3:2', stroke: { style: 'glass', width: 0.02 } },
      { web: 'samples/fieldset.png' },
    );
    const ref = await loadImage('test/golden/render/stroke-light.png');
    const rc = createCanvas(ref.width, ref.height);
    rc.getContext('2d').drawImage(ref, 0, 0);

    const a = target.getContext('2d').getImageData(0, 0, target.width, target.height);
    const b = rc.getContext('2d').getImageData(0, 0, ref.width, ref.height);
    const diff = pixelmatch(a.data, b.data, null, ref.width, ref.height, { threshold: 0 });
    expect(diff / (ref.width * ref.height)).toBeGreaterThan(0.02);
  });
});

// Task 2 fix round 1 (authorised core/ change): composeWithMeta accepts an
// optional 5th argument, a precomputed `meta`, so a caller that already
// knows the ground hasn't changed (same images, same forceHue, same tone)
// can skip groundFor's own analysis - measured the dominant cost of a
// render (~200ms of ~216ms; see web/state.js). This is additive: every
// existing call site and every golden above omits it and is unaffected.
describe('composeWithMeta - precomputed meta (Task 2 fix round 1)', () => {
  it('a render with supplied meta is byte-identical to one without', async () => {
    const config = { ratio: '3:2' };
    const files = { web: 'samples/fieldset.png' };
    const withoutMeta = await run(config, files);
    const withMeta = await run(config, files, withoutMeta.meta);
    expect(withMeta.meta).toEqual(withoutMeta.meta);
    expect(Buffer.compare(
      withMeta.target.toBuffer('image/png'),
      withoutMeta.target.toBuffer('image/png'),
    )).toBe(0);
  });

  // The test above alone could pass even if `precomputedMeta` were silently
  // ignored (the "real" and the "supplied" meta happen to be the same
  // value in that test, by construction). This one proves the parameter is
  // actually read and actually used: a deliberately wrong `meta` paints
  // wrong - only possible if composeWithMeta is genuinely skipping its own
  // groundFor call and trusting what it was handed.
  it('actually uses the supplied meta rather than silently recomputing it', async () => {
    const config = { ratio: '3:2' };
    const files = { web: 'samples/fieldset.png' };
    const real = await run(config, files);
    const wrongMeta = { ...real.meta, ground: ['#000000', '#000000', '#000000'] };
    const withWrongMeta = await run(config, files, wrongMeta);
    expect(Buffer.compare(
      withWrongMeta.target.toBuffer('image/png'),
      real.target.toBuffer('image/png'),
    )).not.toBe(0);
  });
});
