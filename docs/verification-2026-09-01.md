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
- **`NODE_VERSION = "20"` against vite 7's `engines` range.** Vite 7 requires
  `^20.19.0 || >=22.12.0`. Netlify resolves the bare `"20"` to the latest 20.x,
  which satisfies it — but that resolution was never observed, and it has its own
  failure mode (`npm ERR! engine`) distinct from the publish-path assumption above.
- **Any export format or scale other than PNG at 2x.** The dev-vs-production
  comparison used one image, one layout, one format and one scale. The other
  formats and scales were covered in Task 3 and are unchanged here; this notes the
  limit of *this* comparison, not a gap in the export path.

---

## Deployment — 2026-09-01

Deployed by the user's explicit instruction, after the Task 8 review returned
APPROVED. Netlify project `shotkit-app`
(`5271b0a5-a157-497b-8de4-2e4b02a4da0f`), deploy `6a97374c4abd41cc427cadca`,
live at **https://shotkit-app.netlify.app**.

The bare name `shotkit` was already taken on Netlify by someone else, so the
project is `shotkit-app`.

This is a **direct upload build**, not a git-connected site: the repo was
uploaded and built in Netlify's build system from `netlify.toml`. No GitHub
repository is connected, so pushing to `main` does not currently redeploy.

### Two Task 8 gaps now closed

Both were listed under "What was NOT verified" above; the deploy exercised them
for real, so they are struck here rather than in place.

**1. `netlify.toml` against a real Netlify build.** Previously the
`publish = "dist"` / `outDir: '../dist'` agreement had been checked by reading
the config and listing `dist/` locally. Netlify's own build system has now
resolved it: the build succeeded and the site serves the app at `/`. The
`NODE_VERSION = "20"` resolution against vite 7's `engines` range is likewise
now observed rather than reasoned about — the build did not fail on `npm ERR!
engine`.

**2. The security headers being served.** Observed on a real response from the
production origin:

```
$ curl -sSI https://shotkit-app.netlify.app
HTTP/2 200
referrer-policy: strict-origin-when-cross-origin
x-content-type-options: nosniff
strict-transport-security: max-age=31536000; includeSubDomains; preload
```

Both declared headers are present. HSTS is Netlify's own default, not ours.

### Production smoke test

Driven against the live origin, not a local server:

- Empty state renders as app chrome — toolbar, rail, sidebar, inspector, empty
  ratio frame labelled `1800 x 1200`. Zero console errors.
- A synthetic 1440x900 PNG was set on the real `#fileInput` and dispatched
  `change` (the same path a drop takes). Export enabled, the real Export button
  clicked, and the download blob captured: `synthetic--web@2x.png`,
  `image/png`, 9,499,433 bytes, decoded **3600x2400** — the correct 2x of the
  3:2 1800x1200 canvas.
- The preview canvas was confirmed painted by sampling its backing store
  (1800x1200, pixel range [14,18,31]–[255,255,255]), not by eye. Worth
  recording *why*: the first screenshot after load showed an empty canvas, and
  the backing-store sample is what established that this was the arrival
  animation mid-flight rather than a render failure. A later screenshot showed
  the composed shot correctly.

### Still not verified

- **The download written to disk.** Same substitution as §2 — the blob was
  intercepted in-page. Unchanged by deploying.
- **Any browser other than Chromium.** The production smoke test used one
  engine, as every check before it did.
- **The two real-hardware items from Task 7** — an OS-level Reduce Motion
  toggle, and a real window drag across the 900px breakpoint. Still worth
  thirty seconds on the live site.

---

# Task 4b — grain scope, and the white edge nobody could reproduce

Date: 2026-09-02. Branch `feat/cycle-a`, on top of `e75e6b9`.

Two defects, reported together and unrelated in cause. One is testable in
Node and is tested. The other is a **Chromium-only rasterisation bug** that
`@napi-rs/canvas` does not reproduce, so this record — not a green test — is
the evidence for it.

## 1. Grain was painted over everything (testable, tested)

`composeWithMeta`'s paint order was ground → shot → **grain last**, and
`paintGrain` is an unclipped `soft-light` `fillRect` across the whole canvas.
So the noise landed on the screenshot and the phones, not only on the ground.

Measured, `@napi-rs/canvas`, flat `#808080` source, `grain: 1`, sampling the
screenshot's interior 8px inside each edge:

```
before:  105 distinct colours, per-channel spread 104/104/104
after:     1 distinct colour,  per-channel spread   0/  0/  0
```

`test/render-grain-scope.test.js` asserts exactly that, for the web screen
and for a phone, plus a third case proving the ground is still grained (so
the fix cannot be satisfied by turning grain off). Confirmed red against the
unfixed code before the fix landed: two of its three cases failed with the
"105 colours" reading above.

**Fix:** `paintGrain` moved to immediately after `paintGround`, rather than
clipped around the shots. The reasoning is in `core/index.js` at the call
site: an even-odd clip around every shot box would modulate the grain along
its own antialiased boundary, producing a 1px ring at the shot's edge — the
exact artefact Task 1 spent two rounds removing.

## 2. The white edge on dark screenshots (browser only, NOT testable here)

Reported as *"I just tried using a dark image there, and they have a white
stroke"* and *"even the roundness of the corner is off"*.

Reproduced in Chrome through the app's own drop handler (dev server on
:5188, a real `DragEvent` with a `DataTransfer`, measured only after the
canvas's pixels had actually changed), flat `#1e1e1e` 1512x982 source,
default settings, 1800x1200 canvas:

```
13,864 pixels at exactly 255,255,255, alpha 255
right edge   x 1728-1731   (the shot's box ends at x = 1727.75)
bottom edge  y 1138-1143   (the shot's box ends at y = 1137.60)
```

### It is not grain

Bisecting `composeWithMeta` stage by stage in the browser: after
`paintGround` 0 white pixels, after `paintWeb` 13,864, after `paintGrain`
still 13,864. Grain was a red herring.

### The mechanism

`paintWeb` clipped to a rounded rect and then filled the body with
`ctx.fillRect` covering that whole clip. In Chromium, **a `fillRect` that
covers its clip region is rasterised against the clip mask's rounded-out
device bounds instead of its own rectangle**, and for an antialiased
non-rectangular clip those bounds overshoot the path.

Measured directly, canvas 1800x1200, box `{x:100, y:100, w:1600, h:1000}` —
so the true right edge is 1700 and the true bottom is 1100. Last painted
pixel:

