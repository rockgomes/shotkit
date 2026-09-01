# Verification records — 2026-09-01

Two records, in order: **Task 7** (empty state, motion, accessibility) first, and
**Task 8** (the production build, and retiring the original implementation) at
the end of this file. Both follow the same rule: every claim either names the
tool call that produced it, or says plainly that it could not be produced here.

## Task 7 — empty state, motion, and the verification pass

Date: 2026-09-01. Branch `feat/shotkit-web`, on top of `c380e4a`.

This records what was actually run and what was actually found — not a
checklist ticked from reading the code. Every claim below either names the
tool call that produced it or says plainly that it couldn't be produced in
this environment.

## 1. Automated tests

`npx vitest run` (full suite, not the changed files only):

```
Test Files  13 passed (13)
     Tests  254 passed (254)
```

Run twice, at the start of this task (before any change) and again after
every change described below — both runs green, unmodified. One test
(`export-scale-fidelity.test.js`) timed out once at 20s under system load in
the very first run of the session; re-run standalone it passed in ~18s, and
every subsequent full-suite run (three more, including the final one after
all changes) passed it inline with no timeout. That is a flake from machine
load during a large parallel run, not a regression — nothing in this task
touches `core/`, `test/`, or `scripts/`, and `git diff --stat` confirms only
`web/index.html`, `web/style.css`, `web/main.js` and `web/tokens.css`
changed.

## 2. The empty state

Implemented in `web/index.html` (`#dropzone`'s new `#dropzoneDims` label,
`inert` added by default to `#backgroundSection`/`#frameSection`/
`#finishSection`), `web/style.css` (`.dropzone` resized from a fixed
420px card to a box matching the canvas's own ratio, `.inspector-section[inert]`
greyed), and `web/main.js` (`updateEmptyFrame()`, the `propertySections`
inert toggle in `syncContentUI()`).

Verified live against the running app (`npm run dev`, Vite on :5188,
driven through the Browser pane):

- **Full chrome present, presets live.** With nothing loaded: toolbar,
  rail, sidebar (Templates/Ratios/Ground), canvas toolbar (Surround) and
  the inspector's Export section all render and respond to clicks.
  Confirmed by clicking a Ratio row (`16:9`) with no file loaded — the
  empty frame's own label and box both updated to `1920 × 1080` and
  re-proportioned, with no image loaded at all.
- **An empty frame at the current ratio, dimensions labelled.** Verified
  by reading `#dropzoneDims`'s text and `#dropzone`'s computed
  width/height at the default (`3:2`, `1800 × 1200`) and after switching
  ratio — text and box both track `normalise(state.config)`'s effective
  size, not a fixed placeholder.
- **Properties greyed.** Confirmed via `getComputedStyle`:
  `#backgroundSection`/`#frameSection`/`#finishSection` all report
  `opacity: 0.42` and `hasAttribute('inert') === true` with nothing
  loaded, and every control inside them is genuinely unfocusable while
  inert (see §5 — the "false" `:focus-visible` results for `.chip`,
  `.sampled-row`, `.slider`, the URL/caption inputs all trace back to
  this, not to a missing focus style). The Export section is deliberately
  excluded from this — its format/scale pickers stay live; only the two
  Export buttons themselves are `disabled` (already true before this
  task, confirmed unchanged).
- **Export disabled.** `#exportBtnToolbar.disabled === true` and
  `#exportBtnPanel.disabled === true` confirmed with nothing loaded, in
  both the static HTML and via `getComputedStyle` after JS ran.

## 3. The one authored moment

Implemented as three coordinated pieces, all in `web/style.css` +
`web/main.js`:

- **Drop zone gives way** — `.dropzone.is-leaving` (`dropzone-exit`
  keyframes, 220ms), added by `playArrival()` and removed once the
  dropzone is set `hidden` after that duration.
- **The ground blooms in** — `.canvas-surface`'s own
  `transition: background-color 420ms ease`, which fires for free the
  moment `.has-content`/`data-surround` flip; no JS timing needed for
  this piece.
