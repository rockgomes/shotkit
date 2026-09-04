// Freezes the pixel-diff baseline for test/compose.test.js's "pixel-diff
// against frozen renders" suite.
//
// IMPORTANT: these PNGs are rendered under @napi-rs/canvas, the same engine
// the test suite runs under - NOT a browser. As documented on paintShadow and
// paintWeb in core/render.js, @napi-rs/canvas renders canvas shadowBlur
// measurably fainter than a real browser does at the alpha/blur values this
// code ships (the phone and web screen shadows in particular). That gap is a
// property of the napi-rs engine, not of the code, and is expected here.
//
// So these images are a napi-rs-vs-napi-rs regression baseline only: they
// catch unintended changes to this renderer's OWN output over time. They do
// NOT prove pixel fidelity against frame.html or against what a user's
// browser actually renders - never compare them to a browser screenshot and
// conclude the shadow code is wrong from the difference. If you need to
// verify browser fidelity, re-render frame.html itself and compare against
// that, not against these PNGs.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { composeWithMeta } from '../core/index.js';

const mk = (w, h) => createCanvas(w, h);
mkdirSync('test/golden/render', { recursive: true });

const CASES = [
  ['web',        { ratio: '3:2' },                     { web: 'samples/fieldset.png', mobile: [] }],
  ['mobile',     { layout: 'mobile', ratio: '3:2' },   { web: null, mobile: ['samples/karaoke-mobile.png', 'samples/karaoke-mobile-2.png'] }],
  ['web-mobile', { layout: 'web+mobile', ratio: '3:2' }, { web: 'samples/karaoke-web.png', mobile: ['samples/karaoke-mobile.png'] }],
  // Exercises paintMesh specifically, with a fixed seed so the golden is
  // reproducible. See test/compose.test.js's "pixel-diff against frozen
  // renders" suite for the guard that this actually catches a seed change.
  ['mesh',       { ratio: '3:2', bgType: 'mesh', seed: 7 },   { web: 'samples/fieldset.png', mobile: [] }],
  // Task 6: browser chrome in both themes, and the phone frame. Without
  // these, a stubbed-out paintChrome/phone painter would leave every
  // existing golden above untouched (none of them set frameKind), and the
  // pixel-diff suite would stay fully green - see test/compose.test.js's
  // "pixel-diff against frozen renders" comment for why that already
  // happened once with a doubled shadow alpha.
  ['browser-dark',  { ratio: '3:2', frameKind: 'browser', chromeTheme: 'dark' },  { web: 'samples/fieldset.png', mobile: [] }],
  ['browser-light', { ratio: '3:2', frameKind: 'browser', chromeTheme: 'light' }, { web: 'samples/fieldset.png', mobile: [] }],
  ['phone',         { ratio: '3:2', frameKind: 'phone' },                         { web: 'samples/fieldset.png', mobile: [] }],
  // Task 5b: a second canvas size (1:1, 1500x1500 - the ratio furthest from
  // 3:2) with the web layout and a browser frame, to pixel-verify that
  // geometry, chrome and grain all stay proportional to the canvas at a
  // size other than 3:2. See test/compose.test.js's "pixel-diff against
  // frozen renders" comment for the full rationale.
  ['square-browser', { ratio: '1:1', frameKind: 'browser', chromeTheme: 'dark' }, { web: 'samples/fieldset.png', mobile: [] }],
  // Task 6: the browser pill's own URL text - a new golden, not a
  // regeneration of any above (see test/compose.test.js's "pixel-diff
  // against frozen renders" comment for why the other 9 stay byte-identical
  // here: none of them set `url`, and DEFAULTS.url is null).
  ['browser-url',   { ratio: '3:2', frameKind: 'browser', chromeTheme: 'dark', url: 'app.acme.dev' }, { web: 'samples/fieldset.png', mobile: [] }],
  // Task 6b: shadowScale at a clearly non-default value (1.6, well clear of
  // the default 1 and the [0,2] range's midpoint) - exercises paintShadow's
  // new scale parameter specifically. Without this case a stubbed-out scale
  // multiplier (or one that silently no-ops) would leave every golden above
  // untouched, since none of them sets shadowScale away from its default 1 -
  // see test/compose.test.js's matching "pixel-diff against frozen renders"
  // comment for the injection proof that this golden actually discriminates.
  ['shadow-heavy',  { ratio: '3:2', shadowScale: 1.6 }, { web: 'samples/fieldset.png', mobile: [] }],
  // Task 7: the three stroke styles that paint. Same reason as every block
  // above - STROKE_DEFAULTS.style is 'none' and no golden above sets
  // `stroke`, so a stubbed or no-op paintStroke would leave all eleven of
  // them byte-identical and the pixel-diff suite fully green. 'light' and
  // 'glass' are the two fills that differ in kind (opaque vs translucent,
  // and only 'glass' draws the outer hairline); 'custom' is 'light' with a
  // different fillStyle and needs no third canvas. The browser case is the
  // one that proves the mat wraps a FRAME rather than replacing its border,
  // which is the geometry Task 6 established.
  ['stroke-light',   { ratio: '3:2', stroke: { style: 'light', width: 0.02 } },  { web: 'samples/fieldset.png', mobile: [] }],
  ['stroke-glass',   { ratio: '3:2', stroke: { style: 'glass', width: 0.02 } },  { web: 'samples/fieldset.png', mobile: [] }],
  ['stroke-browser', { ratio: '3:2', frameKind: 'browser', stroke: { style: 'light', width: 0.015 } }, { web: 'samples/fieldset.png', mobile: [] }],
  // Task 9: a SECOND mesh case, at a wide spread and the maximum stop
  // count. The `mesh` case above uses the defaults, so on its own it would
  // freeze the default field and say nothing about whether `spread` or
  // `stops` reach the canvas at all - the exact gap that let the old
  // two-tone mesh sit there looking like a feature.
  ['mesh-wide', { ratio: '3:2', bgType: 'mesh', seed: 7, mesh: { stops: 5, spread: 140 } }, { web: 'samples/fieldset.png', mobile: [] }],
  // Cycle B Task 4: the mobile element's own frames. Without these, a
  // stubbed dispatcher would leave every golden above untouched - none of
  // them sets `elements.mobile`, and its default 'phone' is the path that
  // already existed.
  ['mobile-browser', { layout: 'mobile', ratio: '3:2', elements: { mobile: { frameKind: 'browser' } } }, { web: null, mobile: ['samples/karaoke-mobile.png'] }],
  ['mobile-bare',    { layout: 'mobile', ratio: '3:2', elements: { mobile: { frameKind: 'none' } } },    { web: null, mobile: ['samples/karaoke-mobile.png'] }],
  // Cycle C Task 2: a DARK ground, with a DARK screenshot on it - the one
  // combination where the shot's separation is at risk. Measured in
  // Chromium, the shadow's contrast against the ground falls from 1.38 at
  // the sampled pale ground to 1.02 at luminosity 0.15, so it is doing
  // essentially nothing here and this golden is what would catch the
  // ground maths, the edge blend or the shadow changing at that end. Every
  // other golden is pale.
  ['ground-dark', { ratio: '3:2', luminosity: 0.18 }, { web: 'samples/karaoke-web.png', mobile: [] }],
];

for (const [name, cfg, files] of CASES) {
  const web = files.web ? await loadImage(files.web) : null;
  const mobile = [];
  for (const m of files.mobile) mobile.push(await loadImage(m));
  const { target } = composeWithMeta(createCanvas(10, 10), cfg, { web, mobile }, mk);
  writeFileSync(`test/golden/render/${name}.png`, target.toBuffer('image/png'));
  console.log('wrote', name);
}