```
radius 0      clip + fillRect     right 1699  bottom 1099   exact
radius 2      clip + fillRect     right 1703  bottom 1103   +4 / +4
radius 4      clip + fillRect     right 1703  bottom 1103   +4 / +4
radius 8      clip + fillRect     right 1703  bottom 1103   +4 / +4
radius 12     clip + fillRect     right 1703  bottom 1103   +4 / +4
radius 16     clip + fillRect     right 1703  bottom 1103   +4 / +4
radius 24     clip + fillRect     right 1703  bottom 1103   +4 / +4
radius 32     clip + fillRect     right 1703  bottom 1103   +4 / +4
radius 48     clip + fillRect     right 1703  bottom 1103   +4 / +4
radius 64     clip + fillRect     right 1703  bottom 1103   +4 / +4
radius 96     clip + fillRect     right 1703  bottom 1103   +4 / +4

radius 24     clip + fill(path)   right 1699  bottom 1099   exact
radius 24     clip + drawImage    right 1699  bottom 1099   exact
radius 24     plain rect clip     right 1699  bottom 1099   exact
radius 24     no clip, fillRect   right 1699  bottom 1099   exact
```

The overshoot is a constant +4 on the right and bottom, independent of the
radius, absent on the left and top, and absent at radius 0 (where the path
degenerates to a rectangle). Only a fill that COVERS the clip triggers it: a
small rect inside the clip is exact (`fillRect(200,200,400,60)` inside the
same clip → 200,200..599,259, correct to the pixel), and so is a bar
spanning the full clip width at the top (100,100..1699,159, correct).

Intersecting an exact `rect()` clip with the rounded clip does **not** help —
measured, still 13,868 near-white pixels — because the combined clip is
still non-rectangular. The fix is not "clip differently", it is "fill the
path you already have instead of a rectangle over it".

### Why it reads as a white stroke and a wrong corner

The overshooting fill is the screen's own body colour, `#ffffff`. On a pale
screenshot it is invisible. On a dark one it is a 4px white band down the
right edge and a 6px band along the bottom, and at the bottom-right corner
the leaked rounded rect's curve does not coincide with the shot's, so the
corner reads as the wrong radius. Both of Rock's sentences describe the same
bug. Before/after at 10x: `docs/2026-09-02-task-4b-clip-leak.png`.

### Why there is no pixel test for it

`@napi-rs/canvas` clips exactly, so the same scene renders clean in Node
both before and after the fix. A pixel assertion would pass in both
directions — vacuous, which this cycle has already shipped five times. The
guard is structural instead: `test/render-clip-safety.test.js` scans
`core/render.js` for any `fillRect` inside a `ctx.clip()` block and for the
five painters that must route their body fill through `fillRoundRect`.
Confirmed red against the pre-fix file: 7 of its 9 cases fail, naming all
five leaking `fillRect` sites.

Its known limit is stated in the file: the scan is lexical, so a covering
`fillRect` reached only at runtime across a call boundary would slip past
it. The one such call that exists today — `paintChrome`'s title bar, inside
`paintWebChrome`'s clip — was measured and is safe, because it does not
cover the clip.

### Confirmed fixed, in the browser, through the app

Same flat `#1e1e1e` drop, after the fix:

```
pixels at 255,255,255 : 0
pixels >= 245 on every channel : 0
right edge profile  : 30, 30, 30, 81, 168, 170, ...   (one AA pixel)
bottom edge profile : 30, 30, 30, 99, 156, 156, ...   (one AA pixel)
screenshot interior : 1 distinct colour
```

### A second thing the fix corrected, in Node as well

Filling the path instead of a covering rect also changed the single boundary
pixel at every shot edge, and changed it towards the truth. Phone frame,
`box.x = 62.4` (so 60% body coverage on pixel 62), body `17,19,24` on ground
`231,233,240`:

```
ideal blend   ~103
before         160,162,168
after          113,114,119
```

The old rendering carried a light 1px halo on every edge, in Node and in the
browser. It is now within 10 levels of the correct coverage blend. This
accounts for ~5,100 of the changed pixels in each regenerated golden.

## 3. Goldens

All ten regenerated. The change was attributed before regenerating, by
composing the same cases against the pre-fix core and the post-fix core:

```                     clip fix alone (grain 0)      total change
web             5,187 px, max delta  8     434,037 px, max delta 19
phone           5,083 px, max delta 51     540,170 px, max delta 61
mobile          5,898 px, max delta 48     860,713 px, max delta 55
browser-dark    5,091 px, max delta 48     572,907 px, max delta 53
```

The clip fix touches ~5,100 pixels per case — the shot's perimeter, which is
~5,460 pixels for the 3:2 web box. Everything else is the grain move: large
inside the shot (max delta 19 on a light screenshot, 61 on the dark phone
body — soft-light lightens dark pixels hardest, which is why the complaint
came from a dark screenshot), and at most 3-4 levels outside it, where the
only change is that the shadow is now painted over grain rather than under
it.

One assertion moved with them: `test/compose.test.js`'s "the browser-url
golden actually discriminates" measured 0.00201 and now measures 0.000816,
still ~80x its pass threshold. The drop is `pixelmatch`'s `includeAA: false`
finally working — grain over the URL text used to defeat its antialias
heuristic, so glyph edges counted as differences. With clean text they are
correctly skipped and only glyph bodies count, which is the stricter
measurement. The threshold and the recorded number were updated together,
with that reasoning in the test.

## What was NOT established

- **The exact Skia code path.** The behaviour is characterised (constant +4,
  right and bottom, only when the fill covers a non-rectangular clip) but
  not traced to a Chromium source line, and no upstream bug was filed or
  looked for.
- **Whether it is size-dependent.** A small case — 200x150 canvas, box
  100.3x80.7, radius 12 — showed no overshoot. Every case at shot-sized
  geometry did. The threshold between them was not located, so nobody should
  treat a small repro's cleanliness as disproof.
- **Other browsers.** Measured in Chrome only. Not checked in Safari or
  Firefox. The fix does not depend on which is affected.

## 4. The CI timeout this task hit on the way through

The first push of Task 4b went red on CI — `export-scale-fidelity.test.js`
timed out at 20s — and it was worth ruling out as a regression before
treating it as a budget problem.

It is not a regression. The same test was timed on `HEAD~1` (the pre-Task-4b
commit, in a worktree, same machine, same `node_modules`) and on the fix:

```
                        first case      second case
HEAD~1 (before)         5.4s / 5.6s     3.6s / 3.9s
Task 4b (after)         5.3s / 6.5s     3.1s / 5.2s
under full-suite load   9.5s            4.5s
```

Identical within noise. The test composes the same shot at 1x, 2x and 3x, and
3x of 2000x1500 is 27 megapixels through `@napi-rs/canvas`; at 9.5s under
load it had 2.1x headroom against the suite-wide 20s, and CI's shared
`macos-15-intel` runner is slower than this machine. It was always marginal —
the Task 7 record above already notes it timing out once, in the previous
cycle, for the same reason.

Fixed by scoping a measured 90s timeout to that one file rather than raising
the suite-wide budget, so the other 320 tests keep a tight one — for them a
20s hang IS the bug signal. The `describe(name, { timeout }, fn)` form was
verified to actually apply, not be silently ignored, with a throwaway test
that sleeps 24s and passes under it.

---

# Task 4d — the clip itself, measured in Chrome

Task 4c stopped a one-pixel halo by snapping the screenshot's destination
rect outward onto the pixel grid, inside the `ctx.clip()` every painter had
always used. The edge numbers came right. Rock opened the preview and
reported two new things the same day:

> "1px is cut from the top and left of the screenshot" — as soon as the
> corner radius is above zero. At radius 0 the image is intact.

> "a visible spike where the straight edge meets the corner arc" — visible
> without zooming.

Both are the clip, and both are invisible to this suite: `@napi-rs/canvas`
does not reproduce either. This section is the browser measurement that
stands in for the pixel test, exactly as Task 4b's does above.

## The measurement

A standalone page, canvas 1800x1200, box `{x:62.4, y:76.5, w:1675.2,
h:1047, radius:24}` — the app's own `frame: none` geometry at the default
padding — rendering the same scene four ways and reading the result back
with `getImageData`. Two flat sources (`#141414` and `#c8c8c8`) isolate the
screenshot's own contribution from everything painted over it:

```
out(S) = a * S + b   =>   a = (out(light) - out(dark)) / (light - dark)
```

`a` is how much of the screenshot reached each pixel. The path's own
coverage comes from filling the same rounded rect white on black.

### Edge coverage — the shot against the path it is supposed to follow

```
                                   left     right     top      bottom
path coverage                      0.600    0.596     0.502    0.502
A  clip + snapped drawImage        0.600    1.000     0.500    1.000
C  tile + edge clamp + one mask    0.600    0.594     0.500    0.500
D  tile, no clamp                  0.361    0.361     0.000    0.250
```

**A overshoots its own clip by a whole pixel on the right and bottom.** That
is the same Chromium behaviour Task 4b measured for a covering `fillRect` —
a non-rectangular clip is rasterised against rounded-out device bounds, not
against its path — reaching `drawImage` for the first time because Task 4c's
snap pushed the drawn rect out far enough to touch those bounds. Before 4c
the picture faded out inside the clip and never met it.

The report about the top and left is a plainer thing, and NOT
Chromium-specific: the snapped rect starts at `floor(box.x)`, the clip cuts
at `box.x`, and what falls between them is picture. It is ordinary clipping
of an overhang the snap created. Measured as marker survival — a source
whose first row and column are a distinct colour, rendered twice and
subtracted, summed across the boundary:

```
                                   top row survived   left column survived
one source row/column is           1.163 px           1.163 px
A  clip + snapped drawImage        0.714 px (61%)     0.812 px (70%)
C  tile + edge clamp               1.141 px (98%)     1.141 px (98%)
```

This half IS reproducible in Node — `@napi-rs/canvas` reads 0.714 and 0.812
for A too, to three decimal places — which is why it is a real test rather
than a note in this file: `test/render-edge-blend.test.js`'s "the screenshot
keeps every pixel it was given", six assertions at three radii, all six red
against the pre-fix core.

**D is why the clamp is not optional.** A tile whose picture is drawn at the
true rect and then masked has two antialiased edges again — its own and the
mask's — and they multiply: 0.6 x 0.6 = 0.36. That is Task 4c's halo back in
full. The clamp draws the source's outermost row and column one pixel past
the shot under `destination-over`, so the picture has no partial coverage of
its own along the line the mask cuts.

### The corner join — where the straight edge meets the arc

Walking the bottom-right corner column by column and reading the boundary's
sub-pixel position out of each column's coverage, normalised by the straight
run (this is the metric `test/render-edge-blend.test.js` uses, tolerance
0.35px):

```
                                   worst column     worst step
A  clip + snapped drawImage        2.939 px         1.234 px
C  tile + edge clamp + one mask    0.009 px         0.012 px
@napi-rs/canvas, either            0.031 px         0.021 px
```

Walking it row by row instead makes the shape of it plainer — A tracks the
arc to within 0.03px for eleven rows and then leaves it:

```
row    1119    1120    1121    1122     1123
A      0.000  -0.004  +0.028  +0.451  +14.008
C      0.000  +0.002  +0.006  -0.005   -0.031
```

Fourteen pixels of shot sticking out along the bottom edge where the arc has
already turned away from it. That is the spike, and it is one pixel of
overshoot on a straight edge meeting a curve that has none.

### Colour at the boundary — why the clamp and not a scaled copy

Redrawing the whole picture one pixel larger behind itself fixes the
coverage identically, and shifts the boundary colour, because it resamples
the picture off its own grid. On a source whose first row is a distinct
colour:

```
the row itself                     218,90,218
C  edge clamp                      218,90,218
B  scaled second copy              172,136,172
```

## What was NOT established

- **Which Chromium version, and whether it is GPU-dependent.** Measured in
  the Chrome this machine runs, once. Not checked across versions, not
  checked with GPU rasterisation forced off, not checked in Safari or
  Firefox. The fix does not depend on which engines are affected — it
  removes the clip rather than working around it.
- **Whether the +1 on right/bottom and the +4 of Task 4b are the same
  constant.** They are the same asymmetry (right and bottom, radius > 0) and
  are treated as one behaviour here, but the magnitudes differ and nothing
  was done to reconcile them.