- **The shot settles** — `.render-canvas.is-settling` (`shot-settle`
  keyframes, 420ms, 120ms delay: opacity 0→1, `scale(0.96) translateY(10px)`
  → identity, `box-shadow: none` → `var(--shadow-settle)`).

Verified live: dropped `samples/fieldset.png` (via a real `File` object
fetched from a copy served alongside the app and dispatched through the
actual hidden `<input type="file">`'s `change` event — the same code path
`main.js`'s `fileInput` listener and `state.js`'s `addFiles()` use for a
real drop) into a fresh empty-state load. Confirmed by reading DOM state
mid-flight and after settling:

- `renderCanvas.classList` gained `is-visible` immediately and
  `is-settling` (restarted via the reflow trick, not a no-op re-add).
- `dropzone.hidden` became `true` only after the 220ms exit window, not
  immediately.
- The finished frame (screenshot) shows a fully opaque, correctly
  positioned shot with no dropzone remnant — see the fieldset.png and
  karaoke-web.png screenshots taken during this session.
- A **second** drop while already loaded (replacing the shot) does not
  re-run the dropzone-exit beat (nothing to exit) but does restart
  `is-settling` on the new canvas content — confirmed by code path
  (`resettleCanvas()`), not separately screenshotted.

Reduced motion is covered in §6.

## 4. Contrast

**What the brief's framing assumes vs. what actually exists.** The task
brief says "the app chrome takes its accent from the shot's sampled
colour." Reading `web/tokens.css`, `web/style.css`, and every `web/*.js`
file that touches colour: **the app chrome does not do this.** All chrome
tokens (`--surface-*`, `--text-*`, `--border-*`) are fixed values in
`:root`, never touched by JS, never bound to the sampled hue. This is
consistent with `docs/superpowers/specs/2026-08-31-shotkit-web-design.md`'s
own **Amendment 1**, which superseded the original "app wears the shot's
colour" idea and replaced it with the Background panel's "Sampled" ground
swatches — small, `aria-hidden`, decorative chips (`.sampled-stop`,
`.preset-swatch`) that sit *beside* fixed-colour text, never *under* it. No
text is ever rendered on top of a hue-derived colour anywhere in `web/`
(confirmed by reading every element that sets `.style.background` from
`gradientFor()`/`groundFromMeta()` — both `.sampled-stops` and
`.preset-swatch` are `aria-hidden="true"` siblings of the text, never a
container of it). So the 4.5:1 text-contrast sweep the brief describes has
no real target in this codebase to sweep — that is the honest finding, not
an assumption to route around.

What **was** checked, precisely:

**(a) The fixed chrome tokens**, computed with the WCAG relative-luminance
formula (script run under Node, not eyeballed):

| pair | ratio | verdict |
|---|---|---|
| `--text-primary` on `--surface-window`/`--surface-raised-1`/`--surface-raised-2`/`--surface-control-active` | 12.75–16.25:1 | pass (4.5:1) |
| `--color-white` on `--surface-control-active` (active segmented label) | 15.36:1 | pass |
| `--text-secondary` on window / raised-1 / hover bg | 10.26–11.91:1 | pass |
| `--text-muted` on window | 7.53:1 | pass |
| `--text-faint` on window | 6.02:1 | pass |
| `--text-disabled` (`#7e8590`) on window / hover bg (`#1b1d22`) | 5.26:1 / 4.53:1 | pass — this is the value already lifted from `#565b64` in an earlier task; re-verified here, not re-fixed |
| `--text-fainter` (`#6b7078`) on window / hover bg | 3.93:1 / 3.38:1 | **below 4.5:1, by design** — sits on icons/section-labels/a placeholder, where the 3:1 non-text threshold applies; confirmed by grep that every use is icon colour, a `.section-label`, or `.dropzone-sub`/`.dropzone-dims`, never a value or a control's primary label |
| `--text-subtle` (`#4b4f58`) on window | 2.38:1 | **not currently reachable to fail anything** — `tokens.css` documents it as the breadcrumb `/` separator's colour, but `grep -rn "text-subtle" web/*.css` turns up no `var(--text-subtle)` consumer anywhere in `style.css` today; see the note below the table |
| `--color-danger` on `--surface-danger` (drop-error banner) | 7.90:1 | pass |

