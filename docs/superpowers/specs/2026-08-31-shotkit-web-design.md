# shotkit web — design

Date: 2026-08-31
Status: approved, ready for implementation planning

## Problem

`shotkit` turns a raw screenshot into a finished Dribbble shot. It works, but it
is a CLI that only exists in one folder on one machine. It needs `python3` with
Pillow and `playwright` with Chromium. Neither is currently installed here, so
the tool does not run at all today.

Two things are wanted:

1. A UI, so the shot can be composed by eye instead of by re-running a command
   with different flags.
2. Availability outside this folder.

## Decisions

These were settled during brainstorming and are not open in this cycle.

| Decision | Choice |
|---|---|
| First surface | Hosted static web app (GitHub → Netlify) |
| Rendering | Redraw on `<canvas>`, not DOM-snapshot |
| v1 feature scope | Full single-shot parity. No batch. |
| Stack | Vanilla JS + Vite. No framework. |
| Repo | New public GitHub repo |
| Design register | Push it — distinctive, authored motion, a point of view |
| Later surfaces | CLI, npm publish, Claude Code skill, Tauri desktop |

### Why canvas and not DOM-snapshot

`html-to-image` and its siblings are known to drop or shift `box-shadow`,
blur, and webfonts. shotkit's entire look *is* shadow and gradient, so an
export that quietly disagrees with the preview would be the worst possible
failure for this tool. Canvas 2D draws all of it natively, exports with
`canvas.toBlob()`, needs no library, and is reused unchanged by the future CLI
and desktop app.

### Why the Python and Playwright dependencies go away

In a browser there is nothing for Playwright to do — the browser is the
renderer. And `ground.py` is pixel arithmetic that runs the same on a canvas
`ImageData` buffer. Removing both is what makes the app static, free to host,
offline-capable, and privacy-preserving: screenshots are often unreleased
client work and must never leave the machine.

## Architecture

```
shotkit/
  core/                 pure JS. No deps. No DOM, no fs, no node builtins.
    ground.js             colour analysis      (port of ground.py)
    layout.js             geometry             (port of frame.html maths)
    render.js             canvas 2D painter    (port of frame.html CSS)
    presets.js            RATIOS, HUES, defaults
    config.js             defaults + validation + normalisation
    index.js              compose(target, config, images) -> target
  web/                  Vite app, deploys to Netlify
    index.html
    main.js               wiring: drop -> analyse -> render -> export
    panel.js              controls
    style.css
  samples/              the six screenshots currently in src/
  test/
    golden/ground.json    reference values, generated once from ground.py
    ground.test.js
    layout.test.js
    render.test.js
```

`core/` is the keystone. It knows nothing about where images came from or where
the PNG is going. Every other surface — web app now, CLI and desktop later — is
a thin shell around it.

`compose()` is **handed** a target to draw into, rather than creating one. The
target is anything exposing `width`, `height`, and `getContext("2d")`. In the
browser that is a `<canvas>` or an `OffscreenCanvas`; in Node it is an
`@napi-rs/canvas` instance. This is what keeps `core/` free of DOM types and
lets the CLI reuse `render.js` untouched.

The current three files map on as follows. `frame.html` splits in two, because
geometry is testable as plain numbers and painting is not:

| Now | Becomes |
|---|---|
| `ground.py` | `core/ground.js` |
| `frame.html` (maths) | `core/layout.js` |
| `frame.html` (CSS/paint) | `core/render.js` |
| `shotkit.js` (flag parsing) | `core/config.js` + a later CLI shell |

`frame.html`, `ground.py`, and `shotkit.js` stay in the repo until the golden
tests pass, then are deleted in the same commit that turns them green.

## Modules

### `core/ground.js`

Input: one or more images, as `ImageData` or anything exposing width, height,
and an RGBA byte array. Plus optional `forceHue` (0–360) and `mode`
(`"light"` | `"mid"` | `null`).

