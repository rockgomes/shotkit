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
    const { target } = await run(
      { layout: 'mobile', ratio: '3:2' },
      { mobile: ['samples/karaoke-mobile.png', 'samples/karaoke-mobile-2.png'] },
    );
    expect(target.width).toBe(1800);
    const ctx = target.getContext('2d');
    expect(ctx.getImageData(900, 600, 1, 1).data[3]).toBe(255);
  });

  it('renders web+mobile', async () => {
    const { target } = await run(
      { layout: 'web+mobile', ratio: '3:2' },
      { web: 'samples/karaoke-web.png', mobile: ['samples/karaoke-mobile.png'] },
    );
    expect(target.width).toBe(1800);
  });

  it('is byte-identical across two runs', async () => {
    const a = await run({ ratio: '3:2' }, { web: 'samples/fieldset.png' });
    const b = await run({ ratio: '3:2' }, { web: 'samples/fieldset.png' });
    expect(Buffer.compare(a.target.toBuffer('image/png'), b.target.toBuffer('image/png'))).toBe(0);
  });

  it('draws a caption without throwing', async () => {
    const { target } = await run(
      { ratio: '3:2', caption: 'Fieldset — 2026' },
      { web: 'samples/fieldset.png' },
    );
    expect(target.width).toBe(1800);
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
      const diff = pixelmatch(a.data, b.data, null, ref.width, ref.height, { threshold: 0.1 });
      expect(diff / (ref.width * ref.height)).toBeLessThan(0.001);
    });
  }
});
