# shotkit Cycle B — Elements and Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every control in the inspector either work or say that it cannot. Today the frame, the corner radius, the stroke and the shadow all belong to the desktop screenshot alone — so on a mobile shot the Frame and Padding controls do nothing, Corner radius does nothing under either frame, and a browser frame around a phone screenshot does not exist at all. One cause, one fix: settings move into a per-element block, the canvas becomes selectable, and the inspector shows the selected element's own settings.

**Architecture:** `normalise()` gains `elements: { web, mobile }`, each carrying `frameKind`, `chromeTheme`, `url`, `radius`, `stroke` and `shadowScale`. A flat key at the top level of the input remains a default for *every* element; an entry in `elements` overrides it for that one. The flat fields stay on the returned config untouched, so nothing that reads them breaks on the day the block appears. `layout()` and the painters are then moved onto the block in one deliberate no-op refactor whose only acceptance test is that all fourteen goldens are byte-identical. Only after that does behaviour change. Selection is a DOM overlay over the canvas and never a painted pixel — the preview canvas is the export canvas.

**Tech Stack:** Zero-dependency ES modules in `core/`; Vite + vanilla JS in `web/`; vitest with `@napi-rs/canvas` and `pixelmatch` for goldens.

**Spec:** `docs/superpowers/specs/2026-09-02-shotkit-round-two-design.md` — Structural decision 1, "Selection", "Carried forward — controls that do nothing", and "Carried forward — corner radius is inert under a frame".

## Global Constraints

Copied from the spec and carried forward from Cycle A. Every task's requirements implicitly include these.

- `composeWithMeta` is called from **exactly one place** in `web/` (`web/state.js`, inside `render()`). Do not add a second call site.
- The preview canvas **is** the export canvas. Nothing may be drawn into it that must not appear in the exported PNG. This cycle adds a selection outline, which makes the rule load-bearing rather than theoretical — see Task 6.
- **No engine detection** anywhere in `core/`. No `typeof window`, no `navigator`, no branching on canvas implementation.
- `core/` has **zero runtime dependencies**. It may import only its own relative files.
- `web/tokens.css` is the **only** file in `web/` allowed to contain a raw hex colour.
- `[hidden] { display: none !important; }` stays a **single global rule**. Do not add per-element `hidden` handling.
- **A disabled state is an explicit colour, never `opacity`.** Cycle A Task 3b removed every `opacity`-based disabled rule in the stylesheet; `opacity` outside `@keyframes` is not permitted. Task 8 of this cycle adds several disabled states and must obey it.
- Contrast floors, from Cycle A Task 3b: informational text ≥ 7:1, ladder separation ≥ 1.2, interactive or graphic boundaries ≥ 3:1, decorative 1.8–2.5.
- Geometry in `core/` is **proportional to the canvas**, never fixed pixels, except these documented minimums: `lineWidth = 1`, the 240px grain tile, `PHONE_BEZEL_MIN = 3`, `SHADOW_SOURCE_INSET = 2`, `TILE_BLEED = 1`. `TILE_QUANTUM = 64` is an allocation grid, not geometry.
- **Nothing is painted behind a shot, and nothing is drawn inside a clip.** Each shot is composed in its own offscreen tile through the injected `makeCanvas`, drawn one pixel past its own edge, and cut once with a `destination-in` fill. `test/render-clip-safety.test.js` enforces this structurally.
- **Do not retune `paintShadow`'s alphas.** `0.17 / 0.07` for web and browser, `0.22 / 0.10` for phones.
- **An inset hairline's radius shrinks with its inset.** `strokeInsetHairline` (Cycle A, round three) is the only way to stroke a 1px line just inside a rounded rect. Do not hand-roll another.
- Run `npx vitest run` before and after every task. Commit only green.
- After each task, push the branch. Do not merge to `main` mid-cycle.

### The one rule this cycle exists to defend

**A control that appears to work and does not is worse than no control.** Every task below either makes a control act or makes it visibly unable to. There is no third outcome, and "it writes the value but nothing reads it" is the failure mode to hunt for — it is what shipped in Cycle A three separate times.

### THE APPROVAL GATE — read this before starting any task

**Every task that changes anything Rock can see ends by deploying a preview and STOPPING.** Not a screenshot in a report — a URL he can open, click and test himself.

Task 0 opens the branch and the pull request. From then on every push rebuilds one preview:

**https://deploy-preview-2--shotkit-app.netlify.app**