Note on `--text-subtle`: grepping `web/style.css` for `var(--text-subtle)`
turns up **zero current uses** — the token is defined and documented but
not consumed by any rule in the shipped CSS today. Left as-is (not
deleted): out of scope for this task, and removing a token is a `tokens.css`
change with its own blast radius this task wasn't asked to take on.

Fixes made as a result of this pass: **none.** Every fixed-token pair
already clears its applicable threshold (the `--text-disabled` lift was
already done in an earlier task and is called out in `tokens.css`'s own
comment, not new here).

**(b) The hue-dependent swatches**, swept exactly as instructed — hue 0 to
360 in steps of 10 — using the real `groundFor()` from `core/ground.js`
(imported, not reimplemented), at all three `tone` modes (`null`/auto,
`'mid'`, `'light'`), against both panel backgrounds the swatches actually
sit on (`--surface-window` and `--surface-raised-1`):

- Worst case across the full sweep (37 hues × 3 tones × 3 stops = 333
  samples): **7.59:1**, at hue 240°, tone `mid`, against
  `--surface-raised-1`.
- Best case: 16.25:1 range at the pale/light branch.
- **Nothing in the sweep drops below 3:1**, let alone 4.5:1 — the swatches
  clear even the stricter text threshold with room to spare, despite
  never needing to (they carry no text).

No token or lightness change was made as a result of the hue sweep — there
was nothing to fix.

**(c) Non-text / UI-component pairs** (1px hairlines, control borders,
selected-row fills) were also computed and several fall under 3:1 against
their neighbouring surface (e.g. `--border-hairline` on `--surface-window`,
1.16:1). These are pure decorative separators and redundant-cue state
indicators (a selected row also changes background fill, font-weight and
text colour — never border colour alone), not the sole means of conveying
information, so WCAG 1.4.11 does not apply to them the way it would to,
say, a focus ring or a required component boundary. Not treated as
failures; noted here so the number isn't silently omitted.

## 5. No horizontal scroll, 320–1920

Checked at every width the brief lists — 320, 375, 480, 640, 768, 899, 900,
1024, 1280, 1440, 1920 — via `document.documentElement.scrollWidth` vs.
`clientWidth` (a scrollbar-agnostic, exact check, not a visual guess), at
**both** the empty state (this task's new sizing logic, the actual risk
area) and with a shot loaded:

```
width   empty-state overflow   loaded overflow   dropzone width (empty)
320     false                  false             212px
375     false                  false             267px
480     false                  false             372px
640     false                  false             532px
768     false                  false             660px
899     false                  false             791px
900     false                  false             300px (4-pane layout begins)
1024    false                  false             424px
1280    false                  false             680px
1440    false                  false             840px
1920    false                  false             1290px
```

No overflow at any width, in either state. The empty-state frame's width
column shows the ratio-preserving resize logic working continuously across
the breakpoint, including the discontinuity at exactly 900px where the
sidebar/inspector switch from off-canvas drawers to permanent panes and the
stage's available width drops sharply (791px → 300px) — `updateEmptyFrame()`
re-clamps to the new available space correctly on both sides of that jump.

## 6. Focus, disabled, loading

**Caveat stated up front:** this session's Browser-pane tool reported the
pane "hidden" for every `computer` mouse-click action once the app was
loaded (screenshots and JS execution continued to work throughout), and
synthetic `Tab` key presses landed on `<body>` rather than entering the
page's own tab order. Real hardware Tab-key traversal was **not**
exercised in this environment. What follows is a DOM/CSS-level substitute:
each control was given real programmatic focus (`el.focus()`) and checked
with `el.matches(':focus-visible')` plus `getComputedStyle` — Chromium
applies the same `:focus-visible` heuristic to a programmatic focus as it
would to a keyboard-focus in the absence of a very recent mouse click, so
this exercises the same CSS rules a keyboard user would trigger, but it is
not proof that this specific sandboxed pane can be tabbed through by a
human. Stated plainly rather than claimed as full coverage.

