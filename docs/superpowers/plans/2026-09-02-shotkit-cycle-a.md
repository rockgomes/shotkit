# shotkit Cycle A — Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the rendered shot honest — no stroke you didn't ask for, strokes you can ask for, a browser frame that looks like a browser, frames that grow outward instead of shrinking your screenshot, a mesh worth using, and a shadow you can steer — plus the three app fixes that collide with none of it.

**Architecture:** All rendering work lands in `core/`, which reopens deliberately after being closed since Task 5. Frames and strokes become *outsets*: the screenshot's box is computed first from the source ratio, then chrome and stroke grow outward from it, and padding gives way rather than the picture. `paintShadow` gains named parameters whose defaults reproduce today's verified output byte-for-byte, guarded by a golden of the shadow alone. Three app-side fixes (contrast, label spacing, Ground dedup) touch only `web/tokens.css`, `web/style.css` and `web/sidebar.js`, and are sequenced first so daily use improves immediately.

**Tech Stack:** Zero-dependency ES modules in `core/`; Vite + vanilla JS in `web/`; vitest with `@napi-rs/canvas` and `pixelmatch` for goldens.

**Spec:** `docs/superpowers/specs/2026-09-02-shotkit-round-two-design.md`

## Global Constraints

Copied from the spec. Every task's requirements implicitly include these.

- `composeWithMeta` is called from **exactly one place** in `web/` (`web/state.js`, inside `render()`). Do not add a second call site.
- The preview canvas **is** the export canvas. Nothing may be drawn into it that must not appear in the exported PNG.
- **No engine detection** anywhere in `core/`. No `typeof window`, no `navigator`, no branching on canvas implementation.
- `core/` has **zero runtime dependencies**. It may import only its own relative files.
- `web/tokens.css` is the **only** file in `web/` allowed to contain a raw hex colour.
- `[hidden] { display: none !important; }` stays a **single global rule**. Do not add per-element `hidden` handling.
- Geometry in `core/` is **proportional to the canvas**, never fixed pixels, except these documented minimums: `lineWidth = 1`, the 240px grain tile, `PHONE_BEZEL_MIN = 3`, `SHADOW_SOURCE_INSET = 2` (added in Task 1's follow-up; like `lineWidth = 1` it exists to cover antialiased coverage, which is a fixed pixel count at every canvas size — see its comment in `core/render.js` for the measurements that set it), and `TILE_BLEED = 1` (Task 4d — how far a shot's own drawing is pushed past the mask that cuts it, inside its offscreen tile; same category, same reason, measurements in its own comment). `SNAP_TO_PIXELS` was Task 4c's version of the same idea and is **gone** — Task 4d removed it along with the clip it was compensating for. `TILE_QUANTUM = 64` is also a raw pixel number but is not geometry at all: it rounds a tile's ALLOCATION up so a pooling `makeCanvas` cannot mint a canvas per frame, and changes nothing that is painted.
- **Nothing is painted behind a shot, and nothing is drawn inside a clip** (Task 4d). Each shot is composed in its own offscreen tile through the injected `makeCanvas`, drawn one pixel past its own edge, and cut once with a `destination-in` fill; `paintShadow` clips the box out of itself so there is no caster to cover. `test/render-clip-safety.test.js` enforces both structurally.
- **Do not retune `paintShadow`'s alphas.** `0.17 / 0.07` for web and browser, `0.22 / 0.10` for phones. These were broken once by tuning against `@napi-rs/canvas` while the browser — the actual product — would have shipped a shadow ~65 RGB levels too dark, with every Node test green. `frame.html` is deleted, so they cannot be re-derived.
- Run `npx vitest run` before and after every task. Commit only green.
- After each task, push the branch. Do not merge to `main` mid-cycle.

### THE APPROVAL GATE — read this before starting any task

**Every task that changes anything Rock can see ends by deploying a preview and
STOPPING.** Not a screenshot in a report — a URL he can open, click and test
himself.

Round one shipped seven tasks without a single preview link. Rock saw the app
for the first time when it was finished and deployed, and nineteen pieces of
feedback arrived at once — several of them ("frame:none draws a stroke", "the
browser chrome is comically big", "the contrast is bad") things he would have
caught on day one. That is the cost this gate exists to prevent.

**There is nothing to deploy by hand.** The repo is connected to Netlify and
all of Cycle A lives on branch `feat/cycle-a` behind pull request #1. Every
push rebuilds the preview at:

**https://deploy-preview-1--shotkit-app.netlify.app**

One URL for the whole cycle, always showing the latest task. Production
(`shotkit-app`) is untouched until the PR merges.

CI runs on the same push — the full suite, the build, and a check that no
golden file changed. Both it and the preview must be green before you hand
over.

Then **stop and hand Rock the URL**, saying what changed and what to look at.
Do not start the next task. Do not assume approval from silence. A task whose
preview has not been approved is not finished, no matter how green the tests
are.

**A feature with no way to reach it in the UI cannot be approved.** That is why
Tasks 5, 7 and 9 below each ship a minimal control alongside the render work —
see the note on each.

---

### Task 1: `frame: none` draws no stroke

**Files:**
- Modify: `core/render.js:376-382` (the inset hairline in `paintWeb`)
- Test: `test/render-screen.test.js`
- Regenerate: `test/golden/render/web.png`, `mesh.png`, `shadow-heavy.png`, `web-mobile.png`

**Interfaces:**
- Consumes: nothing from earlier tasks — this is the first.
- Produces: `paintWeb` no longer strokes anything when `box.chrome` is null. Task 7 (strokes) adds the *opt-in* stroke in a different place; it must not reinstate this one.

- [ ] **Step 1: Write the failing test**

Add to `test/render-screen.test.js`:

```js
describe('frame: none draws no stroke', () => {
  it('leaves no darker ring just inside the screen edge', async () => {
    // A pure white source image. With no stroke, every pixel just inside the
    // box edge must be white — a hairline would darken the first row/column.
    const img = createCanvas(1440, 900);
    const ictx = img.getContext('2d');
    ictx.fillStyle = '#ffffff';
    ictx.fillRect(0, 0, 1440, 900);

    const c = normalise({ layout: 'web', ratio: '3:2', frameKind: 'none' });
    const lay = layout(c, { web: 1440 / 900, mobile: [] });
    const cv = createCanvas(c.w, c.h);
    const ctx = cv.getContext('2d');
    paintGround(ctx, c, GROUND);
    paintWeb(ctx, c, lay.web, img);

    const b = lay.web;
    const midY = Math.round(b.y + b.h / 2);
    const midX = Math.round(b.x + b.w / 2);

    // 2px in from each edge, clear of the antialiased boundary itself.
    for (const [x, y, edge] of [
      [Math.round(b.x) + 2, midY, 'left'],
      [Math.round(b.x + b.w) - 3, midY, 'right'],
      [midX, Math.round(b.y) + 2, 'top'],
      [midX, Math.round(b.y + b.h) - 3, 'bottom'],
    ]) {
      const [r, g, bl] = px(ctx, x, y);
      expect(`${edge}:${r},${g},${bl}`).toBe(`${edge}:255,255,255`);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run test/render-screen.test.js -t 'no darker ring'`
Expected: FAIL. The hairline is `rgba(16,18,27,0.07)` over white, so the edge pixels read roughly `238,238,239` rather than `255,255,255`.

- [ ] **Step 3: Delete the hairline**

In `core/render.js`, remove this block at the end of `paintWeb` (currently lines 376-382), including its `// inset 0 0 0 1px hairline` comment:

```js
  // inset 0 0 0 1px hairline
  ctx.save();
  ctx.strokeStyle = 'rgba(16,18,27,0.07)';         // --hairline
  ctx.lineWidth = 1;
  roundRect(ctx, box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1, box.radius);
  ctx.stroke();
  ctx.restore();
```

Replace it with a comment recording why nothing is there, so a later reader does not "restore" it:

```js
  // NO STROKE HERE, DELIBERATELY. frame.html stroked an inset hairline on
  // every unframed screen; it read as an unrequested border and was the
  // first item of round two's feedback. An edge treatment is now opt-in via
  // `stroke` (see paintStroke) — do not reinstate an unconditional one.
```

Do **not** touch the `t.border` strokes in `paintWebChrome` (line ~556) or `paintDeviceHairline` — those belong to frames, which are opt-in already.

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run test/render-screen.test.js`
Expected: PASS.

- [ ] **Step 5: Regenerate the affected goldens and confirm the diff is only the edge**

Run: `node scripts/make-render-goldens.js && npx vitest run`

Five goldens contain an unframed web screen and will change: `web`, `mesh`,
`shadow-heavy`, `web-mobile` and **`caption`** — `caption` sets no `frameKind`
(see `scripts/make-render-goldens.js`), so it renders an unframed screen like
the rest. The correct invariant is: the **five** cases that set `frameKind`
(`browser-dark`, `browser-light`, `browser-url`, `square-browser`, `phone`)
plus the phone-only `mobile` must stay byte-identical — six unchanged, five
changed, eleven in total. If one of those moves,
**stop and report** — the deletion reached the framed path.

> **Follow-up (after Rock opened the preview): the border was still there.**
> The hairline was only one of two sources. `paintShadow` filled an **opaque
> black rounded rect** on `box`'s exact geometry to make canvas cast a blur;
> the body painted over it is antialiased on that same path, so at the
> boundary pixel the black showed through at `k(1-k)` — measured 166,166,167
> on a white screen over a 239,234,247 ground, and it survived at
> `shadowScale: 0`, with the shadow entirely off. That is why deleting the
> hairline did not remove it, and why the Step 1 test stayed green: that test
> samples the first **fully interior** pixel, where the body's coverage is 1.
>
> Fixed by insetting the shadow's opaque source rect (and its radius) by
> `SHADOW_SOURCE_INSET = 2`, so the fill lands wholly beneath the body. The
> alphas are untouched. Because `paintShadow` serves all four call sites,
> **all eleven goldens change** — the six-unchanged invariant above applies
> only to the original hairline deletion, not to this follow-up.

- [ ] **Step 6: Commit**

```bash
git add core/render.js test/render-screen.test.js test/golden/render
git commit -m "fix(core): frame:none draws no stroke"
git push origin feat/cycle-a
```

- [ ] **Final step: deploy a preview, hand over the link, and STOP**

The preview is automatic. The Commit step above already pushed to
`feat/cycle-a`, which makes Netlify rebuild PR #1. Wait for both checks:

```bash
gh pr checks 1
```

`test` and `netlify/shotkit-app/deploy-preview` must both be green before you
hand anything over. **A task with red CI is not finished**, however good the
preview looks — fix it, push, and wait again.

Then give Rock the URL — **https://deploy-preview-1--shotkit-app.netlify.app** —
and tell him what to look at:

> Load a screenshot with Frame set to **None**. There must be no border, edge or hairline of any kind between the ground and the screenshot. Open https://shotkit-app.netlify.app in another tab for the before.

**Then stop.** Do not begin the next task. Silence is not approval. If Rock
asks for a change, make it, redeploy, and hand the link back before moving on.


---

### Task 2: Label spacing, and Ground leaves the left rail

**Files:**
- Modify: `web/style.css:511-524` (`.template-row`)
- Modify: `web/sidebar.js:455-465` (the rail's Ground section)
- Modify: `web/index.html` (the rail's Ground markup)
- Test: `test/sidebar.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `renderGroundSwatches` **stays exported** from `web/sidebar.js` — `web/inspector-background.js:491` still calls it, and Cycle B's Background rebuild depends on it. Only the rail's *caller* and its markup go.

- [ ] **Step 1: Fix the label run-together**

The cause is not a missing space character. `.template-row` is already `display:flex; justify-content:space-between`, but it has no `gap`, so at the rail's width "Dribbble shot" and "2800×2100" grow until they touch. Injecting a literal space would also corrupt the accessible name.

In `web/style.css`, inside `.template-row` (line 511), add:

```css
  gap: 10px;
```

And immediately after the `.template-row` rule, add:

```css
/* The name truncates; the dimensions never do — they are the information the
   row exists to carry. Without `min-width: 0` a flex item refuses to shrink
   below its content and the two spans collide, which is what produced
   "Dribbble shot2800×2100". */
.template-row > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-row > .dim {
  flex: none;
}
```

- [ ] **Step 2: Remove Ground from the left rail**

In `web/sidebar.js`, delete the rail's Ground block — the `renderGroundSwatches(groundList, ...)` call at line ~460 and the `groundList` element lookup that feeds it. Delete the corresponding `GROUND` heading and `<ul>` from `web/index.html`'s rail markup.

Do **not** delete the `renderGroundSwatches` function itself (line 228) or its export.

- [ ] **Step 3: Write the guard**

Add to `test/sidebar.test.js`:

```js
describe('the rail does not duplicate the Background panel', () => {
  it('renders no ground swatch list in the sidebar', () => {
    const dom = mountSidebar();               // existing helper in this file
    expect(dom.querySelector('#groundList')).toBeNull();
  });

  it('still exports renderGroundSwatches for the inspector', async () => {
    const mod = await import('../web/sidebar.js');
    expect(typeof mod.renderGroundSwatches).toBe('function');
  });
});
```

If `mountSidebar` is not the helper's actual name in this file, use whatever the existing suite uses to build the sidebar — do not invent a second harness.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/sidebar.test.js`
Expected: PASS. Then `npx vitest run` — all green, and the count drops by any test that asserted the rail's ground list existed. Update those tests rather than deleting them wholesale; if one asserted the rail and the panel agreed, that assertion is now meaningless and should go with a note in the commit.

- [ ] **Step 5: Verify in the browser**

Start the dev server via `preview_start`, load a screenshot, and confirm: template rows read "Dribbble shot   2800×2100" with a visible gap, long names ellipsise instead of colliding, and the rail has no Ground section while the Background panel still shows its presets. Screenshot both.

- [ ] **Step 6: Commit**

```bash
git add web/style.css web/sidebar.js web/index.html test/sidebar.test.js
git commit -m "fix(web): space template labels, drop the rail's duplicate Ground list"
git push origin feat/cycle-a
```

- [ ] **Final step: deploy a preview, hand over the link, and STOP**

The preview is automatic. The Commit step above already pushed to
`feat/cycle-a`, which makes Netlify rebuild PR #1. Wait for both checks:

```bash
gh pr checks 1
```

`test` and `netlify/shotkit-app/deploy-preview` must both be green before you
hand anything over. **A task with red CI is not finished**, however good the
preview looks — fix it, push, and wait again.

Then give Rock the URL — **https://deploy-preview-1--shotkit-app.netlify.app** —
and tell him what to look at:

> Look at the template and ratio lists: name on the left, dimensions on the right, a clear gap between them, long names truncating with an ellipsis rather than colliding. Then confirm the left rail has no Ground section, and the Background panel still does.

**Then stop.** Do not begin the next task. Silence is not approval. If Rock
asks for a change, make it, redeploy, and hand the link back before moving on.


---

### Task 3: Contrast pass

**Files:**
- Modify: `web/tokens.css:30-52` (the Text block)
- Create: `test/contrast.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: a reusable `contrastRatio(hexA, hexB)` helper exported from `test/contrast.test.js`'s own module scope is **not** wanted — keep the helper local to the test file. Cycle B recomputes contrast for the generated hues separately.

- [ ] **Step 0: Sweep the dead swatch rules Task 2 left behind**

Task 2 removed the rail's preset markup and flagged, correctly, that it left
orphans. Verify each with `grep -rn` before touching it — remove only what is
genuinely unreferenced, and say in the report what you removed and what you
found still in use:

- `web/style.css:679-689` — `.preset-swatch--aurora`, `--slate`, `--candy`.
  Nothing matches these selectors any more.
- `web/tokens.css:59-68` — `--color-blue`, `--color-pink`, `--color-slate`,
  `--color-charcoal`, `--color-orange`, `--color-magenta`. If the only
  references are the three rules above, they go with them.

`--color-cyan`, `--color-indigo`, `--color-green` and `--color-teal` sit in the
same block and may already have been dead before Task 2 — check them too, but
do not assume. Also re-check `--text-subtle`, flagged as a dead token back in
Task 7 of the previous cycle and deliberately left then.

This belongs here rather than in Task 2 because this is the task that edits
`tokens.css`, and a token file is easier to reason about once the dead entries
are gone.

- [ ] **Step 1: Write the audit test first, and let it fail**

Create `test/contrast.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

function srgbToLinear(v) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex) {
  const m = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16));
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