- **The `destination-in` culling bug this fix walked into** is a
  `@napi-rs/canvas` defect, not Chromium's, and is recorded where it can do
  some good: in `placeShot`'s doc comment in `core/render.js`. A
  `destination-in` fill whose path lies outside the untransformed canvas
  bounds is culled, and a culled `destination-in` clears the whole surface —
  so the first version of this task, which put a `translate` on the tile,
  rendered phones with no screenshot at all whenever the phone sat past
  x = 512. The goldens caught it. It is not reproduced in Chromium.

---

# Cycle A Task 7 — strokes

Measured in Chrome on this machine, against the dev server, by rendering
`core/` directly (no UI) onto a 1800x1200 canvas with a fully black
1440x900 source and the lavender ground — the same probe Rock's own bug
reports were reproduced with.

## The phone body's inner highlight: LEFT AS IT WAS

`paintDeviceHairline` (`core/render.js`) strokes `rgba(255,255,255,0.10)`
just inside every phone body, and it still does so unconditionally.

That is deliberate. It is the DEVICE's own highlight — the same thing the
browser frame's `t.border` is — not an edge treatment on anyone's
screenshot. The complaint that opened round two was a hairline on a *bare*
screenshot, which Task 1 removed; a phone that is drawn as a phone reads
wrong without its highlight, exactly as the browser frame would without its
border. A `mobile` stroke, when Cycle B gives the phone element one, paints
OUTSIDE it, so the two never compete.

No code changed for this. It is written down because the task required a
position rather than a silence.

## What the mat does, measured

`stroke: { style: 'light', width: 0.02 }`, so 24px on a 1200-high canvas:

| probe | no stroke | light mat |
|---|---|---|
| 3px inside the composite's left edge | `0,0,0` (shot) | `255,255,255` |
| 2px inside `inner`'s left edge | — | `0,0,0` (shot) |
| 3px outside the composite, right | `207,200,223` | `207,202,224` |
| 3px outside the composite, bottom | `187,179,206` | `189,180,207` |

The mat reads pure white on all four sides; the picture starts, still pure
black, immediately inside `inner`; and outside the composite is ground. No
band of body colour on the right or bottom — Task 4b's `fillRoundRect` rule
holds through a path fill too. `glass` measured `248,246,254` over the pale
ground (translucent, as intended) and `custom` measured exactly `255,0,170`
for `#ff00aa`.

## One defect found, and it was only visible in Chromium

The first version handed `paintChrome` the OUTER box. With a mat on, the
title bar was then drawn one stroke-width too high and ended one
stroke-width short of the screenshot, leaving a band of bare white mat
between the bar and the picture — **16 rows** of `255,255,255` at a 1.5%
stroke, found by scanning the composite's centre column top to bottom.

Nothing in the suite could have caught it as it stood. The unstroked frame
is unaffected (the outer box and the frame body are the same rect then), and
the `stroke-browser` golden had been generated from the broken render, so it
agreed with itself. `test/render-stroke.test.js`'s "leaves no gap between
the browser bar and the screenshot" is the guard, confirmed red against the
pre-fix line and green after; the golden was regenerated.

The neighbouring test in that file — "wraps the browser window without
moving the bar off the screenshot" — passes in BOTH states. It guards other
claims (the screenshot sits under the bar; the mat sits above it) and is
not, on its own, a guard against the gap.

## Goldens

Three added — `stroke-light`, `stroke-glass`, `stroke-browser`. All ten
pre-existing goldens stayed byte-identical across the regeneration
(`git status` reported only the three new files), which is the proof that
`STROKE_DEFAULTS.style: 'none'` really is a no-op. Two discriminator tests
in `test/compose.test.js` prove `stroke-light.png` guards the stroke rather
than merely matching itself: the same config at style `none` differs by
more than 2% of pixels, and `glass` against the `light` golden likewise.

---

# Cycle A Task 8 — the browser chrome, remeasured

Every number came from the Figma community file *Apple iOS Browser Mockup —
Safari & Chrome*, file key `ashXeowHsiwznytlLbuvuS`, page "Browser Mockup",
read as **layer geometry** through the Figma MCP — not pixel-counted off a
raster. Symbols: `Desktop / Safari / Light` (node `1:3179`, 1280 wide) and
`Desktop / Safari / Dark` (node `1:3209`, 1268 wide).

## The two numbers the plan left open

**1. The window corner radius: 24px on a 1280 frame → `24/1280 = 0.01875`.**

Source: the `Desktop / Safari / Light` symbol itself carries
`border-radius: 24px` with `overflow: clip`. Confirmed on the Dark symbol,
which carries the same 24. The old value (`25/1064 = 0.0235`) would have
been 30px at that width.

Two near-misses worth recording, because either would have been wrong:
`Body` (`1:3180`) has **no** radius at all — it is a plain rect behind the
clip — and the `toolbar` child carries its own `rounded-tl-10 rounded-tr-10`,
which the parent's 24px clip overrides. Neither is the visible corner.

**2. The theme colours — three agree, three did not.**

| value | handoff (was) | Safari reference | verdict |
|---|---|---|---|
| dark bar | `#1b1d22` | `#191c1f` | agree, 2 levels |
| dark body | `#101114` | `#0c0f12` | agree, 4 levels |
| light bar | `#f6f7f9` | `#ffffff` | **changed** |
| light pill | `#ffffff` | `#f0f0f0` | **changed** |
| dark pill | `rgba(255,255,255,.07)` | `#434343` | **changed** |

The pills did not merely differ in value, they differed in **sign**: our
light pill was *lighter* than its bar, where a browser's address field is
recessed. The light bar goes to white and the light pill to `#f0f0f0`,
restoring the relationship. The dark pill goes to `rgba(255,255,255,0.16)`
rather than the reference's flat `#434343` — that lands at `#40424a`, the
same lightness, but keeps the bar's blue-grey hue instead of dropping a
neutral patch into it. A port of the relationship, not of the number.

## A third change the plan did not anticipate

**The pill font was 2× too large.** `URL_PILL_FONT_RATIO` was `5/224`
(0.0223), sized for the old 45/1064 pill. The reference sets its address
text at 14px in a 28px pill → `14/1280 = 0.0109`. Against the new pill, the
old ratio would have been 28.6px of text inside a 28px pill: it simply would
not fit. Changed, and the face changed with it — the reference uses SF Pro
Display Medium, and Geist Mono at this size read as a code snippet pasted
into the chrome.

Also read off the `URL Background` SVG's own path (`M0 9.6 C …`): the pill
radius is 9.6px, so `9.6/1280 = 0.0075`. The old `25/2128` would have been
15px on a 28px pill — past half its height, collapsing it into a stadium.

