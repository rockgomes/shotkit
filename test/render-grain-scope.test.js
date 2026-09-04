import { describe, it, expect } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { composeWithMeta } from '../core/index.js';

const mk = (w, h) => createCanvas(w, h);

// A flat source. Every pixel identical, so ANY variation inside the painted
// screenshot came from something core/ added on top of it - which is exactly
// the defect this file exists to catch. Mid-grey rather than white or black
// because `soft-light` (paintGrain's blend) moves mid-tones the most: at 0.5
// the blend is at its steepest, so a flat mid-grey is the most sensitive
// probe available, and a fix that merely made the artefact small on white
// would still fail here.
function flat(w, h, hex) {
  const im = createCanvas(w, h);
  const ictx = im.getContext('2d');
  ictx.fillStyle = hex;
  ictx.fillRect(0, 0, w, h);
  return im;
}

function render(config, images) {
  const target = createCanvas(10, 10);
  return composeWithMeta(target, config, images, mk);
}

// Every distinct RGB triple in `rect`, as a Set of "r,g,b" strings, plus the
// per-channel spread. A flat region has exactly one entry and zero spread.
function paletteOf(ctx, x, y, w, h) {
  const d = ctx.getImageData(Math.round(x), Math.round(y), Math.round(w), Math.round(h)).data;
  const seen = new Set();
  let min = [255, 255, 255];
  let max = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) {
    seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    for (let ch = 0; ch < 3; ch++) {
      if (d[i + ch] < min[ch]) min[ch] = d[i + ch];
      if (d[i + ch] > max[ch]) max[ch] = d[i + ch];
    }
  }
  return { colours: seen, spread: [0, 1, 2].map(ch => max[ch] - min[ch]) };
}

describe('grain is applied to the ground only', () => {
  it('leaves a flat screenshot perfectly flat at maximum grain', () => {
    const image = flat(1440, 900, '#808080');
    const { target, layout } = render({ ratio: '3:2', frameKind: 'none', grain: 1 }, { web: image, mobile: [] });
    const ctx = target.getContext('2d');
    const b = layout.web;

    // 8px inside the box on every side: clear of the antialiased boundary
    // and of any subpixel sliver where the fitted image meets the body fill.
    const inset = 8;
    const { colours, spread } = paletteOf(ctx, b.x + inset, b.y + inset, b.w - inset * 2, b.h - inset * 2);

    expect(
      `${colours.size} colours, spread ${spread.join('/')}`,
      'the screenshot must carry no grain: a flat source must render flat',
    ).toBe('1 colours, spread 0/0/0');
  });

  it('leaves a flat phone screenshot flat too', () => {
    const image = flat(900, 1600, '#808080');
    const { target, layout } = render(
      { layout: 'mobile', ratio: '3:2', grain: 1 },
      { web: null, mobile: [image] },
    );
    const ctx = target.getContext('2d');
    const p = layout.phones[0];

    // The phone's own inset highlight (paintDeviceHairline) lives just
    // inside the bezel, so sample the middle half of the screen, well clear
    // of it. Grain, being a full-canvas fill, would still land here.
    //
    // Cycle B Task 4: read the screen from `chrome`. The bespoke `frame`
    // field this used to inset by is gone - a phone box has the same shape
    // a web box has now, and two sources for the bezel is exactly what that
    // change removed.
    const scr = p.chrome.screen;
    const { colours, spread } = paletteOf(
      ctx, scr.x + scr.w * 0.25, scr.y + scr.h * 0.25, scr.w * 0.5, scr.h * 0.5);

    expect(
      `${colours.size} colours, spread ${spread.join('/')}`,
      'the phone screenshot must carry no grain either',
    ).toBe('1 colours, spread 0/0/0');
  });

  it('still grains the ground — otherwise the fix above is just "grain off"', () => {
    const image = flat(1440, 900, '#808080');
    const on = render({ ratio: '3:2', frameKind: 'none', grain: 1 }, { web: image, mobile: [] });
    const off = render({ ratio: '3:2', frameKind: 'none', grain: 0 }, { web: image, mobile: [] });

    // A ground patch in the top-left corner, outside the shot and far from
    // its shadow.
    const patch = [10, 10, 120, 120];
    const a = on.target.getContext('2d').getImageData(...patch).data;
    const b = off.target.getContext('2d').getImageData(...patch).data;

    let differing = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) differing++;
    }
    expect(differing, 'grain must still change the ground').toBeGreaterThan(120 * 120 * 0.5);

    // And the ground is not flat: grain is per-pixel noise, not a tint.
    const { colours } = paletteOf(on.target.getContext('2d'), ...patch);
    expect(colours.size).toBeGreaterThan(8);
  });
});