(PR #2, the next number after Cycle A's #1. Confirm the number from `gh pr view` after Task 0 and correct this line if it differs.)

CI runs on the same push — the full suite, the build, and a check that no golden file changed. Both it and the preview must be green before you hand over.

Then **stop and hand Rock the URL**, saying what changed and what to look at. Do not start the next task. Do not assume approval from silence.

### Tests that cannot fail

Cycle A produced **twelve** tests incapable of failing: sample points outside the shape under test, source scans standing in for behaviour, a guard whose threshold moved twice, a pixel test for a half-pixel change that no pixel could show. Every one was found by deliberately breaking the code and watching the test stay green.

So, for every assertion added below:

1. Run it against the **unchanged** code first and record that it goes red.
2. If it goes green, it is not a test. Fix it or delete it — do not tune it.
3. Say in the task report which sample points were verified and how.

A task report that does not contain a red-then-green record for its new assertions is not finished.

---

## File Structure

| File | Responsibility this cycle |
|---|---|
| `core/presets.js` | `ELEMENT_KINDS`, `ELEMENT_DEFAULTS`, `PHONE_RADIUS_RANGE`, `BROWSER_RADIUS_RANGE` |
| `core/config.js` | the `elements` block and its precedence rule — the crux of Task 1 |
| `core/layout.js` | `webBox`/`phoneBox` read the element block; `phoneBox` joins the outset machinery |
| `core/render.js` | painters take a resolved element instead of reading `c` directly |
| `core/index.js` | passes each element's block to its painter; exports the new vocabulary |
| `web/state.js` | `state.selection`, and nothing else — it must not learn what an outline looks like |
| `web/selection.js` | **new** — hit-testing and the DOM overlay. No canvas drawing, ever. |
| `web/inspector-frame.js` | Frame and Finish read and write the *selected* element |
| `web/main.js` | wires the canvas click and the overlay's position |
| `web/style.css` | the selection outline, and the disabled states Task 8 adds |

`web/selection.js` is a new file rather than more of `main.js` because it is the one piece of this cycle with a hard safety rule attached — it may never touch a canvas — and a rule is easier to keep in a file that contains only the thing it governs.

---

## Task 0: Branch, pull request, preview

**Files:** none changed.

> **Corrected during execution, 2026-09-03.** GitHub refuses to open a pull
> request on a branch with no commits ahead of its base — "No commits between
> main and feat/cycle-b" — so Steps 1 and 2 cannot both run before any work
> exists. Task 0 is therefore folded into Task 1: branch first, do Task 1's
> work, commit, push, and open the PR with that commit. The approval gate is
> unaffected, because Task 1 has nothing visible to approve either way.

- [x] **Step 1: Branch from an up-to-date main**

```bash
git checkout main && git pull --ff-only && git checkout -b feat/cycle-b
```

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/cycle-b
gh pr create --title "Cycle B — elements and selection" --body "$(cat <<'EOF'
Cycle B of the round-two plan. This PR stays open for the whole cycle: each task
pushes to it, so the deploy preview URL below always reflects the latest task.

**Spec:** `docs/superpowers/specs/2026-09-02-shotkit-round-two-design.md`
**Plan:** `docs/superpowers/plans/2026-09-03-shotkit-cycle-b.md`

**Preview:** https://deploy-preview-2--shotkit-app.netlify.app

Every control in the inspector will either work or say that it cannot.

- [ ] 1. The `elements` block, read by nothing
- [ ] 2. Layout and the painters move onto it — a no-op refactor, proven by the goldens
- [ ] 3. Corner radius works under every frame, phones included
- [ ] 4. A mobile shot can take a browser frame, or none
- [ ] 5. Stroke and shadow per element
- [ ] 6. Canvas selection, as a DOM overlay
- [ ] 7. The inspector follows the selection
- [ ] 8. Controls that cannot act are disabled

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Confirm the preview number**

Run `gh pr view --json number`. If it is not 2, correct the URL in this plan and in the PR body before continuing.

---

## Task 1: The `elements` block, read by nothing

**Files:**
- Modify: `core/presets.js` — add `ELEMENT_KINDS`, `ELEMENT_DEFAULTS`
- Modify: `core/config.js` — add the `elements` block to `normalise()`'s return
- Modify: `core/index.js` — export the new vocabulary
- Test: `test/config.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `normalise()` returns `elements: { web: E, mobile: E }` where `E` is `{ frameKind, chromeTheme, url, radius, stroke, shadowScale }`. `radius` is `null` or a number — see Task 3 for what `null` resolves to. Every existing top-level field stays on the config exactly as it is; Task 2 is what moves the readers.

**Why this task changes no behaviour at all.** The block is added and nothing reads it. That is deliberate: the precedence rule below is the single piece of this cycle most likely to go wrong quietly, and it gets a task to itself where the only thing that can move is the config object.

- [x] **Step 1: Read the failure this rule has to avoid**

Cycle A Task 5b introduced `shadow: { scale, ... }` alongside the existing flat `shadowScale`, with the rule "specific beats legacy". The panel's writer seeded the block with `{ ...SHADOW_DEFAULTS }`, so `shadow.scale` was *always present* — and therefore always outranked `shadowScale`. The main Shadow slider went dead the moment the Advanced section was opened, while still displaying its old value. It had to be reverted in full.

The rule that prevents it: **a key counts as an override only when the INPUT carried it.** A resolved default is not an override. `undefined` is the test, and the block is never pre-seeded with defaults before that test runs.

- [x] **Step 2: Write the failing tests**

Add to `test/config.test.js`:

```js
describe('per-element settings (Cycle B Task 1)', () => {
  it('gives both elements a full block from the defaults', () => {
    const c = normalise({});
    expect(Object.keys(c.elements).sort()).toEqual(['mobile', 'web']);
    for (const el of ['web', 'mobile']) {
      expect(Object.keys(c.elements[el]).sort())
        .toEqual(['chromeTheme', 'frameKind', 'radius', 'shadowScale', 'stroke', 'url']);
    }
  });

  it('defaults each element to the frame it draws today', () => {
    const c = normalise({});
    expect(c.elements.web.frameKind).toBe('none');
    expect(c.elements.mobile.frameKind).toBe('phone');
  });

  it('a flat key is a default for EVERY element', () => {
    const c = normalise({ frameKind: 'browser' });
    expect(c.elements.web.frameKind).toBe('browser');
    expect(c.elements.mobile.frameKind).toBe('browser');
  });

  it('an element entry overrides the flat key for that element only', () => {
    const c = normalise({ frameKind: 'browser', elements: { mobile: { frameKind: 'phone' } } });
    expect(c.elements.web.frameKind).toBe('browser');
    expect(c.elements.mobile.frameKind).toBe('phone');
  });

  // THE TASK 5B TRAP. A key the caller did not supply must not outrank one
  // they did, however the block gets built internally.
  it('an absent element key never outranks an explicit flat key', () => {
    const c = normalise({ shadowScale: 0.4, elements: { web: { url: 'a.dev' } } });
    expect(c.elements.web.shadowScale).toBeCloseTo(0.4, 9);
    expect(c.elements.mobile.shadowScale).toBeCloseTo(0.4, 9);
  });

  it('an explicitly undefined element key behaves as absent, not as a value', () => {
    const c = normalise({ frameKind: 'browser', elements: { web: { frameKind: undefined } } });
    expect(c.elements.web.frameKind).toBe('browser');
  });

  it('clamps and validates inside the block exactly as it does at the top level', () => {
    const c = normalise({
      elements: {
        web: { frameKind: 'hovercraft', chromeTheme: 'puce', shadowScale: 99,
               stroke: { style: 'embossed', width: 99 } },
      },
    });
    expect(c.elements.web.frameKind).toBe('none');
    expect(c.elements.web.chromeTheme).toBe('dark');
    expect(c.elements.web.shadowScale).toBe(SHADOW_SCALE_RANGE[1]);
    expect(c.elements.web.stroke.style).toBe('none');
    expect(c.elements.web.stroke.width).toBeCloseTo(STROKE_WIDTH_RANGE[1], 9);
  });

  it('leaves every top-level field exactly where it was', () => {
    // Task 2 moves the readers. Until then nothing may notice this block.
    const before = normalise({ frameKind: 'browser', shadowScale: 0.5, url: 'x.dev' });
    expect(before.frameKind).toBe('browser');
    expect(before.shadowScale).toBeCloseTo(0.5, 9);
    expect(before.url).toBe('x.dev');
    expect(before.radius).toBeGreaterThan(0);
  });

  it('radius starts null in the block — "whatever this frame\\'s own corner is"', () => {
    expect(normalise({}).elements.web.radius).toBeNull();
    expect(normalise({ elements: { web: { radius: 40 } } }).elements.web.radius).toBe(40);
  });
});
```

Add `SHADOW_SCALE_RANGE` and `STROKE_WIDTH_RANGE` to that file's imports from `../core/presets.js` if they are not already there.

- [x] **Step 3: Run and watch every one fail**

Run: `npx vitest run test/config.test.js -t 'per-element settings'`
Expected: all nine FAIL — `c.elements` is `undefined` today, so most fail on a property read.

That is a weak kind of red. Before moving on, **also** check the two that matter can fail for the right reason later: temporarily return `elements: { web: {}, mobile: {} }` and confirm "a flat key is a default for EVERY element" and "an absent element key never outranks an explicit flat key" still fail. Record that in the report.

- [x] **Step 4: Add the vocabulary**

In `core/presets.js`:

```js
// --- Per-element settings (Cycle B) -------------------------------------
//
// Frame, stroke, corner radius and shadow are properties of a THING IN THE
// SHOT, not of the shot. Round two attached them to the config's top level,
// which in practice meant the desktop screenshot: on a mobile-only shot the
// Frame and Padding controls did nothing, corner radius did nothing under
// either frame, and a browser frame around a phone screenshot did not
// exist. All of that is one cause.
//
// `mobile` covers every phone in the web+mobile layout as one class.
// Per-phone settings are not a goal and would not survive a layout change.
export const ELEMENT_KINDS = ['web', 'mobile'];

// The default frame per element is TODAY'S BEHAVIOUR, not a new opinion: a
// desktop screenshot is bare unless asked otherwise, and the mobile layout
// has always drawn phones.
export const ELEMENT_DEFAULTS = {
  web:    { frameKind: 'none' },
  mobile: { frameKind: 'phone' },
};
```

In `core/config.js`, above `normalise()`:

```js
/**
 * Resolve one field for one element.
 *
 * PRECEDENCE, AND WHY IT IS WRITTEN THIS WAY: an element entry wins over a
 * flat key, and a flat key wins over the default — but ONLY when the input
 * actually carried it. `undefined` means absent, and a resolved default is
 * never an override.
 *
 * Cycle A Task 5b is the reason this is a function rather than three
 * spreads. It introduced a nested block alongside a flat field, seeded the
 * block with its defaults, and so made the nested value always present and
 * therefore always winning. The flat field went dead while its slider went
 * on displaying the old number, and the whole task had to be reverted. A
 * spread cannot express "only if the caller said so"; this can.
 */
function pickField(elInput, flatInput, fallback) {
  if (elInput !== undefined) return elInput;
  if (flatInput !== undefined) return flatInput;
  return fallback;
}
```

Then, inside `normalise()`, build the block from `input` — **not** from the resolved config, which has already turned every absent field into a default:

```js
  const elements = {};
  for (const kind of ELEMENT_KINDS) {
    const e = (input.elements && input.elements[kind]) || {};
    const frameKind = pickField(e.frameKind, input.frameKind, ELEMENT_DEFAULTS[kind].frameKind);
    const chromeTheme = pickField(e.chromeTheme, input.chromeTheme, 'dark');
    const url = pickField(e.url, input.url, DEFAULTS.url);
    const shadowScale = pickField(e.shadowScale, input.shadowScale, DEFAULTS.shadowScale);
    const stroke = pickField(e.stroke, input.stroke, undefined);

    elements[kind] = {
      frameKind: FRAME_KINDS.includes(frameKind) ? frameKind : ELEMENT_DEFAULTS[kind].frameKind,
      chromeTheme: CHROME_THEMES.includes(chromeTheme) ? chromeTheme : 'dark',
      url: url ? String(url) : DEFAULTS.url,
      // null means "this frame's own corner" — resolved in layout.js by
      // Task 3, because the answer depends on which frame is on.
      // Corrected during execution: the first sketch of this line routed
      // radius through pickField with two undefined arguments, which is a
      // no-op dressed as a rule. It does not use pickField at all - the
      // flat radius is deliberately not inherited, so there is no
      // precedence to express.
      radius: e.radius === undefined ? null : num(e.radius, null),
      shadowScale: Math.min(
        SHADOW_SCALE_RANGE[1],
        Math.max(SHADOW_SCALE_RANGE[0], num(shadowScale, DEFAULTS.shadowScale)),
      ),
      stroke: normaliseStroke(stroke),
    };
  }