## Traffic lights: kept ours, deliberately

The reference's own SVG uses `#EE6A5F / #F5BD4F / #61C454`, each with a
0.5px darker ring. Those are its matte reconstruction of the three lights.
At the size these draw here — `12/1280` of the frame, about 17px on an
1800px canvas — the ring is sub-pixel and the muted fills read as dimmer
dots, so the saturated system values (`#ff5f57 / #febc2e / #28c840`) stay.
Recorded so the difference is a decision, not an oversight.

Geometry confirmed from the same SVG: circles at cx 6, 26, 46 with r=6 — so
12px across and **20px centre to centre**. The old constant was an
edge-to-edge gap; the new one is a stride, and `paintChrome` was changed to
match.

## Does it look right

Rendered the new `browser-dark` golden and the reference's own screenshot
(node `1:3209`) scaled to a common 1200px window width, stacked. Bar height,
traffic-light size and inset, and pill height and centring all line up.

**What ours deliberately omits:** the reference's six toolbar buttons —
sidebar, back, forward, shield, share, new tab, tabs. Those are exported SVG
assets; drawing them would mean hand-authoring vectors we do not have, which
is the one thing the design-to-code guidance says never to do. The bar is
therefore chrome + lights + address field, and nothing invented.

## Goldens

Five changed, exactly the five predicted: `browser-dark`, `browser-light`,
`browser-url`, `square-browser`, `stroke-browser`. The other eight —
`web`, `mobile`, `web-mobile`, `mesh`, `phone`, `shadow-heavy`,
`stroke-light`, `stroke-glass` — are byte-identical.

## Three tests moved, and why none of them was weakened

- **`the browser-url golden actually discriminates`** — bound lowered from
  5e-4 to 2.5e-4. Only because the text halved in size: measured 704 of
  2,160,000 pixels (3.26e-4) after the rebuild. The guard still fails if the
  text stops being drawn.
- **`scales the whole composite uniformly when the floor does bind`** — its
  premise stopped holding. A browser composite at 3:2 used to cross
  `MIN_MARGIN_RATIO` at the default padding; with a 4.1% bar it now fits
  with room to spare, which is the feature working. The test moved to
  `pad: 0.02` so the floor binds again; the assertion is unchanged.
- **`does not make the browser title bar taller`** (Task 7) — was comparing
  against a hardcoded `10/133`. Now imports `BROWSER_BAR_RATIO`. That
  literal was exactly the drift this codebase keeps warning about, and it
  was mine.

## Task 8, round two — the whole chrome at 3/4

Rock, on the first rebuild: *"I still feel like it's too big. like, in the
small image the bar is almost as tall as the bar I have right now on my
desktop. i think this could be, proportionally, about 1/4 shorter in
height."*

He was describing a real property the first pass missed. **Browser chrome
has a FIXED height.** A Safari window twice as wide still has a 53px
toolbar — the chrome does not grow with the window, only the page does.
Dividing the measurements by 1280 drew the reference's chrome at the size it
would be *if our frame were a 1280px window*. It is not: at 3:2 the frame is
1675px wide, and every ratio was multiplied back up by that. The bar came out
at 69px — proportionally faithful, and taller than any real one.

**Fix: `CHROME_REF_WIDTH = 1280 / 0.75 = 1706.67`**, the single divisor every
browser ratio now shares. Two independent routes agree on it:

- Rock's "about 1/4 shorter" is exactly the 0.75.
- 1706.67 is within 2% of 1675.2, our actual frame width at 3:2 — so the bar
  now draws at **52.0px** against a real Safari's **53px**. Very nearly
  literal.

**Every ratio shares the divisor, deliberately.** Shrinking the bar alone
would have left a 28px pill inside a 40px bar. The reference's internal
proportions are what make it read as a browser, and they are preserved to the
decimal: pill height is 52.8% of bar height here and 52.8% in the reference.

At a 1675.2px frame: bar 52.0, window radius 23.6, dot 11.8, pill 475×27.5,
pill text 13.7px.

### Two tests moved again, and the second one is the interesting failure

- **`scales the whole composite uniformly when the floor does bind`** — its
  premise broke for the second time in one task. The bar is now small enough
  that a browser composite clears `MIN_MARGIN_RATIO` even at `pad: 0.02`. The
  test now uses a SQUARE source, so the screenshot already fills the safe
  box's height and any bar at all must push past it, and it asserts up front
  that the floor really did bind rather than trusting the setup.
- **`the browser-url golden actually discriminates`** — its bound has now
  been lowered twice in one task, both times because the text got smaller:
  5.00e-4 → 3.26e-4 → 2.38e-4 (514 of 2,160,000 pixels). **A bound that keeps
  being lowered is a bound worth distrusting**, so the test gained a second
  assertion that does not depend on glyph count at all: the same config with
  no url must differ from the golden. That is the claim the golden exists to
  make, and it cannot be eroded by the text shrinking — only by the text
  disappearing.

## Task 8, round three — the window corner at 0.6%, and a bug it uncovered

Rock: *"our base browser view can have less rounded corners. based on our
sliders, 0.6% would be it."*

The Corner radius slider reads in percent of CANVAS width, so 0.6% is 10.8px
on an 1800px canvas. At 3:2 the frame is 1675.2px wide, so
`BROWSER_RADIUS_RATIO = 11 / CHROME_REF_WIDTH` lands on **10.80px = 0.600%
of the canvas exactly**. Stated in the same `<px>/CHROME_REF_WIDTH`
vocabulary as everything else so it stays comparable to Safari's own 24.

This is now the one browser value that is deliberately NOT the reference's,
and a consequence worth stating: the frameless screenshot's own corner is
`RADIUS_RATIO`, 1.33% of canvas width, so turning the browser frame on now
tightens the corner noticeably. Two different corners on two different
objects; Cycle B's per-element model is where they stop being unrelated.

### The bug the smaller corner exposed

Every inset hairline in `core/render.js` — the browser frame's border, the
phone body's highlight, the glass stroke's outer line — was stroked with its
box's FULL radius on a rect inset half a pixel. A 1px stroke straddles its
path, so the path really does run half a pixel inside each edge, and the
radius has to come in by the same half pixel or the arc traced is wider than
the corner it sits inside. The border bulged.