Results, focusing one instance of every control class:

- `.rail-item`, `.template-row`, `.preset-row`, `.surround-cell`,
  `#dropzone`, `.segmented-cell`, `#exportFormatSelect`/`.select-control`,
  `.sidebar-search` (the wrapping label, via `:focus-within` — fixed
  during this task, see below), `.slider`, `.chip`, `.sampled-row`,
  the URL and Caption text inputs — **every one** shows
  `:focus-visible` matching `true` and a `2px solid` outline in
  `--text-primary` when reachable.
- Controls that reported `focus-visible: false` were checked individually
  and every single one was correctly unfocusable, not missing a style:
  `.zoom-btn`/`#exportBtnToolbar` (native `disabled` before a shot is
  loaded), `#panelToggleLeft`/`#panelToggleRight` (`display: none` outside
  the <900px breakpoint), `.chip`/`.sampled-row`/`.slider`/the URL input
  (all inside an `inert` Properties section with nothing loaded — see §2),
  and the URL input a second time before `frameKind` is `browser` (its row
  is `[hidden]`).
- **Fix made:** `.sidebar-search input` had `outline: none` with no
  replacement focus indicator anywhere but a barely-visible border-colour
  shift on `:focus-within`. Added `outline: 2px solid var(--text-primary)`
  to `.sidebar-search:focus-within` in `web/style.css` — confirmed live,
  now `2px solid` on focus.
- **Disabled state:** `#exportBtnToolbar`/`#exportBtnPanel` confirmed
  `disabled === true` with nothing loaded, `false` once a shot exists.
- **Loading state:** triggered a real 2x PNG export (`fieldset.png`
  loaded, default 3:2/1800×1200 → 3600×2400 output) and polled the button
  mid-flight: `aria-busy="true"`, label "Exporting…", `.is-loading`
  spinner class present; on completion `aria-busy="false"`, label restored
  to "Export PNG". The exported blob was decoded back
  (`createImageBitmap`) and measured at exactly 3600×2400 — the file is
  genuinely valid, not just "no error thrown."
- **Rail items:** `Library`/`Presets`/`Integrations`/`Settings` all carry
  `aria-disabled="true"`, remain focusable (`tabIndex === 0`, confirmed by
  `.focus()` actually landing), and their click handler calls
  `preventDefault()` (existing code, unchanged) — matches the "skipped or
  announced as disabled" requirement for a control that stays in the tab
  order per ARIA authoring practice rather than one that's removed from it.

## 7. Reduced motion

The OS-level `prefers-reduced-motion` setting could not be toggled in this
sandboxed browser (the `resize_window` tool only exposes `colorScheme`
emulation, not motion preference). Verified instead by monkey-patching
`window.matchMedia` to report `matches: true` for
`'(prefers-reduced-motion: reduce)'` only (every other query, including the
`900px` drawer breakpoint, passed through untouched) and then performing a
real file drop through the same `<input>` `change` path used elsewhere:

- `dropzone.hidden` became `true` **immediately** (no 220ms wait).
- `dropzone.is-leaving` was **never added**.
- `renderCanvas.is-settling` was **never added**.
- Canvas opacity was `1` and visible from the first check after the drop.

This confirms `main.js`'s own `isReducedMotion()` branch in `playArrival()`
— the code path that decides whether to animate at all. The **CSS**
`@media (prefers-reduced-motion: reduce)` block (which also zeroes the
`.canvas-surface` background-color transition, and would neutralise
`.is-leaving`/`.is-settling` even if one slipped through) was confirmed by
reading the stylesheet, not by triggering the real OS media feature — that
half of the "belt and suspenders" design is a code-review confirmation,
not a live one, and is reported as such rather than folded into the "live"
claims above.

