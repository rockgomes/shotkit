import { describe, it, expect } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import pixelmatch from 'pixelmatch';
import { existsSync } from 'node:fs';
import { composeWithMeta } from '../core/index.js';

const mk = (w, h) => createCanvas(w, h);

async function run(config, files) {
  const web = files.web ? await loadImage(files.web) : null;
  const mobile = [];
  for (const m of files.mobile || []) mobile.push(await loadImage(m));
  const first = createCanvas(10, 10);
  const { target, meta } = composeWithMeta(first, config, { web, mobile }, mk);
  return { target, meta };
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
    // `layout: 'none'` keeps the exact same images (so the exact same
    // sampled ground tint) but matches none of layout()'s branches, so
    // `lay.phones` stays empty and nothing but ground+grain gets painted -
    // an apples-to-apples "no phone" baseline. Verified: with paintPhone
    // stubbed to a no-op, this comparison collapses to byte-identical
    // (renders are proven deterministic above), so it can only pass for
    // real when the phone was actually painted.
    const withoutPhones = await run({ layout: 'none', ratio: '3:2' }, files);
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

  it('draws a caption that actually paints pixels', async () => {
    const config = { ratio: '3:2', caption: 'Fieldset — 2026' };
    const files = { web: 'samples/fieldset.png' };
    const withCaption = await run(config, files);
    const withoutCaption = await run({ ...config, caption: null }, files);
    expect(withCaption.target.width).toBe(1800);
    // Same config and image apart from the caption text - if paintCaption
    // painted nothing (or were a no-op), these two buffers would be
    // byte-identical, per the determinism proven above. A real difference
    // can only come from the caption actually being drawn.
    expect(Buffer.compare(
      withCaption.target.toBuffer('image/png'),
      withoutCaption.target.toBuffer('image/png'),
    )).not.toBe(0);
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
    ['caption',    { ratio: '3:2', caption: 'Fieldset — 2026' }, { web: 'samples/fieldset.png' }],
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
});