```

`radius` deliberately does **not** fall back to the top-level `input.radius`. The flat `radius` is a resolved pixel count for the *bare screenshot* and has never meant "the browser window's corner"; inheriting it would silently give a browser frame a 24px corner the moment someone touched the old slider. Task 3 is where the slider is rewired; until then the block's radius is null and unread.

Extract the existing stroke logic out of the top-level `stroke:` field into a shared `normaliseStroke(input)` so the block and the flat field cannot drift:

```js
function normaliseStroke(s) {
  const v = s || {};
  const style = STROKE_STYLES.includes(v.style) ? v.style : STROKE_DEFAULTS.style;
  return {
    style,
    width: Math.min(
      STROKE_WIDTH_RANGE[1],
      Math.max(STROKE_WIDTH_RANGE[0], num(v.width, STROKE_DEFAULTS.width)),
    ),
    color: /^#[0-9a-fA-F]{6}$/.test(v.color) ? v.color : STROKE_DEFAULTS.color,
  };
}
```

Add `elements` to the returned object, and export `ELEMENT_KINDS` / `ELEMENT_DEFAULTS` from `core/index.js`.

- [x] **Step 5: Run and watch them pass**

Run: `npx vitest run`
Expected: PASS, and **every one of the fourteen goldens byte-identical** — nothing reads the block yet, so a moved pixel means something else changed.

- [x] **Step 6: Commit and push**

```bash
git add core test
git commit -m "feat(core): a per-element settings block, read by nothing yet"
git push origin feat/cycle-b
```

**No preview needed.** This task changes nothing Rock can see. Say so, and go straight to Task 2.

---

## Task 2: Layout and the painters move onto the block

**Files:**
- Modify: `core/layout.js` — `webBox`, `chromeFor`, `frameInsets`, `layout`
- Modify: `core/render.js` — `paintWeb`, `paintWebChrome`, `paintPhoneChrome`, `paintPhone`, `paintChrome`
- Modify: `core/index.js` — hand each painter its element's block
- Test: `test/layout.test.js`, `test/render-frames.test.js`

**Interfaces:**
- Consumes: Task 1's `c.elements`.
- Produces: `layout(c, sources)` unchanged in signature. `paintWeb(ctx, c, box, image, makeCanvas, el)` and `paintPhone(ctx, c, box, image, makeCanvas, el)` gain a trailing `el` — the resolved element block. `el` defaults to `c.elements.web` and `c.elements.mobile` respectively so a stale two-argument call still works, but `core/index.js` passes it explicitly.

**This task must change nothing that reaches a canvas.** It is the plumbing, separated from the behaviour so that when Task 3 does move a pixel there is no doubt about which change did it.

- [x] **Step 1: The acceptance test is the golden set, and it already exists**

There is no new test to write for the main claim. The claim is "all fourteen goldens are byte-identical", and `npx vitest run` plus `git status test/golden` is the whole check. Do not regenerate goldens in this task — if one moves, the refactor is wrong.

Write only this, in `test/layout.test.js`, to pin the new plumbing:

```js
describe('layout reads the element block, not the flat fields (Task 2)', () => {
  it('an element override changes the layout; the flat field alone still works', () => {
    const flat = layout(normalise({ layout: 'web', ratio: '3:2', frameKind: 'browser' }),
                        { web: 1.6, mobile: [] });
    const viaBlock = layout(normalise({
      layout: 'web', ratio: '3:2', elements: { web: { frameKind: 'browser' } },
    }), { web: 1.6, mobile: [] });
    expect(viaBlock.web.chrome.barH).toBeCloseTo(flat.web.chrome.barH, 9);
    expect(viaBlock.web.chrome.barH).toBeGreaterThan(0);
  });

  // CORRECTED DURING EXECUTION. As sketched, this test could not fail: with
  // no flat `frameKind` at all, `c.frameKind` sits at its own default of
  // 'none', so `chrome` is null before the fix and after it. The flat key
  // has to be 'browser' so that only an element override reading correctly
  // can produce null.
  it("an element override beats the flat key, and the other element's does not leak", () => {
    const out = layout(normalise({
      layout: 'web', ratio: '3:2',
      frameKind: 'browser',
      elements: { web: { frameKind: 'none' }, mobile: { frameKind: 'phone' } },
    }), { web: 1.6, mobile: [] });
    expect(out.web.chrome).toBeNull();
  });
});
```

- [x] **Step 2: Run and watch the second one fail**

Run: `npx vitest run test/layout.test.js -t 'element block'`
Expected — and **the plan had this backwards**, corrected here from what actually happened: the FIRST fails (an element override alone leaves `c.frameKind` at 'none', so `chrome` is null and `.barH` throws) and the second, as originally sketched, passed for the wrong reason. Both are red once the second is corrected as above.

- [x] **Step 3: Thread the element through layout**

In `core/layout.js`, `frameInsets`, `chromeFor` and `webBox` currently read `c.frameKind` and `c.stroke`. Give each an `el` parameter and read it from there. `c` stays for canvas-level values (`c.w`, `c.h`, `c.pad`, `c.radius`) — the point of the split is that those are the shot's, not an element's.

```js
function frameInsets(c, el, screenW, shorterSide) {
  const sw = el.stroke.style === 'none' ? 0 : shorterSide * el.stroke.width;
  if (el.frameKind === 'none') {
    return { top: sw, right: sw, bottom: sw, left: sw, stroke: sw };
  }
  if (el.frameKind === 'phone') {
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

`chromeFor(c, el, web, ins, screenW, screenH)` and `webBox(c, el, box, ratio)` follow the same shape. In `layout()`, call `webBox(c, c.elements.web, safe, sources.web)`.

`phoneBox` is untouched in this task — Task 4 is what moves it.

- [x] **Step 4: Thread the element through the painters**

```js
export function paintWeb(ctx, c, box, image, makeCanvas, el = c.elements.web) {
```

and inside, every `c.stroke` becomes `el.stroke`, every `c.chromeTheme` becomes `el.chromeTheme`, every `c.url` becomes `el.url`, and `c.shadowScale` becomes `el.shadowScale`. `paintWebChrome`, `paintPhoneChrome` and `paintChrome` each take `el` and read the same way. `paintPhone` takes `el = c.elements.mobile`.

The default-argument form is not laziness: `test/render-frames.test.js` and `test/render-edge-blend.test.js` call these painters directly with five arguments in dozens of places, and rewriting all of them is churn that would hide a real change inside a large diff. The defaults make those call sites keep working and keep meaning what they meant.

In `core/index.js`:

```js
  if (lay.web && web) paintWeb(ctx, rc, lay.web, web, makeCanvas, rc.elements.web);
  lay.phones.forEach((box, i) =>
    paintPhone(ctx, rc, box, mobile[i], makeCanvas, rc.elements.mobile));
```

- [x] **Step 5: Run everything, and check the goldens did not move**

```bash
npx vitest run && git status --short test/golden
```

Expected: all tests PASS and `git status` reports **nothing**. A modified golden here is a bug in the refactor, not a golden to regenerate.

- [x] **Step 6: Extend the frozen baseline's field strip**

`test/layout.test.js`'s `webWithoutFrameFields` strips `chrome`, `strokeWidth` and `inner` before comparing against `PRE_FRAME_BASELINE`. If this task adds any field to the returned `web` box, add it there too — and assert its no-frame value first, the way the existing three are asserted, so nothing is dropped blindly.

- [x] **Step 7: Commit and push**

```bash
git add core test
git commit -m "refactor(core): layout and the painters read the element block"
git push origin feat/cycle-b
```

**No preview needed** — nothing visible changed, and the goldens prove it. Go straight to Task 3.

---

## Task 3: Corner radius works under every frame

**Files:**
- Modify: `core/presets.js` — `BROWSER_RADIUS_RANGE`, `PHONE_RADIUS_RANGE`
- Modify: `core/layout.js` — resolve `el.radius === null` against the frame
- Modify: `web/inspector-frame.js` — the Corner radius slider reads and writes the element
- Test: `test/layout.test.js`, `test/inspector-frame.test.js`
- Regenerate: nothing. If a golden moves, the default resolution is wrong.

**Interfaces:**
- Consumes: Task 2's `el` plumbing.
- Produces: `layout()`'s `web.radius` and `web.chrome.radius` both honour `el.radius`. `activeRadiusPercent(config)` / `setRadiusPercent(config, pct)` in `web/inspector-frame.js` operate on the selected element (for now, always `web` — Task 7 wires the selection).

**This is the first task Rock can see.** It closes the finding he raised on 2026-09-03: *"corner radius slider is not working when browser is selected. it either should, or the control should be disabled."* It should — a browser window's corner is a real, adjustable thing.

- [x] **Step 1: Decide what `null` means, per frame, and write it down**

`el.radius === null` means *this frame's own corner*:

| frameKind | null resolves to | range when set |
|---|---|---|
| `none` | `c.radius` (the existing `RADIUS_RATIO` × canvas width) | 0 – 6% of canvas width, unchanged |
| `browser` | `web.w × BROWSER_RADIUS_RATIO` | `BROWSER_RADIUS_RANGE` |
| `phone` | `web.w × PHONE_RADIUS_RATIO` | `PHONE_RADIUS_RANGE` |

The ranges are bounded per frame because the shapes are not interchangeable. A browser window with a 20% corner is a lozenge; a phone with a square corner or one past half its width stops reading as a phone. Rock asked for the phone range specifically: *"shouldn't we allow 'some' adjustment for corner radius on mobile? I think android phones can have a different ratio."*

```js
// Bounds for a SET corner radius, as fractions of the element's own width.
// Not the same range for both, because the shapes are not interchangeable:
// a browser window at 20% is a lozenge, and a phone below ~6% or above half
// its width stops reading as a phone at all. The defaults sit inside each.
//
// Browser: the reference's own 24/1706.67 = 0.0141 (Cycle A Task 8) sits
// near the bottom, because Rock asked for a tight window corner (0.6% of
// canvas width). The top allows a markedly rounder window without becoming
// a pill.
export const BROWSER_RADIUS_RANGE = [0, 0.05];

// Phone: PHONE_RADIUS_RATIO is 0.125. Android devices sit lower, some
// concept devices higher; below 0.04 the body reads as a tablet bezel and
// above 0.24 the corners meet.
export const PHONE_RADIUS_RANGE = [0.04, 0.24];
```

- [x] **Step 2: Write the failing tests**

Add to `test/layout.test.js`:

```js
describe('corner radius under a frame (Task 3)', () => {
  const web = (o) => layout(normalise({ layout: 'web', ratio: '3:2', ...o }),
                            { web: 1.6, mobile: [] }).web;

  it('null keeps each frame\\'s own default corner', () => {
    expect(web({ elements: { web: { frameKind: 'none' } } }).radius)
      .toBeCloseTo(normalise({ ratio: '3:2' }).radius, 9);
    const b = web({ elements: { web: { frameKind: 'browser' } } });
    expect(b.chrome.radius).toBeCloseTo(b.w * BROWSER_RADIUS_RATIO, 9);
    const p = web({ elements: { web: { frameKind: 'phone' } } });
    expect(p.chrome.radius).toBeCloseTo(p.w * PHONE_RADIUS_RATIO, 9);
  });

  it('a set radius reaches the BROWSER window, which it never did before', () => {
    const a = web({ elements: { web: { frameKind: 'browser' } } });
    const b = web({ elements: { web: { frameKind: 'browser', radius: a.w * 0.04 } } });
    expect(b.chrome.radius).toBeGreaterThan(a.chrome.radius * 1.5);
  });

  it('a set radius reaches the PHONE body', () => {
    const a = web({ elements: { web: { frameKind: 'phone' } } });
    const b = web({ elements: { web: { frameKind: 'phone', radius: a.w * 0.20 } } });
    expect(b.chrome.radius).toBeGreaterThan(a.chrome.radius * 1.4);
  });

  it('clamps into the frame\\'s own range rather than deforming the shape', () => {
    const p = web({ elements: { web: { frameKind: 'phone', radius: 99999 } } });
    expect(p.chrome.radius).toBeCloseTo(p.w * PHONE_RADIUS_RANGE[1], 9);
    const b = web({ elements: { web: { frameKind: 'browser', radius: 99999 } } });
    expect(b.chrome.radius).toBeCloseTo(b.w * BROWSER_RADIUS_RANGE[1], 9);
  });

  it('the screen corner stays concentric inside the phone body', () => {
    const p = web({ elements: { web: { frameKind: 'phone', radius: 200 } } });
    expect(p.chrome.innerRadius)
      .toBeCloseTo(Math.max(0, p.chrome.bodyRadius - p.chrome.frame), 9);
  });
});
```

- [x] **Step 3: Run and watch them fail**

Run: `npx vitest run test/layout.test.js -t 'corner radius under a frame'`
Expected: the first PASSES (that is today's behaviour, kept), the other four FAIL — `chromeFor` computes `radius` from the ratio constant and never consults `el.radius`.

- [x] **Step 4: Resolve the radius in `chromeFor` and `webBox`**

```js
// `el.radius` is null ("this frame's own corner") or an explicit pixel
// count. Resolved HERE and not in config.js, because the answer depends on
// which frame is on and on the element's own width — neither of which
// normalise() knows.
function radiusFor(c, el, web) {
  if (el.frameKind === 'phone') {
    return el.radius === null
      ? web.w * PHONE_RADIUS_RATIO
      : clamp(el.radius, web.w * PHONE_RADIUS_RANGE[0], web.w * PHONE_RADIUS_RANGE[1]);
  }
  if (el.frameKind === 'browser') {
    return el.radius === null
      ? web.w * BROWSER_RADIUS_RATIO
      : clamp(el.radius, web.w * BROWSER_RADIUS_RANGE[0], web.w * BROWSER_RADIUS_RANGE[1]);
  }
  return el.radius === null ? c.radius : Math.max(0, el.radius);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
```

`chromeFor` uses it for `radius`; `webBox` uses it for the bare screenshot's `web.radius` when there is no frame. `bodyRadius` and `innerRadius` derive from it exactly as they do now, so the concentric relationship Cycle A established is untouched.

- [x] **Step 5: Run and watch them pass, and the goldens hold**

```bash
npx vitest run && git status --short test/golden
```

Expected: PASS, and no golden modified — every golden leaves `radius` null, so every one takes the same default it had before.

- [x] **Step 6: Rewire the Corner radius slider**

> **Corrected during execution.** The plan's `radiusRangeFor` sketch fudged
> this with a comment saying "the composite is within a few percent of the
> canvas width at every ratio, so the slider is expressed against the
> canvas". That is an approximation in a readout, which is how the ground
> swatches came to lie once before. The panel now gets the element's REAL
> width: `composeWithMeta` already returns `layout`, so `web/state.js` keeps
> it as `state.lay` and the DOM layer passes `state.lay.web.w` down. Task 6
> needs the same thing for hit-testing, so it is built once, here.
>
> The unit stays percent of CANVAS width in all three frames — the unit the
> slider has always used and the one Rock reasons in ("based on our sliders,
> 0.6% would be it"). Only the bounds change per frame.

`activeRadiusPercent` currently reads `normalise(config).radius` and expresses it as a percent of canvas width. It must now read the *selected element's* effective radius and express it against the range that applies to that element's frame — otherwise the slider's travel means something different under each frame while looking the same.

```js
/** The range the Corner radius slider works in, for one element. Percent of
 *  canvas width in all three cases, so the readout stays comparable, but the
 *  BOUNDS differ per frame — see BROWSER_RADIUS_RANGE / PHONE_RADIUS_RANGE
 *  in core/presets.js for why the shapes are not interchangeable. */
export function radiusRangeFor(config, which = 'web') {
  const eff = normalise(config);
  const el = eff.elements[which];
  if (el.frameKind === 'none') return [0, RADIUS_PERCENT_MAX];
  const range = el.frameKind === 'phone' ? PHONE_RADIUS_RANGE : BROWSER_RADIUS_RANGE;
  // The frame's own width is not known until layout runs, and the panel does
  // not run layout. The composite is within a few percent of the canvas
  // width at every ratio, so the slider is expressed against the canvas and
  // core/ does the real clamp against the element's actual width. The
  // slider can therefore ask for a value core/ trims; it can never ask for
  // one core/ would deform the shape to honour.
  return [range[0] * 100, range[1] * 100];
}
```

Write to `config.elements[which].radius` in pixels, never to the flat `config.radius`. Add a test asserting the flat field is left alone.

- [x] **Step 7: Add the inspector tests**

```js
describe('corner radius writes the element, not the flat field (Task 3)', () => {
  it('setRadiusPercent writes elements.web.radius and leaves config.radius alone', () => {
    const config = {};
    setRadiusPercent(config, 2);
    expect(config.elements.web.radius).toBeGreaterThan(0);
    expect(config.radius).toBeUndefined();
  });

  it('the range follows the frame', () => {
    expect(radiusRangeFor({ elements: { web: { frameKind: 'none' } } }))
      .toEqual([0, RADIUS_PERCENT_MAX]);
    expect(radiusRangeFor({ elements: { web: { frameKind: 'phone' } } }))
      .toEqual([PHONE_RADIUS_RANGE[0] * 100, PHONE_RADIUS_RANGE[1] * 100]);
  });

  it('changing the frame does not silently move a radius the user set', () => {
    const config = {};
    setRadiusPercent(config, 2);
    const set = config.elements.web.radius;
    setFrameKind(config, 'browser');
    expect(config.elements.web.radius).toBe(set);
  });
});
```

- [x] **Step 8: Commit, push, deploy, and STOP**

```bash
git add core web test
git commit -m "feat(core): corner radius acts under every frame, phones included"
git push origin feat/cycle-b
```

Wait for `gh pr checks`. Then hand Rock the URL and tell him:

> Drop a screenshot, then drag **Corner radius** with Frame set to **None**, then **Browser**, then **Phone**. It must do something in all three. On Browser it is the window's corner; on Phone it is the device's body, and its range is bounded so the phone still reads as a phone at both ends.

**Then stop.**

---

## Task 4: A mobile shot can take a browser frame, or none

**Files:**
- Modify: `core/layout.js` — `phoneBox` joins the outset machinery
- Modify: `core/index.js` — the mobile painter dispatches on `frameKind`
- Modify: `core/render.js` — `paintPhone` dispatches to the chrome painters
- Test: `test/layout.test.js`, `test/render-frames.test.js`
- Regenerate: nothing — the mobile element defaults to `phone`, which is today's behaviour.

**Interfaces:**
- Consumes: Task 2's `el` plumbing and Task 3's `radiusFor`.
- Produces: `layout()`'s `out.phones[i]` gains `chrome` and `inner`, matching `out.web`'s shape. A phone box is now the same kind of object a web box is.

**The asymmetry Rock found.** *"in the other hand, you do allow me to add a phone border on a desktop screenshot. shouldn't it work the same way?"* A phone frame around a web screenshot works; a browser frame around a mobile screenshot does not exist. That was never a decision — `frameKind` was attached to one element and the mobile layout had its own hardcoded device.

- [x] **Step 1: Write the failing tests**

```js
describe('the mobile element takes a frame like the web one (Task 4)', () => {
  const mob = (o) => layout(normalise({ layout: 'mobile', ratio: '3:2', ...o }),
                            { web: null, mobile: [0.462] }).phones[0];

  it('defaults to the phone body, exactly as it always did', () => {
    const p = mob({});
    expect(p.chrome.kind).toBe('phone');
    expect(p.chrome.frame).toBeGreaterThan(0);
  });

  it('frameKind none gives a bare screenshot — no bezel, no device body', () => {
    const p = mob({ elements: { mobile: { frameKind: 'none' } } });
    expect(p.chrome).toBeNull();
  });

  it('frameKind browser puts a title bar above a portrait screenshot', () => {
    const p = mob({ elements: { mobile: { frameKind: 'browser' } } });
    expect(p.chrome.kind).toBe('browser');
    expect(p.chrome.barH).toBeGreaterThan(0);
    expect(p.chrome.screen.h / p.chrome.screen.w).toBeCloseTo(1 / 0.462, 6);
  });

  it('the screenshot keeps its own ratio under every frame', () => {
    for (const frameKind of ['none', 'browser', 'phone']) {
      const p = mob({ elements: { mobile: { frameKind } } });
      const s = p.chrome ? p.chrome.screen : p;
      expect(s.w / s.h).toBeCloseTo(0.462, 6);
    }
  });

  it('a web+mobile shot can frame each element differently', () => {
    const out = layout(normalise({
      layout: 'web+mobile', ratio: '3:2',
      elements: { web: { frameKind: 'browser' }, mobile: { frameKind: 'none' } },
    }), { web: 1.6, mobile: [0.462] });
    expect(out.web.chrome.kind).toBe('browser');
    expect(out.phones[0].chrome).toBeNull();
  });
});
```

- [x] **Step 2: Run and watch them fail**

Run: `npx vitest run test/layout.test.js -t 'the mobile element takes a frame'`
Expected: the first PASSES only if `phoneBox` already reports a `chrome` block — it does not, so expect it to fail too. All five FAIL.

- [x] **Step 3: Give `phoneBox` the same shape a web box has**

`phoneBox(ratio, h, cx, cy)` computes a bezel and two radii inline. Rewrite it to compute the screenshot's box first and grow the frame outward, exactly as `webBox` does, so both go through `frameInsets` and `chromeFor` and there is one outset model rather than two:

```js
function phoneBox(c, el, ratio, h, cx, cy) {
  // 1. The screenshot's own box, from the SOURCE ratio. `h` is the height
  //    the layout allotted this phone; the width follows the picture.
  const sh = h;
  const sw = sh * (ratio || PHONE_FALLBACK_RATIO);

  // 2. Grow the frame outward from it — the same call webBox makes, so a
  //    phone frame here and a phone frame around a web shot are the same
  //    geometry rather than two implementations that agree by accident.
  const ins = frameInsets(c, el, sw, Math.min(c.w, c.h));
  const ow = sw + ins.left + ins.right;
  const oh = sh + ins.top + ins.bottom;

  const box = { x: cx - ow / 2, y: cy - oh / 2, w: ow, h: oh };
  box.radius = radiusFor(c, el, box);
  box.strokeWidth = ins.stroke;
  box.inner = {
    x: box.x + ins.stroke, y: box.y + ins.stroke,
    w: ow - ins.stroke * 2, h: oh - ins.stroke * 2,
    radius: Math.max(0, box.radius - ins.stroke),
  };
  box.chrome = chromeFor(c, el, box, ins, sw, sh);
  return box;
}
```

**The phone's own height allotment does not change.** `layout()` still computes `ph` from `c.h` and the phone count exactly as it does now, and still passes it in. What changes is only that the bezel is now an outset around it rather than an inset carved out of it — which is the same correction Cycle A Task 6 made for the web box, and it means turning the phone frame off makes the screenshot bigger rather than the same size with a hole where the bezel was.

The legacy `frame` / `innerRadius` fields on the returned box are **removed**, not kept alongside `chrome` — two sources for one number is the defect this cycle exists to remove. `paintPhone` reads `box.chrome` instead.

- [x] **Step 4: Dispatch the mobile painter on `frameKind`**

`paintPhone` becomes a dispatcher with the same three branches `paintWeb` already has:

```js
export function paintPhone(ctx, c, box, image, makeCanvas, el = c.elements.mobile) {
  if (box.chrome?.kind === 'browser') return paintWebChrome(ctx, c, box, image, makeCanvas, el);
  if (box.chrome?.kind === 'phone') return paintPhoneChrome(ctx, c, box, image, makeCanvas, el);
  // Unframed: the same three calls paintWeb makes for a bare screenshot.
  // 0.22/0.10, not 0.17/0.07 — a phone-sized card sitting on the ground is
  // what those alphas were verified against (see paintShadow's comment).
  paintShadow(ctx, box, box.h * 0.055, box.h * 0.14, 0.22, 0.10, el.shadowScale);
  paintStroke(ctx, box, el.stroke, box.strokeWidth);
  placeShot(ctx, makeCanvas, box.inner, box.inner,
    (t, at) => drawFitted(t, at(box.inner), image, 'contain'));
}
```

**Note the fit changes from `cover` to `contain` on the unframed path, and only there.** `paintPhoneChrome` keeps its own behaviour. The reason: a bare screenshot has no bezel to crop against, so cropping it would silently discard picture the user can see nowhere else. Say this in the report — it is a visible change to what a phone screenshot shows.

> **Corrected during execution.** Two things the plan missed:
>
> 1. `layout()`'s stagger and web+mobile offset are fractions of the
>    device's OUTER width. That used to be `h * ratio` because `h` was the
>    device's own height; now `h` is the screenshot's, so the outer width
>    has to be asked for or the arrangement quietly tightens by two bezels.
>    Hence `phoneMetrics`, split out of `phoneBox`.
> 2. `PRE_FRAME_BASELINE`'s phone entries could not simply be renumbered.
>    They are left exactly as captured and compared by TRANSFORMATION
>    instead — the picture now occupies what the device used to, and the
>    device grew by one bezel a side — which states the change rather than
>    burying it in new magic numbers.

- [x] **Step 5: Run everything, and check the goldens**

```bash
npx vitest run && git status --short test/golden
```

Expected: PASS. `mobile.png` and `web-mobile.png` **will** move — the bezel became an outset, so the screenshot inside a phone is now larger. That is the same correction Task 6 of Cycle A made for the web box and it is the point of this task. Regenerate them, and confirm **nothing else** moved:

```bash
node scripts/make-render-goldens.js && git status --short test/golden
```

Only `mobile.png` and `web-mobile.png` may appear. If `phone.png` moved, the web box's phone frame was disturbed and something is wrong.

- [x] **Step 6: Add two goldens for the new frames**

```js
  ['mobile-browser', { layout: 'mobile', ratio: '3:2', elements: { mobile: { frameKind: 'browser' } } }, { web: null, mobile: ['samples/karaoke-mobile.png'] }],
  ['mobile-bare',    { layout: 'mobile', ratio: '3:2', elements: { mobile: { frameKind: 'none' } } },    { web: null, mobile: ['samples/karaoke-mobile.png'] }],
```

Add them to both `scripts/make-render-goldens.js` and `test/compose.test.js`, with a comment in the file's own style saying that without them a stubbed mobile dispatcher would leave every existing golden untouched.

- [x] **Step 7: Commit, push, deploy, and STOP**

```bash
git add core test scripts
git commit -m "feat(core): the mobile element takes a frame, like the web one"
git push origin feat/cycle-b
```

Tell Rock:

> Drop a **portrait** screenshot. The Frame control now works on it: **Phone** is the device body as before, **Browser** puts a title bar above it, **None** is the bare screenshot. Also check a desktop + phone shot — the two can now be framed differently. One visible change to call out: an unframed phone screenshot is no longer cropped to fill, because there is no bezel to crop against.

**Then stop.**

---

## Task 5: Stroke and shadow per element

**Files:**
- Modify: `core/render.js` — `paintDeviceHairline`'s conditionality
- Modify: `web/inspector-frame.js` — the stroke and shadow controls write the selected element
- Test: `test/render-stroke.test.js`, `test/inspector-frame.test.js`

**Interfaces:**
- Consumes: Tasks 2 and 4. `el.stroke` and `el.shadowScale` already reach the painters; this task makes them reachable from the panel and settles the phone body's own highlight.

- [x] **Step 1: Settle the phone body's inner highlight, and say what you settled**

Cycle A Task 7 took the position "leave it": `paintDeviceHairline` strokes `rgba(255,255,255,0.10)` inside every phone body unconditionally, because it is the *device's* own highlight — the phone equivalent of the browser frame's border — and not an unrequested edge on someone's screenshot.

That position still holds and **does not change here**. What changes is that there is now an unframed mobile element (Task 4), and an unframed screenshot must have no highlight at all — there is no device for it to belong to. Confirm by test that `frameKind: 'none'` on the mobile element draws no hairline, and that `phone` still does.

- [x] **Step 2: Write the failing tests**

```js
describe('per-element stroke and shadow (Task 5)', () => {
  it('the phone can carry a mat the desktop shot does not', () => {
    const out = scene({
      layout: 'web+mobile',
      elements: { mobile: { stroke: { style: 'light', width: 0.02 } } },
    });
    expect(out.lay.phones[0].strokeWidth).toBeGreaterThan(0);
    expect(out.lay.web.strokeWidth).toBe(0);
  });

  it('the phone can carry a shadow the desktop shot does not', () => {
    const out = normalise({ layout: 'web+mobile',
      elements: { web: { shadowScale: 0 }, mobile: { shadowScale: 1.6 } } });
    expect(out.elements.web.shadowScale).toBe(0);
    expect(out.elements.mobile.shadowScale).toBeCloseTo(1.6, 9);
  });

  it('an unframed mobile screenshot has no device highlight', () => {
    // The highlight belongs to the DEVICE. With no device there is nothing
    // for it to sit on, and it would read as exactly the unrequested border
    // Cycle A Task 1 removed. Sampled one pixel inside the shot's own edge,
    // against a flat black source: any white line shows immediately.
    const bare = phoneScene({ elements: { mobile: { frameKind: 'none' } } });
    const b = bare.lay.phones[0];
    const mid = Math.round(b.y + b.h / 2);
    expect(px(bare.ctx, Math.ceil(b.x) + 1, mid)).toEqual([0, 0, 0]);
  });

  it('a phone-framed one still has it — the device keeps its highlight', () => {
    const framed = phoneScene({ elements: { mobile: { frameKind: 'phone' } } });
    const b = framed.lay.phones[0];
    const mid = Math.round(b.y + b.h / 2);
    const [r] = px(framed.ctx, Math.ceil(b.x) + 1, mid);
    expect(r).toBeGreaterThan(20);   // #111318 lifted by the 0.10 white line
  });
});
```

`phoneScene` renders a `mobile` layout over a flat `#000000` source, the same way `scene` in that file already does for the web layout. Do not duplicate the harness — extend it.

> **Corrected during execution.** Two things.
>
> 1. The plan's sample point was wrong. The device highlight occupies
>    exactly ONE pixel column, at `Math.ceil(box.x)`; `+1`, as sketched, is
>    already the device body. Measured on a flat-black source at 3:2:
>    `none` reads 0,0,0 / 0,0,0 / 0,0,0 across +0..+2, and `phone` reads
>    34,36,40 / 17,19,24 / 17,19,24. The sketched assertion (`r > 20` at +1)
>    would have failed against correct code.
> 2. This task's render side was already delivered by Tasks 2 and 4, so the
>    render tests below pass on arrival and are regression guards, not
>    new-behaviour guards. The red-then-green work for Task 5 is entirely in
>    the panel writers (Step 5).

- [x] **Step 3: Run and watch them fail; verify the sample points**

Run: `npx vitest run test/render-stroke.test.js -t 'per-element'`

**Verify the last two sample points before trusting them.** Cycle A's Task 1 test sampled two pixels inside a box whose edge was fractional and could not fail. Print the actual pixel values at `Math.ceil(b.x)`, `+1` and `+2` for both cases and confirm the highlight is visible at the point being asserted. Record those numbers in the report.

- [x] **Step 4: Make the highlight conditional on there being a device**

`paintPhoneChrome` and `paintPhone`'s phone branch call `paintDeviceHairline`; the unframed branch added in Task 4 does not. If Task 4 was implemented correctly this step is already done — confirm it, and add the comment saying why, rather than assuming.

- [x] **Step 5: Point the stroke and shadow controls at the element**

`setStrokeStyle`, `setStrokeWidthPercent`, `setStrokeColor` and `setShadowPercent` in `web/inspector-frame.js` currently write `config.stroke` and `config.shadowScale`. They now write `config.elements[which]`, with `which` defaulting to `'web'` until Task 7 supplies the selection.

Keep the defaults-first, current-second, changed-field-last ordering already established there, and add a test that changing the stroke style does not reset a width the user set — the Task 5b guard, now one level deeper and therefore easier to get wrong.

- [x] **Step 6: Commit, push, deploy, and STOP**

```bash
git add core web test
git commit -m "feat(core): stroke and shadow belong to an element"
git push origin feat/cycle-b
```

Tell Rock:

> Drop a desktop screenshot **and** a phone screenshot. The stroke and shadow controls still act on the desktop shot for now — Task 7 is what lets you point them at the phone. What to check here: a phone with **Frame: None** has no white inner line on it, and a phone with **Frame: Phone** still does. That line is the device's own highlight; with no device it should not be there.

**Then stop.**

---

## Task 6: Canvas selection, as a DOM overlay

**Files:**
- Create: `web/selection.js`
- Modify: `web/state.js` — `state.selection`
- Modify: `web/main.js` — the canvas click, and repositioning on render/resize
- Modify: `web/style.css` — the outline
- Test: `test/selection.test.js` (create), `test/web-export.test.js`

**Interfaces:**
- Consumes: `layout()`'s boxes, via `state.meta`.
- Produces: `state.selection` is `'web' | 'mobile' | null`. `hitTest(lay, x, y)` in `web/selection.js` takes canvas-space coordinates and returns an element kind or null.

**The rule that makes this task dangerous.** The preview canvas *is* the export canvas. An outline drawn into it ships in the PNG. So the outline is a DOM element positioned over the canvas, and `web/selection.js` may not contain the string `getContext` at all.

- [x] **Step 1: Write the failing tests**

Create `test/selection.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalise } from '../core/config.js';
import { layout } from '../core/layout.js';
import { hitTest } from '../web/selection.js';

const lay = (o = {}) => layout(
  normalise({ layout: 'web+mobile', ratio: '3:2', ...o }),
  { web: 1.6, mobile: [0.462] },
);

describe('hit-testing the canvas', () => {
  it('the middle of the web shot selects web', () => {
    const l = lay();
    expect(hitTest(l, l.web.x + l.web.w / 2, l.web.y + l.web.h / 2)).toBe('web');
  });

  it('the middle of the phone selects mobile', () => {
    const l = lay();
    const p = l.phones[0];
    expect(hitTest(l, p.x + p.w / 2, p.y + p.h / 2)).toBe('mobile');
  });

  it('the phone wins where it overlaps the web shot — it is drawn on top', () => {
    const l = lay();
    const p = l.phones[0];
    // The phone rises out of the bottom-right of the web shot, so its own
    // left edge sits over it. A point 4px inside the phone's left edge is
    // inside BOTH boxes; painting order decides, and the phone is painted
    // last. Verified by asserting the point really is inside the web box.
    const x = p.x + 4, y = p.y + p.h * 0.25;
    expect(x).toBeGreaterThan(l.web.x);
    expect(x).toBeLessThan(l.web.x + l.web.w);
    expect(hitTest(l, x, y)).toBe('mobile');
  });

  it('the bare ground selects nothing', () => {
    const l = lay();
    expect(hitTest(l, 4, 4)).toBeNull();
  });

  it('an empty layout selects nothing rather than throwing', () => {
    expect(hitTest({ web: null, phones: [] }, 100, 100)).toBeNull();
  });
});

describe('the selection never reaches the canvas', () => {
  it('web/selection.js does not touch a canvas at all', () => {
    // Structural, and deliberately so: the preview canvas IS the export
    // canvas, so an outline painted into it would ship inside every PNG.
    // A pixel test would only catch the cases someone thought to render.
    const src = readFileSync('web/selection.js', 'utf8');
    for (const banned of ['getContext', 'canvas.width', 'drawImage', 'fillRect']) {
      expect(src).not.toContain(banned);
    }
  });
});
```

And in `test/web-export.test.js`, the claim that matters most:

```js
it('an active selection leaves the export byte-identical', async () => {
  const before = await exportBytes();
  state.selection = 'web';
  const after = await exportBytes();
  expect(Buffer.compare(before, after)).toBe(0);
});
```

Use that file's existing export harness rather than a new one.

- [x] **Step 2: Run and watch them fail**

Run: `npx vitest run test/selection.test.js`
Expected: every test FAILS — `web/selection.js` does not exist.

The export test will PASS immediately, because nothing draws a selection yet. **Say so in the report.** It is a regression guard for the rest of this cycle, not a new-behaviour guard, and calling it a passing test would be the twelfth dead guard.

- [x] **Step 3: Write `web/selection.js`**

```js
// web/selection.js — which element the pointer is over, and the DOM outline
// that says so.
//
// THIS FILE MUST NEVER TOUCH A CANVAS. The preview canvas is the export
// canvas (see web/state.js), so anything painted into it ships inside every
// exported PNG. The outline is therefore an absolutely-positioned DOM
// element over the canvas, scaled by the same factor CSS already scales the
// canvas by. test/selection.test.js enforces this by reading this file's
// source — a structural guard, because a pixel test would only cover the
// compositions someone thought to render.

/**
 * Which element covers canvas-space point (x, y), or null.
 *
 * PAINTING ORDER DECIDES OVERLAPS, so phones are tested first: core/index.js
 * paints the web shot and then the phones, and in the web+mobile layout the
 * phone deliberately sits over the web shot's bottom-right corner. Testing
 * the web box first would select the thing underneath the one you clicked.
 *
 * The test is the composite's OUTER box, not the screenshot inside it: the
 * browser bar and the phone's bezel are part of the element you are
 * selecting, and clicking a phone's bezel plainly means the phone.
 */
export function hitTest(lay, x, y) {
  if (!lay) return null;
  for (const box of (lay.phones || [])) {
    if (within(box, x, y)) return 'mobile';
  }
  if (lay.web && within(lay.web, x, y)) return 'web';
  return null;
}

function within(box, x, y) {
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
}

/**
 * Place the outline over one box. `scale` is the canvas's CSS width divided
 * by its pixel width — the same number the browser is already using to
 * display it — so the outline tracks the shot at any zoom without anyone
 * recomputing the layout.
 */
export function placeOutline(el, box, scale) {
  if (!box) { el.hidden = true; return; }
  el.hidden = false;
  el.style.left = `${box.x * scale}px`;
  el.style.top = `${box.y * scale}px`;
  el.style.width = `${box.w * scale}px`;
  el.style.height = `${box.h * scale}px`;
  el.style.borderRadius = `${(box.radius || 0) * scale}px`;
}
```

- [x] **Step 4: Add `state.selection` and nothing else**

In `web/state.js`, add `selection: null` to `state`. **Do not** add outline logic there — `state.js` holds state and calls `core/`, and giving it a view concern is how the one-render-path rule erodes.

- [x] **Step 5: Wire the click and the outline in `main.js`**

The outline is a `<div id="selectionOutline">` inside `.canvas-surface`, a sibling of the canvas. Position it after every render and on resize, from `state.meta`'s layout. A click on the canvas converts client coordinates to canvas space by the same scale factor and calls `hitTest`; a click that hits nothing clears the selection.

Give it a real keyboard path as well as a pointer one: `Escape` clears the selection, and the canvas takes focus so that is reachable. A selection you can only make with a mouse is not finished.

> **Corrected during execution.** Three things.
>
> 1. `placeOutline` needs an ORIGIN as well as a scale. The canvas is
>    centred inside `.canvas-surface`'s 28px padding, so box coordinates
>    (canvas-relative) and the outline (surface-relative) differ by that
>    offset. Without it the outline sits a padding's width off — a bug that
>    looks like a rounding error and is not. `.canvas-surface` also needed
>    `position: relative`, or the outline escapes to the viewport.
> 2. `main.js` had no post-render hook, so `state.js` gained a small
>    `onRender(fn)` subscriber list. That keeps the inversion where
>    `render()` lives instead of making every caller remember to reposition.
> 3. The structural guard's first run FAILED on the word `getContext` inside
>    `web/selection.js`'s own comment explaining why it must never call it.
>    The test now strips comments and scans code — and carries a second
>    assertion proving the stripping did not swallow the code too, by
>    checking `core/render.js` still reads as containing `getContext`.

- [x] **Step 6: Style the outline**

In `web/style.css`, using tokens only:

```css
/* The selection outline. A DOM element over the canvas, never a painted
   pixel — see web/selection.js. `outline` rather than `border` so it cannot
   change the box's own size, and a 2px one so it clears Task 3b's 3:1
   floor for a graphic boundary against both a pale and a dark ground. */
.selection-outline {
  position: absolute;
  pointer-events: none;
  outline: 2px solid var(--border-strong);
  outline-offset: 2px;
}
```

If `--border-strong` does not clear 3:1 against the palest ground the app can produce, add a token for this rather than reaching for a raw hex — `web/tokens.css` is the only file allowed one.

- [x] **Step 7: Run everything**

```bash
npx vitest run && git status --short test/golden
```

Expected: PASS, no golden moved. The export test is the one to read twice.

- [x] **Step 8: Commit, push, deploy, and STOP**

```bash
git add web test
git commit -m "feat(web): click the canvas to select an element"
git push origin feat/cycle-b
```

Tell Rock:

> Drop a desktop screenshot **and** a phone screenshot, then click each one on the canvas. An outline should follow what you clicked, including the frame around it, not just the picture. Click the background to clear it, or press Escape. Then export — the outline must not be in the PNG. Nothing in the inspector responds to the selection yet; that is the next task.

**Then stop.**

---

## Task 7: The inspector follows the selection

**Files:**
- Modify: `web/inspector-frame.js` — every reader and writer takes the selected element
- Modify: `web/main.js` — re-sync the inspector when the selection changes
- Test: `test/inspector-frame.test.js`

**Interfaces:**
- Consumes: Task 6's `state.selection`, Task 5's element-aware writers.
- Produces: the Frame and Finish sections read and write `state.config.elements[selected]`, where `selected` is `state.selection ?? 'web'`.

- [ ] **Step 1: Decide what "nothing selected" means, and write it down**

`state.selection` is null until something is clicked, and a shot with only a desktop screenshot has nothing to select but the desktop screenshot. Two defensible answers; take the first:

- **The panel edits `web` when nothing is selected**, because that is what it has always edited and because a mobile-only shot is the case where it matters, and there `web` does not exist. Refine to: **the selection defaults to the only element present**, and to `web` when both are.
- Grey the whole panel until something is selected. Rejected: it makes the common case (one screenshot, no clicking) worse to serve the rare one.

```js
/** The element the panel is editing. `state.selection` when set; otherwise
 *  the only element the shot actually has; otherwise 'web'. */
export function editingElement(state) {
  if (state.selection) return state.selection;
  const hasWeb = !!state.images.web;
  const hasMobile = state.images.mobile.length > 0;
  if (!hasWeb && hasMobile) return 'mobile';
  return 'web';
}
```

- [ ] **Step 2: Write the failing tests**

```js
describe('the inspector edits the selected element (Task 7)', () => {
  it('edits web by default', () => {
    expect(editingElement({ selection: null, images: { web: {}, mobile: [] } })).toBe('web');
  });

  it('edits mobile when that is the only thing on the canvas', () => {
    expect(editingElement({ selection: null, images: { web: null, mobile: [{}] } }))
      .toBe('mobile');
  });

  it('an explicit selection wins over both', () => {
    expect(editingElement({ selection: 'web', images: { web: null, mobile: [{}] } }))
      .toBe('web');
  });

  it('writes the frame to the selected element and no other', () => {
    const config = {};
    setFrameKind(config, 'browser', 'mobile');
    expect(config.elements.mobile.frameKind).toBe('browser');
    expect(config.elements.web).toBeUndefined();
  });

  it('reads back the selected element, not always web', () => {
    const config = { elements: { web: { frameKind: 'none' }, mobile: { frameKind: 'browser' } } };
    expect(activeFrameKind(config, 'web')).toBe('none');
    expect(activeFrameKind(config, 'mobile')).toBe('browser');
  });
});
```

- [ ] **Step 3: Run and watch them fail**

Run: `npx vitest run test/inspector-frame.test.js -t 'edits the selected element'`
Expected: all five FAIL — `editingElement` does not exist and the writers take no element argument.

- [ ] **Step 4: Thread `which` through the panel**

Every `active*` and `set*` in `web/inspector-frame.js` gains a trailing `which = 'web'`. The DOM layer reads `editingElement(state)` once per sync and passes it down. The section header gains a label saying which element is being edited — without it, two identical panels editing different objects is a trap, not a feature.

- [ ] **Step 5: Re-sync on selection change**

`main.js` calls the inspector's `sync*` functions when `state.selection` changes. The controls must show the newly-selected element's values immediately, not on the next interaction. Add a test that a selection change followed by a sync leaves each control displaying that element's value.

- [ ] **Step 6: Commit, push, deploy, and STOP**

```bash
git add web test
git commit -m "feat(web): the inspector edits the selected element"
git push origin feat/cycle-b
```

Tell Rock:

> Drop a desktop screenshot and a phone screenshot. Click the phone: the Frame, Corner radius, Stroke and Shadow controls now act on the phone. Click the desktop shot: they act on that. The panel says which one it is editing. Give the two different frames and different strokes and confirm they hold independently.

**Then stop.**

---

## Task 8: Controls that cannot act are disabled

**Files:**
- Modify: `web/inspector-frame.js`, `web/inspector-background.js`
- Modify: `web/style.css`
- Test: `test/inspector-frame.test.js`, `test/contrast.test.js`

**Interfaces:**
- Consumes: everything above.
- Produces: `disabledControls(config, which)` — a pure function returning the set of control ids that cannot act for the given element, so the rule is testable without a DOM.

**After Tasks 3–7 there should be very little left.** That is the point: the honest fix for a control that does nothing was to make it do something, and disabling is the residue. Enumerate what remains rather than assuming it is empty.

- [ ] **Step 1: Enumerate what still cannot act, by reading the code**

Go through every control in the Frame and Finish sections and, for each, find the line in `core/` that reads its field. A control whose field is read on no code path for the current element is inert. Write the list into the task report **before** writing any code, with the file and line for each.

Known candidates at the time of writing:

- **Chrome theme** and **URL** — browser-only, already gated by `showsBrowserOnlyControls`. Confirm that gate still holds per element.
- **Padding** — canvas-level, not per element. It acts on any layout, so it is not inert; confirm rather than assume.
- **Stroke colour** — custom-only, already gated.

If the list comes back empty, say so plainly and skip to Step 4. An empty list is a real outcome here.

- [ ] **Step 2: Write the failing tests**

```js
describe('controls that cannot act say so (Task 8)', () => {
  it('names exactly the controls with no code path for this element', () => {
    // Not a snapshot: each entry below was traced to the core/ line that
    // does or does not read it. See the task report.
    expect(disabledControls({ elements: { web: { frameKind: 'none' } } }, 'web'))
      .toEqual(new Set(['chromeTheme', 'url']));
    expect(disabledControls({ elements: { web: { frameKind: 'browser' } } }, 'web'))
      .toEqual(new Set());
  });

  it('a disabled control is disabled, not merely hidden', () => {
    // Hiding a control answers "where did it go"; disabling answers "why
    // can I not use it". Rock asked for the second: "maybe we should
    // disable controls that are not supposed to work".
    const { syncFrameUI } = initFrameInspector();
    state.config = { elements: { web: { frameKind: 'none' } } };
    syncFrameUI();
    expect(document.querySelector('[data-control="chromeTheme"] button').disabled).toBe(true);
  });
});
```

- [ ] **Step 3: Implement, with explicit colours**

The disabled treatment is a colour, never `opacity` — Cycle A Task 3b removed every `opacity`-based disabled rule and `test/contrast.test.js` enforces it. Reuse the existing `.chip:disabled` and `.zoom-btn:disabled` rules rather than inventing a third.

Each disabled control needs a reason the user can find: a `title` and an `aria-describedby` pointing at one short line, e.g. *"Only a browser frame has a title bar."* A disabled control with no explanation is a different kind of lie.

- [ ] **Step 4: Confirm the contrast guard still passes**

Run: `npx vitest run test/contrast.test.js`

If a new disabled colour fails the floor, change the colour, not the floor.

- [ ] **Step 5: Commit, push, deploy, and STOP**

```bash
git add web test
git commit -m "feat(web): controls that cannot act are disabled, and say why"
git push origin feat/cycle-b
```

Tell Rock:

> Work through the Frame and Finish controls with each frame selected in turn, on both a desktop and a phone shot. Anything greyed out should be greyed for a reason you can see by hovering it. Anything not greyed should do something. That is the whole cycle in one check: no control should lie about what it does.

**Then stop.**

---

## Cycle close

After Task 8 is approved:

1. `npx vitest run` — green.
2. `git status --short test/golden` — clean, and the full set intentional. Expect 16: Cycle A's fourteen plus `mobile-browser` and `mobile-bare`.
3. Update the README: the `elements` block in the `core/` section, the selection model under "Using the app", and remove the "Per-element settings" entry from "Not built yet" — it is the entry this cycle closes.
4. Merge the PR to `main` with `--merge` (not squash — the per-task commits carry the reasoning), delete the branch, and confirm CI on `main` and the production deploy both go green.
5. Verify the live site, not just the preview.
6. **Stop and report before Cycle C.** Cycle C is Background and palette: the type-first restructure, rendered preset tiles, a stronger palette, the dark ground, the accent colour, Angle, per-control Resets, and mesh's second hearing.

---

## Self-review

Run against the spec after writing, before executing.

**Spec coverage.** Structural decision 1 → Tasks 1, 2, 5. "Selection" → Tasks 6, 7. "Carried forward — controls that do nothing" → Tasks 3, 4, 8, and its two open questions are settled in Task 8 Step 3 (disabled treatment) and Task 3 Step 1 (bounded phone radius). "Carried forward — corner radius is inert under a frame" → Task 3, taking the spec's stated preference to make it work rather than disable it.

**Not covered here, deliberately:** the rendered preset tiles, Angle and per-control Resets, which the spec's original Cycle B carried. They are Background-panel work and moved to Cycle C with the rest of it, per the revised four-cycle split.

**Known gap.** Task 8's list of still-inert controls is written to be discovered rather than specified, because it depends on what Tasks 3–7 actually close. That is a placeholder in form but not in substance: the task specifies the method (trace each control to the `core/` line that reads it), the artefact (the list, with file and line, in the report before any code), and the acceptable outcome (an empty list is a real answer). It cannot be satisfied by guessing.

**Type consistency.** `el` is the resolved element block throughout `core/`; `which` is the element *name* (`'web'`/`'mobile'`) throughout `web/`. `frameKind`, `chromeTheme`, `url`, `radius`, `stroke`, `shadowScale` are the six fields, spelled identically in `ELEMENT_DEFAULTS`, `normalise()`, the painters and the panel. `radiusFor(c, el, box)` is defined in Task 3 and used by Task 4's `phoneBox`. `hitTest(lay, x, y)` and `placeOutline(el, box, scale)` are Task 6's only exports; note that `el` there is a DOM element, not an element block — the one collision in the cycle, and it is confined to that file.