Output:

```js
{ ground: ["#…", "#…", "#…"], lum, hue, chroma, darkUI }
```

A direct translation of `ground.py`. The algorithm and every threshold carry
over unchanged:

- Downscale to fit 800×800 before sampling.
- **Flat-pixel filter.** A pixel votes on hue only if all four neighbours are
  within a Manhattan RGB distance of 18. A button or pill is one solid colour;
  a photo is not. Without this, album art and furniture photography hijack the
  brand colour and every ground comes out muddy orange.
- If fewer than 300 flat pixels clear saturation 0.22, fall back to all pixels.
- Luminance is the Rec. 709 mean over *all* pixels, normalised 0–1.
- Hue is a 36-bin histogram weighted by saturation squared, ignoring pixels
  with `s < 0.22`, `v < 0.16`, or `v > 0.98`. Take the **peak** bin, scored
  with its two neighbours at half weight. Refine inside the winning bin with a
  saturation-weighted circular mean. Peak, never mean — a brand colour piles
  into one bin, photos smear across many.
- `chroma` = share of total weight in the three winning bins, ×1.25, capped
  at 1.
- If total weight is negligible, return the neutral fallback: hue 250/360,
  chroma 0.
- `darkUI` = `lum < 0.34`, overridable by `mode`.
- Saturation of the ground: `0.16 + 0.26 * min(chroma * 1.6, 1)`. Never fully
  saturated.
- **Lightness is set for separation, not mood.** A light UI gets a pale tint at
  L 0.975 / 0.925 / 0.868. A dark UI gets a **mid-tone** ground at L 0.855 /
  0.780 / 0.712 — never a dark one. Dark-on-dark is the most common way these
  shots fail.

Needs an HSV→RGB and RGB→HSV pair, and an HSL→hex. Written inline; they are a
dozen lines and pulling in a colour library would break the zero-dependency
rule for `core/`.

### `core/layout.js`

Pure functions over numbers. No canvas, no images — it takes source aspect
ratios, not pixels. This is what makes the geometry unit-testable.

```js
layout(config, sourceRatios) -> { safe, web?, phones: [] }
```

Carries over from `frame.html`:

- **One padding number.** `pad` (default `.052`) is a fraction of the
  **shorter** canvas side, so the margin is identical on all four edges. An
  earlier version used separate per-axis percentages; those resolve to very
  different pixel gaps and the UI floats in the middle looking small. `insetX`
  and `insetY` remain as explicit per-axis overrides.
- **Everything is proportional to the canvas.** Padding, radius, shadow offset
  and blur are all fractions, never fixed pixels. That is what makes a row of
  shots at 3:2, 4:3, 16:9 and 1:1 look like one person made them.
- **`contain` by default.** The screen takes the source image's own aspect
  ratio and fits inside the safe box, so nothing is ever cropped. `cover` is
  available and accepts the crop.
- Screen corner radius defaults to 1.33% of canvas width, overridable.
- Phone width follows its source ratio, so a screenshot is never squashed.
  Phone corner radius is 12.5% of phone width.
- `mobile` layout: 1–3 phones, staggered, middle one highest.
- `web+mobile`: the web screen fills the safe box; the phone rises out of the
  bottom-right corner and bleeds past the bottom edge by `phoneBleed`
  (default `.10`) at `phoneScale` (default `.86`).

### `core/render.js`

Takes a layout result plus decoded images and paints a canvas at full export
resolution.

- **Ground**: a linear gradient through the three stops, angled toward a
  top-left light source.
- **Shadow**: canvas `shadowColor` / `shadowBlur` / `shadowOffsetY`. The CSS
  used two stacked shadows (a tight contact shadow and a wide ambient one), so
  this is two draw passes over the same rounded rect. Alphas differ for light
  and dark UI, matching the current values.
- **Screen**: rounded rect clip, image drawn `contain` or `cover`, then a 1px
  inset hairline stroke.