The error is 0.5 against the radius, so it hid while the corners were large:
2% at the browser's old 23.6px corner, 4.6% at 10.8px. Fixed in one place,
`strokeInsetHairline`, now shared by all three call sites — the same
correction `paintShadow` already makes for its inset caster.

**How it was pinned, because two suspects looked identical.** The
corner-continuity metric in `test/render-edge-blend.test.js` went red at
0.49px against a 0.35 tolerance. Two experiments separated the causes:

- the SAME metric on an UNFRAMED shot at radius 11 **passed** — so it was
  not the ruler running out of resolution at a small radius;
- the browser case with the border stroke commented out **passed** — so it
  was not the shot's edge either.

Both suspects were real, and they were tangled in one number:

1. the hairline was genuinely non-concentric (fixed);
2. the metric divides the border's attenuation out as a CONSTANT, which is
   exact on the straight run and only approximate through the arc — an error
   that scales as 1px / radius and so grew when the corner halved.

They are now guarded separately: the browser case carries its own documented
`TOL_OVER_HAIRLINE = 0.55` for (2), and (1) has a direct test of its own.

### The direct guard, and the pixel test that was thrown away

The first version of that guard looked for painted pixels outside the
frame's path. **It passed identically with the bug present and with it
fixed** — a 0.09-alpha white line moved half a pixel does not push visible
colour past an arc. That is the eleventh test in this cycle that could not
fail, and it was deleted rather than tuned.

The replacement asserts the PATH, not the pixels: `strokeInsetHairline` is
called with a stub context that records `moveTo`/`arcTo`, and the traced
rectangle must be inset half a pixel on every side with its radius reduced
by the same half pixel. Confirmed red against `box.radius` (`expected 11 to
be close to 10.5`) and green after. A second case checks a radius of 0 never
traces a negative one.

### Goldens

Nine changed — every golden that draws an inset hairline: `browser-dark`,
`browser-light`, `browser-url`, `square-browser`, `stroke-browser`,
`stroke-glass`, `phone`, `mobile`, `web-mobile`. The four with no hairline
anywhere — `web`, `mesh`, `shadow-heavy`, `stroke-light` — are
byte-identical, which is the check that the change did only what it claims.

---

# Cycle A Task 9 — mesh rebuilt

Rock: *"I still don't know what mesh does. you're gonna need to show me the
value of it."* It was two tints of ONE hue with a reroll button, so it could
only ever look like a blotchier linear gradient.

## The rule that had to be changed, not broken

`paintMesh`'s own doc comment used to argue that painting in anything but the
three sampled stops "would break the same 'dark UI gets a mid-tone ground'
contract core/ground.js exists to uphold". A test enforced it:
`circularSpread < 40°`.

The argument was right and the conclusion was too strong. The rule is now
**parameterised**: `spread` is a hue arc in degrees, **centred on the
ground's own hue**, so the mesh wanders a bounded distance from the colour
the screenshot actually produced and never off to an unrelated one. At spread
0 every blob is the base hue and the old guarantee holds exactly — which is
what the old test now asserts, restated rather than deleted, alongside a new
one that the arc never exceeds the spread it was given.

**Only the hue varies.** Each blob keeps a sampled stop's saturation and
lightness — g1 for the first pass, g3 for the second — so the light/dark play
that made the field read as a ground is untouched, and a dark ground cannot
sprout bright blobs. A near-grey ground has no hue to rotate around and is
left alone entirely; spread does nothing there, on purpose.

**`seed` is NOT in the mesh block**, deliberately, though the plan specified
`mesh: { stops, spread, seed }`. It already lives at the top level with its
own clamp and its own control. A second writable home for one value is
exactly how Task 5b killed the shadow slider — a nested default silently
outranked the flat field and the control went dead while still displaying the
old number. One value, one home; guarded by a test that asserts
`config.mesh.seed` stays undefined.

## The three gates

**1. Distinguishable — PASS.** Measured: a spread mesh spans more 15° hue
buckets than a linear ground of the same base. Visually it is not close, on a
ground with any real chroma: on an ember ground, spread 140 shows distinct
orange, yellow-green and red regions where the linear ramp is one orange
sweep.

**2. Steerable — PASS.** Spread, stop count and seed each change the bytes,
each with its own test. Spread 0 → 70 → 140 → 180 is a visible progression;
two seeds at the same spread give genuinely different fields, not noise.

**3. Not muddy — PASS**, and the per-blob alpha came down from 0.75 to 0.62
to keep it that way once there could be ten overlapping blobs instead of six.
Mean chroma over the sample grid, ground `#ece6fb`:

| render | mean chroma |
|---|---|
| linear ground | 21.17 (floor at ×0.75 = **15.88**) |
| mesh, spread 0 | 24.54 |
| mesh, spread 70 (default) | 23.77 |
| mesh, spread 140 | 19.63 |
| mesh, spread 180 (range max) | **17.31** — 9% clear of the floor |

### What the anti-mud gate does not catch, stated rather than left to be found

The plan's version measured at spread 140. It is measured at **180** here,
the top of `MESH_SPREAD_RANGE`, because a gate that stops short of the
range's own maximum does not cover the range.

More importantly: **raising the per-blob alpha to 0.85 does not trip it.**
Checked directly. Alpha is not the lever that muds this construction — the
blobs are drawn `source-over`, so the topmost mostly replaces rather than
averages, and it is SPREAD that pulls chroma down. So this is a floor on the
worst case a user can reach, not a detector of every possible way to make
mud. That is why the task also requires a human to look, and why a second
assertion measures the widest spread against the mesh's OWN spread-0 render
(70.5% against a 65% floor) so the claim holds whatever ground it is handed.

## Two things worth Rock's attention, not defects