function tokens() {
  const css = readFileSync('web/tokens.css', 'utf8');
  const out = {};
  for (const [, name, value] of css.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    out[name] = value;
  }
  return out;
}

// Every text token, and every surface it actually sits on. Derived by reading
// web/style.css — if a pairing here is wrong the fix is to correct the
// pairing, not to loosen the threshold.
const PAIRS = [
  ['--text-primary',   '--surface-window',   7.0],
  ['--text-primary',   '--surface-canvas',   7.0],
  ['--text-primary',   '--surface-raised-1', 7.0],
  ['--text-secondary', '--surface-window',   4.5],
  ['--text-secondary', '--surface-raised-1', 4.5],
  ['--text-muted',     '--surface-window',   4.5],
  ['--text-muted',     '--surface-raised-1', 4.5],
  ['--text-muted',     '--border-hairline',  4.5],
  ['--text-faint',     '--surface-window',   4.5],
  ['--text-faint',     '--surface-raised-1', 4.5],
  ['--text-fainter',   '--surface-window',   4.5],
  ['--text-disabled',  '--surface-window',   4.5],
  ['--text-disabled',  '--border-hairline',  4.5],
  ['--text-subtle',    '--surface-window',   3.0],
];

describe('token contrast', () => {
  const t = tokens();
  for (const [fg, bg, min] of PAIRS) {
    it(`${fg} on ${bg} clears ${min}:1`, () => {
      expect(t[fg], `${fg} missing`).toBeTruthy();
      expect(t[bg], `${bg} missing`).toBeTruthy();
      const r = ratio(t[fg], t[bg]);
      expect(
        Number(r.toFixed(2)),
        `${fg} (${t[fg]}) on ${bg} (${t[bg]}) = ${r.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(min);
    });
  }
});
```

- [ ] **Step 2: Run it and record every failure**

Run: `npx vitest run test/contrast.test.js`
Expected: several FAIL. Copy the full list of failing pairs and their measured ratios into the task report — this is the evidence that the complaint was real, and it is what the reviewer will check the fix against.

- [ ] **Step 3: Raise only the failing tokens, minimally**

In `web/tokens.css`, for each failing token, raise **lightness only** — keep hue and saturation, exactly as the existing `--text-disabled` comment did. Change the smallest amount that clears the threshold, then add a comment in the same style as the `--text-disabled` block recording the old value, the measured ratio, the binding background, and why the new value is the minimum.

Do not touch `--text-subtle` unless it fails its 3:1 row: it is a decorative separator, and the spec sets 3:1 for decorative.

Do not change any surface token. Raising text is reversible and local; moving a surface changes every pairing at once.

- [ ] **Step 4: Run the audit until green**

Run: `npx vitest run test/contrast.test.js`
Expected: PASS, all rows.

- [ ] **Step 5: Look at it**

Run the dev server, load a screenshot, and screenshot the full app. Then screenshot the empty state. Confirm the inert/disabled states still read as *inert* — the point of this task is legibility, not flattening the hierarchy. If everything now looks the same weight, the lift went too far on the muted end; pull it back and re-run.

- [ ] **Step 6: Run everything and commit**

```bash
npx vitest run
git add web/tokens.css test/contrast.test.js
git commit -m "fix(web): raise text token luminance to clear AA, with an audit test"
git push origin feat/cycle-a
```

- [ ] **Final step: deploy a preview, hand over the link, and STOP**

The preview is automatic. The Commit step above already pushed to
`feat/cycle-a`, which makes Netlify rebuild PR #1. Wait for both checks:

```bash
gh pr checks 1
```

`test` and `netlify/shotkit-app/deploy-preview` must both be green before you
hand anything over. **A task with red CI is not finished**, however good the
preview looks — fix it, push, and wait again.

Then give Rock the URL — **https://deploy-preview-1--shotkit-app.netlify.app** —
and tell him what to look at:

> Read every label in the app — rail, toolbar, template rows, section headings, inspector labels, the export dimensions, the empty state. Nothing should require effort to read. Check the empty state too: inert controls must still look inert, not merely dim. If everything now reads at the same weight, say so — the lift went too far.

**Then stop.** Do not begin the next task. Silence is not approval. If Rock
asks for a change, make it, redeploy, and hand the link back before moving on.


---

### Task 3b: Contrast above the floor, and the half nobody measured

Written after Task 3 shipped and Rock looked at it: *"still dim. I think our
greys need to get closer to white. I feel like we using 'pass' as the floor...
even the placeholder 'square' on the center of the page is so dim that I can
barely see the dashed lines and the ratio on the corner."*

Two failures, not one. **The floor was the target** — Task 3 solved each token
to the minimum that cleared 4.5:1 and stopped there. And **the audit measured
text only**: every border, dashed affordance and the dot grid went unchecked,
and all of them failed badly (1.15:1 to 1.46:1), including the empty state's
dashed frame and its ratio label, which is what Rock named.

The spec's Contrast section was rewritten as five numbered items (text 7:1;
ladder rungs 1.2:1 apart; interactive boundaries and meaningful graphics 3:1;
decorative separators in a **1.8-2.5:1 band with a ceiling as well as a floor**;
inert and disabled states dimmed with explicit full-alpha colours, never
`opacity`). This task implements all five and `test/contrast.test.js` enforces
all five.

**The structural change worth knowing about.** `--border-hairline` was one
token doing two jobs with opposite requirements: as a hairline it is decoration
and wants to be bright, and as the row hover fill it is the lightest surface any
LADDER token is painted on, and so the ceiling on the entire text ladder.
Lifting it would have dropped that ceiling from 16.86:1 to 9.78:1 and made a
7:1 floor with five rungs impossible. It was split — the hover fill keeps the
old value as `--surface-hover`, the hairline moved. No surface token changed
value.

**What the review found, and why it matters to later tasks.** The first pass
converted `.inspector-section[inert]` off `opacity` and left nine other rules
on it. Three sat below 3:1, and most of them were on the empty state — its
toolbar buttons and all four rail items rendered *dimmer than the inert panels
beside them*. The suite could not see any of it, because it read values out of
`tokens.css` and a composited colour exists only in the browser. So:

> **A guard that reads token values is blind to `opacity`.** `web/style.css`
> now carries **no static `opacity` below 1 outside `@keyframes`**, and
> `test/contrast.test.js` fails on any that appears. Every off state routes
> through **one rule** near the top of `style.css` that re-declares the live
> tokens as `--text-inert` / `--surface-inert` / `--border-inert`, the way
> `[hidden]` is one rule. A new disabled control inherits the treatment for
> free; a new `:disabled` rule that is not in that selector list fails the
> suite.

Two further traps this task walked into, recorded so a later one does not:

- **Dimming is not always an off state.** `.sampled-row:not(.is-active)` means
  "true, but not currently in effect" on a live, clickable row — informational
  text that owes 7:1, not an exempt inactive component. It steps down the
  ladder instead of into the inert tone.
- **A "dim" assertion must read the rule, not the tokens.** The first version
  of that guard compared two token constants, so swapping the stylesheet to a
  brighter token left it green. Mutation N6 caught it. Anything asserting *this
  rule dims* has to parse the declaration.

**Files:** `web/tokens.css`, `web/style.css`, `test/contrast.test.js`, and the
spec's Contrast section.


---

### Task 4: Delete `fit`/`cover` and the caption

**Files:**
- Modify: `core/presets.js` (remove `FITS`, `DEFAULTS.fit`, `DEFAULTS.caption`)
- Modify: `core/config.js` (remove `fit` and `caption` from `normalise`)
- Modify: `core/layout.js:106-132` (`webBox`), and the caption block at the end of `layout()`
- Modify: `core/render.js` (`paintWeb`'s `drawFitted` call; delete `paintCaption`)
- Modify: `core/index.js` (drop `FITS` from the exported vocabulary)
- Modify: `scripts/make-render-goldens.js` (delete the `caption` case)
- Modify: `web/` wherever `fit` or `caption` is surfaced
- Delete: `test/golden/render/caption.png`
- Test: `test/config.test.js`, `test/layout.test.js`, `test/render-screen.test.js`

**Interfaces:**
- Consumes: Task 1's `paintWeb` with no hairline.
- Produces: `normalise()` no longer returns `fit` or `caption`. `layout()` no longer returns a `caption` key. `webBox(c, box, ratio)` keeps its signature but always uses the image ratio. Task 6 rewrites `webBox`'s body; it must not reintroduce a fit branch.

- [ ] **Step 1: Write the failing tests**

Add to `test/config.test.js`:

```js
describe('retired vocabulary', () => {
  it('drops fit entirely', () => {
    const c = normalise({ fit: 'cover' });
    expect(c.fit).toBeUndefined();
  });

  it('drops caption entirely', () => {
    const c = normalise({ caption: 'hello' });
    expect(c.caption).toBeUndefined();
  });

  it('ignores a stale cover and still uses the image ratio', () => {
    const c = normalise({ layout: 'web', ratio: '3:2', fit: 'cover' });
    const lay = layout(c, { web: 1440 / 900, mobile: [] });
    expect(lay.web.w / lay.web.h).toBeCloseTo(1440 / 900, 12);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run test/config.test.js -t 'retired vocabulary'`
Expected: FAIL — `c.fit` is `'cover'`, `c.caption` is `'hello'`.

- [ ] **Step 3: Remove them**

`core/presets.js`: delete `export const FITS = [...]`, `fit:` from `DEFAULTS`, `caption:` from `DEFAULTS`.

`core/config.js`: delete the `FITS` and `caption` imports and the `fit:` and `caption:` lines from the returned object. Leave `url:` alone — the comment above it references `caption`'s coercion, so rewrite that comment to stand on its own rather than pointing at a deleted field.

`core/layout.js`: in `webBox`, delete the `c.fit === 'contain'` branches. The box always takes the ratio and is always fitted:

```js
function webBox(c, box, ratio) {
  const fitRatio = c.frameKind !== 'none' ? frameRatio(c.frameKind, ratio) : ratio;

  let w, h;
  if (fitRatio > box.w / box.h) { w = box.w; h = box.w / fitRatio; }
  else                          { h = box.h; w = box.h * fitRatio; }

  const x = box.x + (box.w - w) / 2;
  const y = box.y + (box.h - h) / 2;
  const web = { x, y, w, h, radius: c.radius };
  web.chrome = chromeFor(c, web);
  return web;
}
```

Delete the `if (c.caption) { out.caption = ... }` block and change `out`'s initialiser from `{ safe, web: null, phones: [], caption: null }` to `{ safe, web: null, phones: [] }`.

`core/render.js`: in `paintWeb`, change `drawFitted(ctx, box, image, c.fit)` to `drawFitted(ctx, box, image, 'contain')`. Delete `paintCaption` entirely. Keep `drawFitted` — `paintPhone` still uses it with `'cover'`.

`core/index.js`: remove `FITS` from the export list, and remove the `paintCaption` call from `composeWithMeta`.

`scripts/make-render-goldens.js`: delete the `['caption', ...]` case and its comment.

`web/`: grep for `fit` and `caption` and remove the controls and any state that fed them.

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run test/config.test.js -t 'retired vocabulary'`
Expected: PASS.

- [ ] **Step 5: Delete the caption golden, regenerate, confirm nothing else moved**

```bash
git rm test/golden/render/caption.png
node scripts/make-render-goldens.js
npx vitest run
```

Every remaining golden must be **byte-identical** — `git status` should show no modifications under `test/golden/render/`. Removing `fit` cannot change output because `contain` was the default and the only non-cropping option. If any golden moved, **stop and report**: something else changed with it.

- [ ] **Step 6: Commit**

```bash
git add -u core web scripts test
git commit -m "refactor(core): retire fit/cover and the caption"
git push origin feat/cycle-a
```

- [ ] **Final step: deploy a preview, hand over the link, and STOP**

The preview is automatic. The Commit step above already pushed to
`feat/cycle-a`, which makes Netlify rebuild PR #1. Wait for both checks:

```bash
gh pr checks 1
```

`test` and `netlify/shotkit-app/deploy-preview` must both be green before you
hand anything over. **A task with red CI is not finished**, however good the
preview looks — fix it, push, and wait again.

Then give Rock the URL — **https://deploy-preview-1--shotkit-app.netlify.app** —
and tell him what to look at:

> Confirm the **Fit** control and the **Caption** field are gone from the inspector, and that nothing else moved or broke in their place.

**Then stop.** Do not begin the next task. Silence is not approval. If Rock
asks for a change, make it, redeploy, and hand the link back before moving on.


---

### Task 4b: Grain belongs to the ground, and the white edge on dark screenshots

Written after Task 4 shipped and Rock looked at it. Two reports, one of which
turned out to be two sentences about the same bug:

> "the 'noise' is adding noise to the screenshot too. it should only add to the
> background."

> "I just tried using a dark image there, and they have a white stroke. so, this
> shit again." ... "if you look closely, even the roundness of the corner is off."

Unrelated causes. One is testable in Node and is tested; the other is a
**Chromium-only rasterisation bug** that `@napi-rs/canvas` does not reproduce
at all, so it is guarded structurally and recorded in
`docs/verification-2026-09-01.md` rather than asserted by a pixel test that
would pass in both directions.

**Grain.** `composeWithMeta`'s paint order was ground → shot → **grain last**,
and `paintGrain` is an unclipped `soft-light` `fillRect` over the whole canvas.
On a flat `#808080` source at `grain: 1` the screenshot's interior came back as
105 distinct colours spanning 104 levels, where a flat source must render flat.
`paintGrain` moved to immediately after `paintGround`.

Not clipped around the shots, and the reason is written at the call site: an
even-odd clip would modulate the grain along its own antialiased boundary and
draw a 1px ring at the shot's edge — the exact artefact Task 1 spent two rounds
removing. The trade is that grain no longer sits over the shadow; the shadow is
a low-alpha wash over an already-grained ground, so the grain still shows
through it, just unmodulated by it.

**The white edge, and why it is not a stroke at all.** `paintWeb` clipped to a
rounded rect and filled the body with a `fillRect` covering that whole clip.

> **In Chromium, a `fillRect` that COVERS its clip is rasterised against the
> clip mask's rounded-out device bounds, not its own rectangle.** For an
> antialiased non-rectangular clip those bounds overshoot the path by a
> constant **+4px on the right and bottom** — independent of the radius, absent
> on the left and top, and absent at radius 0. Only a covering fill triggers
> it: a rect inside the clip is exact, `fill()` of a path is exact, `drawImage`
> is exact, and intersecting an exact `rect()` clip does not help.

That painted the body colour — `#ffffff` — as a 4px band down the right edge
and 6px along the bottom, with a bottom-right corner whose leaked curve no
longer matched the shot's radius. Invisible on a pale screenshot; glaring on a
dark one. Both of Rock's sentences describe it. Before/after at 10x:
`docs/2026-09-02-task-4b-clip-leak.png`.

Every rounded body/screen fill now goes through one helper, `fillRoundRect`,
which fills the path. Five sites: `paintWeb`, `paintWebChrome`,
`paintDeviceBody`, `paintPhoneChrome`, `paintPhone`. The measurements that
establish the +4 are in that helper's doc comment and in the verification doc.

**Two things worth carrying forward.**

- **A guard that renders under `@napi-rs/canvas` is blind to Chromium's
  rasteriser.** This is the same shape as Task 3b's "a guard that reads token
  values is blind to `opacity`", and the same shape as the shadow alphas that
  were once retuned against Node while the browser would have shipped something
  65 levels off. `test/render-clip-safety.test.js` therefore asserts the
  *structure* that makes the bug unreachable — no `fillRect` inside a
  `ctx.clip()` block, and all five painters routed through `fillRoundRect` — and
  states its own limit: the scan is lexical, so a covering `fillRect` reached
  only at runtime across a call boundary would slip past it.
- **Filling the path fixed a light halo in Node too.** The body's boundary
  pixel used to take its coverage from the clip mask; it now takes it from the
  fill. On the phone frame at `box.x = 62.4` (60% coverage) the edge pixel went
  from `160,162,168` to `113,114,119` against an ideal blend of ~103. Every
  shot has carried a light 1px halo on all four edges until now.

Goldens: all ten regenerated. The change was attributed before regenerating by
composing each case against the pre-fix and post-fix cores — the clip fix is
~5,100 pixels per case (the shot's perimeter), everything else is the grain
move. `test/compose.test.js`'s url-discrimination measurement moved from
0.00201 to 0.000816 (still ~80x its pass threshold) because grain over the URL
text used to defeat `pixelmatch`'s antialias heuristic; the threshold and the
recorded number were updated together, with that reasoning in the test.

**Files:** `core/index.js`, `core/render.js`, `test/render-grain-scope.test.js`
(new), `test/render-clip-safety.test.js` (new), `test/compose.test.js`, the ten
render goldens, `docs/verification-2026-09-01.md`,
`docs/2026-09-02-task-4b-clip-leak.png` (new).


---

### Task 4c: the white screen fill, and the halo it was only half of

Written after Task 4b shipped and Rock sent corner zooms: a light line on
**all four edges**, following the rounded corner, on an **opaque** dark
screenshot. The third report of the same symptom. Task 1 removed an
unconditional hairline and Task 4b fixed a real Chromium clip leak; both were
genuine, neither was this.

Measured, `frame: none`, flat `#1e1e1e` source on a ~179 ground:

```
inside: 30   boundary pixel: 159   ground: 179     an honest blend is ~104
```

**Two causes, and the smaller one is the one that had a name.** The white
fill — `paintWeb` filling the box with `--screen-bg` before drawing the
picture — was worth about **7 of those 55 levels**. Deleting it and putting
the ground behind instead moved the boundary from 168 to 162 and left the
line exactly where it was. The other 49 levels are this:

> **A clip mask is antialiased, and so are the edges of the rectangle
> `drawImage` is asked to fill. When they coincide, the two coverages
> MULTIPLY.** A boundary pixel the geometry puts 60% inside the box got the
> screenshot at 0.6 x 0.6 = 0.36 and kept the backing colour for the other
> 0.64. Every shot has had a one-pixel ring of whatever was behind it,
> worst at the corners where coverage is most partial. `@napi-rs/canvas` is
> additionally inconsistent about which edges it antialiases at all: a dest
> rect at `y = 60.5` painted **nothing** into row 60, and one ending at
> `x = 150.4` nothing into column 150, while the opposite two edges blended
> correctly. That is why the top edge measured 249 against a ground of 243 —
> pure fill, no screenshot in that row whatsoever.

Both halves had to go, because each is enough on its own. The fix is not to
model the rasteriser but to stop asking it the question: the screenshot's
destination rect is **snapped outward onto the device pixel grid**
(`SNAP_TO_PIXELS`, `drawFitted`), so it has no partial coverage of its own
and the clip is the only mask on the boundary pixel — in any engine, with no
engine detection. Before and after, per edge, against an ideal computed from
the rasteriser's own coverage and a transparent-source render of the same
scene:

| | left | right | top | bottom | corner (mean) |
|---|---|---|---|---|---|
| `frame: none` before | +51.6 | +50.0 | +109.9 | +52.9 | +23.4 |
| `frame: none` after | +0.2 | +0.4 | −0.0 | −0.5 | +0.37, worst 1.2 |
| `phone` screen before | +30.1 | +30.7 | +21.2 | +21.2 | worst pixel 31.7 |
| `phone` screen after | +1.0 | −0.0 | −1.9 | −1.9 | +0.40, worst 1.3 |

**Black did not replace white.** `paintShadow` casts from an opaque black
rounded rect, so simply deleting the fill exposes *that* through the same
partial coverage, and through any transparent pixel in the source. Which
backing is correct turned out to be per painter, and getting it wrong is the
same bug in a new colour:

- **`paintWeb` and `paintWebChrome` are backed by the ground**, re-painted
  over the shadow's caster inside the shot's own path. `paintGround` gained
  an optional `area`; `paintWeb`/`paintWebChrome` gained a `stops` argument
  (`composeWithMeta` passes `meta.ground`). The browser frame's `fBodyBg`
  went with the white — it was white in the light theme and `#101114` in the
  dark one, and since the bar covers its whole strip and the screenshot
  covers everything below, the *only* thing it ever did was leak at the edge.
- **`paintPhoneChrome` and `paintPhone` are backed by the device**, and
  deliberately not by the ground. `paintDeviceBody` has already filled the
  bezel across the screen area. Backing the screen with the ground instead
  was measured: **+52 levels** of light halo inside the bezel.

Three things worth carrying forward.

- **The area-restricted ground fills a path; it does not clip.** A `clip()`
  plus a covering `fillRect` is exactly Task 4b's Chromium overshoot, and
  `paintGround`'s own fills cover the canvas. `fillArea` fills the rounded
  path instead. The elliptical corner radials still work because **a path is
  transformed as it is traced and a gradient when it is painted** — trace the
  area under the identity CTM, then scale, then fill.
- **The bar is painted after the screenshot now.** Their edges are the same
  line; painting the bar last puts an exact `fillRect` edge on that boundary
  instead of `drawImage`'s unreliable one.
- **The goldens did NOT change only at the edges, and that is expected.**
  Snapping redraws the picture on a rect up to one pixel larger per axis, so
  a detailed screenshot is resampled at up to 0.05% off its previous scale —
  7-12% of pixels moved, mean 21 levels, entirely at glyph boundaries. The
  edge fix itself was isolated by re-rendering every case with a **flat**
  source, where resampling cannot change anything: 0.21-0.31% of the canvas,
  and 5,292 of those 5,414 pixels sit at distance 0 from a shot edge. A
  uniform 1px bleed was tried first and costs four times the resampling for
  the same result.

**Tests.** `test/render-edge-blend.test.js` (new) asserts the boundary pixel
against `k * shot + (1 - k) * backdrop` on all four edges and around a corner
for all three frame kinds, with **both terms measured rather than assumed**:
`k` from a render of the same path filled (skia's analytic AA reads 0.502
where the geometry says 0.600, and a test that trusted the ruler would report
a defect that is not there), `backdrop` from re-rendering the identical scene
with a fully transparent source. The browser frame is measured by coverage
instead — its own 1px hairline is painted over the edge pixel and breaks the
blend identity — using two flat sources so everything that is not the
screenshot cancels. A `windowCaptureSource` case (transparent rounded
corners, alpha shadow) asserts the margin reads as ground, neither near-white
nor near-black. **All 18 were run against the pre-fix core and all 18 went
red**, reporting the leaked values above; six tests in this cycle had turned
out incapable of failing, and one draft of the transparency case here made
seven — it sampled 6px inside the corner, which falls *outside* the r=24 arc,
and passed against the very white fill it was written to catch.

`test/render-clip-safety.test.js`'s per-painter list changed shape: the
phone painters no longer fill a backing at all, and the two web painters
reach theirs through `paintGround(ctx, c, stops, area)`. It also gained
Task 4c's structural half — nothing draws an image except `drawFitted`, and
every call asks for `SNAP_TO_PIXELS`. `test/export-scale-fidelity.test.js`
was leaning on the white fill to find the corner arc and now asserts the
fixture premise it actually depends on.

**Files:** `core/render.js`, `core/index.js`,
`test/render-edge-blend.test.js` (new), `test/render-clip-safety.test.js`,
`test/export-scale-fidelity.test.js`, `test/render-screen.test.js`,
`test/render-frames.test.js`, all ten render goldens.


---

### Task 4d: the clip, and why nothing goes behind a shot

Written after Task 4c shipped. The edge numbers were right — within a level
of ideal on every edge and corner — and Rock opened the preview and found two
new things the same day, plus the question that turned out to be the whole
task:

> "1px is cut from the top and left of the screenshot" — as soon as the
> corner radius is above zero. At radius 0 the image is intact.

> "a visible spike where the straight edge meets the corner arc" — without
> zooming.

> "I don't understand why we are rendering anything behind it at all."

**He was right about the third one, and it explains the first two.** Task 4c
snapped the screenshot's destination rect outward so that the clip would be
the only antialiased mask on the boundary pixel. It worked, and it pushed the
drawn rect out far enough to touch the clip for the first time. Two separate
things came out of that, and they are worth keeping separate:

> **The cut is plain clipping, and it is real in both engines.** The snapped
> rect starts at `floor(box.x)` and the clip cuts at `box.x`, so the overhang
> is thrown away: 39% of the source's first row and 30% of its first column,
> the same numbers to three decimals under Chromium and `@napi-rs/canvas`.
> That is why it is a test, not a note.

> **The overshoot and the spike are Chromium's, and are Task 4b's finding
> reaching `drawImage`: a non-rectangular clip is rasterised against
> rounded-out device bounds, not against its path.** On the right and bottom
> the shot covers the boundary pixel completely — 1.000 where the path says
> 0.596 — while the arc still follows the path. Walking the bottom-right
> corner row by row, the shot tracks the arc to within 0.03px for eleven rows
> and then steps **14.0px** off it in one. A straight edge that overshoots by
> a pixel meeting a curve that does not: that is the spike. Skia reproduces
> none of it.

Why Rock saw the cut appear only above radius 0 was not established — a
rectangular clip is the one shape Task 4b measured as exact, which is a
plausible reason and not a demonstrated one.

And the backing existed for exactly one reason. `paintShadow` casts from an
**opaque black rounded rect**, which sits between the ground and the shot and
shows through wherever the shot does not fully cover — the corners and the
antialiased edge. frame.html covered it with a white `--screen-bg` card;
Task 4c covered it with a second pass of the ground. Both leaked, because a
backing can only ever be seen through partial coverage.

**The fix is one rule.** *A shot gets exactly one antialiased edge, and it is
the mask's.* Each shot is composed in its own offscreen canvas
(`placeShot`, through the injected `makeCanvas` — `core/` still creates
nothing), everything in it is drawn **one pixel past** where the shot ends,
the shape is cut once with a `destination-in` fill of the rounded path, and
the finished tile is stamped down at integer coordinates. No clip, no
snapping, no backing:

- `SNAP_TO_PIXELS` is gone and the picture is drawn at its true rect again.
- The bleed is an **edge clamp** — the source's own outermost row and column
  stretched outward under `destination-over` — not a scaled-up second copy.
  Both fix the coverage; only the clamp keeps the boundary pixel's colour,
  because it extends edge pixels instead of resampling the picture off its
  grid (Chromium: 218,90,218 clamped, 172,136,172 scaled, against a row that
  is 218,90,218). `destination-over` is what keeps it to the ring, so a
  window capture's transparent corners stay transparent.
- **A tile with no clamp is the halo again**, in full: the picture's own edge
  and the mask's multiply, 0.6 x 0.6 = 0.36. Measured, and the reason the
  clamp is not a flourish.
- `paintShadow` clips the box out of itself (even-odd), so the blur still
  spills outward and the opaque caster never lands under the shot. The white
  fill, the ground re-paint, `paintGround`'s `area` parameter and `fillArea`
  are all deleted.
- `SHADOW_SOURCE_INSET` **stays**, for a new reason: at inset 0 the caster's
  path and the clip's boundary would be the same rounded rect, both
  antialiased, and the boundary pixel would get black at `k(1-k)` — a dark
  ring instead of a light one.
- The phone keeps its device body. That is drawn content, not a backing
  hiding a caster: what is behind a phone's screen is the phone, and Task 4c
  measured the alternative at +52 levels of halo inside the bezel. It is a
  path fill, so its own edge against the ground is already single.

Before and after, measured in Chrome on the app's own `frame: none` geometry:

| | left | right | top | bottom | corner (worst step) |
|---|---|---|---|---|---|
| path coverage | 0.600 | 0.596 | 0.502 | 0.502 | — |
| Task 4c | 0.600 | **1.000** | 0.500 | **1.000** | **1.234px** |
| Task 4d | 0.600 | 0.594 | 0.500 | 0.500 | 0.012px |
| source row/column kept | 70% | — | 61% | — | (4c) |
| source row/column kept | 98% | — | 98% | — | (4d) |

**Four things worth carrying forward.**

- **A `destination-in` fill under a `translate` is culled against the
  UNTRANSFORMED canvas bounds in `@napi-rs/canvas`, and a culled
  `destination-in` clears the whole surface.** The obvious way to write
  `placeShot` — translate the tile and let painters keep working in canvas
  coordinates — therefore rendered phones with no screenshot in them at all
  whenever the phone sat past x = 512. The goldens caught it. The tile
  carries no transform; painters get an `at(rect)` shifter instead.
- **Tile bitmaps are allocated on a 64px grid (`TILE_QUANTUM`).** Nothing
  about the render changes — the extra strip is transparent and the mask
  clears it — but `makeCanvas` implementations are entitled to pool by size,
  and `web/state.js` does. Sized to the exact box, a padding drag would mint
  and keep a new multi-megabyte canvas every frame; quantised, the whole
  sweep asks for eight sizes.
- **The cost is a browser number and a Node number and they disagree.**
  Chromium: 74.8ms → 71.1ms for the standard web case — slightly *faster*,
  because both are dominated by the shadow blurs and the shadow now has the
  box clipped out of it. `@napi-rs/canvas`: 3.7ms → 26.3ms, almost all of it
  the tile blit (an empty 1728x1088 tile costs 4.7ms to draw there). That is
  the CLI's and the suite's bill, not a user's; the full suite went from
  31.1s to 29.4s.
- **The corner-continuity assertion cannot fail in Node, and it is in the
  suite anyway.** Same shape as Task 4b: skia reads 0.031px worst error on
  the pre-fix core where Chromium reads 2.939px against a 0.35px tolerance.
  It was confirmed red the one way it can be, in Chrome, and the structural
  guard — *nothing is drawn inside a clip* — is what actually holds the line.
  The content-preservation assertions are not like that: all six went red in
  Node, reporting 0.714 of 1.163 destination pixels at the top edge.

**Goldens: all ten regenerated, and the point of the number is which way it
moved.** Against the Task 4c goldens, 2.8-11.7% of pixels change — that is
4c's resampling churn being *undone*. Against the goldens from **before** 4c,
which is where the picture's own grid came from, 0.22-0.35% change, 75-97% of
them on a shot's edge or corner arc, and the rest is 1 level of rounding over
at most 0.08% of the canvas. The picture is back where it was; only its edge
moved.

**Files:** `core/render.js`, `core/index.js`, `web/state.js` (one comment),
`test/render-edge-blend.test.js`, `test/render-clip-safety.test.js`,
`test/render-frames.test.js`, `test/render-screen.test.js`,
`test/inspector-frame.test.js`, all ten render goldens,
`docs/verification-2026-09-01.md`.


---

### REVERTED — Tasks 5, 5b and 5c (shadow controls)

**Reverted in full on 2026-09-02, at Rock's instruction: "no. you can't do this.
revert the shadow as we had it originally."**

`core/`, `web/`, `test/` and `scripts/` were restored to their Task 4d state
(`3c9a33b`). `paintShadow` is back to its positional signature; `SHADOW_DEFAULTS`,
`phoneShadow`, the four advanced controls, the Advanced disclosure, the softness
floor and the isolated shadow golden are all gone. The Finish section is Padding,
Corner radius, Grain, Shadow — one strength slider, as before.

**Why, honestly.** The rendering work was sound and the default output never
moved. What went wrong was everything around it:

1. **Task 5b shipped a regression that killed the main slider.** Opening Advanced
   caused the panel to seed a shadow block from `SHADOW_DEFAULTS`, which contains
   `scale: 1`, and `normalise`'s "specific beats legacy" rule then made that
   hardcoded 1 outrank the slider's `shadowScale` permanently. It also silently
   reset a chosen strength to 100% while the slider went on displaying the old
   number.
2. **The tests could not have caught it.** They scanned source text for the
   controls' existence rather than driving the setters and asserting the render
   config followed. No DOM was needed to catch this — it was a pure-function bug —
   so the structural approach was a choice, and the wrong one.
3. **Task 5c fixed it properly, and by then the feature had cost more trust than
   it was worth.** Rock had said the shadow was already good; three tasks of churn
   on something that worked is its own answer.

**If this is ever picked up again**, the useful residue is: the isolated
shadow golden (capture before touching, prove the default is byte-identical),
the finding that the softness floor must be measured in Chromium — Node gives a
floor six times too low, the same trap that broke the alphas — and the rule that
a control test must follow the value to what is actually drawn, not to the field
the setter happens to write.

The two design points Rock made stand on their own if it returns: one slider by
default with the rest behind an Advanced disclosure, and Directional before the
Angle it governs.

---

### Task 5 (REVERTED — see above): Parameterised shadow, guarded by an isolated golden

**Files:**
- Modify: `core/presets.js` (add `SHADOW_DEFAULTS`)
- Modify: `core/config.js` (`shadow` block in `normalise`)
- Modify: `core/render.js:319-333` (`paintShadow`) and its four call sites
- Create: `scripts/make-shadow-golden.js`
- Create: `test/golden/shadow/default.png`
- Create: `test/render-shadow.test.js`

**Interfaces:**
- Consumes: Task 4's `normalise` without `fit`/`caption`.
- Produces: `normalise()` returns `shadow: { scale, distance, angle, blur, directional }`. `paintShadow(ctx, box, shadow, a1, a2, canvasH)` — the old positional `spreadY`/`blur`/`scale` are gone. `shadowScale` remains accepted as **input** and folds into `shadow.scale`.

- [ ] **Step 1: Capture today's shadow BEFORE touching anything**

This step must run against the current, unmodified `paintShadow`. Create `scripts/make-shadow-golden.js`:

```js
// The shadow, alone, on a blank canvas, at default settings.
//
// WHY THIS EXISTS: paintShadow's alphas were retuned once against
// @napi-rs/canvas (0.17/0.07 -> 0.40/0.30). Every Node test stayed green
// while the browser would have shipped a shadow ~65 RGB levels too dark.
// frame.html, the original reference, is now deleted. Every whole-shot
// golden changes during Cycle A for unrelated reasons, so a shadow
// regression could hide inside a legitimate diff. This golden cannot:
// nothing else is drawn in it.
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'node:fs';
import { paintShadow } from '../core/render.js';

mkdirSync('test/golden/shadow', { recursive: true });

const W = 1800, H = 1200;
const cv = createCanvas(W, H);
const ctx = cv.getContext('2d');
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, W, H);

const box = { x: 300, y: 220, w: 1200, h: 760, radius: 24 };
paintShadow(ctx, box, H * 0.040, H * 0.105, 0.17, 0.07, 1);

writeFileSync('test/golden/shadow/default.png', cv.toBuffer('image/png'));
console.log('wrote test/golden/shadow/default.png');
```

Run: `node scripts/make-shadow-golden.js`

- [ ] **Step 2: Write the guard test**

Create `test/render-shadow.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import pixelmatch from 'pixelmatch';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { normalise } from '../core/config.js';
import { paintShadow } from '../core/render.js';

const W = 1800, H = 1200;
const BOX = { x: 300, y: 220, w: 1200, h: 760, radius: 24 };

function render(shadow) {
  const cv = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  paintShadow(ctx, BOX, shadow, 0.17, 0.07, H);
  return ctx;
}

function diffAgainstGolden(ctx) {
  const golden = PNG.sync.read(readFileSync('test/golden/shadow/default.png'));
  const actual = ctx.getImageData(0, 0, W, H);
  return pixelmatch(golden.data, Buffer.from(actual.data), null, W, H, { threshold: 0 });
}

describe('shadow defaults are frozen', () => {
  it('reproduces the pre-refactor shadow exactly', () => {
    const c = normalise({});
    expect(diffAgainstGolden(render(c.shadow))).toBe(0);
  });

  it('the golden actually discriminates — a nudged distance fails it', () => {
    const c = normalise({});
    const nudged = { ...c.shadow, distance: c.shadow.distance * 1.1 };
    expect(diffAgainstGolden(render(nudged))).toBeGreaterThan(0);
  });

  it('the golden catches an alpha change', () => {
    const cv = createCanvas(W, H);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    paintShadow(ctx, BOX, normalise({}).shadow, 0.20, 0.07, H);
    expect(diffAgainstGolden(ctx)).toBeGreaterThan(0);
  });
});
```

**Do not add a dependency.** `core/` has zero runtime dependencies and this
round adds none to the test side either. Before writing the test, open
`test/compose.test.js` and use the exact golden-comparison technique already
there — read the PNG, get its pixels, and `pixelmatch` against the live
render. Replace the `pngjs` import above with that technique; it is written
here only to show the shape of the three assertions, which are the part that
matters.

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run test/render-shadow.test.js`
Expected: FAIL — `normalise({}).shadow` is undefined and `paintShadow`'s signature does not accept it yet.

- [ ] **Step 4: Add the config block**

In `core/presets.js`:

```js
// Shadow parameters. `distance` and `blur` are fractions of the canvas
// HEIGHT — they are exactly the `c.h * 0.040` and `c.h * 0.105` that were
// hard-coded at paintShadow's four call sites, moved into config without
// changing value. `angle` is degrees clockwise from the positive x-axis, so
// 90 is straight down, which is what a non-directional shadow already did.
export const SHADOW_DEFAULTS = {
  scale: 1,
  distance: 0.040,
  angle: 90,
  blur: 0.105,
  directional: false,
};

export const SHADOW_DISTANCE_RANGE = [0, 0.20];
export const SHADOW_BLUR_RANGE = [0, 0.40];
```

In `core/config.js`, replace the `shadowScale:` field with:

```js
    shadow: (() => {
      const s = input.shadow || {};
      // `shadowScale` at the top level is still honoured: it was the only
      // shadow input before this task, and Task 6b's clamp semantics are
      // preserved exactly (out-of-range values clamp, non-numbers fall back).
      const scaleIn = s.scale !== undefined ? s.scale : input.shadowScale;
      return {
        scale: Math.min(
          SHADOW_SCALE_RANGE[1],
          Math.max(SHADOW_SCALE_RANGE[0], num(scaleIn, SHADOW_DEFAULTS.scale)),
        ),
        distance: Math.min(
          SHADOW_DISTANCE_RANGE[1],
          Math.max(SHADOW_DISTANCE_RANGE[0], num(s.distance, SHADOW_DEFAULTS.distance)),
        ),
        angle: (() => {
          const a = num(s.angle, SHADOW_DEFAULTS.angle);
          return ((a % 360) + 360) % 360;
        })(),
        blur: Math.min(
          SHADOW_BLUR_RANGE[1],
          Math.max(SHADOW_BLUR_RANGE[0], num(s.blur, SHADOW_DEFAULTS.blur)),
        ),
        directional: s.directional === true,
      };
    })(),
```

- [ ] **Step 5: Rewrite `paintShadow`**

```js
/**
 * DO NOT RETUNE THE ALPHAS PASSED IN HERE. 0.17/0.07 for web and browser,
 * 0.22/0.10 for phones. A prior pass retuned them to 0.40/0.30 against
 * @napi-rs/canvas — every Node test stayed green while the browser, the
 * actual product, would have shipped a shadow ~65 RGB levels too dark.
 * frame.html is deleted; these cannot be re-derived. test/render-shadow.test.js
 * freezes the default output against test/golden/shadow/default.png.
 *
 * `shadow` is the config block: { scale, distance, angle, blur, directional }.
 * `distance` and `blur` are fractions of `canvasH`.
 */
export function paintShadow(ctx, box, shadow, a1, a2, canvasH) {
  const spread = canvasH * shadow.distance;
  const blur = canvasH * shadow.blur;

  // Non-directional keeps the original construction exactly: both layers
  // offset straight down, which is angle 90.
  const rad = (shadow.angle * Math.PI) / 180;
  const ox = shadow.directional ? Math.cos(rad) : 0;
  const oy = shadow.directional ? Math.sin(rad) : 1;

  for (const [dist, b, baseAlpha] of [[spread, blur, a1], [spread * 0.28, blur * 0.3, a2]]) {
    const a = Math.min(1, Math.max(0, baseAlpha * shadow.scale));
    ctx.save();
    ctx.shadowColor = `rgba(${SHADOW_RGB},${a})`;
    ctx.shadowBlur = b;
    ctx.shadowOffsetX = dist * ox;
    ctx.shadowOffsetY = dist * oy;
    ctx.fillStyle = '#000';
    roundRect(ctx, box.x, box.y, box.w, box.h, box.radius);
    ctx.fill();
    ctx.restore();
  }
}
```

Note `ctx.shadowOffsetX` must be set explicitly on both branches — canvas state is saved/restored per layer, but leaving it unset relies on the default being 0, which is true but silent. Setting it is what makes the directional case work at all.

Update the four call sites to `paintShadow(ctx, box, c.shadow, 0.17, 0.07, c.h)` (web and browser) and `paintShadow(ctx, box, c.shadow, 0.22, 0.10, c.h)` (both phone sites), deleting the now-duplicated `c.h * 0.040` / `c.h * 0.105` arguments.

- [ ] **Step 6: Run the guard**

Run: `npx vitest run test/render-shadow.test.js`
Expected: PASS, all three — including both discrimination checks. If "the golden actually discriminates" passes but "reproduces exactly" fails, the refactor changed the default output: fix the refactor, **never** regenerate the golden.

- [ ] **Step 7: Full suite, goldens must not move**

Run: `npx vitest run`

Every whole-shot golden must stay byte-identical: the defaults are unchanged, so the composed output is unchanged. `git status` must show nothing modified under `test/golden/render/`. If one moved, stop and report.

- [ ] **Step 8: Add the shadow controls so this can be previewed**

In the Finish section of the inspector, add four controls bound to
`state.config.shadow`:

- **Distance** — slider over `SHADOW_DISTANCE_RANGE`
- **Angle** — slider 0–360, degrees
- **Blur** — slider over `SHADOW_BLUR_RANGE`
- **Directional** — a toggle bound to `shadow.directional`

Angle only has a visible effect when Directional is on. Leave it enabled and
let that be discoverable — do not disable it, and do not hide it; a control
that vanishes is more confusing than one that waits.

**These controls are deliberately minimal, and Cycle B will replace them.**
That is not wasted work: a render feature with no way to invoke it cannot be
previewed, and a feature Rock cannot test is a feature he cannot approve. Wire
them into the existing inspector following the pattern already in
`web/inspector-frame.js` — a labelled row with a slider or segmented control,
writing to `state.config`, then `scheduleRender()`. Do not invent a new control
idiom; do not restyle anything around them.

Add matching tests to the existing inspector test file, in the style already
there — assert the control writes the value, clamps at both ends, and that
`render()` is scheduled.

- [ ] **Step 9: Commit**

```bash
git add core web scripts test
git commit -m "feat(core): parameterised shadow (distance, angle, blur, directional) with a frozen default golden"
git push origin feat/cycle-a
```

- [ ] **Final step: deploy a preview, hand over the link, and STOP**

The preview is automatic. The Commit step above already pushed to
`feat/cycle-a`, which makes Netlify rebuild PR #1. Wait for both checks:

```bash
gh pr checks 1
```

`test` and `netlify/shotkit-app/deploy-preview` must both be green before you
hand anything over. **A task with red CI is not finished**, however good the
preview looks — fix it, push, and wait again.

Then give Rock the URL — **https://deploy-preview-1--shotkit-app.netlify.app** —
and tell him what to look at:

> Drag each shadow control and watch the shot: **Distance**, **Angle**, **Blur**, and the **Directional** toggle. With Directional off, Angle should do nothing — that is correct, not a bug. Reset should return the shot to exactly the shadow it has today.

**Then stop.** Do not begin the next task. Silence is not approval. If Rock
asks for a change, make it, redeploy, and hand the link back before moving on.


---

### Task 5b: One shadow slider, Advanced behind a disclosure, and a floor under Softness

Written after Task 5 shipped and Rock dragged the four controls:

> "Angle only works when directional is on, so why is it even there before the
> directional toggle? also, I feel like shadow should still be just one slider,
> and the other controls appear only after selecting some sort of 'advanced
> controls' for shadows. also, blur is useless atm... you put it on zero and it
> becomes this weird thing with the 'shadow' being sharp."

then, looking at what zero actually draws:

> "but still weird that we have 2 shadows, no?"

and, clarifying:

> "don't get me wrong, the shadow looks good atm. it just felt wrong on 0blur"

**THE TWO LAYERS ARE NOT A BUG AND ARE NOT RE-ENGINEERED HERE.** `paintShadow`
draws a broad soft layer and a tighter contact layer, inherited from
`frame.html`; that pairing is what makes a shot look seated rather than pasted,
and at every normal softness the two fuse into one shadow. They read as two in
exactly one place — at softness 0, where both collapse into hard-edged
rectangles offset by `distance` and `0.28 * distance`. Putting a floor under
softness closes the "two shadows" report as a side effect of closing the
"sharp" one. The offsets, the alphas and the layer relationship are untouched.

**One slider by default.** Finish shows **Shadow** — the existing strength
slider — and nothing else. Below it sits a collapsed **Advanced shadow
settings** disclosure holding the rest, mirroring the Screen Studio panel Rock
supplied as reference. The toggle is a `button` carrying `aria-expanded` and
`aria-controls`, and the group it names is hidden with the global `[hidden]`
rule — the same disclosure shape the sidebar's "+ Custom size" already uses,
and no second hiding mechanism.

**Directional first, Angle subordinate to it.** Inside Advanced the order is
**Directional**, **Angle**, **Distance**, **Softness**. Angle is indented under
Directional and is **disabled while Directional is off**. Task 5 deliberately
left it enabled, reasoning that a control which vanishes confuses more than one
that waits; Rock's reading is the opposite — a control that moves and does
nothing reads as broken — and he is the user. It stays visible, and its off
state is Task 3b's: `disabled` on the input, which is already one of the
selectors in `style.css`'s single off-state rule, plus that rule extended to the
row so the label dims with it. **No static `opacity` outside `@keyframes`**, as
3b requires.

**Blur becomes Softness, and gets a measured floor.**

For the record: **Shadow Blur is in Rock's own reference.** His Screen Studio
screenshot of Advanced shadow settings lists Directional shadow / Shadow
Distance / Shadow Angle / Shadow Blur, and he has accepted the control. Two
things were still wrong with ours.

- **The name collides.** Screen Studio also has a *Background blur*, which
  blurs a wallpaper and is an unrelated feature (already recorded in the spec
  for Cycle B). Ours is renamed **Softness** in the UI, and the panel's helpers
  with it (`activeShadowSoftnessPercent` / `setShadowSoftnessPercent`). The
  config field stays `shadow.blur`: it is `ctx.shadowBlur`, one for one, and
  renaming a core config key changes `normalise()`'s contract and every
  jobs.json written against it for no gain in what is drawn.
- **Zero gives hard-edged rectangles** — two of them. `SHADOW_BLUR_RANGE`'s
  lower bound goes up.

**How the floor was chosen — measured, not picked.** The artefact is a visible
*edge*: a luminance step big enough to read as a line. The threshold used is
the classic Weber one, **1% of the background — 2.55 of 255 levels per pixel**,
measured on the worst-case white ground, and it coincides with the render's own
8-bit banding (a smooth gradient here steps by 1-2 levels), so "below 2.55" is
also "no sharper than the gradient it sits in".

Measured **in Chromium**, on `paintShadow` alone over white, at the real box
`layout()` produces for each canvas size, with the box's own path plus a 4px
band excluded (the even-odd clip makes that boundary hard by construction, and
the shot is painted over it). Seven canvas sizes x the whole Distance range,
bisecting for the smallest softness whose worst per-pixel step clears 2.55:

```
                        worst-case softness      = shadowBlur px
  twitter-header 1500x500      0.0674                33.7
  twitter-post   1600x900      0.0432                38.8
  16:9           1920x1080     0.0271                29.3
  3:2            1800x1200     0.0311                37.2
  4:3            2000x1500     0.0225                33.8
  instagram      2160x2160     0.0107                23.1
  dribbble       2800x2100     0.0200                42.0
```

The requirement is **a roughly constant number of PIXELS — ~23-42px of
`shadowBlur`, worst case 42.0** — not a constant fraction, because edge
sharpness is a per-pixel property while the parameter is a fraction of the
canvas. The worst case is at *small* Distance (0.01-0.04), where the two layers
still overlap and their slopes add — which is the same fact as the "two
shadows" report, seen from the other side.

No single fraction can therefore hold at every canvas height. The floor is
pinned to the height the shipped default and the frozen golden both live at,
**1200**:

> **`SHADOW_BLUR_RANGE = [0.035, 0.40]`, from 42.0px / 1200.**

At 1200 and above the floor over-delivers (2800x2100 gets 73px where 42 is
needed). Below it the same fraction buys fewer pixels: at 1600x900 the measured
requirement is 0.043 and the floor gives 31.5px, so the worst step there is 3
levels (1.2%) rather than 2 — marginal, and nothing like the 40-level step at
softness 0. That residual is a canvas-size policy question, not a rendering
one.

**Do the two layers stay fused at the floor?** Yes, measured. The averaged
bottom-edge profile's derivative at softness 0, 1800x1200, Distance 0.04, has
two clean bumps — **13.67 levels/px at the direct layer's edge and 5.00 at the
contact layer's, 34 rows apart**. At 0.035 the largest bump anywhere in that
profile is 1.67 levels/px, inside the 8-bit banding, with no pair standing above
it — at every Distance from 0.01 to 0.20, at both 1800x1200 and 2800x2100. The
contact layer is what binds the floor, incidentally: it carries 41% of the
direct layer's alpha through 30% of its blur, so it is the sharper of the two.

**MEASURE THIS IN CHROMIUM OR DO NOT MEASURE IT.** `@napi-rs/canvas` renders
the same `shadowBlur` far fainter, and the same probe run under Node clears the
threshold at **softness 0.005** — a floor six times too low. At softness 0 the
two engines agree exactly (21 levels), because there is no blur to disagree
about. This is the third instance of the pattern already recorded against Task
3b ("a guard that reads token values is blind to `opacity`") and Task 4b ("a
guard that renders under `@napi-rs/canvas` is blind to Chromium's rasteriser"),
and it is the same trap that once let the alphas be retuned to 0.40/0.30 with
every Node test green.

**The default does not move.** 0.105 is well above the floor, so
`normalise({})` is unchanged, `test/golden/shadow/default.png` and all ten
whole-shot goldens stay byte-identical, and every existing test keeps passing.
The only config that changes is one that asked for a softness below 0.035, which
previously produced the sharp shape this task exists to remove.

**Tests.** `test/config.test.js` gains the clamp (`{shadow:{blur:0}}` comes back
at the floor, and the floor is above zero); `test/inspector-frame.test.js` gains
the disclosure (exists, collapsed by default, contains all four advanced
controls, in the Directional/Angle/Distance/Softness order) and the Angle gate
(`shadowAngleDisabled` false only while Directional is on, and the sync function
actually applies it). Every new assertion was run against the pre-change code
first and confirmed red — eight tests in this cycle have turned out incapable of
failing, and the source-scanning ones in this file are exactly the shape that
happens to.

**Files:** `core/presets.js`, `web/inspector-frame.js`, `web/style.css`,
`web/index.html` (no change — the section is built in JS), `test/config.test.js`,
`test/inspector-frame.test.js`, `test/contrast.test.js`, and the spec's shadow
section.


---

### Task 5c: One source of truth for shadow strength

A **regression**, reported by Rock the moment Task 5b's preview went up:

> "the shadow control now only works until I open the advanced settings, then
> the slider doesn't do absolutely anything anymore."

and, on what he expects instead:

> "shadow controls the shadow amount, which I suppose is what we had before — a
> pre baked combination of distance, angle and softness, PLUS the strength (or
> opacity maybe?)" ... "now when the other options appear, the main shadow
> slider STILL controls strength/opacity"

**The design is right and does not change here.** Shadow = strength, Advanced
holds the four shape controls, and the layout Task 5b shipped is untouched.
Nothing in `core/render.js` is touched either. This task fixes one thing: the
strength had **two writable homes**, and opening Advanced moved the render onto
the wrong one.

**The reproduction — pure functions, no DOM.** `{ ...DEFAULTS }` is exactly
what `web/state.js` seeds `state.config` with:

```
A. after Shadow=40%   -> config.shadowScale = 0.4 | config.shadow = undefined
                       | normalise().shadow.scale = 0.4 | slider reads 40%
B. after Distance=6%  -> config.shadow = {"scale":1,"distance":0.06,...}
C. after Shadow=180%  -> config.shadowScale = 1.8
                       | normalise().shadow.scale = 1      <-- ignored
                       | slider reads 180%
D. after Shadow=0%    -> config.shadowScale = 0
                       | normalise().shadow.scale = 1      <-- ignored
                       | slider reads 0%
```

**The chain, confirmed:**

- `web/inspector-frame.js`'s `writableShadow(config)` seeded a missing block
  with `config.shadow = { ...SHADOW_DEFAULTS }`.
- `SHADOW_DEFAULTS` (`core/presets.js`) includes **`scale: 1`**.
- `normalise` resolves the strength as
  `s.scale !== undefined ? s.scale : input.shadowScale` — "an explicit
  `shadow.scale` wins over it, the specific beats the legacy".
- The main Shadow slider wrote `config.shadowScale` (`setShadowPercent`).

So the first touch of **any** Advanced control manufactured an "explicit"
`shadow.scale` of 1 which then permanently outranked `shadowScale`. Line B is
the second half of the same bug, and Rock did not report it only because it is
quieter: that first touch also *silently reset* a chosen 40% strength back to
100% while the slider went on showing 40%.

**The precedence rule stays.** The bug is that the app accidentally created a
specific value, not that the rule is wrong.

**The fix: the panel writes `shadow.scale`, and reads through `normalise()`.**

- `setShadowPercent` writes `writableShadow(config).scale`. `shadowScale`
  survives only as a legacy **input** to `normalise` — accepted from a
  jobs.json or the shipped CLI, folded into `shadow.scale`, never written by
  the app again.
- `readShadow(config)` becomes `normalise(config || {}).shadow` — the same
  function `core/render.js`'s config goes through — so a displayed value
  cannot disagree with a drawn one. This also closes two smaller read/write
  disagreements the spread had: it ignored a legacy `shadowScale` (a jobs.json
  carrying one read back as 100%), and it displayed unclamped/unwrapped values
  `normalise` would then move (distance 50% shown, 20% drawn).
- `writableShadow` seeds from that **resolved** block rather than from
  `SHADOW_DEFAULTS`, which buys a property worth stating: **seeding is
  render-neutral** — `normalise(config)` is identical either side of the seed,
  for every field, because the block written is by definition the one
  `normalise` would have produced. That is the general form of this bug, closed
  for all five controls rather than just for `scale`.
- `core/config.js`'s top-level `shadowScale` **output** becomes
  `shadow.scale` — one resolution, one clamp, mirrored — instead of a second,
  independent resolution that could report a different number from the one
  drawn. Every legacy input still lands where it did.

**Why this over "stop seeding `scale`".** Not seeding `scale` also fixes the
reported symptom, but leaves the strength with two writable homes and the class
of bug intact: any later code that writes a whole `shadow` block — a preset, a
reset, a jobs.json round trip — reinstates it, and a reader who notices the
deliberately-missing key is likely to "fix" it back. Writing one field leaves
the smaller surface.

**Tests — behavioural, and this is the part that matters.** Task 5b's tests for
this panel were **structural**: they scanned `web/inspector-frame.js`'s own
source text for the controls' existence. They prove a slider is built, never
that moving it changes what is drawn, and they could not have caught this.
There is no excuse for a structural test here — every setter is a pure function
over a config object and `normalise` is pure, so **no DOM is required**.

`test/inspector-frame.test.js` gains a Task 5c suite that drives the setters as
a user drives the panel, asserting both the value the renderer will use
(`normalise(config).shadow`, literally what `core/render.js` reads) and the
value the slider will show:

- the regression sequence itself — set strength, touch Distance, set strength
  again, assert the render followed;
- strength still reaching 0 after Advanced has been opened;
- touching any one control changes **only** that control's field in the
  normalised block (the seeding-neutrality property, asserted directly);
- the general round trip **for every control** — set it, touch every sibling,
  set it again, assert the render follows and the readback agrees;
- a legacy top-level `shadowScale` surviving the first Advanced touch;
- `normalise()` reporting the same strength in both of its shadow fields, with
  Advanced open — where they diverged.

The four Task 6b tests that asserted `config.shadowScale` after
`setShadowPercent` are rewritten to assert through `normalise()`. That they
stayed green throughout the regression is the point: they tested the field the
slider happened to write, not that the write reached the canvas.

**Run them against the broken code first.** Six of the ten new assertions fail
before the fix; the four that pass are the sibling round trips for Distance,
Softness, Angle and Directional — those controls did not have the bug, and the
tests are still worth having because they are what makes the guarantee general.
A control that silently stops responding is the exact failure mode this cycle
has now shipped once.

**Verify it in the browser, by driving it.** Not "it looks fine" — load the
preview, drop an image, move Shadow and read the canvas pixels; open Advanced;
move Shadow again and confirm the pixels **still** move; move each Advanced
control and confirm each does something; close Advanced and move Shadow again.

**Nothing may move.** `test/golden/shadow/default.png` and all ten render
goldens stay **byte-identical** — the defaults are unchanged and no painter is
touched.

**Files:** `core/config.js`, `web/inspector-frame.js`,
`test/inspector-frame.test.js`. Not `core/render.js`, not `core/presets.js`,
not the alphas, not `web/style.css`, not the panel's layout.


---

### Task 6: Frames become outsets; padding gives way, not the picture

**Files:**
- Modify: `core/presets.js` (add `MIN_MARGIN_RATIO`)
- Modify: `core/layout.js` (delete `frameRatio`, rewrite `webBox` and `chromeFor`)
- Test: `test/layout.test.js`
- Regenerate: the framed goldens

**Interfaces:**
- Consumes: Task 4's `webBox` with no fit branch.
- Produces: `webBox` returns the **outer composite** box with `chrome.screen` as the interior. `layout().web.w/h` is now the composite, not the screenshot. `frameRatio` no longer exists. `frameInsets(c, screenW)` is introduced here — **Task 7 extends it to `frameInsets(c, screenW, shorterSide)`** and adds a `stroke` field to its return value, so write it as a small function that is cheap to extend rather than inlining it. Task 8 changes `BROWSER_BAR_RATIO`, which must flow through this with no further layout edits.

- [ ] **Step 1: Write the failing tests**

Add to `test/layout.test.js`. Add `MIN_MARGIN_RATIO` to the file's existing
import from `../core/presets.js` — the last test below reads it directly
rather than restating `0.02`, so a change to the constant cannot silently
invalidate the guard:

```js
const SRC = 1440 / 900;

describe('frames grow outward', () => {
  it('the interior keeps the source ratio exactly', () => {
    for (const frameKind of ['none', 'browser', 'phone']) {
      const c = normalise({ layout: 'web', ratio: '3:2', frameKind });
      const lay = layout(c, { web: SRC, mobile: [] });
      const screen = lay.web.chrome ? lay.web.chrome.screen : lay.web;
      expect(screen.w / screen.h, frameKind).toBeCloseTo(SRC, 12);
    }
  });

  it('turning on a browser frame does not shrink the screenshot', () => {
    const bare = normalise({ layout: 'web', ratio: '3:2', frameKind: 'none' });
    const framed = normalise({ layout: 'web', ratio: '3:2', frameKind: 'browser' });
    const a = layout(bare, { web: SRC, mobile: [] }).web;
    const b = layout(framed, { web: SRC, mobile: [] }).web.chrome.screen;
    expect(b.w).toBeCloseTo(a.w, 6);
    expect(b.h).toBeCloseTo(a.h, 6);
  });

  it('the composite grows outward instead — it is taller than the bare screen', () => {
    const framed = normalise({ layout: 'web', ratio: '3:2', frameKind: 'browser' });
    const lay = layout(framed, { web: SRC, mobile: [] });
    expect(lay.web.h).toBeGreaterThan(lay.web.chrome.screen.h);
    expect(lay.web.y).toBeLessThan(lay.web.chrome.screen.y);
  });

  it('never exceeds the canvas less the minimum margin', () => {
    // A deliberately extreme case: a phone frame on a very tall source, where
    // the composite would otherwise run off the canvas.
    const c = normalise({ layout: 'web', ratio: '1:1', frameKind: 'phone', pad: 0.005 });
    const lay = layout(c, { web: 0.3, mobile: [] });
    const m = MIN_MARGIN_RATIO * Math.min(c.w, c.h);
    expect(lay.web.x).toBeGreaterThanOrEqual(m - 1e-9);
    expect(lay.web.y).toBeGreaterThanOrEqual(m - 1e-9);
    expect(lay.web.x + lay.web.w).toBeLessThanOrEqual(c.w - m + 1e-9);
    expect(lay.web.y + lay.web.h).toBeLessThanOrEqual(c.h - m + 1e-9);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run test/layout.test.js -t 'frames grow outward'`
Expected: the first test PASSES (the old `frameRatio` maths already guaranteed it — that is the property being preserved, not introduced), and the other three FAIL.

If the first test fails too, stop: `frameRatio` is not doing what the comments claim and that must be understood before it is deleted.

- [ ] **Step 3: Add the minimum margin**

In `core/presets.js`:

```js
// The composite (screenshot + chrome + stroke) grows OUTWARD from the
// screenshot and is allowed to consume the safe area's padding — that is
// what makes turning on a frame leave the screenshot's size alone. This is
// the floor it may not cross: a fraction of the shorter canvas side, kept
// as breathing room at the canvas edge.
export const MIN_MARGIN_RATIO = 0.02;
```

- [ ] **Step 4: Rewrite `webBox`**

Delete `frameRatio` entirely. Replace `webBox` and adapt `chromeFor`:

```js
// Outset thickness contributed by the frame, in units of the SCREEN width.
// Browser: a bar above. Phone: a bezel all round.
function frameInsets(c, screenW) {
  if (c.frameKind === 'none') return { top: 0, right: 0, bottom: 0, left: 0 };
  if (c.frameKind === 'phone') {
    const bezel = Math.max(PHONE_BEZEL_MIN, screenW * PHONE_BEZEL_RATIO);
    return { top: bezel, right: bezel, bottom: bezel, left: bezel };
  }
  return { top: screenW * BROWSER_BAR_RATIO, right: 0, bottom: 0, left: 0 };
}

function webBox(c, box, ratio) {
  // 1. The screenshot's own box: its ratio is the SOURCE ratio, fitted to the
  //    safe area. This is the size the screenshot keeps — nothing below
  //    changes it.
  let sw, sh;
  if (ratio > box.w / box.h) { sw = box.w; sh = box.w / ratio; }
  else                       { sh = box.h; sw = box.h * ratio; }

  // 2. Grow outward. The composite eats into the padding rather than into
  //    the picture — see the spec's "frames and strokes are outsets".
  const ins = frameInsets(c, sw);
  let ow = sw + ins.left + ins.right;
  let oh = sh + ins.top + ins.bottom;

  // 3. Floor: never past the canvas less MIN_MARGIN_RATIO. Only then does
  //    the whole composite (screenshot included) scale down, uniformly.
  const m = MIN_MARGIN_RATIO * Math.min(c.w, c.h);
  const maxW = c.w - m * 2;
  const maxH = c.h - m * 2;
  const shrink = Math.min(1, maxW / ow, maxH / oh);
  ow *= shrink; oh *= shrink; sw *= shrink; sh *= shrink;
  const s = {
    top: ins.top * shrink, right: ins.right * shrink,
    bottom: ins.bottom * shrink, left: ins.left * shrink,
  };

  // 4. Centre the composite on the canvas.
  const x = (c.w - ow) / 2;
  const y = (c.h - oh) / 2;

  const web = { x, y, w: ow, h: oh, radius: c.radius };
  web.chrome = chromeFor(c, web, s, sw, sh);
  return web;
}
```

And `chromeFor` becomes a consumer of the already-computed insets rather than a re-deriver:

```js
function chromeFor(c, web, ins, screenW, screenH) {
  if (c.frameKind === 'none') return null;
  const radius = c.frameKind === 'phone'
    ? web.w * PHONE_RADIUS_RATIO
    : web.w * BROWSER_RADIUS_RATIO;
  const frame = c.frameKind === 'phone' ? ins.left : 0;
  return {
    kind: c.frameKind,
    barH: ins.top,
    frame,
    radius,
    innerRadius: Math.max(0, radius - frame),
    screen: {
      x: web.x + ins.left,
      y: web.y + ins.top,
      w: screenW,
      h: screenH,
    },
  };
}
```

`screen.w`/`screen.h` are now carried through from step 1 rather than derived by subtraction, which is why the ratio cannot drift.

- [ ] **Step 5: Run and watch them pass**

Run: `npx vitest run test/layout.test.js`
Expected: all four PASS. Then `npx vitest run` — expect failures in `render-frames.test.js` and the golden diff, both legitimate: the framed geometry has genuinely changed. Fix any test that asserted the *old* derivation; do not weaken a test that asserts the interior ratio.

- [ ] **Step 6: Regenerate goldens and look at the result**

```bash
node scripts/make-render-goldens.js
npx vitest run
```

`browser-dark`, `browser-light`, `browser-url`, `square-browser` and `phone` will change. `web`, `mobile`, `mesh`, `shadow-heavy` must **not** — they set no frame. If they moved, the outset path is leaking into `frameKind: 'none'`.

Then open the dev server, load a screenshot, and toggle Frame between none and browser. The screenshot must stay the same size; the padding around it must visibly shrink. Screenshot both states side by side for the report — this is the item the user asked for and the report should show it, not assert it.

- [ ] **Step 7: Commit**

```bash
git add core test scripts
git commit -m "feat(core): frames grow outward from the screenshot; padding gives way"
git push origin feat/cycle-a
```

- [ ] **Final step: deploy a preview, hand over the link, and STOP**

The preview is automatic. The Commit step above already pushed to
`feat/cycle-a`, which makes Netlify rebuild PR #1. Wait for both checks:

```bash
gh pr checks 1
```

`test` and `netlify/shotkit-app/deploy-preview` must both be green before you
hand anything over. **A task with red CI is not finished**, however good the
preview looks — fix it, push, and wait again.

Then give Rock the URL — **https://deploy-preview-1--shotkit-app.netlify.app** —
and tell him what to look at:

> Load a screenshot and toggle Frame between **None** and **Browser**, then **Phone**. The screenshot itself must stay the same size in all three; the padding around it should visibly shrink to make room. This is the item that motivated the whole cycle — if the screenshot changes size, the task is not done.

**Then stop.** Do not begin the next task. Silence is not approval. If Rock
asks for a change, make it, redeploy, and hand the link back before moving on.


---

### Task 7: Strokes

**Files:**
- Modify: `core/presets.js` (`STROKE_STYLES`, `STROKE_DEFAULTS`, `STROKE_WIDTH_RANGE`)
- Modify: `core/config.js` (`stroke` block)
- Modify: `core/layout.js` (`frameInsets` gains the stroke)
- Modify: `core/render.js` (`paintStroke`, called from `paintWeb`/`paintWebChrome`/`paintPhoneChrome`)
- Modify: `core/index.js` (export `STROKE_STYLES`)
- Modify: `scripts/make-render-goldens.js` (three new cases)
- Test: `test/render-stroke.test.js` (create), `test/layout.test.js`

**Interfaces:**
- Consumes: Task 6's `frameInsets(c, screenW)` and outset accumulation.
- Produces: `normalise()` returns `stroke: { style, width, color }`. `paintStroke(ctx, box, stroke, width)` — `width` is the already-resolved stroke thickness in canvas pixels (`layout()` computed it, including any `shrink`), NOT a ratio and NOT the shorter canvas side. It paints the ring **behind** the composite. Cycle B's inspector reads `STROKE_STYLES`.

- [ ] **Step 1: Write the failing tests**

**Read this before writing them.** Task 1's edge test, as originally planned,
*could not fail*: it sampled 2px inside the box, but a 1px stroke drawn at
`box.x + 0.5` straddles the boundary and only reaches the boundary pixel and
the first fully-interior one. `box.x` is fractional (62.4 at 3:2), so
`Math.round(box.x) + 2` lands on clean fill and the test passed with the border
still present. The tests below sample edges the same way — use the first fully
interior pixel (`Math.ceil(b.x)`, `Math.floor(b.x + b.w) - 1`, and likewise for
y), and after writing each one, **run it against the unfixed code and confirm
it actually goes red**. A green "failing test" is worse than no test.

Create `test/render-stroke.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { normalise } from '../core/config.js';
import { layout } from '../core/layout.js';
import { paintGround, paintWeb } from '../core/render.js';

const GROUND = ['#f7f4ff', '#ece6fb', '#ded3f5'];
const SRC = 1440 / 900;

function px(ctx, x, y) {
  const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
  return [d[0], d[1], d[2]];
}

function scene(overrides) {
  const img = createCanvas(1440, 900);
  const ictx = img.getContext('2d');
  ictx.fillStyle = '#101826';
  ictx.fillRect(0, 0, 1440, 900);

  const c = normalise({ layout: 'web', ratio: '3:2', ...overrides });
  const lay = layout(c, { web: SRC, mobile: [] });
  const cv = createCanvas(c.w, c.h);
  const ctx = cv.getContext('2d');
  paintGround(ctx, c, GROUND);
  paintWeb(ctx, c, lay.web, img);
  return { c, lay, ctx };
}

describe('strokes', () => {
  it('style none paints nothing — output matches a config with no stroke key', () => {
    const a = scene({ stroke: { style: 'none' } });
    const b = scene({});
    const mid = Math.round(a.lay.web.y + a.lay.web.h / 2);
    for (const x of [10, 200, 900, 1600, 1790]) {
      expect(px(a.ctx, x, mid).join()).toBe(px(b.ctx, x, mid).join());
    }
  });

  it('a light stroke puts near-white between the ground and the screenshot', () => {
    const { lay, ctx } = scene({ stroke: { style: 'light', width: 0.02 } });
    const b = lay.web;
    const mid = Math.round(b.y + b.h / 2);
    // 3px inside the composite's left edge is stroke, not screenshot.
    const [r, g, bl] = px(ctx, Math.round(b.x) + 3, mid);
    expect(Math.min(r, g, bl)).toBeGreaterThan(230);
  });

  it('the stroke grows the composite and leaves the screenshot alone', () => {
    const bare = scene({});
    const stroked = scene({ stroke: { style: 'light', width: 0.02 } });
    expect(stroked.lay.web.w).toBeGreaterThan(bare.lay.web.w);
    // With no frame, the interior IS the screenshot box; compare interiors.
    const bareScreen = bare.lay.web;
    const strokedScreen = stroked.lay.web.inner;
    expect(strokedScreen.w).toBeCloseTo(bareScreen.w, 6);
  });

  it('never covers the screenshot: the centre pixel is still the image', () => {
    const { lay, ctx } = scene({ stroke: { style: 'light', width: 0.02 } });
    const [r, g, bl] = px(ctx, lay.web.x + lay.web.w / 2, lay.web.y + lay.web.h / 2);
    expect([r, g, bl]).toEqual([16, 24, 38]);
  });

  it('clamps an absurd width instead of inverting the box', () => {
    const { lay } = scene({ stroke: { style: 'light', width: 99 } });
    expect(lay.web.inner.w).toBeGreaterThan(0);
    expect(lay.web.inner.h).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run test/render-stroke.test.js`
Expected: the first test PASSES (no stroke is today's behaviour); the rest FAIL.

- [ ] **Step 3: Decide the phone body's hairline, and say what you decided**

Task 1's reviewer surfaced this and it lands here. `paintPhone`
(`core/render.js:656`) calls `paintDeviceHairline` (`:580`,
`rgba(255,255,255,0.10)`) **unconditionally**, so every phone mockup carries an
inset white highlight regardless of any stroke setting. That was correctly out
of Task 1's scope — it is the device body's own highlight, not a border on a
bare screenshot — but the spec's `stroke` block is per-element, with `web` and
`mobile` each getting one, so this task cannot ignore it.

Take one of these positions and record it in the task report:

- **Leave it.** It is part of what makes the phone read as a device, like the
  browser frame's `t.border`, and is not an "unrequested border on my
  screenshot". A `mobile` stroke then paints outside it. This is the default
  and needs no code change.
- **Make it opt-in** the way the web hairline just became opt-in, so a phone
  with `stroke.style: 'none'` is genuinely bare.

Do not decide silently, and do not change it without saying so — an unexplained
change to the phone's appearance is exactly the class of surprise this cycle
exists to remove.

- [ ] **Step 4: Add the vocabulary**

In `core/presets.js`:

```js
export const STROKE_STYLES = ['none', 'light', 'glass', 'custom'];

// Width is a fraction of the SHORTER canvas side, like every other
// proportional value here, so a stroke keeps its visual weight across ratios.
export const STROKE_WIDTH_RANGE = [0, 0.06];

export const STROKE_DEFAULTS = { style: 'none', width: 0.008, color: '#ffffff' };
```

In `core/config.js`:

```js
    stroke: (() => {
      const s = input.stroke || {};
      const style = STROKE_STYLES.includes(s.style) ? s.style : STROKE_DEFAULTS.style;
      return {
        style,
        width: Math.min(
          STROKE_WIDTH_RANGE[1],
          Math.max(STROKE_WIDTH_RANGE[0], num(s.width, STROKE_DEFAULTS.width)),
        ),
        color: /^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : STROKE_DEFAULTS.color,
      };
    })(),
```

- [ ] **Step 5: Add the stroke to the outset accumulation**

In `core/layout.js`, `frameInsets` gains the stroke, which wraps everything else:

```js
function frameInsets(c, screenW, shorterSide) {
  const sw = c.stroke.style === 'none' ? 0 : shorterSide * c.stroke.width;
  if (c.frameKind === 'none') {
    return { top: sw, right: sw, bottom: sw, left: sw, stroke: sw };
  }
  if (c.frameKind === 'phone') {
    const bezel = Math.max(PHONE_BEZEL_MIN, screenW * PHONE_BEZEL_RATIO);
    return {
      top: bezel + sw, right: bezel + sw, bottom: bezel + sw, left: bezel + sw,
      stroke: sw,
    };
  }
  return {
    top: screenW * BROWSER_BAR_RATIO + sw, right: sw, bottom: sw, left: sw,
    stroke: sw,
  };
}
```

Call it as `frameInsets(c, sw, Math.min(c.w, c.h))`, scale `stroke` by `shrink` alongside the others, and record the interior on the returned box so the tests above can see it:

```js
  web.inner = {
    x: web.x + s.stroke, y: web.y + s.stroke,
    w: ow - s.stroke * 2, h: oh - s.stroke * 2,
    radius: Math.max(0, c.radius - s.stroke),
  };
  web.strokeWidth = s.stroke;
```

`chromeFor` takes its offsets from `web.inner`, not `web`, so the bar sits inside the stroke.

- [ ] **Step 6: Paint it**

In `core/render.js`:

```js
/**
 * The stroke is a ring painted BEHIND the composite, never inside the clip —
 * so it can grow the shot but can never cover the screenshot. Outer radius is
 * the inner radius plus the width, which keeps the corner concentric.
 */
export function paintStroke(ctx, box, stroke, width) {
  if (stroke.style === 'none' || width <= 0) return;

  ctx.save();
  roundRect(ctx, box.x, box.y, box.w, box.h, box.radius);
  if (stroke.style === 'glass') {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
  } else if (stroke.style === 'custom') {
    ctx.fillStyle = stroke.color;
  } else {
    ctx.fillStyle = '#ffffff';
  }
  ctx.fill();
  ctx.restore();

  if (stroke.style === 'glass') {
    // A faint outer hairline so a translucent mat still reads as an edge
    // against a pale ground.
    ctx.save();
    ctx.strokeStyle = 'rgba(16,18,27,0.06)';
    ctx.lineWidth = 1;
    roundRect(ctx, box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1, box.radius);
    ctx.stroke();
    ctx.restore();
  }
}
```

Call it from `paintWeb` (and from `paintWebChrome`/`paintPhoneChrome`) immediately after `paintShadow` and before the body fill, passing the **outer** box; then paint the body and screenshot into `box.inner`. The shadow already uses the outer box, so a stroked shot casts its shadow from the mat, which is correct.

- [ ] **Step 7: Run and watch them pass**

Run: `npx vitest run test/render-stroke.test.js`
Expected: all five PASS.

- [ ] **Step 8: Add goldens and regenerate**

Add to `scripts/make-render-goldens.js`'s `CASES`, with a comment matching the file's existing style explaining that without them a stubbed `paintStroke` leaves every other golden untouched:

```js
  ['stroke-light', { ratio: '3:2', stroke: { style: 'light', width: 0.02 } }, { web: 'samples/fieldset.png', mobile: [] }],
  ['stroke-glass', { ratio: '3:2', stroke: { style: 'glass', width: 0.02 } }, { web: 'samples/fieldset.png', mobile: [] }],
  ['stroke-browser', { ratio: '3:2', frameKind: 'browser', stroke: { style: 'light', width: 0.015 } }, { web: 'samples/fieldset.png', mobile: [] }],
```

Run: `node scripts/make-render-goldens.js && npx vitest run`

Only the three new files may appear. Every pre-existing golden must be byte-identical — `STROKE_DEFAULTS.style` is `'none'`, so nothing else can move. If one did, the stroke is being applied when it should not be.

- [ ] **Step 9: Add the stroke control so this can be previewed**

In the Finish section of the inspector, add:

- **Stroke** — a segmented control over `STROKE_STYLES` (None / Light / Glass /
  Custom)
- **Width** — a slider over `STROKE_WIDTH_RANGE`, shown only when the style is
  not None
- **Colour** — an `<input type="color">` bound to `stroke.color`, shown only
  when the style is Custom

Use the same show/hide mechanism `web/inspector-frame.js` already uses for the
browser-only rows (`showsBrowserOnlyControls`), and remember the global rule:
`[hidden]` is a single global `display: none !important` — do not add a second
hiding mechanism.

**These controls are deliberately minimal, and Cycle B will replace them.**
That is not wasted work: a render feature with no way to invoke it cannot be
previewed, and a feature Rock cannot test is a feature he cannot approve. Wire
them into the existing inspector following the pattern already in
`web/inspector-frame.js` — a labelled row with a slider or segmented control,
writing to `state.config`, then `scheduleRender()`. Do not invent a new control
idiom; do not restyle anything around them.

Add matching tests to the existing inspector test file, in the style already
there — assert the control writes the value, clamps at both ends, and that
`render()` is scheduled.

- [ ] **Step 10: Commit**

```bash
git add core web test scripts
git commit -m "feat(core): opt-in strokes — light, glass, custom — as outsets"
git push origin feat/cycle-a
```

- [ ] **Final step: deploy a preview, hand over the link, and STOP**

The preview is automatic. The Commit step above already pushed to
`feat/cycle-a`, which makes Netlify rebuild PR #1. Wait for both checks:

```bash
gh pr checks 1
```

`test` and `netlify/shotkit-app/deploy-preview` must both be green before you
hand anything over. **A task with red CI is not finished**, however good the
preview looks — fix it, push, and wait again.

Then give Rock the URL — **https://deploy-preview-1--shotkit-app.netlify.app** —
and tell him what to look at:

> Set Stroke to **Light**, then **Glass**, then **Custom** with a colour, dragging the width slider through its range on each. The mat must grow outward — the screenshot must never get smaller or be covered. Take the width to its maximum and confirm nothing inverts.

**Then stop.** Do not begin the next task. Silence is not approval. If Rock
asks for a change, make it, redeploy, and hand the link back before moving on.


---

### Task 8: Rebuild the browser chrome

**Files:**
- Modify: `core/presets.js` (`BROWSER_BAR_RATIO`, `BROWSER_RADIUS_RATIO`, traffic-light and glyph ratios)
- Modify: `core/render.js:442-526` (`paintChrome`)
- Test: `test/render-frames.test.js`
- Regenerate: the browser goldens

**Interfaces:**
- Consumes: Task 6's outset layout — changing `BROWSER_BAR_RATIO` must flow through `frameInsets` with no further layout edits. Task 7's stroke wraps the frame.
- Produces: no signature change. `paintChrome(ctx, c, box, theme)` keeps its shape; only what it draws and the ratios change.

- [ ] **Step 1: Take the measurements as given — they are already made**

These were measured from the Figma community file *Apple iOS Browser Mockup —
Safari & Chrome*, file key `ashXeowHsiwznytlLbuvuS`, symbol
`Desktop / Safari / Light`, node `1:3179`, via the Figma MCP layer tree. They
are exact layer geometry, not pixel-counted from a raster, so there is nothing
left to re-derive.

The reference is a careful reconstruction of Safari rather than a screenshot of
it, and that is **correct for this purpose**: shotkit draws a stylised browser
for a Dribbble shot, so the idealised form is the right register. A real
screenshot would carry toolbar clutter, extensions and retina artefacts we
would then have to strip back out.

Raw layer geometry, window width 1280:

| Layer | Geometry |
|---|---|
| `toolbar` (1:3181) | 1280 × **53**, at y=0 |
| `Core / Traffic Lights (Big Sur)` (1:3198) | 52 × **12**, at x=**21**, y=20 |
| `URL Form` (4008:386) | **484** × **28**, at x=**398**, y=12 |
| `Body` (1:3180) | 1280 × 731, at y=53 |

Derived, as fractions of the frame width — use these values verbatim:

```
BROWSER_BAR_RATIO     = 53  / 1280 = 0.04140625   // was 10/133 = 0.0752
TRAFFIC_DOT_RATIO     = 12  / 1280 = 0.009375     // dot diameter
TRAFFIC_GAP_RATIO     = 20  / 1280 = 0.015625     // centre-to-centre spacing
TRAFFIC_INSET_RATIO   = 21  / 1280 = 0.01640625   // left edge to first dot's left edge
URL_PILL_WIDTH_RATIO  = 484 / 1280 = 0.378125
URL_PILL_HEIGHT_RATIO = 28  / 1280 = 0.021875
```

Two facts that are not ratios and matter as much:

- **The pill is horizontally centred in the frame.** 398 + 484/2 = 640, and
  640 is exactly half of 1280. Our current pill is not centred; centring it is
  part of this task.
- **Both the dots and the pill are vertically centred in the bar.** Dots:
  20 + 12/2 = 26 against a bar centre of 26.5. Pill: 12 + 28/2 = 26. Treat
  both as centred; do not reproduce the half-pixel.

**Two numbers are NOT settled here and must be obtained before you write code:**

1. **The window corner radius.** `Body` is a rounded rectangle but the layer
   tree does not expose its radius. `BROWSER_RADIUS_RATIO` is currently
   `25/1064 = 0.0235`, which at 1280 would be 30px — visibly larger than the
   reference. Obtain the real value with `get_design_context` on node
   `1:3180` (load the `figma-design-to-code` guidance first, as that tool
   requires), or from any equivalent source, and record where you got it.
2. **The light and dark bar colours.** The existing `CHROME_THEME` table in
   `core/render.js` came from the Backdrop handoff, not from this reference.
   Compare them against the Figma file and report whether they agree. Change
   them only if they visibly disagree — and say so if you do.

If you cannot obtain the corner radius, **stop and report** rather than
guessing or keeping the old value silently. Everything else in this task can
proceed on the table above.

- [ ] **Step 2: Write the failing tests**

Add to `test/render-frames.test.js`:

```js
describe('browser chrome proportions', () => {
  it('the bar is a small fraction of the window width', () => {
    const c = normalise({ layout: 'web', ratio: '3:2', frameKind: 'browser' });
    const lay = layout(c, { web: 1440 / 900, mobile: [] });
    const r = lay.web.chrome.barH / lay.web.w;
    expect(r).toBeGreaterThan(0.02);
    expect(r).toBeLessThan(0.055);   // the old 0.0752 fails this
  });

  it('draws three traffic lights in the bar, left-aligned', () => {
    // Sample the bar's vertical centre across its left eighth and count
    // runs of non-bar colour. Three dots => three runs.
    const { ctx, lay } = framedScene({ chromeTheme: 'dark' });
    const ch = lay.web.chrome;
    const y = Math.round(ch.screen.y - ch.barH / 2);
    const bar = px(ctx, Math.round(lay.web.x + lay.web.w * 0.5), y);
    let runs = 0, inRun = false;
    for (let x = Math.round(lay.web.x); x < lay.web.x + lay.web.w * 0.18; x++) {
      const p = px(ctx, x, y);
      const differs = Math.abs(p[0] - bar[0]) + Math.abs(p[1] - bar[1]) + Math.abs(p[2] - bar[2]) > 24;
      if (differs && !inRun) { runs++; inRun = true; }
      if (!differs) inRun = false;
    }
    expect(runs).toBe(3);
  });

  it('keeps the pill empty when no url is set', () => {
    const { ctx, lay } = framedScene({ chromeTheme: 'dark' });
    // No text pixels: sample along the pill's text baseline and require that
    // nothing differs from the pill fill by more than antialiasing noise.
    const ch = lay.web.chrome;
    const y = Math.round(ch.screen.y - ch.barH / 2);
    const fill = px(ctx, Math.round(lay.web.x + lay.web.w / 2), y);
    let maxDelta = 0;
    for (let d = -60; d <= 60; d++) {
      const p = px(ctx, Math.round(lay.web.x + lay.web.w / 2) + d, y);
      maxDelta = Math.max(maxDelta, Math.abs(p[0] - fill[0]));
    }
    expect(maxDelta).toBeLessThan(12);
  });
});
```

Write `framedScene` alongside the file's existing helpers if one does not already exist; do not duplicate an existing harness.

- [ ] **Step 3: Run and watch them fail**

Run: `npx vitest run test/render-frames.test.js -t 'browser chrome proportions'`
Expected: the ratio test FAILS at `0.0752`; the traffic-light test FAILS (there are none today).

- [ ] **Step 4: Apply the measured ratios and draw the chrome**

Update `BROWSER_BAR_RATIO` and `BROWSER_RADIUS_RATIO` in `core/presets.js` to the measured values, replacing the `10/133` and `25/1064` comments with the new measurement and its source. Add:

```js
// Traffic lights and bar glyphs, as fractions of the frame width, measured
// from the round-two reference windows (see the Task 8 report for the raw
// pixel measurements and which screenshot each came from).
export const TRAFFIC_DOT_RATIO = /* measured */;
export const TRAFFIC_GAP_RATIO = /* measured */;
export const TRAFFIC_INSET_RATIO = /* measured */;
```

Replace those `/* measured */` placeholders with the actual numbers from Step 1 — a literal `/* measured */` left in the source is a task failure.

In `paintChrome`, draw: the bar fill and its bottom hairline (both already there), then three dots at `TRAFFIC_INSET_RATIO` from the left at the bar's vertical centre, then the centred URL pill (existing code). Use the traffic lights' real colours in both themes — they are the same on macOS regardless of appearance:

```js
const TRAFFIC_COLOURS = ['#ff5f57', '#febc2e', '#28c840'];
```

Keep the pill empty when `c.url` is null. Do not invent placeholder text — that rule has held since Task 6.

- [ ] **Step 5: Run and watch them pass**

Run: `npx vitest run test/render-frames.test.js`
Expected: PASS.

- [ ] **Step 6: Regenerate and compare against the references**

```bash
node scripts/make-render-goldens.js && npx vitest run
```

`browser-dark`, `browser-light`, `browser-url`, `square-browser` and `stroke-browser` change. `phone`, `web`, `mobile`, `web-mobile`, `mesh`, `shadow-heavy`, `stroke-light`, `stroke-glass` must not.

Then put the new `browser-dark` golden next to the reference screenshot and say in the report whether the proportions match. If the bar still reads as too tall, the measurement was wrong — re-measure, do not nudge.

- [ ] **Step 7: Commit**

```bash
git add core test scripts
git commit -m "feat(core): rebuild the browser chrome from measured reference proportions"
git push origin feat/cycle-a
```

- [ ] **Final step: deploy a preview, hand over the link, and STOP**

The preview is automatic. The Commit step above already pushed to
`feat/cycle-a`, which makes Netlify rebuild PR #1. Wait for both checks:

```bash
gh pr checks 1
```

`test` and `netlify/shotkit-app/deploy-preview` must both be green before you
hand anything over. **A task with red CI is not finished**, however good the
preview looks — fix it, push, and wait again.

Then give Rock the URL — **https://deploy-preview-1--shotkit-app.netlify.app** —
and tell him what to look at:

> Turn on the Browser frame in both **Dark** and **Light**. The bar should read as a browser at a glance: three small traffic lights at the left, a centred URL pill, and a bar roughly half the height of the one at https://shotkit-app.netlify.app. Set a URL and confirm the pill fills; clear it and confirm the pill stays empty rather than showing invented text.

**Then stop.** Do not begin the next task. Silence is not approval. If Rock
asks for a change, make it, redeploy, and hand the link back before moving on.


---

### Task 9: Rebuild mesh so it is worth having

**Files:**
- Modify: `core/presets.js` (`MESH_DEFAULTS`, ranges)
- Modify: `core/config.js` (`mesh` block)
- Modify: `core/render.js:126-160` (`paintMesh`)
- Modify: `core/index.js` (export the mesh vocabulary)
- Test: `test/render-mesh.test.js`
- Regenerate: `test/golden/render/mesh.png`, plus one new case

**Interfaces:**
- Consumes: nothing from Tasks 5–8.
- Produces: `normalise()` returns `mesh: { stops, spread, seed }`. `paintMesh(ctx, c, stops)` keeps its signature — `stops` is still the three-entry ground array; the extra hues are derived inside from `c.mesh` and the ground's own hue. Cycle B's Background panel reads `MESH_STOPS_RANGE` and `MESH_SPREAD_RANGE`.

- [ ] **Step 1: Write the failing tests**

Replace the weak assertions in `test/render-mesh.test.js` (keep any existing determinism test) and add:

```js
describe('mesh has real colour variety', () => {
  function hues(ctx, c) {
    // Sample a grid and collect distinct hues, ignoring near-greys.
    const seen = new Set();
    for (let i = 1; i < 8; i++) {
      for (let j = 1; j < 6; j++) {
        const d = ctx.getImageData(
          Math.round((c.w * i) / 8), Math.round((c.h * j) / 6), 1, 1,
        ).data;
        const [r, g, b] = [d[0] / 255, d[1] / 255, d[2] / 255];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (mx - mn < 0.04) continue;                 // too grey to have a hue
        let h;
        if (mx === r) h = ((g - b) / (mx - mn)) % 6;
        else if (mx === g) h = (b - r) / (mx - mn) + 2;
        else h = (r - g) / (mx - mn) + 4;
        seen.add(Math.round((((h * 60) % 360) + 360) % 360 / 15));   // 15° buckets
      }
    }
    return seen;
  }

  it('a spread mesh spans more hue buckets than a linear ground', () => {
    const mesh = meshScene({ mesh: { stops: 5, spread: 90, seed: 7 } });
    const linear = meshScene({ bgType: 'linear' });
    expect(hues(mesh.ctx, mesh.c).size).toBeGreaterThan(hues(linear.ctx, linear.c).size);
  });

  it('spread 0 collapses toward a single hue family', () => {
    const wide = meshScene({ mesh: { stops: 5, spread: 120, seed: 7 } });
    const flat = meshScene({ mesh: { stops: 5, spread: 0, seed: 7 } });
    expect(hues(flat.ctx, flat.c).size).toBeLessThan(hues(wide.ctx, wide.c).size);
  });

  it('is deterministic for a given seed', () => {
    const a = meshScene({ mesh: { stops: 4, spread: 60, seed: 12 } });
    const b = meshScene({ mesh: { stops: 4, spread: 60, seed: 12 } });
    expect(Buffer.from(a.ctx.getImageData(0, 0, a.c.w, a.c.h).data))
      .toEqual(Buffer.from(b.ctx.getImageData(0, 0, b.c.w, b.c.h).data));
  });

  it('changing only the seed changes the image', () => {
    const a = meshScene({ mesh: { stops: 4, spread: 60, seed: 12 } });
    const b = meshScene({ mesh: { stops: 4, spread: 60, seed: 13 } });
    expect(Buffer.from(a.ctx.getImageData(0, 0, a.c.w, a.c.h).data))
      .not.toEqual(Buffer.from(b.ctx.getImageData(0, 0, b.c.w, b.c.h).data));
  });

  it('stop count actually reaches the canvas', () => {
    const few = meshScene({ mesh: { stops: 3, spread: 120, seed: 3 } });
    const many = meshScene({ mesh: { stops: 5, spread: 120, seed: 3 } });
    expect(Buffer.from(few.ctx.getImageData(0, 0, few.c.w, few.c.h).data))
      .not.toEqual(Buffer.from(many.ctx.getImageData(0, 0, many.c.w, many.c.h).data));
  });
});
```

`meshScene` builds a config with `bgType: 'mesh'` unless overridden, runs `paintGround`, and returns `{ c, ctx }`.

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run test/render-mesh.test.js`
Expected: the variety and stop-count tests FAIL — today's mesh uses two tints of one hue and ignores any stop count.

- [ ] **Step 3: Add the vocabulary**

In `core/presets.js`:

```js
// Mesh was two tints of ONE hue with a reroll button, which is why it could
// only ever look like a blotchier linear gradient. `stops` is how many
// distinct hues are placed; `spread` is the total hue arc in degrees they
// are distributed across, centred on the ground's own hue — so a sampled
// mesh still belongs to the screenshot it came from.
export const MESH_STOPS_RANGE = [3, 5];
export const MESH_SPREAD_RANGE = [0, 180];
export const MESH_DEFAULTS = { stops: 4, spread: 70, seed: 1 };
```

In `core/config.js` add a `mesh` block clamping `stops` (rounded, into range), `spread` (into range) and `seed` (rounded, using the existing `SEED` bounds). Keep the top-level `seed` input working by folding it in the way Task 5 folded `shadowScale`.

- [ ] **Step 4: Rewrite `paintMesh`**

```js
export function paintMesh(ctx, c, stops) {
  const { stops: n, spread, seed } = c.mesh;

  // Base fill, the role g2 plays in the linear gradient.
  ctx.fillStyle = stops[1];
  ctx.fillRect(0, 0, c.w, c.h);

  // Derive n distinct hues from the ground's own hue, spanning `spread`
  // degrees centred on it. spread 0 => every stop is the base hue.
  const base = hueOf(stops[1]);
  const blobColours = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    blobColours.push(hslString(((base + t * spread) % 360 + 360) % 360, 0.62, 0.66));
  }

  const rnd = mulberry32(seed);
  const short = Math.min(c.w, c.h);
  const margin = short * 0.12;

  // One blob per stop, plus a second pass so a 3-stop mesh still fills the
  // field — each blob takes a DISTINCT stop rather than alternating between
  // two, which is what made the old mesh two-tone.
  for (let i = 0; i < n * 2; i++) {
    const cx = margin + rnd() * (c.w - margin * 2);
    const cy = margin + rnd() * (c.h - margin * 2);
    const r = short * (0.40 + rnd() * 0.35);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, rgba(blobColours[i % n], 0.75));
    g.addColorStop(1, rgba(blobColours[i % n], 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.w, c.h);
  }

  radial(ctx, c, stops[0], 0.22, 0.06, 1.15, 0.85, 0.58);
  radial(ctx, c, stops[2], 0.88, 0.97, 1.05, 0.90, 0.62);
}
```

`hueOf(hex)` and `hslString(h, s, l)` are small local helpers — add them next to the existing `rgba` helper in `core/render.js`. `rgba()` must accept whatever `hslString` produces; if it only parses hex, have `hslString` return hex so `rgba` is untouched.

- [ ] **Step 5: Run and watch them pass**

Run: `npx vitest run test/render-mesh.test.js`
Expected: all PASS.

- [ ] **Step 6: Regenerate goldens**

Add a second mesh case so spread is exercised, with a comment in the file's style:

```js
  ['mesh-wide', { ratio: '3:2', bgType: 'mesh', mesh: { stops: 5, spread: 140, seed: 7 } }, { web: 'samples/fieldset.png', mobile: [] }],
```

Run: `node scripts/make-render-goldens.js && npx vitest run`

`mesh` changes (expected — that is the point of the task) and `mesh-wide` is new. Nothing else may move.

- [ ] **Step 7: Hold it to the three gates**

"Useful" is not a matter of taste here. Mesh earns its place only if it does
something a linear gradient cannot, which is three specific things. All three
are already tested above except the third, which is added in Step 8.

1. **Distinguishable** — spans more hue buckets than a linear ground of the
   same base. (`a spread mesh spans more hue buckets than a linear ground`)
2. **Steerable** — spread, stop count and seed each visibly change the output.
   (the four determinism and variation tests)
3. **Not muddy** — wide spread must not wash the colour out. This is the real
   failure mode of multi-hue blending: overlapping hues average toward grey,
   and a mesh that technically contains five hues but renders as sludge is
   worse than the linear gradient it replaced.

Render mesh in the browser at several seeds and spreads, screenshot four, and
put them in the report next to a linear ground of the same hue.

If all three gates pass, the task is done — report it as done even if you
personally find the look unexciting; that is a design conversation, not a
gate. If a gate **fails** and you cannot make it pass, say so plainly and
stop: the spec keeps deleting mesh on the table, and taking that option is
better than shipping a control that does nothing.

- [ ] **Step 8: Add the anti-mud test**

Add to `test/render-mesh.test.js`:

```js
it('a wide spread does not wash the colour out', () => {
  // Mean chroma (max channel minus min channel, 0-255) over a sample grid.
  // Overlapping hues average toward grey; this is the failure mode that
  // makes a technically-multi-hue mesh look like sludge.
  function meanChroma(ctx, c) {
    let total = 0, n = 0;
    for (let i = 1; i < 8; i++) {
      for (let j = 1; j < 6; j++) {
        const d = ctx.getImageData(
          Math.round((c.w * i) / 8), Math.round((c.h * j) / 6), 1, 1,
        ).data;
        total += Math.max(d[0], d[1], d[2]) - Math.min(d[0], d[1], d[2]);
        n++;
      }
    }
    return total / n;
  }

  const linear = meshScene({ bgType: 'linear' });
  const wide = meshScene({ mesh: { stops: 5, spread: 140, seed: 7 } });

  // A wide mesh may be a little less saturated than a clean two-stop ramp,
  // but it must not collapse. 0.75 is the floor: below it the ground reads
  // as grey rather than coloured.
  expect(meanChroma(wide.ctx, wide.c))
    .toBeGreaterThan(meanChroma(linear.ctx, linear.c) * 0.75);
});
```

Run: `npx vitest run test/render-mesh.test.js`

If this fails, the fix is in `paintMesh` — lower the per-blob alpha, reduce
overlap, or narrow the default spread — **not** in the threshold. Moving the
0.75 to make a muddy mesh pass is exactly the failure this gate exists to
catch.

- [ ] **Step 9: Add the mesh controls so this can be previewed**

The Background panel already shows a **Seed** stepper when the type is Mesh
(`#backgroundSeedRow`). Add two more alongside it, on the same show-when-mesh
condition:

- **Stops** — a stepper over `MESH_STOPS_RANGE` (3–5)
- **Spread** — a slider over `MESH_SPREAD_RANGE` (0–180 degrees)

Without these, Step 7's three gates cannot be judged by a human at all — spread
and stop count would be unreachable, which is precisely the state that made
mesh useless in the first place.

**These controls are deliberately minimal, and Cycle B will replace them.**
That is not wasted work: a render feature with no way to invoke it cannot be
previewed, and a feature Rock cannot test is a feature he cannot approve. Wire
them into the existing inspector following the pattern already in
`web/inspector-frame.js` — a labelled row with a slider or segmented control,
writing to `state.config`, then `scheduleRender()`. Do not invent a new control
idiom; do not restyle anything around them.

Add matching tests to the existing inspector test file, in the style already
there — assert the control writes the value, clamps at both ends, and that
`render()` is scheduled.

- [ ] **Step 10: Commit**

```bash
git add core web test scripts
git commit -m "feat(core): rebuild mesh with real multi-hue stops, spread and seed"
git push origin feat/cycle-a
```

- [ ] **Final step: deploy a preview, hand over the link, and STOP**

The preview is automatic. The Commit step above already pushed to
`feat/cycle-a`, which makes Netlify rebuild PR #1. Wait for both checks:

```bash
gh pr checks 1
```

`test` and `netlify/shotkit-app/deploy-preview` must both be green before you
hand anything over. **A task with red CI is not finished**, however good the
preview looks — fix it, push, and wait again.

Then give Rock the URL — **https://deploy-preview-1--shotkit-app.netlify.app** —
and tell him what to look at:

> Switch Background type to **Mesh** and work the **Stops**, **Spread** and **Seed** controls. Rock's complaint was that mesh had no use: check that spread visibly changes the colour range, that seed gives genuinely different fields rather than noise, and — most importantly — that a wide spread still looks *coloured* rather than grey-brown.

**Then stop.** Do not begin the next task. Silence is not approval. If Rock
asks for a change, make it, redeploy, and hand the link back before moving on.


---

## Cycle close

After Task 9: run `npx vitest run`, confirm the full golden set is intentional, update the README's "not built yet" section for anything this cycle closed, merge `feat/cycle-a` to `main` (PR #1), and push. Then stop and report before Cycle B.
