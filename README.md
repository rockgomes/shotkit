# shotkit

Turns a raw screenshot into a finished shot: the UI floating on a ground, with a
shadow and a bit of grain. Built for Dribbble shots (4:3) and portfolio
thumbnails (3:2), but the canvas is a parameter.

It is a web app now. Drop a screenshot into the page, pick a ground, export a
PNG. It was a Node CLI that drove a headless Chromium and shelled out to Python
for the colour analysis; that implementation has been retired — the whole
renderer was ported to a canvas 2D library (`core/`) that runs unchanged in a
browser and under Node.

**Everything happens in your browser.** There is no upload, no server, no
account, and no image ever leaves the machine: files are read with
`createImageBitmap`, composed on a `<canvas>`, and saved with `canvas.toBlob`
plus an object URL. The single external request the page makes is to Google
Fonts, for Geist and Geist Mono — it carries no image data, and nothing else
goes out.

## The three ideas

**1. One geometry, many grounds.** Padding, radius, and shadow are proportions of
the canvas, not pixels. Same numbers at 3:2, 4:3, 16:9 or 1:1. That is what makes
a row of thumbnails look like one person made them.

Padding is a **single** number measured against the shorter canvas side, so the
gap is identical on all four edges. An earlier version used separate percentages
per axis (5% of width, 9% of height); those resolve to very different pixel
gaps and the UI floats in the middle looking small. If a shot looks over-padded,
check the source ratio first: a narrow source fitted by `contain` into a wider
box leaves the slack on the sides, and no padding value will fix that. Recrop
the source instead.

**2. The ground comes from the product.** `core/ground.js` samples the screenshot
and builds the background from the product's own accent colour. Two rules matter:

- Only **flat** pixels vote on hue. A button or a pill is one solid colour; a
  photo is not. Without this filter, album art and furniture photography hijack
  the brand colour and every ground comes out muddy orange.
- Lightness is set for **separation**, not mood. A light UI gets a pale tint. A
  dark UI gets a **mid-tone** ground by default, and the Luminosity slider
  reaches a genuinely dark one when you want it. Dark-on-dark is the most
  common way these shots fail.

**3. `contain` by default, so nothing is cropped.** The screen element takes the
source image's own aspect ratio and fits inside the safe box. `cover` is there in
the Finish panel if you want edge-to-edge and accept the crop.

## Using the app

Drop a screenshot on the canvas, or press Enter on the drop zone to browse.
Landscape files become the desktop screenshot; portrait files become phones, up
to three. Then:

- **Sidebar** — six output templates (Dribbble, Twitter post and header, App
  Store, Open Graph, Instagram), four ratios, a custom size, and the eight named
  grounds.
- **Canvas** — the shot, plus a **Surround** control (dark / mid / light). The
  surround is app chrome only: it changes what sits *behind* the canvas so you
  can judge a pale ground honestly, and it can never reach the exported pixels.
- **Canvas** — click a shot to select it. The Frame and Finish panels then
  edit *that* element, and each says which one it is on. Click the ground or
  press Escape to clear. The outline is a DOM overlay and never a painted
  pixel, so it cannot reach the exported PNG.
- **Inspector** — Background (type first, then the sampled ground, the preset
  tiles, and hue / angle / luminosity overrides), Frame (none, browser chrome,
  or phone; chrome theme and URL pill),
  Finish (padding, radius, grain, shadow strength, and an opt-in stroke —
  light, glass or a custom colour), and Export. Everything in Frame and
  Finish except Padding and Grain belongs to the selected element; those two
  belong to the canvas.
- **Export** — PNG, JPEG or WebP at 1×, 2× or 3×. Filenames come from the source
  file, e.g. `fieldset--web@2x.png`.

**The preview canvas is the export canvas.** It is rendered at full output
resolution and scaled down with CSS, and `composeWithMeta` is called from exactly
one place in the app (`web/state.js`). There is no second render path, so what
gets exported cannot disagree with what was on screen. `scale` is a `core/` config
field, not a post-process — a 2× export is a fresh composition at twice the pixel
count, not an enlarged copy of a smaller one.

## Running it