- **On the shipped lavender ground, mesh is faint at any spread.** So is the
  linear gradient. That is the palette, not the mesh — and it is his own
  earlier feedback ("our selection is good, but poor... their colors are too
  faint"), already carried into the spec for Cycle B. The ember comparison
  above is the control that separates the two.
- **The default spread of 70 is subtle.** Deliberately conservative, since it
  becomes the look of every mesh shot. Raising it is a one-number change in
  `MESH_DEFAULTS` if he wants it louder.

## Goldens and speed

`mesh` changed — the point of the task — and `mesh-wide` is new, covering the
wide, five-stop end of the range that the default-config `mesh` case says
nothing about. Nothing else moved.

The plan's tests compared renders with
`expect(Buffer.from(getImageData(...))).toEqual(...)`. Vitest deep-equals
that element by element across 8.6 million entries, and each such assertion
took **25–70 seconds**. Rewritten to `Buffer.compare` on the PNG bytes, the
idiom the rest of the file already used: same claim, 3.8s for the whole file
instead of ~170s.

---

# Cycle C Task 2 — the shadow across the luminosity range

Measured in **Chromium**, over the dev server, calling `core/` directly. Not
through `@napi-rs/canvas`: the shadow is the one thing in this codebase where
the two engines have historically disagreed by a factor of five.

Method: the same shot at each luminosity, rendered twice — once with the shot
(and therefore its shadow), once as ground alone — and the two sampled at the
same points 10, 20 and 40px below the shot's bottom edge. The number is the
WCAG contrast ratio between the shadowed and unshadowed ground.

| luminosity | ground | +10px | +20px | +40px |
|---|---|---|---|---|
| sampled (0.975) | `#ebeaee` | **1.382** | 1.312 | 1.210 |
| 0.855 | `#c5c3ca` | 1.339 | 1.281 | 1.202 |
| 0.65 | `#8a8895` | 1.266 | 1.224 | 1.142 |
| 0.45 | `#5f5d69` | 1.176 | 1.152 | 1.104 |
| 0.30 | `#3f3e46` | 1.094 | 1.094 | 1.062 |
| 0.15 | `#201f23` | **1.022** | 1.013 | 1.011 |

**The shadow decays smoothly to nothing.** At 0.15 it moves the ground by
three levels — 25,25,30 against 28,27,31 — which is not visible.

## Why raising the alphas cannot fix it

The shadow is black at a fixed alpha, and **you cannot darken black**. At
luminosity 0.15 the ground sits at relative luminance ≈ 0.0117, so even a
fully opaque black shadow would reach only

```
(0.0117 + 0.05) / (0 + 0.05) = 1.23
```

— still below the 1.38 the pale end gets for free, at alpha 0.17. So outcome
3 from the plan ("the shadow changes with the ground") is not available: the
whole range of the instrument is smaller than the gap it would need to close.
**The alphas are untouched.**

## What actually fails, and what fixes it

Rendered the combinations rather than reasoning about them. The failure is
narrower than the table suggests:

- **A light screenshot on a dark ground** separates enormously well — the
  shot's own edge carries it, and the shadow was never doing the work.
- **A dark screenshot on a pale ground** is the shipped default and is fine.
- **A dark screenshot on a very dark ground** is the one that fails. At
  luminosity 0.15 the shot nearly disappears into the ground, and rendering
  it with `shadowScale: 0` is visually indistinguishable — confirming the
  shadow contributes nothing there.
- **The same shot with a 0.6% light stroke** separates completely.

So this is the plan's outcome 2: the shadow disappears at the dark end and
**the instrument that works is the shot's own edge, not the shadow**. The
stroke already does it, opt-in since Cycle A Task 7, and one click away.

## What was deliberately NOT done

No automatic stroke at low luminosity. It would be a canvas-level control
silently writing a per-element setting — the exact hidden coupling Cycle B
spent eight tasks removing — and it would fire on the light-screenshot case
that has no problem. Raised with Rock as a decision instead.

## Golden

`ground-dark` added: luminosity 0.18 with a dark screenshot, the one
combination at risk. Every other golden is pale, so nothing else would catch
a change to the ground maths, the edge blend or the shadow at that end.

---

# Cycle C Task 3 — the palette

Rock: *"our selection is good, but poor. I can't even see the difference
between them on their thumbnails."* Half of that is the 14×14 swatch, which
Task 5 fixes. This is the other half.

## How close they actually were

Measured before changing anything: all eight named grounds rendered from a
deliberately vivid source, so `chroma` sits at its ceiling and this is the
MOST saturated ground the palette could produce.

| | mid stop | HSL saturation |
|---|---|---|
| every one of the eight | — | **0.263** |
| closest pair, `paper` vs `ash` | `#f1ede7` / `#f1eee7` | **1 level apart** |
| a low-chroma screenshot (the common case) | `#eceaee` | 0.105 |

One level in the largest channel. They are not similar; they are the same
colour.

## What changed

`sat = 0.16 + 0.26 × min(chroma × 1.6, 1)` → `0.26 + 0.38 × …`

Both ends rise. The floor so a nearly-colourless screenshot still produces a
ground with a hue rather than a tinted grey; the ceiling so a colourful one
produces a ground you could name. **The ceiling still exists**, and that is
not negotiable — a ground competing with the screenshot is worse than a dull
one, which is why this was never a plain `chroma` passthrough.

After: 0.263 → **0.385** at the ceiling, 0.105 → **0.158** at the common end.

The per-stop multipliers are untouched. They carry the relationship between
the three stops, which Task 1 now interpolates across the luminosity range,
and disturbing them would move two things at once.

## What this did NOT fix, and cannot

`paper` (34°) and `ash` (40°) are **six degrees apart**. After the change
they are still one level apart in their largest channel. No saturation
setting separates two hues six degrees apart — that is a palette *selection*
problem, not a saturation one.

The eight sit at 24, 34, 40, 158, 205, 240, 268, 340. Three are crammed into
a 16° arc and there is a 118° hole between 40 and 158. Raised with Rock as a
decision rather than fixed unilaterally: the names carry intent he chose, and
re-hueing `ash` is a naming question as much as a colour one.

## What the golden suite proves about this task: nothing

All sixteen renders change, because the ground is in every one. They were
regenerated wholesale. The evidence for this task is the before/after contact
sheet — rendered **with a shot on top**, because a screenshot covers most of
the canvas and only a border of ground shows, which is the thing being judged.

## A test that got weaker, said out loud

`GOLDEN_SWATCHES` in `test/ground.test.js` held values generated from
`ground.py`'s own `hsl()` helper, so it proved `core/ground.js` agreed with
the Python original's actual formula rather than merely with itself. Raising
the saturation formula breaks that agreement deliberately.

`ground.py` was retired in Cycle A, so the cross-check was already
historical — but this is the commit that ends it. The values are now
generated from `core/ground.js`, and what remains is a freeze: it still
catches the hex output drifting silently, which the golden-image test above
cannot (it reads only hue/lum/chroma/darkUI), but it can no longer catch this
file disagreeing with an external reference, because there is no longer one.

## Task 3, round two — a preset carries its own saturation

Rock, on the palette sheet: *"yeah they are extremely similar. when you say
'ash' I expect 'grey'. we don't have a gray one there."*

Right twice over. `ash` sat six degrees from `paper` and rendered as a second
warm cream — and **grey was unreachable**, because a preset was a hue and
nothing else. Grey is not a hue; it is the absence of chroma, and nothing in
the pipeline could ask for that.

`HUES` (name → degrees) becomes `GROUNDS` (name → `{ hue, sat? }`), with
`HUES` kept as a derived export so the several callers that only want degrees
are untouched. One table, not two. `sat` REPLACES the chroma-derived
saturation rather than scaling it — scaling would let a grey preset drift
with the screenshot, where replacing makes "grey" mean grey whatever it is
dropped on.

`ash` becomes hue 220 at `sat: 0.12`. A cool near-neutral rather than a dead
grey: a true neutral reads as "no background chosen", where a barely-blue one
reads as deliberate.

| | before | after |
|---|---|---|
| closest pair | `paper` vs `ash`, **1 level** | `paper` vs `ember`, **3 levels** |
| `ash` mid stop | `#f1eee7` (warm cream) | `#eaebed` (grey) |

`paper` and `ember` are ten degrees apart and are now the closest pair. They
are at least distinguishable — cream against peach — but they are the next
candidates if the palette is revisited.

### The test suite caught this one, unprompted

`gradientFor` in `web/sidebar.js` previews a preset in its swatch, and it did
not know about `forceSat` — so the `ash` swatch would have previewed as a
blue tint and then rendered as a grey. **A swatch lying about what selecting
it produces** is the exact defect that file's own suite exists to catch, and
it caught it: "every swatch, computed for the loaded dark image, matches what
selecting it actually renders" went red on the first run.

### And a gap this exposed

**Regenerating the goldens after this change moved nothing at all** — because
no golden picks a named ground. They all take the sampled one, so the entire
`forceSat` path was unguarded. `ground-ash` added, plus four unit tests
covering the one-table rule, grey-on-vivid, colour-on-vivid, and
replace-not-scale.

---

# Cycle C Task 5 — preset tiles

`gradientFor` in `web/sidebar.js` built a CSS `linear-gradient` string that
APPROXIMATED what `paintGround` draws, and `renderGroundSwatches` painted
eight 14×14 chips with it. A second implementation of the ground, in a
different language, kept in step by hand.

It lied twice. Once before Cycle A, and again within an hour of `ash` gaining
its own saturation in Task 3 — it previewed a blue tint for a preset that
renders grey. Both are deleted. `web/preset-tiles.js` paints a preset into a
real canvas with the real generator, at the current type, angle and
luminosity.

`paintGround` is now exported from `core/index.js` for exactly this. The
other painters stay internal — `composeWithMeta` remains the only way to draw
a shot, which is what keeps the preview canvas and the export canvas from
disagreeing.

## Verified

Painted the same preset at 44px and at 1800px and compared at matching
relative positions: every channel within 6 levels, which is the gradient's
own interpolation across two very different pixel counts. An approximation
drifts across that; the real generator cannot.

In the browser: eight tiles, **eight distinct colours**, `ash` at
`234,235,237` (grey) against `rose` at `243,228,233`.

## A test ported rather than deleted

`test/sidebar.test.js`'s "swatches tell the truth about a loaded dark image"
compared `gradientFor`'s string against the gradient `render()` produced. The
function is gone, but the claim is the reason that suite exists — so it is
made against PIXELS now: paint the tile, select the preset, render, compare
the tile's centre to the ground the shot actually got. Within 3 levels for
all eight, against a genuinely dark sample.

## The mistake, and why the suite did not catch it

Deleting `gradientFor` and `renderGroundSwatches` meant removing the block
they sat in — and that block also contained `matchesQuery`, the sidebar's
search filter, which I removed with them.

`node --check` passed: the syntax was fine. **All 518 tests passed**: nothing
in the suite drives the search box. The app threw
`ReferenceError: matchesQuery is not defined` on load and rendered nothing at
all — no templates, no ratios, no panel.

Caught by opening it. This is the second time this cycle that the browser
found something green tests could not (the first was the luminosity slider
sitting at the wrong position), and both were in `web/`, where the suite has
no DOM. Worth stating plainly: **for this app, a green suite is not evidence
that the page loads.**

---

# Cycle C Task 6 — click targets, measured

Rock, 2026-09-02: *"the color names's clickable area should be the whole row,
like we have for templates. short names atm have also a short click target."*

Measured in Chromium (`getBoundingClientRect`) on every clickable row and
cell in the app, not read off the CSS.

**Already fixed by Task 5.** The eight ground rows are gone. The preset tiles
are grid cells at `width: 100%`, canvas and label both inside the button.

**Already right.** `.sampled-row` is `width: 100%` (measured 237px, the
section's full content width). The Background type cells are a plain
`.segmented`, whose cells carry `flex: 1` — **Gradient 117.5px, Solid
117.5px**, equal and filling.

**The one real instance left.** `.segmented--mini`:

| cell | before | after |
|---|---|---|
| Dark | 43.2px | 49.5px |
| Mid | **36.9px** | 49.5px |
| Light | 49.5px | 49.5px |

Three peers whose targets differed by 34%, purely by label length. Export's
`1x / 2x / 3x` measured equal only because those labels are the same width —
an accident, not a rule, and it now holds by construction.

`flex: 1` does not fix this one: a mini control shrink-wraps inside a toolbar
row, so there is no free space for `flex-grow` to distribute. Probed both in
the page before choosing — `flex: 1 1 0` left the cells at 43.2 / 36.9 / 49.5,
unchanged. `grid-auto-columns: 1fr` sizes every column to the widest cell and
the control grows to 150.5px. That is the mechanism that works on a
shrink-to-fit box.

**Left alone, deliberately.** The `.chip` rows (None / Browser / Phone at
50.9 / 65.6 / 55.3px) are pills in a wrapping row, not rows — sizing to the
label is that idiom, and each is already ≥50px wide.

**Found while measuring, not fixed.** Every `.segmented-cell` is **22px
tall**. WCAG 2.2 AA 2.5.8 asks for 24×24 CSS px, and adjacent cells touch, so
the spacing exception does not apply. Raising `.segmented--mini` to 26px
would fix it and would change the density of the canvas toolbar, the frame
theme control and the export scale at once — an app-wide look change, so it
is Rock's call, not a silent edit inside a Background task.