- **Phone**: rounded rect body in the frame colour, inset screen drawn
  `cover` anchored to top centre, 1px inner highlight stroke.
- **Grain**: a noise tile generated once into an offscreen canvas and drawn
  tiled with `globalAlpha` = `grain` (default `0.34`). Generated from a
  **fixed seed**, so two renders of the same config are byte-identical. This
  matters for the pixel-diff tests and for the user's trust that nothing
  shifted between preview and export. Grain also stops large flat gradients
  from banding.
- **Caption**: one line, bottom left, at 55% opacity.

### `core/config.js`

Holds defaults, validates, and normalises. Same names and defaults as today's
flags, so a `jobs.json` written for the CLI stays valid input for `core/`.

Ratios: `3:2` → 1800×1200, `4:3` → 2000×1500, `16:9` → 1920×1080, `1:1` →
1500×1500. Explicit `w`/`h` beat `ratio`.

Named grounds: lavender 268, paper 34, mint 158, ember 24, slate 240, ash 40,
sky 205, rose 340.

### `web/`

Wiring only. Drop or pick files, decode with `createImageBitmap`, call
`core/`, put the canvas on the page, download on export.

**The preview canvas is the export canvas.** It is rendered at full output
resolution and scaled down with CSS for display. There is no second code path,
so the export cannot disagree with what was on screen. Export is
`canvas.toBlob()` plus an object-URL download.

Re-render is debounced to one animation frame while a slider is dragging.
`ground.js` is the slow step, so its result is cached per image and only
recomputed when the image, `forceHue`, or `mode` changes — not when `pad` moves.

## The app's own design

Register: push it. This is a public portfolio piece and a tool whose entire
subject is making things look good. A default-looking control panel would
undercut its own pitch.

**The organising idea: the app wears the shot's colour.** `ground.js` already
extracts the product's accent. That same value tints the app chrome — panel
surfaces, focus rings, the drop zone, the export button. Drop a different
screenshot and the whole interface shifts with it. The tool demonstrates its
thesis rather than describing it.

**One authored moment**, on file drop: the drop zone gives way, the ground
blooms in, the screen settles under its shadow. One orchestrated sequence, not
scattered hover effects. It is canvas-native and costs nothing.

Controls are grouped by what they change, not by flag name: **Canvas** (ratio,
size), **Ground** (auto / hue / preset, tone), **Frame** (fit, pad, radius),
**Finish** (grain, caption), and **Phone** (scale, bleed — only shown when a
phone layout is active).

## Errors

Every case is handled inline and **never discards the last good render**.

| Case | Behaviour |
|---|---|
| Non-image file dropped | Inline message naming the file. Previous shot stays. |
| Image fails to decode | Same. |
| No colour found in image | Neutral fallback already in the algorithm. Panel shows "no accent found". |
| More than 3 phone images | Use the first 3, say so inline. |
| Very large image | Sample at 800px, render from the full-resolution source. |
| `web+mobile` chosen with no phone image | Fall back to `web`, note it in the panel. |
| Canvas larger than the browser allows | Cap at the platform limit, warn, keep the aspect ratio. |

## Testing

**Golden values, generated once.** Pillow is not installed on this machine, so
step one is a throwaway virtualenv that runs `ground.py` over all six files in
`samples/` and writes hue, luminance, chroma, `darkUI`, and the three hex stops
to `test/golden/ground.json`. That file is committed. The venv is thrown away.
Python is never needed again.

`ground.test.js` then asserts `core/ground.js` reproduces those numbers: hue
within 1.5°, luminance and chroma within 0.01, hex stops exact. This is the
proof the port is faithful, and it is written **before** the port.

`layout.test.js` covers pure geometry: equal margins on all four edges across
all four ratios; `contain` never crops; `cover` fills; phone aspect ratio is
preserved; `insetX`/`insetY` override correctly.