Node 20+.

```
npm install
npm run dev       # Vite dev server
npm test          # vitest, the core/ suite
npm run build     # → dist/
npm run preview   # serve dist/ locally
```

`netlify.toml` builds with `npm run build` and publishes `dist`. The repo is not
connected to a Netlify site — that is a deliberate, separate step.

## The `core/` library

`core/` is a zero-runtime-dependency ES module library that composes a shot onto
any canvas 2D context. It has no DOM assumptions beyond `getContext('2d')`, so it
runs in a browser (the app) and under `@napi-rs/canvas` (the tests) from the same
source. Import only from `core/index.js`; deep-importing `core/presets.js` breaks
the module boundary.

```js
import { composeWithMeta, DEFAULTS } from './core/index.js';

const mk = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
};

const canvas = document.querySelector('canvas');
const { meta } = composeWithMeta(canvas, { ...DEFAULTS, ratio: '4:3' }, { web: bitmap, mobile: [] }, mk);
```

### Functions

**`composeWithMeta(target, rawConfig, images, makeCanvas, precomputedMeta = null)`**

Paints a full shot into `target` and returns `{ target, meta, config, layout }`.

- `target` — anything with `width`, `height` and `getContext('2d')`. It is
  resized to the config's output size.
- `rawConfig` — any subset of the config fields below; unknown and invalid values
  fall back to their defaults rather than throwing.
- `images` — `{ web, mobile }`. `web` is one landscape bitmap or `null`; `mobile`
  is an array, filtered of falsy entries and capped at 3.
- `makeCanvas(w, h)` — scratch-canvas factory. `core/` never creates a canvas
  itself; this is the whole of its host dependency, and it is what lets the same
  code run under Node.
- `precomputedMeta` — optional. A `meta` object returned by an earlier call for
  the same images, `ground` and `luminosity`. Supplying it skips the colour analysis,
  which is roughly 200ms of a ~216ms render; layout, painting and grain together
  are single-digit milliseconds. Omitting it is byte-identical to supplying it.

**`compose(target, rawConfig, images, makeCanvas)`** — the same thing, returning
just `target`.

**`normalise(input = {})`** — resolves raw input into a complete config, applying
every default and validity check. Pure, cheap, and safe to call for a filename or
a label without touching the paint path. Returns `w`, `h`, `layout`, `pad`,
`radius`, `grain`, `phoneScale`, `phoneBleed`, `insetX`, `insetY`,
`url`, `forceHue`, `luminosity`, `scale`, `angle`, `template`, `bgType`,
`frameKind`, `chromeTheme`, `shadowScale`.

**`layout(config, sources)`** — pure geometry, no painting. `sources` is
`{ web, mobile }` where each entry is an aspect ratio (`width / height`), not an
image. Returns `{ safe, web, phones }` in canvas pixels.

**`groundFor(samples, forceHue = null, mode = null)`** — the colour analysis.
`samples` is an array of `ImageData`-shaped objects. Returns
`{ ground, lum, hue, chroma, darkUI }`, where `ground` is the three hex stops the
background is built from and `hue` is in degrees. `mode` is `null` (infer),
`'light'` or `'mid'`.

**`groundFromMeta(meta, forceHue = null, mode = null)`** — the same output without
re-scanning pixels, for previewing a different forced hue against an image already
analysed. Exact, not approximate — `lum` and `chroma` do not depend on the hue.

### Vocabularies

Also exported, so a host never has to hardcode a valid value:
`RATIOS`, `HUES`, `DEFAULTS`, `TEMPLATES`, `FRAME_KINDS`, `SCALES`,
`DEFAULT_ANGLE`, `LAYOUTS`, `BG_TYPES`, `CHROME_THEMES`,
`SHADOW_SCALE_RANGE`, `STROKE_STYLES`, `STROKE_WIDTH_RANGE`,
`STROKE_DEFAULTS`, `LUMINOSITY_RANGE`, `GROUNDS`,
`ELEMENT_KINDS`, `ELEMENT_DEFAULTS`, `BROWSER_RADIUS_RANGE`,
`PHONE_RADIUS_RANGE`.

