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
- Geometry in `core/` is **proportional to the canvas**, never fixed pixels, except these documented minimums: `lineWidth = 1`, the 240px grain tile, `PHONE_BEZEL_MIN = 3`, and `SHADOW_SOURCE_INSET = 2` (added in Task 1's follow-up; like `lineWidth = 1` it exists to cover antialiased coverage, which is a fixed pixel count at every canvas size — see its comment in `core/render.js` for the measurements that set it).
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

### Task 5: Parameterised shadow, guarded by an isolated golden

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
