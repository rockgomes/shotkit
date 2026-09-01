# shotkit app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shotkit web app — the "Obsidian" four-pane editor from the design handoff — on top of the finished `core/` library, and deploy it.

**Architecture:** `core/` is complete: a zero-dependency ES-module library that composes a shot onto a canvas 2D context. 163 tests, 8 golden PNGs, every constant verified against the original `frame.html` / `ground.py`. The app is a thin Vite shell over it — decode files, hold config state, call `composeWithMeta`, download the result. **No compositing logic belongs in the app.** If a task finds itself computing geometry or colour, it is in the wrong layer.

**Tech Stack:** Vanilla JS (ES modules), Vite, Netlify. No framework — the app is one canvas plus a control panel, and all state is a single config object.

**Spec:** `docs/superpowers/specs/2026-08-31-shotkit-web-design.md` — read **Amendment 1**, which governs this plan.

**Design reference:** `design_handoff_backdrop_1a/` — option `1a` in `Backdrop Mockups.dc.html`. Its README summarises; **the HTML is authoritative.**

**Predecessors:** `2026-08-31-shotkit-web.md` (Tasks 1–7) and `2026-08-31-shotkit-core-extensions.md` (Tasks 1–6), both complete.

## Global Constraints

- **Import only from `core/index.js`.** It exports `compose`, `composeWithMeta`, `normalise`, `layout`, `groundFor`, and the vocabularies: `RATIOS`, `HUES`, `DEFAULTS`, `TEMPLATES`, `FRAME_KINDS`, `SCALES`, `DEFAULT_ANGLE`, `LAYOUTS`, `FITS`, `TONES`, `BG_TYPES`, `CHROME_THEMES`. **Never deep-import `core/presets.js`** — that breaks the module boundary and the duplicates drift.
- **`core/` is finished. Do not modify it.** If the app needs something `core/` does not offer, stop and report it rather than reaching in. One known exception is scheduled in Task 6 (the URL/title field) and is explicitly authorised there.
- **The preview canvas IS the export canvas** — rendered at full output resolution, scaled down with CSS. There is no second render path, so what is exported cannot disagree with what was on screen.
- **The canvas surround is chrome, never pixels.** It must never appear in the exported PNG. Enforced by test in Task 2.
- **No fake desktop chrome.** The handoff describes a frameless macOS window with traffic lights. This is a browser tab; painting macOS chrome into it is fake chrome. (Traffic lights inside the *rendered mockup's* browser frame are a different thing entirely and belong to `core/`.)
- **`image-slot.js` in the handoff is prototype scaffolding, marked do-not-ship.** The app has its own decode path.
- Accessibility, checked in Task 7 and expected throughout: contrast passes at every generated hue; no horizontal scroll between 320px and 1920px; `:focus-visible`, disabled and loading states on every interactive control; `prefers-reduced-motion` fallback on every animation.
- **Never fabricate numbers, testimonials, or placeholder copy** that could be mistaken for real. If a value is missing, change the layout.
- All 163 `core/` tests must stay green and unmodified throughout.
- ES modules. Node 20+. Commit after every task.

## Design tokens — from the handoff, use verbatim

```
surfaces   window #0b0c0e · canvas #0e0f12 · raised #17191d / #1a1c20 · active #22252b
borders    strong #26282e · hairline #1b1d22 / #1f2126 · dashed #2c2f36
text       primary #e8eaee · secondary #c6cad2 · muted #9ba1ab
           faint #8a8f98 / #6b7078 · disabled #565b64
inverse    bg #f2f3f5 on text #0b0c0e
brand      #5b6cff → #a24ff0 at 135deg
status     #ff5f57 #febc2e #28c840
type       Geist 400-700, UI 11.5-13px
           Geist Mono for every number, size and meta label (9.5-11px;
           section labels 10px at .12em tracking, uppercase)
radii      7-8 controls · 10 cards · 12 pills
spacing    4 / 6 / 8 / 10 / 12 / 14
```

Fonts from Google Fonts (Geist, Geist Mono). Icons: a 1.5px-stroke set (Lucide or equivalent) — the handoff's unicode glyphs are placeholders. **Never emoji.**

---

### Task 1: Vite shell and the Obsidian chrome

Static layout only. No file handling, no rendering, no state. The point is to get the four panes and the token system right before anything moves.

**Files:**
- Create: `web/index.html`, `web/main.js`, `web/style.css`, `web/tokens.css`
- Modify: `vite.config.js`, `package.json`

**Interfaces:**
- Produces: the DOM skeleton every later task fills. Stable ids: `#rail`, `#sidebar`, `#stage`, `#canvas`, `#inspector`, `#toolbar`, `#dropzone`.

**Layout, from the handoff:** toolbar 48px tall → a row below it holding icon rail 52px · sidebar 226px · canvas (flex) · inspector 266px. Hairline `#1b1d22` between panes.

- [ ] **Step 1: Configure Vite**

Root `web`, build to `../dist`. Confirm `npm run dev` serves and `npm run build` writes `dist/`.

- [ ] **Step 2: Write `web/tokens.css`**

Every token above as a custom property on `:root`. One name per value, no aliases. This is the only file allowed to contain a raw hex code — every other stylesheet references the variables.

- [ ] **Step 3: Build the four-pane skeleton**

Semantic landmarks, not a soup of divs: `<header>` for the toolbar, `<nav>` for the rail, `<aside>` for the sidebar and inspector, `<main>` for the stage. Screen-reader users navigate by these.

The toolbar carries the shotkit wordmark, the filename slot, and a right group: a zoom stepper, a ghost "Copy" button, a primary "Export" button. **No traffic lights** — see the fake-chrome constraint.

The rail holds the app mark and four nav items plus settings pinned to the bottom. Only Canvas is live; the rest render and are visibly disabled with `aria-disabled`. Do not wire them.

- [ ] **Step 4: Control primitives**

Build the three patterns the handoff specifies, as reusable CSS classes: segmented control (h28, active cell `#22252b`), slider row (label + mono value, 3px track `#26282e`, fill `#e8eaee`, 11px white thumb), pill chip (h24, selected inverse). Every one needs `:focus-visible`, `:disabled` and hover states now — retrofitting them in Task 7 is how they get missed.

- [ ] **Step 5: Verify at three widths**

Load at 1440, 1024 and 375. No horizontal scroll at any of them. The four-pane layout will need to collapse below ~900px — decide how now (panels as drawers is the obvious move) and note the decision in the commit message.

- [ ] **Step 6: Commit**

```bash
git add web vite.config.js package.json
git commit -m "feat(web): obsidian four-pane shell and token system"
```

---

### Task 2: The pipeline, and the canvas surround

Drop a file, see a shot. This is the task that proves `core/` works from a browser.

**Files:**
- Create: `web/state.js`, `web/decode.js`
- Modify: `web/main.js`, `web/style.css`
- Create: `test/web-export.test.js`

**Interfaces:**
- `state` — `{ config, images: {web, mobile[]}, meta, surround }`.
- `render()` — recomposes into the on-page canvas, returns `meta`.
- `addFiles(files)` — decodes, classifies by orientation, returns an array of human-readable errors.

- [ ] **Step 1: Decode and classify**

`createImageBitmap` per file. Landscape → the web screenshot; portrait → a phone (max 3). Reject non-images by name, and **never discard the last good render** on a bad drop.

- [ ] **Step 2: Wire `composeWithMeta`**

```js
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const { meta } = composeWithMeta(canvas, state.config, state.images, mk);
```

The canvas is rendered at full output resolution and scaled with CSS (`max-width: 100%; height: auto`). Do not render at display size.

- [ ] **Step 3: Debounce**

One `requestAnimationFrame` per burst while a slider drags. `groundFor` is the slow step — cache its result per image and recompute only when the image, `forceHue` or `tone` changes, never when `pad` moves.

- [ ] **Step 4: The surround**

Three neutral steps — dark, mid, light — as a small control in the canvas toolbar. It sets the background of the **stage element behind the canvas**, nothing else.

**`core/` must never learn the surround exists.** It is not passed to `composeWithMeta`, it is not in `state.config`, and no painter sees it. Keep it on `state.surround`.

- [ ] **Step 5: Prove the surround cannot reach the export**

`test/web-export.test.js`:

```js
it('the surround never reaches the exported pixels', () => {
  // compose twice with identical config; the surround is not a compose input
  // at all, so this asserts the API shape as much as the output
  const a = render({ surround: 'dark' });
  const b = render({ surround: 'light' });
  expect(Buffer.compare(a, b)).toBe(0);
});
```

Then **prove it discriminates**: temporarily pass the surround into the config and paint it as the ground, confirm the test fails, and restore. A test you have not watched fail is not a guard — this project shipped five that could not fail, and every one was caught by trying to break it.

- [ ] **Step 6: Manual verification**

`npm run dev`, drop `samples/fieldset.png`, confirm a shot appears. Drop `samples/karaoke-web.png` and `samples/karaoke-mobile.png` together, confirm the web+mobile layout. Switch the surround through all three and confirm only the area behind the canvas changes.

- [ ] **Step 7: Commit**

```bash
git add web test/web-export.test.js
git commit -m "feat(web): decode, compose and preview, with the canvas surround"
```

---

### Task 3: Export

**Files:**
- Create: `web/export.js`
- Modify: `web/main.js`

- [ ] **Step 1: Download the canvas**

`canvas.toBlob(cb, mime, quality)` → object URL → `<a download>` → revoke. Filename from the source file's stem plus the layout and scale, e.g. `fieldset--web@2x.png`.

- [ ] **Step 2: Scale**

`scale` is a **`core/` config field** — `composeWithMeta` renders at `w × scale`. So changing scale re-renders; it is not a post-process. Confirm a 2× export is exactly twice the pixel dimensions of the 1× and visually identical.

- [ ] **Step 3: Format**

`format` is **app-owned** — `core/` never encodes. Map `png` → `image/png`, `jpeg` → `image/jpeg` at quality 0.92, `webp` → `image/webp`. JPEG has no alpha; the ground always fills the canvas so this is safe, but say so in a comment.

- [ ] **Step 4: States**

Export is `disabled` until a shot exists, and shows a loading state while a large render is in flight (a 3× Dribbble export is 8400×6300 and will not be instant). `aria-busy` while working.

- [ ] **Step 5: Verify**

Export at 1×, 2× and 3×; confirm dimensions are exactly proportional and the images are the same composition. Export each format and open all three.

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "feat(web): export PNG, JPEG and WebP at 1x, 2x and 3x"
```

---

### Task 4: Sidebar — templates, ratios, presets

**Files:**
- Create: `web/sidebar.js`
- Modify: `web/main.js`, `web/style.css`

- [ ] **Step 1: Templates and ratios, both**

The handoff lists templates only; the spec requires both. Two labelled groups under one search field: **Templates** (`TEMPLATES` — name left, mono size right-aligned) and **Ratios** (`RATIOS`). Selected row: bg `#17191d`, border `#26282e`, name 500 white, size `#8a8f98`.

Plus a "+ Custom size" row (dashed `#2c2f36`) opening two number inputs. Explicit `w`/`h` beats a template, which beats a ratio — `normalise()` already enforces that order; do not reimplement it.

- [ ] **Step 2: Ground presets**

The eight named hues from `HUES` as rendered swatches — each drawn with the real light-tint gradient, not a flat colour, so the row previews what it will produce.

- [ ] **Step 3: The search field filters both groups**

Plain substring match on the label. No fuzzy matching.

- [ ] **Step 4: Commit**

```bash
git add web
git commit -m "feat(web): sidebar with templates, ratios and ground presets"
```

---

### Task 5: Inspector — the Background section

**The ordering here is the product's argument, not a layout preference.** shotkit's thesis is that the ground comes from the product's own accent — that is what `core/ground.js` exists for, and four tasks of the first plan verified it. Manual control is an override, not a peer.

**Files:**
- Create: `web/inspector-background.js`
- Modify: `web/main.js`

- [ ] **Step 1: Sampled, first**

At the top: the three stops as swatches, with the measured hue and a "Sampled" label. This is the default and it needs no control to reach.

- [ ] **Step 2: Then the overrides, in order**

Presets (the eight hues) → hue slider (0–360) → **angle** slider (0–360, default `DEFAULT_ANGLE` = 166) → **type** segmented (`BG_TYPES`: linear / solid / mesh) → **seed** stepper, shown only when type is mesh.

- [ ] **Step 3: Tone**

`TONES` as a mini-segmented: auto / light / mid. Label it so the rule is legible — a dark UI gets a mid-tone ground so the shot separates. This is not a mood setting.

- [ ] **Step 4: The panel reflects reality**

When a hue is forced, the "Sampled" swatch stays visible but is visibly no longer active. Do not let the preset row and the hue slider silently disagree — they write the same field.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "feat(web): background inspector, sampled first"
```

---

### Task 5b: `core/` housekeeping — rename `iphone` to `phone`, and a second-size golden

Two small `core/` changes, scheduled here so Task 6 builds its frame panel on the final name. **Authorised `core/` change** (the fourth).

**Files:**
- Modify: `core/presets.js`, `core/config.js`, `core/layout.js`, `core/render.js`, `core/index.js`
- Modify: `scripts/make-render-goldens.js`, `test/compose.test.js`, `test/layout.test.js`, `test/render-frames.test.js`
- Rename: `test/golden/render/iphone.png` → `phone.png`
- Create: `test/golden/render/<second-size>.png`

- [ ] **Step 1: Rename the frame kind `iphone` → `phone`**

Every occurrence: the `FRAME_KINDS` vocabulary, `chromeFor()`'s branch, `paintIphoneChrome` → `paintPhoneChrome`, tests, and the golden filename.

The reason is not cosmetic. `iphone` promises a specific device, which invites a device-size picker — a gate we are deliberately not opening yet. `phone` describes the shape without the promise, and leaves room to add named devices later without renaming the concept.

This is a pure rename. **No pixel may change.** Regenerate the renamed golden and confirm it is byte-identical to the old `iphone.png` before deletion — same bytes, new name. If a single pixel moves, the rename touched behaviour and that is a defect.

- [ ] **Step 2: Add a golden at a second canvas size**

Every existing golden is 3:2 at 1800×1200. "Everything is proportional to the canvas" is the project's founding principle — it is what makes a row of thumbnails look like one person made them — and it is asserted in `layout` unit tests but has never been pixel-verified at another size.

Add one case at **1:1 (1500×1500)**, chosen because it is the furthest from 3:2 and would expose a stray fixed pixel most clearly. Use the `web` layout with a browser frame so it exercises geometry, chrome and grain together.

- [ ] **Step 3: Prove the new golden guards**

Inject a fixed pixel value where a proportion belongs — hardcode the corner radius, or the chrome bar height — and confirm the 1:1 golden fails. Report the diff ratio. Restore and confirm green.

A golden that does not fail on a real change is decoration. An earlier baseline in this project sat at a threshold so loose it could not detect a doubled shadow alpha.

- [ ] **Step 4: Commit**

```bash
git add core test scripts
git commit -m "refactor(core): rename the iphone frame to phone, add a 1:1 golden"
```

---

### Task 6: Inspector — Frame, Finish, and the URL field

**Files:**
- Create: `web/inspector-frame.js`
- Modify: `web/main.js`
- **Authorised `core/` change:** `core/config.js`, `core/presets.js`, `core/render.js`, `core/index.js`

- [ ] **Step 1: Frame**

`FRAME_KINDS` as chips: none / browser / phone. (Task 5b renamed `iphone` to `phone`; use the new name.) **macOS is deliberately absent** — no design exists for it; do not add one. Chrome theme (`CHROME_THEMES`) as a mini-segmented, shown only when a frame is active.

- [ ] **Step 2: Finish**

Fit (`FITS`), padding, corner radius, grain, caption. Sliders per the handoff pattern; caption is a text input.

- [ ] **Step 3: Close the empty URL pill**

**This is the one authorised change to `core/`.** The browser frame currently renders its URL pill empty: the handoff shows literal text (`app.acme.dev` at line 103), but `core/` has no field for it, and Task 5 of the extensions plan correctly refused to fabricate placeholder copy into every export.

Add a `url` field to `normalise()` (default `null`), draw it in `paintChrome` when present using the already-captured `fUrlTxt` colour (dark `#9ba1ab` / light `#5c6470`) in Geist Mono, clipped to the pill, and expose a text input in this panel.

When empty the pill stays empty — that is correct, and better than inventing a domain. Add a `core/` test for both states, and a golden for the populated pill. **Regenerate no existing golden**; the empty-pill goldens must stay byte-identical, which proves the default is unchanged.

- [ ] **Step 4: Verify**

All 163 `core/` tests still pass, all 8 existing goldens byte-identical, plus the new one.

- [ ] **Step 5: Commit**

```bash
git add web core test
git commit -m "feat: frame and finish inspector, and a url field for the browser pill"
```

---

### Task 6b: The Shadow control — a multiplier, not a retune

**Authorised `core/` change** (the fifth, and the last planned). The handoff specifies a Shadow slider; the panel has none, because `core/`'s shadow alphas are hardcoded constants.

**The design constraint that makes this safe.** A previous task measured `@napi-rs/canvas` rendering shadows ~5.4× fainter than Chromium, "corrected" the alphas upward, and shipped values **65 RGB levels too dark in the browser** with every Node test green. The doc comment above `paintShadow` exists to stop that recurring, and it stays.

So this is **not** a retune. It is a multiplier over the verified values:

- `shadowScale` in `core/config.js`, default **1**, accepted range 0–2.
- `paintShadow` gains a scale parameter defaulting to 1; every call site passes `c.shadowScale`. The alphas themselves (`0.17/0.07` web and browser frame, `0.22/0.10` phones) are **not touched**.
- Clamp the product to `[0, 1]` defensively.

**At scale 1 the output must be byte-identical**, which all 10 existing goldens prove. That is the whole safety argument: the default path is unchanged by construction, not by inspection.

**Files:**
- Modify: `core/config.js`, `core/presets.js`, `core/render.js`
- Modify: `web/inspector-frame.js`, `scripts/make-render-goldens.js`, tests
- Create: one golden at a non-default scale

- [ ] **Step 1: Add the field**

`shadowScale` alongside the other numeric config, validated and clamped. `SHADOW_SCALE_RANGE` in `presets.js` so the app does not hardcode the bounds.

- [ ] **Step 2: Thread it through `paintShadow`**

One parameter, defaulting to 1. Update every call site. Do not change an alpha literal.

- [ ] **Step 3: Prove the default did not move**

Run the suite. **All 10 goldens byte-identical.** If any moves, the multiplier leaked into the default path — a defect, never a reason to regenerate.

- [ ] **Step 4: A golden at a non-default scale, proven to guard**

Add one case at a clearly different scale. Then change the scale and confirm the diff fails; report the ratio. A golden that does not fail on a real change is decoration.

- [ ] **Step 5: The slider**

In the Finish section: 0–200%, default 100%, where 100% is `frame.html`'s original values. Label it so it reads as a strength, not a colour. It must hit the colour cache — shadow has nothing to do with the sampled ground, so a shadow drag must not trigger a `groundFor` recompute. Prove it with the throwing-canvas technique already used in Tasks 5 and 6.

- [ ] **Step 6: Commit**

```bash
git add core web test scripts
git commit -m "feat: shadow strength as a multiplier over the verified alphas"
```

---

### Task 7: Empty state, motion, and the verification pass

**Files:**
- Modify: `web/index.html`, `web/style.css`, `web/main.js`
- Create: `docs/verification-2026-09-01.md`

- [ ] **Step 1: The empty state is the app with no file open**

Not a marketing page — that was rejected twice during direction exploration. Full chrome present, presets still live and clickable, an empty frame on the canvas at the current ratio with its dimensions labelled, Properties greyed, Export disabled. This is how Figma and a photo editor look before you open a document.

- [ ] **Step 2: One authored moment**

A single orchestrated sequence when a file lands — the drop zone gives way, the ground blooms in, the shot settles. Not scattered hovers. Every animation needs a `prefers-reduced-motion: reduce` fallback that disables it, including any colour transition.

- [ ] **Step 3: Contrast at every hue**

The accent tint is generated, so it must be checked across the range, not at one value. Sweep hue 0–360 in steps of 10 and verify every text-on-surface and surface-on-surface pair clears 4.5:1. Fix by adjusting lightness in the token definitions, and keep the `:root` defaults in step with any change.

- [ ] **Step 4: No horizontal scroll, 320 to 1920**

Step through 320, 375, 480, 640, 768, 900, 1024, 1280, 1440, 1920. The four-pane layout must collapse gracefully; a horizontal scrollbar at any width is a failure.

- [ ] **Step 5: Focus, disabled, loading**

Tab the entire app with the mouse untouched. Every control shows a visible focus ring. Export is disabled without a shot and busy during a large render. Nav items the app does not implement are `aria-disabled` and skipped or announced as disabled.

- [ ] **Step 6: Record what actually happened**

Write `docs/verification-2026-09-01.md` with the real outcome of each check — what was run, what was found, what changed. **Do not write "passed" for a check that was not run.**

- [ ] **Step 7: Commit**

```bash
git add web docs/verification-2026-09-01.md
git commit -m "feat(web): app-chrome empty state, drop sequence, verification fixes"
```

---

### Task 8: Deploy, README, and retiring the original

**Files:**
- Create: `netlify.toml`
- Modify: `README.md`
- Delete: `frame.html`, `ground.py`, `shotkit.js`, `jobs.json`

- [ ] **Step 1: Confirm green before deleting anything**

`npx vitest run` — all tests pass. `npm run build` — clean. If either fails, **stop**: the originals are the only remaining reference for the port.

- [ ] **Step 2: `netlify.toml`**

Build `npm run build`, publish `dist`, `NODE_VERSION = "20"`. Security headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.

- [ ] **Step 3: Verify the production build**

`npm run build && npm run preview`. Drop a screenshot, export, and confirm the file is identical to one exported from `npm run dev`.

- [ ] **Step 4: Retire the original implementation**

```bash
git rm frame.html ground.py shotkit.js jobs.json
```

They have served their purpose: every constant in `core/` was verified against them, repeatedly, including after refactors. That verification lives in the task reports and the goldens now.

- [ ] **Step 5: Rewrite `README.md`**

Keep the three ideas — they are the reasoning behind the tool and still true. Replace the CLI usage with the app. Be accurate about what exists: browser-only, no upload, no account. Document the `core/` public API, since it is a real library boundary now. List what is genuinely not built rather than implying completeness.

- [ ] **Step 6: Commit and stop**

```bash
git add -A
git commit -m "feat: netlify config, rewrite README, retire the python/playwright implementation"
```

**Then stop.** Do not create a GitHub release, do not connect Netlify, do not push to `main`. Deployment is the user's call; report that the branch is ready and ask.

---

## Carried forward from `core/` — do not lose these

Three items reached the end of the library work unresolved. Two are handled above; the third is a `core/` follow-up that this plan deliberately does not do.

1. **The empty URL pill** — closed in Task 6, Step 3.
2. **Caption baseline drift.** `core/` draws the caption on the alphabetic baseline at `y = h − h×0.035`, but `frame.html`'s CSS `bottom` positions the *line-box bottom*. The caption therefore sits roughly half a descender lower than the original. Real, small, and unguarded — no golden compares caption position against `frame.html`. Fixing it properly needs browser font-metric measurement. **Not in this plan.** Note it in the README's "not built yet" section so it is not lost.
3. **No golden renders at any canvas size other than 3:2 1800×1200.** "Everything is proportional to the canvas" is asserted in layout unit tests but never pixel-verified at a second size — which is exactly where a stray fixed pixel would show. The highest-value coverage gap in the project. **A `core/` follow-up, not app work.** Task 3 of this plan exercises 2× and 3× renders manually, which is a weak proxy; if anything looks wrong there, this is the first suspect.

## Self-review

**Spec coverage** against Amendment 1:

| Amendment section | Task |
|---|---|
| Obsidian tokens, four-pane shell, control patterns | 1 |
| Pipeline, preview-is-export | 2 |
| Canvas surround, and never reaching the export | 2 |
| Export scale and format | 3 |
| Templates AND ratios | 4 |
| Background panel — sampled first, then overrides | 5 |
| Angle, mesh, seed | 5 |
| Device frames, chrome theme | 6 |
| App-chrome empty state | 7 |
| Accessibility verification | 7 |
| Netlify, README, retire the original | 8 |

**Deliberately not in this plan, stated rather than hidden:**

- **A full light theme for the app chrome.** Deferred, and **it is planned, not dropped** — see "Future work" below. The *surround* control ships now and solves the functional problem the light theme was originally asked for: judging a pale ground honestly.
- **Saved user presets, the CLI, the nav rail's Library / Integrations / Settings.** The rail renders them disabled; nothing is wired.
- **npm publish, the Claude Code skill, the Tauri desktop app.** Each its own cycle.
- **Zoom** is in the toolbar per the handoff but affects the *view* only — it must never reach `composeWithMeta`. If Task 1 cannot wire it safely as a pure CSS transform, leave it out rather than risk it touching the render.

**One risk worth naming.** The app has almost no automated tests by design — its logic is wiring, and `core/` holds the behaviour. The two things that genuinely need a test are the surround never reaching the export (Task 2) and the URL pill (Task 6), and both are specified. Everything else is verified by hand in Task 7. That is a deliberate trade, not an oversight: an app-level test suite that mocks `core/` would assert that the wiring calls the functions, which is exactly the class of test this project has already thrown away five times.


---

## Future work — planned, not dropped

**A light theme for the app chrome.** Decided 2026-09-01: this gets built, after Task 8, as its own cycle.

Two constraints from that decision:

- **It is our own light mode, designed from scratch.** The handoff's option 1b ("Fieldset") is *not* the source — it was a different design that happened to be lighter, not a light variant of Obsidian.
- The token system from Task 1 is the foundation: `web/tokens.css` is the only file containing raw colour, so a second theme is a second token set rather than a hunt through stylesheets. That boundary has held through four reviews — keep it holding.

Scope when it happens: every token gets a light value; the contrast sweep in Task 7 doubles, since a generated accent must clear 4.5:1 at every hue in **both** themes; and the canvas surround stays independent of the theme, because it answers a different question.

**Named device frames.** Task 5b renamed `iphone` to `phone` deliberately, to avoid promising specific device sizes. If device presets are ever wanted, they extend the `phone` frame rather than replacing it.

**Caption baseline.** `core/` draws the caption on the alphabetic baseline; `frame.html`'s CSS positioned the line-box bottom. The caption therefore sits roughly half a descender low. Decided 2026-09-01: **leave it, note it.** Fixing it properly needs browser font-metric measurement, and no golden guards it. Record it in the README's "not built yet" section.