## 8. The three carried items

**(a) The cross-breakpoint drawer reset.** Reproduced the exact failure
mode described in the brief, using this session's own tooling:

1. Fresh page load at 375px width → `#inspector` correctly `is-open: false`,
   `inert: true` (baseline correct).
2. Opened the inspector drawer via its toggle button (dispatched through
   the real click handler, `panelToggleRight.click()`) → `is-open: true`,
   `inert: false` (correct).
3. Widened the viewport to 1200px via `resize_window` — **this tool changes
   rendering dimensions but does not fire a `resize` or `matchMedia`
   `change` event** (confirmed by instrumenting both listeners before the
   resize: zero events logged). Checked `#inspector` afterward:
   `is-open: false`, **`inert: true`**, `transform: none`,
   `display: flex`, bounding rect fully on-screen at
   `x:934–1200, y:48–800`. **This is the bug, live-reproduced**: the pane
   is rendered, laid out, and fully on-screen in the desktop four-pane
   layout, while still carrying `inert` from before the resize — a
   keyboard/AT user would see the pane but it would be unreachable and
   invisible to assistive tech.
4. Manually dispatched `window.dispatchEvent(new Event('resize'))` →
   `#inspector.inert` immediately became `false`, `is-open` unchanged
   (`false`) — the pane became a normal, fully-interactive pane. **This
   confirms the reconciliation logic (`reconcileForViewport()`/
   `settleInertState()` in `main.js`) is correct** — exactly what the two
   prior reviews found — and that the gap is specifically in this
   environment's inability to fire a genuine resize signal, not in the
   app.

No code change was made for this — the brief frames it as a proven-correct
reconciliation blocked only by tooling, and this session's reproduction
confirms that framing rather than finding a new bug to fix. A real user
dragging a real OS window edge fires a native `resize` event no
browser omits; this sandboxed pane's programmatic viewport override is the
one thing that doesn't.

**(b) The frame panel's wiring** (`showsBrowserOnlyControls`,
`themeRow.hidden = !showsSecondary`). Verified by eye in the running app,
not just by the existing unit test:

- `frameKind: none` (default) — no Chrome theme row, no URL row. Screenshot
  taken.
- `frameKind: browser` — both rows appear (Chrome theme Dark/Light segmented,
  URL text input with `app.acme.dev` placeholder). Screenshot taken; the
  canvas itself also grew a macOS-style traffic-light browser frame around
  the shot, confirming the connection is live end-to-end, not just a CSS
  toggle with nothing behind it.
- `frameKind: phone` — both rows disappear again, canvas shows the phone
  device frame instead. Screenshot taken.

The `!` is present and correct in the running app; had it been dropped
(`themeRow.hidden = showsSecondary`), Browser would have hidden the rows
and Phone/None would have shown them — the opposite of what was observed.

**(c) A real end-to-end look.** Loaded `karaoke-web.png` (the dark sample)
through the real file-input path, then in one session: switched Surround
to Light, set a Caption ("Reporting dashboard" — test-only text, never
committed to any file), switched Frame to Browser, confirmed the Sampled
hue (255°, a violet) and the correctly-chosen mid-tone ground (per the
"dark screenshot never gets a dark ground" rule — visibly separated in the
screenshot), ran a real 2x PNG export, and decoded the resulting blob back
into an `ImageBitmap` to confirm it is a valid 3600×2400 PNG. Both
`fieldset.png` (light) and `karaoke-web.png` (dark) decoded and rendered
correctly on the first real attempt in this session — the earlier report
that these files "would not decode in the sandboxed browser" did not
reproduce here, consistent with what a reviewer already found.

## Changes made as a result of this pass

- `web/index.html`: `#dropzoneDims` label added; `inert` added by default
  to `#backgroundSection`/`#frameSection`/`#finishSection`.