`render.test.js` pixel-diffs a small set of reference PNGs, one per layout,
with a tolerance for antialiasing. The fixed grain seed is what makes this
stable.

Runner: Vitest, browser mode for the canvas tests.

## Verification before ship

Per the standing UI rules:

- Contrast checked, including the accent-tinted chrome at every hue — the
  tint is generated, so it must be clamped to stay legible.
- No horizontal scroll between 320px and 1920px.
- `:focus-visible`, disabled, and loading states on every control.
- `prefers-reduced-motion` fallback on the drop sequence.
- No fabricated numbers anywhere in the page copy.

## Out of scope for this cycle

Each gets its own brainstorm → spec → plan cycle later:

- **CLI rewire.** `shotkit.js` reduced to flag parsing plus file IO over
  `core/`, using `@napi-rs/canvas` for an identical canvas 2D API in Node.
  Drops both Python and Playwright. Keeps `--config=jobs.json` batch.
- **npm publish**, so `shotkit` is a global command in any folder.
- **Claude Code skill** wrapping the CLI.
- **Tauri desktop app**, wrapping `web/`.
- **Bleed layout** — letting the UI run off one canvas edge.
- **MP4 export.**

## Open risk

The `render.js` port is the only part that cannot be proven correct by
arithmetic alone. CSS `box-shadow` and canvas `shadowBlur` do not use the same
blur kernel, so the two-pass shadow will need tuning by eye against the current
output before the reference PNGs are frozen. Budget for that; do not assume
the first numbers match.

---

# Amendment 1 — Backdrop handoff, expanded scope

Date: 2026-08-31, after Task 7. Tasks 1–7 are complete and unaffected; `core/` as
built stands. This amendment supersedes the original "Out of scope" list and the
plan's Tasks 8–12, which were written before the visual direction existed.

## What changed

Two things arrived after the original spec was approved.

1. A **visual direction** was chosen from six candidates: the three-column editor
   layout, judged on the requirement that the app read as *software* — a photo
   editor, Figma, pen.dev — not a marketing page.
2. A **high-fidelity design handoff** (`design_handoff_backdrop_1a/`) landed,
   specifying that direction properly: a four-pane dark editor called "Obsidian",
   with a complete token system, control patterns, and a feature set larger than
   shotkit's.

The handoff describes a **macOS desktop app** ("Backdrop") built in SwiftUI,
Electron or Tauri. shotkit is a browser app with a finished `core/` library. The
*visual* specification is adopted faithfully; the *platform* instructions are not.

## Adopted from the handoff

**The token system, verbatim.** Surfaces `#0b0c0e` window · `#0e0f12` canvas ·
`#17191d` / `#1a1c20` raised · `#22252b` active control. Borders `#26282e` strong ·
`#1b1d22` / `#1f2126` hairline · `#2c2f36` dashed. Text `#e8eaee` primary ·
`#c6cad2` secondary · `#9ba1ab` muted · `#8a8f98` / `#6b7078` faint · `#565b64`
disabled. Inverse primary `#f2f3f5` on `#0b0c0e`. Type: Geist 400–700 for UI
(11.5–13px), Geist Mono for every number, size and meta label (9.5–11px; section
labels 10px at .12em, uppercase). Radii 7–8 controls, 10 cards, 12 pills. Spacing
rhythm 4/6/8/10/12/14.

**The four-pane shell.** Toolbar (48) → icon rail (52) · sidebar (226) · canvas ·
inspector (266). Sidebar carries templates and presets; inspector carries
BACKGROUND, FRAME and EXPORT.

**The control patterns.** Segmented control (h28, active cell `#22252b`), slider
rows (label + mono value, 3px track `#26282e`, fill `#e8eaee`, 11px white thumb),
pill chips (h24, selected inverse).

## Rejected from the handoff

- **Platform instructions.** No SwiftUI/AppKit/Electron/Tauri. This is the
  existing Vite app over the existing `core/`.
