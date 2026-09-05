# shotkit Cycle C — Background, End to End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the background worth choosing. Today it is one pale wash: "Ground tone" offers Light and Mid, both of which are pale — there is no dark ground anywhere in the tool — the eight named hues are indistinguishable at 14×14, and mesh was built and then withheld because on this palette it cannot be seen. All of that is one surface, and this cycle rebuilds it end to end.

**Architecture:** `tone` is replaced by a single continuous `luminosity`, resolved in `core/ground.js`. `null` means *sampled* and reproduces today's two-branch inference exactly, byte for byte — that is the acceptance test for the change, not a nicety. A number sets the ground's own top-stop lightness, and the two stops below it follow by ratios interpolated between the two branches that exist now, clamped so a near-black ground still has structure. The panel then rebuilds around it: type first, sampled inside each type, presets as tiles rendered by the real generator rather than approximated in CSS.

**Tech Stack:** Zero-dependency ES modules in `core/`; Vite + vanilla JS in `web/`; vitest with `@napi-rs/canvas` and `pixelmatch` for goldens.

**Spec:** `docs/superpowers/specs/2026-09-02-shotkit-round-two-design.md` — "Background, type-first", "Cycle C's shape", "Carried forward — a dark ground", "Carried forward — Background panel", "Mesh is built, and withheld".

## Global Constraints

Carried forward from Cycles A and B. Every task's requirements implicitly include these.

- `composeWithMeta` is called from **exactly one place** in `web/` (`web/state.js`, inside `render()`).
- The preview canvas **is** the export canvas. Nothing may be drawn into it that must not appear in the exported PNG. `web/selection.js` may not touch a canvas at all, enforced structurally.
- **No engine detection** anywhere in `core/`.
- `core/` has **zero runtime dependencies**.
- `web/tokens.css` is the **only** file in `web/` allowed to contain a raw hex colour.
- `[hidden] { display: none !important; }` stays a **single global rule**.
- **A disabled state is an explicit colour, never `opacity`.** `opacity` outside `@keyframes` is not permitted.
- Contrast floors: informational text ≥ 7:1, ladder separation ≥ 1.2, interactive or graphic boundaries ≥ 3:1, decorative 1.8–2.5.
- **One value, one home.** A control writes to exactly one place; readers may accept every input shape. This is the rule the shadow slider died for in Cycle A and the element block was built on in Cycle B.
- Geometry in `core/` is **proportional to the canvas**, never fixed pixels, except the documented minimums (`lineWidth = 1`, the 240px grain tile, `PHONE_BEZEL_MIN = 3`, `SHADOW_SOURCE_INSET = 2`, `TILE_BLEED = 1`).
- **Nothing is painted behind a shot, and nothing is drawn inside a clip.**
- **Do not retune `paintShadow`'s alphas** — `0.17 / 0.07` web and browser, `0.22 / 0.10` phones — without saying so explicitly and showing the measurement. Task 2 is the one place this cycle even looks at them.
- **An inset hairline's radius shrinks with its inset** (`strokeInsetHairline`).
- Run `npx vitest run` before and after every task. Commit only green.
- After each task, push the branch. Do not merge to `main` mid-cycle.

### The rule this cycle exists to defend

**A control must be worth having, not merely present.** Cycle B's rule was that a control must act; this cycle's is stronger. Mesh acted — every slider moved something — and was still withheld, because on this palette nothing it did could be seen. "It changes pixels" is not the bar. The bar is that Rock can see the difference and wants it.

### THE APPROVAL GATE

**Every task that changes anything Rock can see ends by deploying a preview and STOPPING.** Task 0 opens the branch and the pull request; every push then rebuilds one preview:

**https://deploy-preview-3--shotkit-app.netlify.app**