- `web/style.css`: `.dropzone` resized to a JS-driven ratio-matching box
  with a corner dimension label; `.inspector-section[inert]` greying rule;
  the arrival-sequence keyframes and classes
  (`dropzone-exit`/`.is-leaving`, `shot-settle`/`.is-settling`); the
  `.canvas-surface` background-color transition; the corresponding
  `prefers-reduced-motion: reduce` neutralisation block; `.sidebar-search`
  focus-visible outline fix.
- `web/main.js`: `updateEmptyFrame()`, `playArrival()`/`resettleCanvas()`/
  `restartAnimation()`/`isReducedMotion()`, the `propertySections` inert
  toggle, and the `#sidebar` click/keydown listeners that keep the empty
  frame in sync with Templates/Ratios/Custom-size without touching
  `web/sidebar.js`.
- `web/tokens.css`: one new compound token, `--shadow-settle`, for the
  arrival animation's cast shadow — following the file's own existing
  convention that compound shadow values live here, not as a literal in
  `style.css` (see `--shadow-thumb`/`--shadow-drawer` already there).
- No changes to `core/`, `test/`, or `scripts/`. All 254 tests pass,
  unmodified, confirmed by three full `vitest run` passes across this
  session.

## What was NOT verified, stated plainly

- Real hardware keyboard Tab-key traversal in an actual browser window —
  substituted with programmatic `:focus-visible` checks (§6).
- The actual OS-level `prefers-reduced-motion` media feature engaging the
  CSS `@media` block — substituted with a `matchMedia` monkey-patch that
  proves the JS branch, plus a static read of the CSS (§7).
- A genuine OS-level window drag/resize crossing the 900px breakpoint —
  this session's tooling changes the viewport without firing the event a
  real resize fires; the reconciliation logic was proven correct via a
  manually-dispatched `resize` event instead (§8a).
- Whatever `--text-subtle`'s zero-current-consumer status implies for a
  future cleanup — flagged, not acted on (§4).

---

## Task 8 — the production build, and retiring the original

Date: 2026-09-01. Branch `feat/shotkit-web`, on top of `f9710d3`.

Task 8 added `netlify.toml`, rewrote `README.md`, and deleted `frame.html`,
`ground.py`, `shotkit.js` and `jobs.json`. The deletion is irreversible in
practice — those four files were the reference every constant in `core/` was
verified against — so the order below matters: everything was proved green
first, and nothing was deleted until it was.

### 1. Green before deleting anything

`npx vitest run`, before any change in this task:

```
Test Files  13 passed (13)
     Tests  254 passed (254)
```

`npm run build`, before and again after the deletions:

```
✓ 17 modules transformed.
../dist/index.html                 14.76 kB │ gzip:  3.93 kB
../dist/assets/index-BMGLWttt.css  18.24 kB │ gzip:  4.06 kB
../dist/assets/index-qD2RSkrO.js   44.10 kB │ gzip: 14.83 kB
```

Identical asset content hashes across both builds — removing the four files
changed nothing about what the app compiles to, which is the point: they were
already dead weight, not inputs.

### 2. Export fidelity, dev vs. the production build

The real question behind Step 3 is whether the bundled, minified build can
produce different pixels from the dev server's unbundled ES modules. It cannot,
and this is the evidence.

Both servers were driven in a real browser (the Browser pane), with the same
sequence on each: fetch `fieldset.png` from the origin, wrap it in a real `File`,
set it on the actual `#fileInput` and dispatch `change` — the same code path
`main.js`'s listener and `state.js`'s `addFiles()` take for a genuine drop — then
wait for Export to enable and click the real `#exportBtnPanel`.

| | `npm run dev` (:5188) | `npm run preview` (:4188) |
|---|---|---|
| download filename | `fieldset--web@2x.png` | `fieldset--web@2x.png` |
| blob type | `image/png` | `image/png` |
| bytes | 3,883,562 | 3,883,562 |
| decoded | 3600×2400 | 3600×2400 |
| SHA-256 | `8935b599…c6050a8` | `8935b599…c6050a8` |