- **Desktop window chrome.** No frameless 1180×764 window, no traffic lights in
  the app's own toolbar. Painting macOS chrome inside a browser tab is fake
  chrome. (Traffic lights inside the *rendered mockup's* browser frame are a
  different thing and are in scope — see Device frames.)
- **`image-slot.js`** — prototype scaffolding, explicitly do-not-ship. The app has
  its own decode path.
- **CLI watch-folder card, Library / Integrations nav, saved user presets.**
  Deferred. The nav rail renders the items; only Canvas is live.

## New feature scope

### Background panel — auto first, manual after

The handoff's BACKGROUND section lets the user pick a gradient. shotkit's thesis
is the opposite: **the ground is sampled from the product's own accent**, which is
what `core/ground.js` exists for. Both survive, in this order:

1. **Sampled** — the default. Its three stops shown as swatches with the measured
   hue. This is the top of the panel, not one option among many.
2. **Presets** — the eight named hues already in `core/presets.js`.
3. **Manual** — hue slider, and now an **angle** slider (`frame.html` hardcodes
   166°; it becomes a parameter).
4. **Mesh** — a new background type. New painter in `core/render.js`.

`tone` (auto / light / mid) stays, since the dark-UI mid-tone rule is load-bearing.

### Export — templates AND ratios

Both, not one. Named templates carry real pixel sizes (Dribbble shot 2800×2100,
Twitter post 1600×900, Twitter header 1500×500, App Store 2880×1800, Open Graph
2400×1260, Instagram 2160×2160) alongside the existing bare ratios (3:2, 4:3,
16:9, 1:1) and a custom size. Export gains **scale 1x/2x/3x** and format
PNG/JPEG/WebP.

Note: Dribbble's 2800×2100 is 4:3 at @2x. shotkit's current default is 3:2 at
1800×1200. The named template is the more correct default for its stated purpose.

### Device frames

The largest addition, and the most invasive. **None / Browser / iPhone**, each
with a **chrome theme**

> **Amended 2026-09-01: macOS dropped from v1.** The handoff specifies macOS as a
> feature but contains no macOS frame anywhere — all three of its image slots sit
> inside the same browser chrome, and "macOS" appears only as an inert inspector
> chip. Rather than ship an invented bar height, v1 offers three frames. macOS
> returns when it is designed. (dark: chrome `#1b1d22`, body `#101114`; light:
chrome `#f6f7f9`, body `#fff`, borders `#e3e5ea`).

**This changes geometry, not only paint.** A browser or macOS chrome bar sits
above the screenshot *inside* the frame, so the screen box shrinks by the bar
height, the corner radius applies to the frame rather than the screenshot, and the
shadow attaches to the frame. That reaches into `core/layout.js`, which is
currently closed and fully tested — its existing behaviour must remain exactly
correct when `frame: 'none'`, which is the current behaviour and stays the default
for every existing test.

### Canvas surround

Already decided, still in scope, and distinct from theming: three **neutral**
steps (dark, mid, light) behind the shot, so a pale ground can be judged honestly.

**Hard constraint: the surround is chrome, never pixels.** It must not reach the
exported PNG. Because the preview canvas *is* the export canvas, the surround must
be a separate element behind that canvas — `core/render.js` never learns it
exists. Proven by test: exporting at two surround settings yields byte-identical
PNGs.

## Still deferred

Saved user presets and persistence · the CLI · a full light theme for the app
chrome (handoff option 1b "Fieldset" is the likely source when it happens) ·
bleed layout · MP4 export · npm publish · Claude Code skill · Tauri desktop.

## Sequencing

**`core/` first, then the app.** Mesh, device frames, templates, scale and angle
all land in `core/` while its golden-test infrastructure is fresh, and the shell is
then built once against a finished library rather than revisited each time `core/`
grows. This was an explicit decision; the alternative was a working app sooner at
the cost of building the inspector twice.
