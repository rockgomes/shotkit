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
  // Exercises paintCaption specifically - none of the other three cases set a
  // caption, so without this case a stubbed-out paintCaption would leave
  // every golden untouched and the pixel-diff suite fully green.
  ['caption',    { ratio: '3:2', caption: 'Fieldset — 2026' }, { web: 'samples/fieldset.png', mobile: [] }],
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
];

for (const [name, cfg, files] of CASES) {
  const web = files.web ? await loadImage(files.web) : null;
  const mobile = [];
  for (const m of files.mobile) mobile.push(await loadImage(m));
  const { target } = composeWithMeta(createCanvas(10, 10), cfg, { web, mobile }, mk);
  writeFileSync(`test/golden/render/${name}.png`, target.toBuffer('image/png'));
  console.log('wrote', name);
}