Full digest, identical on both:
`8935b5993ecc8297a3bbb22fc92ede1ddcb2e6665c3e36bf28964cdafc6050a8`

The production build was also screenshotted (renders correctly, ground sampled
at 228°) and `read_console_messages` reported no errors on it.

**Substitution, stated at the point of the claim.** The bytes were hashed
in-page, not read back off disk. `URL.createObjectURL` was wrapped to capture
the exact `Blob` that `downloadBlob()` hands it, and the `<a download>` click was
suppressed so nothing was written to the filesystem; the captured blob was then
hashed with `crypto.subtle` and decoded with `createImageBitmap`. These are the
bytes the download *would* have written, and the anchor's own `download` and the
blob's `type` were read off the intercepted element to confirm the filename and
MIME the user would have received. What this does **not** prove is the browser's
file-writing step itself — no PNG was compared on disk.

**Second substitution.** The sandboxed browser cannot read `samples/` directly,
so `samples/fieldset.png` was temporarily copied to `web/` and `dist/` to be
served from each origin. Both copies were deleted before staging, and
`git status` was checked clean afterwards.

### 3. Retiring the originals

`git rm frame.html ground.py shotkit.js jobs.json`, after a repo-wide grep
(excluding `node_modules`) for all four names. Nearly every remaining hit is
provenance prose in `core/`, `test/` and `docs/` — comments recording where a
constant came from ("frame.html's alphas, unchanged", "Port of ground.py"). Those
are the audit trail for the port and stay. Two hits are not prose, and both are
in `scripts/`, which this task was not permitted to modify:

- **`scripts/make-goldens.sh` is destructive, not merely broken.** It regenerated
  `test/golden/ground.json` from `ground.py` via a heredoc redirected into that
  file. The shell truncates the redirect target *before* running the command, so
  the committed golden is emptied first and only then does Python fail on the
  missing module; `set -euo pipefail` aborts before the `rm -rf .venv-goldens`
  cleanup line, stranding the virtualenv too. Result: an empty golden and all 32
  `test/ground.test.js` cases failing.

  **Reproduced on a copy, not on the real file.** The script itself was never
  run. A structurally identical script (same `set -euo pipefail`, same heredoc
  redirect, same failing import) was run in a scratch directory against a dummy
  golden: 23 bytes before, 0 bytes after, exit 1, cleanup skipped, fake venv left
  behind. `test/golden/ground.json` was confirmed still 1027 bytes and
  `git status` clean afterwards. Recovery is `git checkout
  test/golden/ground.json` plus `rm -rf .venv-goldens`, and both are now in the
  README.
- **`scripts/make-render-goldens.js` line 16** instructs the reader to re-render
  `frame.html` to check browser fidelity. That is an actionable instruction that
  can no longer be followed. Noted in the README; the script is unedited.

### 4. What was NOT verified, stated plainly

- **The download written to disk.** Intercepted in-page instead (§2). The bytes,
  filename and MIME are the real ones; the filesystem write is not exercised.
- **`netlify.toml` against a real Netlify build.** The file is config only — no
  site is connected, no deploy was run, and the build command and publish
  directory were verified only by running `npm run build` locally and confirming
  it writes `dist/`. `publish = "dist"` is repo-root-relative while
  `vite.config.js` sets `root: 'web'` and `outDir: '../dist'`; these agree, but
  that agreement was checked by reading the config and listing `dist/`, not by
  observing Netlify resolve it.
- **The security headers actually being served.** `X-Content-Type-Options` and
  `Referrer-Policy` are declared in `netlify.toml`; `vite preview` does not apply
  Netlify's header rules, so no response was ever inspected carrying them.
- **Any browser other than the Browser pane's Chromium.** Export encoding
  (`canvas.toBlob`) and decode (`createImageBitmap`) were exercised in one engine
  only. The byte-identity result above is a dev-vs-production comparison within
  that engine, not a cross-browser claim.