```
RATIOS       3:2 1800×1200 · 4:3 2000×1500 · 16:9 1920×1080 · 1:1 1500×1500
TEMPLATES    dribbble 2800×2100 · twitter-post 1600×900 · twitter-header 1500×500
             app-store 2880×1800 · open-graph 2400×1260 · instagram 2160×2160
HUES         lavender 268 · paper 46 · mint 158 · ember 24
             slate 240 · ash 40 · sky 205 · rose 340
LAYOUTS      web · mobile · web+mobile          LUMINOSITY 0.15–0.975
FRAME_KINDS  none · browser · phone
BG_TYPES     linear · solid                     SCALES  1 · 2 · 3
CHROME_THEMES dark · light                      DEFAULT_ANGLE 166
STROKE_STYLES none · light · glass · custom     width 0–0.06 of the shorter side
ELEMENT_KINDS web · mobile                      web defaults to no frame, mobile to phone
CORNER RANGE browser 0–5% · phone 4–24% of the element's own width
```

**Settings belong to an element, not to the shot.** `normalise()` returns
`elements: { web, mobile }`, each carrying `frameKind`, `chromeTheme`, `url`,
`radius`, `stroke` and `shadowScale`. A flat key at the top level of the
input is a default for *every* element; an entry in `elements` overrides it
for that one — but only when the input actually carried it, never when it
was resolved from a default. `radius` is `null` for "this frame's own
corner". Canvas, ground, padding and grain stay global: there is one of
each, and they describe the shot rather than a thing in it.

**Frames and strokes are outsets.** The screenshot's box is computed first, from
the source image's own ratio; the browser bar, the phone bezel and the stroke
then grow *outward* from it. Turning a frame on consumes padding rather than
shrinking the picture. Only when the composite would cross `MIN_MARGIN_RATIO`
(2% of the shorter canvas side) does the whole thing scale down uniformly.

`shadowScale` is a **multiplier** over the renderer's verified shadow alphas, not
a replacement for them: `1` reproduces the original values exactly, and
`SHADOW_SCALE_RANGE` is `[0, 2]` only so a slider has somewhere to go — neither
bound is itself a verified value.

## Layout

```
core/     the library — config, presets, ground, layout, render, index
web/      the Vite app — a shell over core/, no compositing logic of its own
test/     vitest suite and its frozen goldens
scripts/  one-shot golden generators — see the warning under Tests
samples/  the screenshots the goldens are built from
docs/     the spec, the plans, and the verification records

design_handoff_backdrop_1a/
          the visual reference. Option 1a ("Obsidian") in
          `Backdrop Mockups.dc.html` is the app's chrome, and every device-frame
          constant in `core/presets.js` derives its ratios from measurements of
          that file — each one carries the mockup pixel value it came from. The
          HTML is authoritative; its README summarises. `image-slot.js` in there
          is prototype scaffolding, marked do-not-ship.
```

## Tests

`npm test` runs 254 tests across 13 files, including 11 golden PNGs and one
golden JSON of colour values. The goldens are a **regression** baseline rendered
under `@napi-rs/canvas` — they catch unintended changes to this renderer's own
output over time. They are not a fidelity check against a browser: `@napi-rs/canvas`
renders `shadowBlur` measurably fainter than a real browser does at the alphas
this code ships, so never compare a golden to a browser screenshot and conclude
the shadow code is wrong from the difference.

**`web/` is covered too — do not skip the suite when editing the app.** Five test
files import `web/` modules and drive the real `render()`, 67 of the 254 tests:

| file | tests | covers |
|---|---|---|
| `test/inspector-background.test.js` | 27 | the whole Background panel |
| `test/inspector-frame.test.js` | 26 | the whole Frame panel, and Finish |
| `test/sidebar.test.js` | 11 | selection helpers, size changes, ground swatches |
| `test/export-scale-fidelity.test.js` | 2 | the export scale path, at 4:3 |
| `test/web-export.test.js` | 1 | the surround never reaching the export |