(PR #3, the next number after Cycle B's #2. Confirm from `gh pr view` after Task 0 and correct this line if it differs.)

`test` and `netlify/shotkit-app/deploy-preview` must both be green before handing over. Then stop. Do not assume approval from silence.

**This cycle is almost entirely taste.** More than any before it, "the tests pass" says very little — a palette that measures well and looks muddy is a failed task. Every handover must say what to *look at*, not only what to click.

### Tests that cannot fail

Cycles A and B produced fifteen between them. The pattern is consistent enough to name: **a test whose setup leaves the old code path on its default will pass by accident**, and **a sample point chosen by arithmetic rather than by measurement will read the wrong thing**. Cycle B added a third: **a comparison that includes a value which moves for a different reason** — the enumeration that compared whole layouts, including the safe box, and reported that everything worked.

So, for every assertion added below:

1. Run it against the **unchanged** code first and record that it goes red.
2. If it goes green, it is not a test. Fix it or delete it — do not tune it.
3. For any pixel assertion, print the actual values around the sample point and record them beside it.
4. Say in the task report which assertions are regression guards that pass on arrival. Do not count those as evidence.

---

## File Structure

| File | Responsibility this cycle |
|---|---|
| `core/ground.js` | `tail()` takes a continuous luminosity; `tone` retired |
| `core/presets.js` | `LUMINOSITY_RANGE`, the palette's saturation constants, `HUES` if it changes |
| `core/config.js` | `luminosity` replaces `tone` |
| `core/index.js` | exports the new vocabulary |
| `web/inspector-background.js` | rebuilt: type first, sampled inside each type, luminosity, angle |
| `web/preset-tiles.js` | **new** — renders a preset into a small canvas through the real generator |
| `web/sidebar.js` | `renderGroundSwatches` retires in favour of the tiles |
| `web/style.css` | the tile grid, the full-width preset row, the angle readout |

`web/preset-tiles.js` is a new file because it is the one piece here with a hard rule attached — *the tile is drawn by the real generator, never approximated* — and a rule is easier to keep in a file that contains only the thing it governs. That is the same reasoning that gave `web/selection.js` its own file in Cycle B, and the same class of defect: a swatch that lies about what it will produce.

---

## Task 0: Branch, pull request, preview

**Files:** none changed.

Cycle B learned that GitHub will not open a pull request on a branch with no commits, so this folds into Task 1: branch first, do Task 1's work, commit, then open the PR with it.

- [x] **Step 1: Branch from an up-to-date main**

```bash
git checkout main && git pull --ff-only && git checkout -b feat/cycle-c
```

- [ ] **Step 2: After Task 1's commit, open the PR**

```bash
gh pr create --title "Cycle C — background, end to end" --body "$(cat <<'EOF'
Cycle C of the round-two plan. This PR stays open for the whole cycle: each task
pushes to it, so the deploy preview URL below always reflects the latest task.

**Spec:** `docs/superpowers/specs/2026-09-02-shotkit-round-two-design.md`
**Plan:** `docs/superpowers/plans/2026-09-04-shotkit-cycle-c.md`

**Preview:** https://deploy-preview-3--shotkit-app.netlify.app

The background, rebuilt end to end. Today it is one pale wash: both "Ground
tone" options are pale, the eight hues are indistinguishable at 14×14, and
mesh was built and then withheld because on this palette it cannot be seen.

- [ ] 1. `luminosity` replaces `tone` in core/ — sampled still means sampled
- [ ] 2. The shadow, re-verified across the whole luminosity range
- [ ] 3. A palette worth choosing from
- [ ] 4. Background becomes type-first, with sampled inside each type
- [ ] 5. Preset tiles, rendered by the real generator
- [ ] 6. Full-width preset rows, and whether a preset carries its angle
- [ ] 7. Angle made legible
- [ ] 8. Mesh's second hearing

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Task 1: `luminosity` replaces `tone`

**Files:**
- Modify: `core/ground.js` — `tail()`
- Modify: `core/presets.js` — `LUMINOSITY_RANGE`, the two anchor triples
- Modify: `core/config.js` — `luminosity` replaces `tone`
- Modify: `core/index.js`
- Modify: `web/inspector-background.js` — the Tone segmented becomes a slider
- Test: `test/ground.test.js`, `test/inspector-background.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `normalise()` returns `luminosity: null | number` and no longer returns `tone`. `groundFor(samples, forceHue, luminosity)` and `groundFromMeta(meta, forceHue, luminosity)` keep their arity; the third argument changes meaning from `'light' | 'mid' | null` to `number | null`.

**The whole task in one sentence:** `null` must reproduce today's output byte for byte, and a number must reach somewhere today cannot.

- [x] **Step 1: Understand the two triples you are interpolating between**

`tail()` in `core/ground.js` produces one of two hard-coded ground triples, chosen by `darkUI = lum < 0.34` and overridable by `mode`:

```
light branch   lightness  0.975  0.925  0.868     sat × 0.55  0.62  0.66
mid branch     lightness  0.855  0.780  0.712     sat × 0.42  0.40  0.44
```

"Mid" means *less pale*. Neither is dark. Rock: *"in the ground tone, why don't we have dark anymore? or you never had it?"* — it never existed.

**The model.** `luminosity` is the **top stop's lightness**. The two stops below follow by RATIO, not by subtraction:

```
light branch   0.925/0.975 = 0.948718…   0.868/0.975 = 0.890256…
mid branch     0.780/0.855 = 0.912281…   0.712/0.855 = 0.832749…
```

Ratios rather than differences because a difference goes negative at the dark end — extrapolating the light branch's 0.107 gap below a top stop of 0.15 produces a negative lightness — while a ratio cannot. Interpolate each ratio linearly in the top stop's lightness across those two anchors, then clamp:

```js
// Anchors: (L, k1, k2) at the two grounds that exist today. `t` is 0 at the
// light branch and 1 at the mid branch, and keeps going past both.
const LUM_ANCHOR_LIGHT = { l: 0.975, k1: 0.925 / 0.975, k2: 0.868 / 0.975, sat: [0.55, 0.62, 0.66] };
const LUM_ANCHOR_MID   = { l: 0.855, k1: 0.780 / 0.855, k2: 0.712 / 0.855, sat: [0.42, 0.40, 0.44] };

// Clamped so a near-black ground still has structure: unclamped, the ratios
// keep falling and the third stop collapses toward 0 long before the slider
// reaches its own floor.
export const LUM_K1_RANGE = [0.86, 0.96];
export const LUM_K2_RANGE = [0.76, 0.92];

// The slider's own bounds. 0.975 is the palest ground today; 0.15 is the
// near-black Rock asked for. Nothing above the current top, because a
// ground lighter than 0.975 is white.
export const LUMINOSITY_RANGE = [0.15, 0.975];
```

**The acceptance test is exactness, not closeness.** At `t = 0` and `t = 1` — that is, at luminosity 0.975 and 0.855 — the interpolation must return the two triples above *identically*, so that `luminosity: null` renders byte-for-byte what ships today. The ratios above are written as divisions, not decimals, precisely so this holds to the last bit.

- [x] **Step 2: Write the failing tests**

Add to `test/ground.test.js`:

```js
describe('luminosity replaces tone (Cycle C Task 1)', () => {
  const SAMPLES = /* reuse this file's existing fixture */;

  it('null reproduces the sampled inference exactly, for a pale UI', () => {
    // The whole cycle rests on this: a config that does not mention
    // luminosity must render what it always did.
    const before = groundFor(SAMPLES.pale, null, null);
    expect(before.ground).toEqual(['#f7f4ff', '#ece6fb', '#ded3f5']); // <- replace with the file's own frozen values
  });

  it('the light anchor is bit-identical to the old light branch', () => {
    const sampled = groundFor(SAMPLES.pale, null, null);
    const explicit = groundFor(SAMPLES.pale, null, 0.975);
    expect(explicit.ground).toEqual(sampled.ground);
  });

  it('the mid anchor is bit-identical to the old mid branch', () => {
    const sampled = groundFor(SAMPLES.dark, null, null);   // dark UI => the old 'mid'
    const explicit = groundFor(SAMPLES.dark, null, 0.855);
    expect(explicit.ground).toEqual(sampled.ground);
  });

  it('reaches a genuinely dark ground, which nothing before it could', () => {
    const dark = groundFor(SAMPLES.pale, null, 0.15);
    for (const hex of dark.ground) {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
      expect(Math.max(r, g, b)).toBeLessThan(60);
    }
  });

  it('never produces a negative or inverted stop at the floor', () => {
    const dark = groundFor(SAMPLES.pale, null, LUMINOSITY_RANGE[0]);
    const lums = dark.ground.map(hex => parseInt(hex.slice(1, 3), 16));
    expect(Math.min(...lums)).toBeGreaterThan(0);
    // and still a gradient, not three identical stops
    expect(new Set(dark.ground).size).toBe(3);
  });

  it('is monotonic: lower luminosity is never a lighter ground', () => {
    const topOf = (l) => parseInt(groundFor(SAMPLES.pale, null, l).ground[0].slice(1, 3), 16);
    let prev = Infinity;
    for (let l = 0.975; l >= 0.15; l -= 0.05) {
      const v = topOf(l);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });

  it('clamps out of range rather than inverting', () => {
    expect(groundFor(SAMPLES.pale, null, 9).ground)
      .toEqual(groundFor(SAMPLES.pale, null, LUMINOSITY_RANGE[1]).ground);
    expect(groundFor(SAMPLES.pale, null, -9).ground)
      .toEqual(groundFor(SAMPLES.pale, null, LUMINOSITY_RANGE[0]).ground);
  });

  it('tone is gone from the config, not merely ignored', () => {
    const c = normalise({ tone: 'mid' });
    expect(c.tone).toBeUndefined();
    expect(c.luminosity).toBeNull();
  });
});
```

Use `test/ground.test.js`'s own existing sample fixtures and frozen expectations rather than inventing new ones — that file already has a pale case and a dark-UI case with golden values, and reusing them is what makes the first three assertions meaningful.

- [x] **Step 3: Run and watch them fail**

Run: `npx vitest run test/ground.test.js -t 'luminosity replaces tone'`
Expected: every one FAILS. `groundFor`'s third argument is a mode string today, so a number falls through every `if` and lands on the sampled branch — which means the "reaches a dark ground" and "monotonic" cases fail on the values, not on a crash. Confirm that specifically; a crash would prove less.

- [x] **Step 4: Rewrite `tail()`**

```js
function tail({ lum, hue, chroma }, forceHue, luminosity) {
  if (forceHue !== null && forceHue !== undefined) hue = forceHue / 360;

  // SAMPLED IS STILL SAMPLED. `null` runs the same inference it always did
  // - a dark UI gets a less-pale ground so the shot separates from it - and
  // lands on one of the two anchors, which is why a config that never
  // mentions luminosity renders byte-for-byte what it always did.
  const darkUI = lum < 0.34;
  const l = luminosity === null || luminosity === undefined
    ? (darkUI ? LUM_ANCHOR_MID.l : LUM_ANCHOR_LIGHT.l)
    : clamp(luminosity, LUMINOSITY_RANGE[0], LUMINOSITY_RANGE[1]);

  const sat = 0.16 + 0.26 * Math.min(chroma * 1.6, 1);   // never fully saturated

  // t is 0 at the light anchor and 1 at the mid one, and keeps going past
  // both. At exactly 0 and exactly 1 every interpolation below returns its
  // anchor unchanged, so the two grounds that ship today are reproduced to
  // the last bit rather than to within a rounding error.
  const t = (LUM_ANCHOR_LIGHT.l - l) / (LUM_ANCHOR_LIGHT.l - LUM_ANCHOR_MID.l);
  const mix = (a, b) => a + (b - a) * t;

  const k1 = clamp(mix(LUM_ANCHOR_LIGHT.k1, LUM_ANCHOR_MID.k1), ...LUM_K1_RANGE);
  const k2 = clamp(mix(LUM_ANCHOR_LIGHT.k2, LUM_ANCHOR_MID.k2), ...LUM_K2_RANGE);
  const s = [0, 1, 2].map(i => mix(LUM_ANCHOR_LIGHT.sat[i], LUM_ANCHOR_MID.sat[i]));

  const ground = [
    hslToHex(hue, sat * s[0], l),
    hslToHex(hue, sat * s[1], l * k1),
    hslToHex(hue, sat * s[2], l * k2),
  ];

  return {
    ground,
    lum: Math.round(lum * 1000) / 1000,
    hue: Math.round(hue * 360 * 10) / 10,
    chroma: Math.round(chroma * 1000) / 1000,
    darkUI,
    luminosity: l,
  };
}
```

`darkUI` stays on the returned meta: `web/inspector-background.js` reads it for the "a dark screenshot gets a mid-tone ground" hint, and Cycle B's `groundKeyFor` cache key does not include it but callers may. Do not remove a field this task has no reason to touch.

**Watch the saturation at the dark end.** `s` extrapolates past the mid anchor and the mid triple's multipliers are *lower* than the light one's, so a near-black ground gets progressively less chroma — the opposite of what it needs to avoid reading as flat grey. If the dark end looks muddy, clamp `s` with its own range rather than reworking the model, and record the measurement that made you.

- [x] **Step 5: Replace `tone` in the config and the panel**

`core/config.js`: `tone` is deleted, not deprecated. `luminosity: input.luminosity === undefined ? null : num(input.luminosity, null)`, clamped into `LUMINOSITY_RANGE` when not null.

`web/inspector-background.js`: the Tone segmented control (`Auto / Light / Mid`) becomes a slider with a **Sampled** reset beside it — the same idiom the hue control already uses for `resetToSampled`. `null` renders the slider at the sampled position, and moving it writes a number. Reuse `activeToneUi`'s replacement, not a second path.

The hint text under the control must change with it. It currently says a dark screenshot gets a mid-tone ground; that is still true of the sampled default and is now only the default.

> **Corrected during execution.** Three things.
>
> 1. The saturation multipliers needed their own clamp (`LUM_SAT_RANGE`),
>    as the step warned they might: the mid anchor's are LOWER than the
>    light one's, so extrapolating past it drains chroma exactly where a
>    dark ground most needs to keep a hue. Measured at luminosity 0.15 with
>    the clamp: `#20232c / #1c1e26 / #181b22` — blue-leaning, not grey.
> 2. `Math.max(LUMINOSITY_RANGE[0], null)` returns the FLOOR, so a garbage
>    value would have silently produced the darkest ground instead of
>    falling back to sampled. Guarded, and the old "BREAK IT" test was
>    re-aimed at exactly this.
> 3. **The slider sat at the wrong place, and only the browser showed it.**
>    It is built before any image exists, syncs once at init against a null
>    `state.meta`, and so sat at the pale anchor over a dark screenshot
>    whose sampled ground was the mid one — the requirement of this whole
>    task, silently unmet with every test green. Same shape as Cycle B Task
>    7's header reading "Desktop" over a phone-only shot. It re-syncs from
>    `refreshSampled` now. Not unit-tested: `initBackgroundInspector` needs
>    a DOM and this suite has none. Verified in Chromium instead.

- [x] **Step 6: Run everything and check the goldens**

```bash
npx vitest run && git status --short test/golden
```

Expected: PASS, and **no golden modified.** Every golden omits `tone`, so every one takes the sampled branch, so every one must be byte-identical. A moved golden here means the interpolation does not reproduce its anchors and the whole cycle's foundation is wrong.

- [x] **Step 7: Commit, open the PR, deploy, and STOP**

Then tell Rock:

> Drag the new **Luminosity** slider all the way down. There is a dark ground now — there never has been. Check that "Sampled" still puts it back where the app chose, and that a dark screenshot still gets a less-pale ground by default. What I want your eye on: whether the dark end still reads as *coloured* rather than flat grey.

---

## Task 2: The shadow, re-verified across the range

**Files:**
- Test: `docs/verification-2026-09-01.md` (the measurement record)
- Modify: `core/render.js` **only if the measurement demands it**
- Test: `test/render-screen.test.js`

**Interfaces:** none. This task may end with no source change at all, and that is a legitimate outcome.

**Why it is a task and not a checklist item.** `paintShadow`'s alphas were verified against pale grounds only. Two fixed tones meant two cases; a slider means the whole range. The dark end is where a shadow stops reading — a dark shadow on a near-black ground is invisible, and the shot loses its lift. This has to be measured in **Chromium**, because the shadow is the one thing in this codebase where `@napi-rs/canvas` and the browser have historically disagreed by a factor of five.

- [ ] **Step 1: Measure, before deciding anything**

In the browser, over the dev server, render the same shot at luminosity 0.975, 0.855, 0.5, 0.3 and 0.15. For each, sample the ground at 10, 20 and 40px below the shot's bottom edge, and the ground far from the shot. Report the **contrast between the shadowed and unshadowed ground** at each luminosity, as a ratio.

Do not sample through `@napi-rs/canvas`. Do not infer the dark end from the light end.

- [ ] **Step 2: Decide from the numbers, and write both the numbers and the decision down**

Three outcomes are all acceptable, and which one is right is a measurement, not a preference:

1. **The shadow holds.** Report the ratios and change nothing. Most likely at the pale end and plausible throughout — the shadow is a dark wash and a dark ground is still lighter than black.
2. **The shadow disappears at the dark end** and the fix is the shot's own edge, not the shadow. A stroke, or the existing device hairline, may already carry the separation. Report and propose.
3. **The shadow needs to change with the ground.** This is the one that touches the alphas, and it is the one to be most careful about. If it is the answer, the change is a documented function of luminosity with the current alphas as its value at the pale end — never a flat retune. Say so loudly in the report, and add a golden at the dark end so the new behaviour is frozen.

- [ ] **Step 3: Add a golden at the dark end regardless of the outcome**

```js
  ['ground-dark', { ratio: '3:2', luminosity: 0.18 }, { web: 'samples/fieldset.png', mobile: [] }],
```

Even under outcome 1 this is worth having: it is the only golden that would catch a future change to the shadow, the ground maths, or the edge blend at the dark end, and every existing golden is pale.

- [ ] **Step 4: Commit, deploy, and STOP**

> Set Luminosity near the bottom and look at whether the shot still lifts off the background. That is the whole question here — a shadow you cannot see is a shot lying flat on the page. I have the measurements either way; I want your eye on it.

---

## Task 3: A palette worth choosing from

**Files:**
- Modify: `core/ground.js` — the `sat` formula
- Modify: `core/presets.js` — `HUES`, if the eight change
- Test: `test/ground.test.js`
- Regenerate: every golden with a ground, which is all of them

**Interfaces:** no signature change.

**This is the task with the least test cover and the most judgement.** Rock: *"our selection is good, but poor. I can't even see the difference between them on their thumbnails."* Half of that is the 14×14 swatch, which Task 5 fixes. The other half is that the grounds really are close together.

- [ ] **Step 1: Measure how close they actually are**

`sat = 0.16 + 0.26 × min(chroma × 1.6, 1)`, then multiplied by 0.55/0.62/0.66 at the light anchor. So the most saturated stop any pale ground can reach is `0.42 × 0.66 = 0.277` — and a screenshot with little colour lands nearer `0.16 × 0.55 = 0.088`.

Render all eight named hues at the default luminosity and report, as a table: each ground's middle stop in hex, its HSL saturation, and the **maximum channel difference between adjacent hues**. That number is the one Rock is describing, and it should be recorded before it changes.

- [ ] **Step 2: Raise saturation, and hold the ceiling that exists for a reason**

The comment on `sat` says "never fully saturated", and that is right: a ground competing with the screenshot is worse than a dull one. What is wrong is where the ceiling sits, not that there is one.

Change the formula, not the multipliers — the multipliers carry the *relationship between the three stops*, which Task 1 now interpolates and which must not be disturbed:

```js
// WAS 0.16 + 0.26 * ..., topping out at 0.42 before the per-stop
// multipliers. Rock, on the shipped palette: "our selection is good, but
// poor. I can't even see the difference between them on their thumbnails."
// The floor rises so a nearly-colourless screenshot still produces a ground
// with a hue, and the ceiling rises so a colourful one produces one you can
// name. The ceiling still exists: a ground that competes with the
// screenshot is worse than a dull one.
const sat = 0.26 + 0.38 * Math.min(chroma * 1.6, 1);
```

Those two numbers are a **starting point to be judged on the canvas, not a result**. Report the same table from Step 1 alongside the new one, and expect to move them once after Rock looks.

- [ ] **Step 3: Regenerate every golden, and say so plainly**

```bash
node scripts/make-render-goldens.js && git status --short test/golden
```

**All sixteen change.** That is unavoidable and it is the point — the ground is in every one. It also means the golden suite proves nothing about this task, so the report must carry the before/after table and the contact sheet from Step 4 instead.

- [ ] **Step 4: Build a contact sheet and put it in front of Rock**

Render all eight hues, before and after, at the default luminosity, with a shot on top — not bare grounds. A palette is judged with a screenshot covering the middle, because that is what the user sees.

- [ ] **Step 5: Commit, deploy, and STOP**

> Eight grounds, more saturated. Look at them with a shot on top — that is the real test, since the screenshot covers most of the canvas and only a border of ground shows. Two questions: can you tell them apart now, and does any of them fight the screenshot? Both numbers are one line to move.

---

## Task 4: Background becomes type-first

**Files:**
- Modify: `web/inspector-background.js`
- Test: `test/inspector-background.test.js`

**Interfaces:**
- Produces: no `core/` change. `bgType`'s stored values stay `'linear' | 'solid' | 'mesh'`; only the label changes, to Gradient / Solid / Mesh.

**The restructure, from the spec:** type is the top control, and **sampled lives inside each type** rather than being a fourth option beside them.

- [x] **Step 1: Write the order down before moving anything**

```
Background
  [ Gradient | Solid | Mesh ]        <- type, first
  Sampled                            <- this type's sampled ground
  <preset tiles for this type>       <- Task 5 renders these
  Hue                                <- overrides, below the choice they override
  Angle                              (gradient only)
  Luminosity
  Stops / Spread / Seed              (mesh only)
```

Mesh is still withheld from `UI_BG_TYPES` (Cycle A). **Task 8 is where it comes back, or does not** — do not restore it here, and do not build the mesh row's tiles speculatively.

- [x] **Step 2: Write the failing tests**

```js
describe('the Background panel is type-first (Task 4)', () => {
  it('offers the types under their user-facing names', () => {
    expect(TYPE_LABELS).toMatchObject({ linear: 'Gradient', solid: 'Solid' });
  });

  it('stores the internal value, not the label', () => {
    const config = {};
    setBgType(config, 'linear');
    expect(config.bgType).toBe('linear');
  });

  it('sampled belongs to the type, so switching type keeps it sampled', () => {
    const config = {};
    expect(isAutoGround(config)).toBe(true);
    setBgType(config, 'solid');
    expect(isAutoGround(config)).toBe(true);
  });

  it('and switching type keeps an explicit hue explicit', () => {
    const config = {};
    setHue(config, 200);
    setBgType(config, 'solid');
    expect(forcedHueDeg(config)).toBe(200);
  });
});
```

> **One thing found while doing it.** `Angle` was shown for every background
> type, but `paintSolid` fills flat with the middle stop and never reads it —
> a slider that moves and changes nothing, in this panel, the whole time
> Cycle B was removing exactly that defect elsewhere. It is gated on the
> gradient type now (`showsAngle`).

- [x] **Step 3: Rebuild the section in that order**

Move the DOM construction, not the logic. Every pure helper in this file already works; what changes is the order the rows are appended and which rows are gated on the type. Gate with the global `[hidden]` rule, never a second mechanism.

- [x] **Step 4: Commit, deploy, and STOP**

> Background now reads top-down: pick the type, then the ground, then the adjustments. Check that switching Gradient ↔ Solid keeps whatever you had — if you were on Sampled you should still be on Sampled, and if you had picked a hue it should still be picked.

---

## Task 5: Preset tiles, rendered by the real generator

**Files:**
- Create: `web/preset-tiles.js`
- Modify: `web/inspector-background.js`
- Modify: `web/sidebar.js` — `renderGroundSwatches` and `gradientFor` retire
- Modify: `web/style.css`
- Test: `test/preset-tiles.test.js` (create)

**Interfaces:**
- Produces: `renderTile(canvas, hue, config, meta)` paints one preset at tile size through `core/`'s own painters.

**The rule with a file to itself.** `gradientFor` in `web/sidebar.js` builds a CSS `linear-gradient` string that *approximates* what `paintGround` will draw. It is a second implementation of the ground, in a different language, and it has already lied once. A 44px tile drawn by the real generator cannot.

- [x] **Step 1: Write the failing test**

```js
describe('preset tiles are the real thing (Task 5)', () => {
  it('web/preset-tiles.js paints through core/, not CSS', () => {
    const src = codeOf('web/preset-tiles.js');       // comment-stripped, as in test/selection.test.js
    expect(src).toContain('paintGround');
    expect(src).not.toContain('linear-gradient');
  });

  it('a tile matches what the canvas will actually render, not an approximation', () => {
    // Render the SAME hue at tile size and at canvas size, and compare the
    // colour at matching relative positions. A CSS approximation drifts;
    // the real generator cannot.
    const big = renderGroundAt(1800, 1200, 268);
    const tile = renderGroundAt(44, 44, 268);
    for (const [u, v] of [[0.2, 0.2], [0.5, 0.5], [0.8, 0.8]]) {
      const a = px(big, 1800 * u, 1200 * v);
      const b = px(tile, 44 * u, 44 * v);
      for (let i = 0; i < 3; i++) expect(Math.abs(a[i] - b[i])).toBeLessThanOrEqual(4);
    }
  });

  it('the retired CSS approximation is gone, not merely unused', () => {
    expect(codeOf('web/sidebar.js')).not.toContain('linear-gradient');
  });
});
```

The tolerance of 4 is for the gradient's own interpolation across two very different pixel counts, not for a different algorithm. Print the actual differences and record them; if any channel is out by more than a few levels the tile is not drawing what the canvas draws.

- [x] **Step 2: Run and watch it fail**

Expected: the file does not exist, and `web/sidebar.js` still contains `linear-gradient`.

- [x] **Step 3: Write `web/preset-tiles.js`**

It builds a small config (`w`/`h` at tile size, the preset's `forceHue`, the current `bgType`, `luminosity` and `seed`), calls `groundFromMeta` for the stops and `paintGround` for the pixels. `groundFromMeta` is the cheap path that already exists precisely for previewing a different hue against the current image's analysis — see its doc comment, and `web/sidebar.js`'s existing caller for the no-image fallback.

Nothing here may re-implement a gradient.

- [x] **Step 4: Replace the swatch rows with a tile grid**

~44px tiles in a grid, per the spec. The row's whole area stays clickable — Task 6 is where that is made true for the rows that remain, but a tile grid gets it for free and must not lose it.

Delete `gradientFor` and `renderGroundSwatches` rather than leaving them unused. An unused second implementation of the ground is exactly the thing that lies later.

- [x] **Step 5: Commit, deploy, and STOP**

> The eight grounds are tiles now, each one painted by the same code that paints the canvas — so what you see in the tile is what you get. With Task 3's palette behind it, this is the point where "I can't tell them apart" should be fixed or clearly not fixed. Tell me which.

---

## Task 6: Full-width preset rows, and the preset angle

**Files:**
- Modify: `web/style.css`
- Modify: `web/inspector-background.js`
- Test: `test/inspector-background.test.js`

**Two carried-forward items from Rock, 2026-09-02.**

- [x] **Step 1: The click target**

> *"the color names's clickable area should be the whole row, like we have for templates. short names atm have also a short click target."*

Cycle A Task 2 fixed exactly this for the template and ratio rows: `.template-row` shrink-wrapped to its text, and `width: 100%` fixed it. Apply the same reasoning here, and **check the sampled row and the type cells while you are in there** — the same defect tends to travel.

If Task 5's tile grid has already made this moot for the presets, say so and fix only what remains. Do not invent work to fill the task.

> **Done.** It was moot for the presets, and the sampled row and the type
> cells were already full-width and equal — all measured, not read off the
> CSS. The one real instance left was `.segmented--mini`, whose cells sized
> to their own labels (Mid 36.9px against Light 49.5px). Fixed with
> `grid-auto-columns: 1fr`; `flex: 1` cannot fix a shrink-wrapped control.
> Numbers in `docs/verification-2026-09-01.md`. Also carried out the dead
> `.control-hint` rule, left behind by Task 5's fix round.

- [x] **Step 2: Decide the preset-angle question, and record the decision**

> *"selecting a background changes the hue, but not the angle. why?"*

Because nothing wires them together: a preset writes `forceHue` only, and `angle` is independent, defaulting to 166°. The spec calls this *"not a decision anyone took — it is how the CLI's flags happened to map"*, and asks whether each named ground should carry a considered angle.

**This is a design question with a real answer either way**, so present both to Rock rather than picking silently:

- **A preset sets hue only** (today). Angle is a separate axis the user owns, and a preset that moved it would overwrite a choice they made deliberately.
- **A preset carries its own angle.** Each named ground becomes a considered look rather than a hue, which is what "preset" implies.

Recommend one, implement it after Rock answers, and write the answer into the spec. If he chooses the second, a preset must still leave an angle the user set explicitly alone — the same sampled-versus-explicit rule as everything else in this panel.

> **Answered 2026-09-05: the first — a preset sets the hue only.** No code
> change. Recorded in the spec with the reasoning, including why the second
> option was weaker than it read: with the explicit-value guard in place it
> would have differed from today only until the user first touched Angle.
> My own framing hid that, and Rock caught it: *"both options are making the
> angle 'mine', so what exactly are you asking?"*

- [x] **Step 3: Commit, deploy, and STOP**

---

## Task 7: Angle made legible

**Files:**
- Modify: `web/inspector-background.js`
- Modify: `web/style.css`
- Test: `test/inspector-background.test.js`

Item 17. Rock, on the shipped app: *"I can't seem to understand the logic behind how Angle works."*

- [x] **Step 1: Find out what it actually does before changing how it reads**

`DEFAULT_ANGLE` is 166°, and `paintGround`'s linear gradient uses it. Determine, by rendering and measuring rather than by reading: at 0°, where is the light end? At 90°? Which way does increasing the number rotate? Write the answer down — that is the thing the control has to communicate, and it cannot be communicated until it is known.

- [x] **Step 2: Make the control show it**

A number alone cannot say which way 166° points. The control needs a **direction you can see**: a small dial, or the readout paired with an arrow that rotates. Whatever it is, it must be drawn from the same angle value the render uses, so it cannot drift.

Keep the slider — it is good for sweeping — and add the indicator beside it. Do not replace one unclear control with a different unclear control.

> **Done, and Step 1 found more than an unclear readout.** The angle steered
> one of `paintGround`'s three layers; the two radial washes were pinned to
> the canvas. Measured, the light landed up to **178° from where the number
> pointed**, and through 285°–345° it did not move at all. An arrow drawn
> from the number would therefore have been a lie, which is the exact failure
> this step warns against — so the washes now rotate with the angle
> (`angle − DEFAULT_ANGLE`, zero at the default, **no golden moved**), and the
> indicator is a circle of the real ground rather than a drawn arrow.
> Numbers in `docs/verification-2026-09-01.md`.

- [ ] **Step 3: Commit, deploy, and STOP**

> Angle now shows which way it points. Sweep it and check the indicator agrees with what the canvas does — if they ever disagree, the indicator is lying and that is worse than the number alone was.

---

## Task 8: Mesh's second hearing

**Files:**
- Modify: `web/inspector-background.js` — `UI_BG_TYPES`
- Modify: `README.md` — the "Not built yet" entry, if it comes back
- Test: `test/inspector-background.test.js`

**The task may end with mesh still withheld, and that is a real outcome.** From the spec: *"If it still cannot be seen at that point, delete it rather than hiding it a second time."*

- [ ] **Step 1: Restore it locally and look, with a shot on top**

Mesh was withheld because on the shipped palette it could not be seen — and Rock was precise about why: *"I can see it on your screenshots, but when there's a screen on top, there isn't much to see."* The mistake the first time was judging it on a bare ground.

So: temporarily add `'mesh'` back to `UI_BG_TYPES`, render it **with a screenshot covering the middle**, on the Task 3 palette, at several luminosities including a dark one, and look at the border of ground that actually shows.

- [ ] **Step 2: Take one of the three outcomes, and say which**

1. **It reads now.** Restore it: remove it from `UI_BG_TYPES`, delete the "not built yet" entry, add the mesh tiles to Task 5's grid, and hand Rock a preview.
2. **It still cannot be seen.** Delete it — `paintMesh`, `MESH_*`, the config block, both goldens, the tests, and `'mesh'` from `BG_TYPES`. The spec says so explicitly, and hiding it a second time would be the worse choice.
3. **It reads only at some luminosities.** Report that and let Rock decide; do not invent a rule that hides it conditionally.

- [ ] **Step 3: Commit, deploy, and STOP**

> Mesh, judged the way it should have been the first time: with a shot on top, on the new palette. Here is what it looks like at a pale ground and a dark one. Keep it or cut it — either is a fine answer, and I would rather cut it than hide it twice.

---

## Cycle close

After Task 8 is approved:

1. `npx vitest run` — green.
2. `git status --short test/golden` — clean, and the full set intentional. Expect 17 if mesh stays (16 plus `ground-dark`), or 15 if mesh is deleted (its two goldens go with it).
3. Update the README: `luminosity` in the `core/` section and the vocabulary table, `tone` removed everywhere it appears, the dark ground struck from "Not built yet", and the mesh entry resolved either way.
4. Merge the PR to `main` with `--merge` (not squash), delete the branch, confirm CI on `main` and the production deploy.
5. **Verify the live site**, not just the preview.
6. **Stop and report before Cycle D.** Cycle D is how the app is organised: the left/right panel split, templates and ratios as one tabbed control, per-control Resets, and the accent colour.

---

## Self-review

**Spec coverage.** "Carried forward — a dark ground" and "Tone becomes a luminosity slider" → Tasks 1 and 2, including the spec's two explicit requirements (sampled default, shadow re-verified). "Background, type-first" → Task 4. "Preset tiles rendered by the real generator" → Task 5. "Carried forward — Background panel" → Task 6, both halves. Item 17, Angle → Task 7. "Mesh is built, and withheld" → Task 8. The stronger palette → Task 3.

**Not covered here, deliberately:** the left/right panel split, tabbed size, per-control Resets and the accent colour, all moved to Cycle D when this cycle split. Background blur stays out entirely — the spec is explicit that it only becomes real once there are image or generated-wallpaper types, and there are none this round.

**Known open questions, both routed to Rock rather than guessed:** whether a preset carries its own angle (Task 6 Step 2), and whether mesh survives (Task 8 Step 2). Both are recorded as decisions to present, with a recommendation, not as things to settle silently.

**Where this plan is weakest, said plainly.** Task 3 is a taste change with almost no test cover — the goldens all move, so they prove nothing about it — and the two saturation constants are a starting point, not a result. Task 7 begins with "find out what the control actually does", which is honest but means its second half cannot be specified until its first half runs. Both are the kind of task where the preview, not the suite, is the acceptance test.

**Type consistency.** `luminosity` is the field name in config, meta and the panel; `l` is the resolved top-stop lightness inside `tail()`; `LUM_ANCHOR_LIGHT` / `LUM_ANCHOR_MID` are the two triples; `LUMINOSITY_RANGE`, `LUM_K1_RANGE`, `LUM_K2_RANGE` are the bounds. `groundFor(samples, forceHue, luminosity)` and `groundFromMeta(meta, forceHue, luminosity)` keep their arity, with the third argument's type changed from string to number. `renderTile(canvas, hue, config, meta)` is Task 5's only export.