So a change to `web/sidebar.js` or either inspector module can and does turn the
suite red, and a failure there is a real failure, not collateral from `core/`.
What genuinely has no automated coverage is the wiring: `web/main.js`, plus
`addFiles()` and `scheduleRender()`'s debounce in `web/state.js` — drag-and-drop,
the drawers, the arrival animation, focus and contrast. `render()` itself, in
that same file, is driven by every test in the table above. That was verified by hand, and the pass is written up in
`docs/verification-2026-09-01.md`.

### Two dead references in `scripts/`

Left in place deliberately — they record where the numbers came from — but
neither can be followed any more, and one of them bites.

**`scripts/make-goldens.sh` is destructive. Do not run it.** It built
`test/golden/ground.json` from `ground.py`, which no longer exists. Because it
redirects a heredoc into that file, the shell **truncates the committed golden to
zero bytes before** Python fails on the missing module; `set -euo pipefail` then
aborts before the cleanup line, so it also strands a `.venv-goldens/` directory.
The result is all 32 `test/ground.test.js` cases failing. If you ran it:

```
git checkout test/golden/ground.json
rm -rf .venv-goldens
```

**`scripts/make-render-goldens.js` tells you to re-render `frame.html`** to check
browser fidelity (line 16). That file is gone. The point behind the advice still
stands — these goldens are a `@napi-rs/canvas` regression baseline and prove
nothing about browser fidelity — but the specific comparison it suggests is no
longer available, and there is currently no replacement for it.

## Not built yet

Honest list. None of these is half-done; they are simply not there.

- **Light mode for the app chrome.** The editor is dark only. This is planned as
  its own cycle, designed from scratch — the design handoff's option 1b was a
  different design that happened to be lighter, not a light variant of this one.
  `web/tokens.css` is the only file in the app containing a raw colour, so a
  second theme is a second token set rather than a hunt through stylesheets.
- **Named device frames.** The phone frame is called `phone`, deliberately
  unnamed, because it promises no specific device size. Device presets would
  extend that frame rather than replace it.
- **Keyboard selection.** Clicking selects; Escape clears. There is no way to
  select with the keyboard, and the canvas is deliberately *not* focusable —
  a focus ring on it is visually indistinguishable from the selection
  outline and reads as "the whole shot is selected". It wants Tab plus
  arrows, with the selection outline itself as the focus indicator so there
  is never a second ring competing with it.
- **Golden coverage at a second canvas size, for most compositions.** Partly
  closed, not open: `square-browser.png` pixel-verifies the web layout with a
  browser frame at 1:1 1500×1500, and `test/export-scale-fidelity.test.js`
  renders at 4:3 2000×1500 — a size no golden covers — and measures the painted
  corner radius directly. What is still 3:2-only is everything else: the mobile
  and web+mobile layouts, the phone frame, the
  light chrome theme, the URL pill, the shadow multiplier, each stroke style
  and each mobile frame have exactly one golden, all at 1800×1200. Since every geometric quantity is a fraction of
  the canvas it was handed, a stray fixed-pixel literal in one of those painters
  would still show its face first at another size.
- **A CLI.** The old one is gone and nothing replaced it. `core/` is a library, so
  a thin Node shell over `composeWithMeta` and `@napi-rs/canvas` would bring back
  batch rendering without Python or Playwright — it just has not been written.
- **Saved presets, and the rail's Library / Presets / Integrations / Settings.**
  They render, disabled. Nothing is wired behind them.
- **Zoom, and copy-to-clipboard.** The toolbar's zoom stepper and its "Copy"
  button both render disabled and are wired to nothing. When zoom is built it
  must stay a pure view transform and never reach `composeWithMeta`.
- **Bleed layouts, and video out.** Letting the UI run off one edge is common in
  the shots that do best and is still unsupported. Dribbble takes video up to
  20MB; same frame, animated screen.

## Capturing a mobile screen when the window will not resize

Browser windows often refuse to resize below the OS minimum, so the page never
hits its mobile breakpoint. Load the page in a **same-origin iframe** fixed at
390px instead: media queries respond to the iframe's width. Scale the iframe
with a CSS transform for resolution, capture in vertical tiles, and stitch. That
is how `samples/karaoke-mobile.png` was made.
