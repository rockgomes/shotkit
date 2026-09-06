# shotkit Cycle D — How the App Is Organised Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the two panels say what the data says — left is the shot, right is the thing you clicked — stop the app reading as one flat black, and give it a colour that means "active".

**Architecture:** No new rendering. This cycle is entirely `web/`: Size becomes one tabbed control so the left panel has room; Background, Padding and Grain move to the left panel because they are canvas properties; Frame, Corner radius, Stroke and Shadow stay on the right because they belong to the selected element; the per-slider Reset that Cycle C built for Background is extracted into a shared control and applied to every slider; and an accent colour replaces "active means lighter" everywhere it currently says that.

**Tech Stack:** Zero-dependency ES modules in `core/` (untouched this cycle); Vite + vanilla JS in `web/`; vitest with `@napi-rs/canvas` and `pixelmatch` for goldens.

**Spec:** `docs/superpowers/specs/2026-09-02-shotkit-round-two-design.md` — "Carried forward — the accent colour", "The organising rule: left is the shot, right is the thing you clicked", "Templates and ratios become one tabbed control", and the two DECIDED notes on Resets and on explanatory paragraphs.

## Global Constraints

Carried forward from Cycles A, B and C. Every task's requirements implicitly include these.

- `composeWithMeta` is called from **exactly one place** in `web/` (`web/state.js`, inside `render()`).
- The preview canvas **is** the export canvas. Nothing may be drawn into it that must not appear in the exported PNG. `web/selection.js` may not touch a canvas at all, enforced structurally.
- **No engine detection** anywhere in `core/`. `core/` has **zero runtime dependencies**.
- `web/tokens.css` is the **only** file in `web/` allowed to contain a raw hex colour. `web/public/favicon.svg` is the one asset exception, and `test/favicon.test.js` pins its two hexes to the tokens.
- `[hidden] { display: none !important; }` stays a **single global rule**.
- **A disabled state is an explicit colour, never `opacity`.** `opacity` outside `@keyframes` is not permitted, and every off state must be registered in the one shared selector list at the top of `web/style.css` (`test/contrast.test.js` enforces both).
- Contrast floors: informational text ≥ 7:1, ladder separation ≥ 1.2, interactive or graphic boundaries ≥ 3:1, decorative 1.8–2.5.
- **Target size:** any two interactive targets that touch must each be at least 24×24 CSS px. Targets with clear space around them may be smaller — but only if a 24px circle centred on each intersects nothing. Measured, not assumed; see `docs/verification-2026-09-01.md`.
- **One value, one home.** A control writes to exactly one place; readers may accept every input shape.
- **No explanatory paragraphs under controls.** Cut twice already (Padding in Cycle A, Luminosity in Cycle C). If a control is confusing, fix the control.
- **Every slider carries its own Reset**, in the same place, **disabled** — never hidden — when its value is already the app's own choice.
- Run `npx vitest run` before and after every task. Commit only green.
- After each task, push the branch. Do not merge to `main` mid-cycle.

### The rule this cycle exists to defend

**The UI must say the same thing the data says.** `c` is the canvas; `elements` is the things in the shot. Cycle B made that split real in the config and Cycle C made the ground worth choosing. Today the panels still contradict it: Background sits on the right with Frame, and Padding — the canvas's own safe area — sits under a heading that changes subject when you click a phone. A user who cannot predict which panel a control lives in has to hunt, and hunting is the defect this whole round exists to remove.

### THE APPROVAL GATE

**Every task that changes anything Rock can see ends by deploying a preview and STOPPING.** Task 0 opens the branch and the pull request; every push then rebuilds one preview:

**https://deploy-preview-6--shotkit-app.netlify.app**

(PR #6, the next number after the favicon's #5. Confirm from `gh pr view` after Task 0 and correct this line if it differs.)

`test` and `netlify/shotkit-app/deploy-preview` must both be green before handing over. Then stop. Do not assume approval from silence.

**This cycle is layout and colour**, which means the suite proves even less than usual. Every handover must say what to *look at*, and every task that moves a control must say where it went.

### Tests that cannot fail

Cycles A, B and C produced eighteen between them. The named patterns:

1. **A setup that leaves the old code path on its default** passes by accident.
2. **A sample point chosen by arithmetic rather than by measurement** reads the wrong thing.
3. **A comparison that includes a value which moves for a different reason** reports success for everything.
4. **A source-reading guard that only restates the code** is not evidence. Cycle C added several deliberately and labelled them; do the same, and never count one as proof that behaviour works.

So, for every assertion added below:

1. Run it against the **unchanged** code first and record that it goes red.
2. If it goes green, it is not a test. Fix it or delete it — do not tune it.
3. Say in the task report which assertions are structural guards or regression guards that pass on arrival. Do not count those as evidence.

### And the lesson Cycle C added twice

**A green suite is not evidence that the page loads.** `web/` has no DOM in the suite. Cycle C shipped a `ReferenceError` on load with 518 tests passing, and separately shipped a slider sitting at the wrong position. **Every task ends with the app opened in Chromium and its console read**, on a tab that has not been used for anything else — a tab's console buffer survives navigation, so a stale error from an earlier edit will look like a live one.

One more, from Cycle C Task 7: **a hidden preview pane does not run `requestAnimationFrame`.** `scheduleRender`'s `rafHandle` then stays non-null and every later render is silently suppressed, which looks exactly like a broken control. If a canvas appears frozen, change something known to work (the hue) before believing it.

---

## File Structure

| File | Responsibility this cycle |
|---|---|
| `web/index.html` | the shell moves: Background's section into the left panel, a new canvas-finish section beside it, panel headings |
| `web/sidebar.js` | Size becomes a three-tab control (Templates / Ratios / Custom) |
| `web/controls.js` | **new** — the shared slider row: label, value, track, Reset |
| `web/inspector-canvas.js` | **new** — Padding and Grain, which belong to the canvas |
| `web/inspector-frame.js` | keeps Frame, Corner radius, Stroke, Shadow; loses Padding and Grain |
| `web/inspector-background.js` | unchanged behaviour; its Reset button moves to `web/controls.js` |
| `web/main.js` | `inert` and drawer wiring follow the moved sections |
| `web/tokens.css` | the surface ladder, then the accent tokens |
| `web/style.css` | the tab strip, the two panels' headings, accent application |

**`web/controls.js` is a new file for the same reason `web/selection.js` and `web/preset-tiles.js` were.** It carries a rule — *every slider row looks the same and every one has a Reset* — and a rule is easier to keep in a file that contains only the thing it governs. Today `makeResetButton` lives inside `web/inspector-background.js`'s init closure, which is precisely why Padding, Radius, Grain, Shadow and Stroke do not have one.

**`web/inspector-canvas.js` is a new file rather than an export from `inspector-frame.js`** because the split is the point of the cycle. A module named "frame" that also owns the canvas's padding is the same contradiction the panels have.

---

## Task 0: Branch, pull request, preview

**Files:**
- Create: none
- Modify: none

- [ ] **Step 1: Branch from a clean, up-to-date main**

```bash
git checkout main
git pull
git status --short          # must be empty
npx vitest run              # must be green before anything is touched
git checkout -b feat/cycle-d
```

- [ ] **Step 2: Open the pull request with an empty commit**

```bash
git commit --allow-empty -m "Plan: Cycle D — how the app is organised"
git push -u origin feat/cycle-d
gh pr create --title "Cycle D — how the app is organised" --body "Left is the shot, right is the thing you clicked. Plus one tabbed size control, a Reset on every slider, and an accent colour.

Plan: docs/superpowers/plans/2026-09-06-shotkit-cycle-d.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 3: Confirm the preview URL and correct this plan if it differs**

```bash
gh pr view --json number,url
gh pr checks
```

Expected: PR #6, and `netlify/shotkit-app/deploy-preview` reporting `https://deploy-preview-6--shotkit-app.netlify.app`. If the number differs, edit **THE APPROVAL GATE** above and commit the correction.

---

## Task 1: Size becomes one tabbed control

**Files:**
- Modify: `web/sidebar.js`
- Modify: `web/style.css`
- Test: `test/sidebar.test.js`

> *"They are already one decision — both write nothing but `w` and `h` — and today they read as two independent lists stacked on top of each other. Tabs make that truth visible, and showing one at a time is where most of the left panel's new space comes from."*

**This task goes first because it pays for Task 2.** Do not start the panel split until the space exists.

**Interfaces:**
- Consumes: `selectTemplate(config, key)`, `selectRatio(config, key)`, `applyCustomSize(config, w, h)`, `isCustomSize(config)`, `activeTemplateKey(config)`, `activeRatioKey(config)` — all already exported from `web/sidebar.js`.
- Produces: `SIZE_TABS` (`['templates', 'ratios', 'custom']`) and `activeSizeTab(config)`, both exported from `web/sidebar.js`.

- [ ] **Step 1: Write the failing test for which tab a config belongs to**

Add to `test/sidebar.test.js`:

```js
import { SIZE_TABS, activeSizeTab } from '../web/sidebar.js';

describe('the size control is one decision, shown one tab at a time', () => {
  it('offers exactly three tabs', () => {
    expect(SIZE_TABS).toEqual(['templates', 'ratios', 'custom']);
  });

  it('opens on the tab the current size actually came from', () => {
    // The panel must not open on Templates while a ratio is selected: the
    // user would see nothing highlighted and conclude nothing is chosen.
    expect(activeSizeTab({ ratio: '3:2' })).toBe('ratios');
    expect(activeSizeTab({ template: 'dribbble' })).toBe('templates');
    expect(activeSizeTab({ w: 1234, h: 567 })).toBe('custom');
  });

  it('and follows normalise()'s own precedence, not its own', () => {
    // core/config.js resolves explicit w/h over template over ratio. A tab
    // rule that disagreed would highlight a row the canvas is not using.
    expect(activeSizeTab({ ratio: '3:2', template: 'dribbble' })).toBe('templates');
    expect(activeSizeTab({ ratio: '3:2', template: 'dribbble', w: 800, h: 600 })).toBe('custom');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run test/sidebar.test.js
```

Expected: FAIL — `SIZE_TABS` is not exported from `web/sidebar.js`.

- [ ] **Step 3: Add the two exports**

In `web/sidebar.js`, beside the existing pure helpers (above `initSidebar`):

```js
/** The size control's three tabs. Templates, ratios and a custom size are
 *  one decision — every one of them writes nothing but `w` and `h` — so
 *  they are three views of a control, not three controls. */
export const SIZE_TABS = ['templates', 'ratios', 'custom'];

/**
 * Which tab the CURRENT size came from.
 *
 * The order here is core/config.js's own precedence, read the same way
 * `isCustomSize` and `activeTemplateKey` already read it: explicit w/h wins,
 * then a template, then a ratio. A tab rule that disagreed with normalise()
 * would open the panel on a list with nothing highlighted while the canvas
 * used a size from somewhere else.
 */
export function activeSizeTab(config) {
  if (isCustomSize(config)) return 'custom';
  if (activeTemplateKey(config)) return 'templates';
  return 'ratios';
}
```

- [ ] **Step 4: Run the test again**

```bash
npx vitest run test/sidebar.test.js
```

Expected: PASS.

- [ ] **Step 5: Build the tab strip in `initSidebar`**

Replace the `ratioSection` block (`web/sidebar.js`, the `const ratioSection = document.createElement('section')` paragraph and its `insertAdjacentElement`) with one section carrying a tab strip and one list:

```js
  // ONE section, not two stacked ones. The tab strip is the same
  // `.segmented` primitive the Background type control uses — no new control
  // vocabulary is invented here, which is the same rule Task 9 of Cycle A
  // followed when it added the mesh steppers.
  const sizeSection = document.createElement('section');
  sizeSection.className = 'sidebar-section';
  sizeSection.innerHTML = `
    <h2 class="section-label">Size</h2>
    <div class="segmented segmented--tabs" role="tablist" aria-label="Size"></div>
    <ul class="template-list size-list"></ul>
  `;
  templateSection.replaceWith(sizeSection);
  const tabStrip = sizeSection.querySelector('.segmented--tabs');
  const sizeList = sizeSection.querySelector('.size-list');

  // Which tab is SHOWING. Seeded from the config so the panel opens on the
  // list the current size came from, then owned by the user's clicks — a tab
  // that snapped back to the config's tab on every render would fight anyone
  // browsing templates while a ratio is applied.
  let openTab = activeSizeTab(state.config);

  const tabButtons = SIZE_TABS.map((tab) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'segmented-cell';
    btn.dataset.tab = tab;
    btn.setAttribute('role', 'tab');
    btn.textContent = { templates: 'Templates', ratios: 'Ratios', custom: 'Custom' }[tab];
    btn.addEventListener('click', () => {
      openTab = tab;
      renderAll(currentQuery());
    });
    tabStrip.appendChild(btn);
    return btn;
  });
```

- [ ] **Step 6: Render one list at a time**

Replace `renderTemplates`, `renderRatios` and the `renderAll` that calls both. `customSizeItem()` keeps its existing body verbatim — only its call site moves:

```js
  function renderAll(query) {
    for (const btn of tabButtons) {
      const active = btn.dataset.tab === openTab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    }
    sizeList.innerHTML = '';

    if (openTab === 'templates') {
      for (const [key, tpl] of Object.entries(TEMPLATES)) {
        if (!matchesQuery(tpl.label, query)) continue;
        sizeList.appendChild(sizeRow({
          key,
          label: tpl.label,
          sizeText: `${tpl.w}×${tpl.h}`,
          selected: activeTemplateKey(state.config) === key,
          onSelect: () => { selectTemplate(state.config, key); afterSizeChange(); },
        }));
      }
      return;
    }

    if (openTab === 'ratios') {
      for (const [key, [w, h]] of Object.entries(RATIOS)) {
        if (!matchesQuery(key, query)) continue;
        sizeList.appendChild(sizeRow({
          key,
          label: key,
          sizeText: `${w}×${h}`,
          selected: activeRatioKey(state.config) === key,
          onSelect: () => { selectRatio(state.config, key); afterSizeChange(); },
        }));
      }
      return;
    }

    // Custom. The disclosure toggle is gone with the tab — the tab IS the
    // disclosure — so the form is always open on this tab.
    customOpen = true;
    sizeList.appendChild(customSizeItem());
  }

  /** One place every size change goes through, so nothing can update the
   *  canvas and forget the list, or the other way round. Same reasoning as
   *  `afterBackgroundChange` in web/inspector-background.js, which exists
   *  because three listeners had been patched and a fourth was still wrong. */
  function afterSizeChange() {
    renderAll(currentQuery());
    scheduleRender();
  }
```

Delete the now-unused `+ Custom size` toggle button from `customSizeItem()` — the `toggle` element and its listener — keeping the form, its inputs and `applyCustomSize` wiring exactly as they are.

- [ ] **Step 7: Style the tab strip**

In `web/style.css`, beside the other `.segmented` modifiers:

```css
/* The size control's tabs. A full-width segmented control, so its three
   cells get an equal share by the flex rule .segmented-cell already carries
   — the `--mini` variant is the shrink-wrapped one that needed a grid. */
.segmented--tabs {
  margin: 0 4px 8px;
}
```

- [ ] **Step 8: Run the whole suite**

```bash
npx vitest run
```

Expected: PASS. If a test in `test/sidebar.test.js` queried `.ratio-list`, update it to `.size-list` — the class is renamed because the list is no longer per-kind.

- [ ] **Step 9: Open the app and measure what the tabs bought**

```bash
# Browser pane: preview_start { name: "shotkit-web" }
```

In a **fresh tab**, with the console read for errors, record:

- the three tabs are equal width, and switching them shows one list;
- searching filters within the open tab;
- the height of `#sidebar`'s content before and after this task, via
  `document.getElementById('sidebar').scrollHeight` — write both numbers into
  `docs/verification-2026-09-01.md`. That number is the space budget Task 2 spends.

- [ ] **Step 10: Commit, deploy, and STOP**

```bash
git add web/sidebar.js web/style.css test/sidebar.test.js docs/verification-2026-09-01.md
git commit -m "feat(web): size is one control with three tabs"
git push
```

> Hand over the preview. Say: Templates, Ratios and Custom are one control now; the panel opens on whichever the current size came from; and say how many pixels of sidebar this freed, because that is what pays for the next task.

---

## Task 2: Background moves to the left panel

**Files:**
- Modify: `web/index.html`
- Modify: `web/main.js`
- Modify: `web/style.css`
- Test: `test/inspector-background.test.js`

> *"Left — the shot as a whole: Size; Background; Padding; Grain."*

**Interfaces:**
- Consumes: `initBackground()` from `web/inspector-background.js`, which finds its host with `document.getElementById('backgroundSection')` and does not care where that element lives.
- Produces: nothing new. This task is the shell.

- [ ] **Step 1: Write the failing test that the section is in the left panel**

Add to `test/inspector-background.test.js`:

```js
import { readFileSync } from 'node:fs';

describe('Background belongs to the canvas, so it lives on the left (Cycle D)', () => {
  // A STRUCTURAL GUARD over web/index.html, in the same family as the
  // `linear-gradient` guard in test/preset-tiles.test.js. It cannot show
  // that the panel WORKS — the browser check in this task's steps does that
  // — only that the section did not drift back to the right-hand panel.
  const html = readFileSync('web/index.html', 'utf8');
  const between = (startId, endId) => {
    const a = html.indexOf(`id="${startId}"`);
    const b = html.indexOf(`id="${endId}"`);
    expect(a, `${startId} not found`).toBeGreaterThan(-1);
    expect(b, `${endId} not found`).toBeGreaterThan(-1);
    return { a, b };
  };

  it('backgroundSection sits inside #sidebar, before #stage', () => {
    const { a: sidebar } = between('sidebar', 'stage');
    const bg = html.indexOf('id="backgroundSection"');
    const stage = html.indexOf('id="stage"');
    expect(bg).toBeGreaterThan(sidebar);
    expect(bg).toBeLessThan(stage);
  });

  it('and the right-hand panel keeps only what belongs to an element', () => {
    const inspector = html.indexOf('id="inspector"');
    for (const id of ['frameSection', 'finishSection']) {
      expect(html.indexOf(`id="${id}"`), `${id} left the inspector`)
        .toBeGreaterThan(inspector);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run test/inspector-background.test.js
```

Expected: FAIL on the first assertion — `backgroundSection` currently sits after `#stage`, inside `#inspector`.

- [ ] **Step 3: Move the section in the shell**

In `web/index.html`, cut the whole `<section class="inspector-section" id="backgroundSection" inert>` element **with its long comment** out of `<aside id="inspector">`, and paste it into `<aside id="sidebar">` immediately after the size section and before `<div class="sidebar-spacer">`. Update the two `aria-label`s:

```html
      <aside id="sidebar" aria-label="The shot: size, background, padding and grain">
```

```html
      <aside id="inspector" aria-label="The selected element: frame, finish and export">
```

- [ ] **Step 4: Make `inert` follow the section**

`web/main.js`'s `syncContentUI()` clears `inert` on the inspector's sections when an image decodes. Find the list of section ids it walks and confirm `backgroundSection` is addressed **by id**, not by `#inspector .inspector-section`. If it is addressed by descendant selector, change it to an explicit id list:

```js
// Addressed by id, not by `#inspector .inspector-section`: Cycle D moved
// Background into the left panel, and a selector rooted at the inspector
// silently stopped reaching it — the section would have stayed inert
// forever, greyed out with no way to tell why.
const CONTENT_SECTIONS = ['backgroundSection', 'frameSection', 'finishSection'];
```

- [ ] **Step 5: Give the left panel room to scroll**

In `web/style.css`, under `#sidebar`, confirm the panel scrolls rather than clipping now that it carries four groups:

```css
#sidebar {
  overflow-y: auto;
  overscroll-behavior: contain;
}
```

- [ ] **Step 6: Run the whole suite**

```bash
npx vitest run
```

Expected: PASS.

- [ ] **Step 7: Open the app and check the move landed**

In a **fresh tab**, with a screenshot loaded:

- Background's controls are on the left, below Size, and all of them still work — change the hue and confirm the canvas follows;
- the section is greyed before a screenshot loads and live after (this is the `inert` path Step 4 touched);
- the left panel scrolls without clipping the CLI card;
- at 320px and at 1440px there is no horizontal scroll;
- the console is clean.

- [ ] **Step 8: Commit, deploy, and STOP**

```bash
git add web/index.html web/main.js web/style.css test/inspector-background.test.js
git commit -m "feat(web): Background moves to the panel that owns the canvas"
git push
```

> Hand over the preview and say plainly that Background has **moved sides**, because a control that changes panel is exactly the thing a user cannot find by looking harder.

---

## Task 3: Padding and Grain move too, into their own module

**Files:**
- Create: `web/inspector-canvas.js`
- Modify: `web/inspector-frame.js`
- Modify: `web/index.html`
- Modify: `web/main.js`
- Test: `test/inspector-canvas.test.js` (new)
- Test: `test/inspector-frame.test.js`

> *"Two of these are on the side they are, against first instinct. Padding is the canvas's safe area and grain paints on the ground only (Cycle A Task 4b), so both are canvas properties however much they feel like finishing touches."*

**Interfaces:**
- Consumes: `activePadPercent(config)`, `setPadPercent(config, pct)`, `activeGrainPercent(config)`, `setGrainPercent(config, pct)` — today exported from `web/inspector-frame.js`.
- Produces: those four functions **move to** `web/inspector-canvas.js` and are exported from there, plus `initCanvasPanel()`.

- [ ] **Step 1: Write the failing test that the canvas module owns them**

Create `test/inspector-canvas.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalise } from '../core/index.js';
import {
  activePadPercent, setPadPercent, activeGrainPercent, setGrainPercent,
} from '../web/inspector-canvas.js';

function codeOf(path) {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('padding and grain belong to the canvas (Cycle D Task 3)', () => {
  it('round-trip through the real normalise(), so the panel agrees with core/', () => {
    const config = {};
    setPadPercent(config, 8);
    expect(activePadPercent(config)).toBeCloseTo(8, 6);
    expect(normalise(config).pad).toBeCloseTo(0.08, 6);

    setGrainPercent(config, 42);
    expect(activeGrainPercent(config)).toBe(42);
    expect(normalise(config).grain).toBeCloseTo(0.42, 6);
  });

  it('and are gone from the element module, not merely re-exported', () => {
    // A second home for one value is the defect that killed the shadow
    // slider in Cycle A Task 5b. Moving means moving.
    const frame = codeOf('web/inspector-frame.js');
    expect(frame).not.toContain('setPadPercent');
    expect(frame).not.toContain('setGrainPercent');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run test/inspector-canvas.test.js
```

Expected: FAIL — `web/inspector-canvas.js` does not exist.

- [ ] **Step 3: Create the module and move the four helpers**

Create `web/inspector-canvas.js` with this header, then **cut** `activePadPercent`, `setPadPercent`, `activeGrainPercent`, `setGrainPercent` out of `web/inspector-frame.js` verbatim — comments included — and paste them in:

```js
// web/inspector-canvas.js — the controls that belong to the CANVAS rather
// than to anything in it: padding and grain.
//
// They were in the Finish panel beside corner radius, stroke and shadow,
// under a heading that changes subject when you select a phone. That was
// wrong twice over. Padding is the safe area the whole composition is laid
// out inside (core/layout.js), and grain paints on the ground ONLY — Cycle
// A Task 4b moved it under the shots for exactly that reason. Neither one
// has anything to do with the element you clicked.
//
// Rock raised the split with both of these on the right and agreed the
// correction; the spec records it as the one counter-intuitive part of the
// rule "left is the shot, right is the thing you clicked".
import { DEFAULTS } from '../core/index.js';
import { state, scheduleRender } from './state.js';
import { makeSliderRow } from './controls.js';
```

- [ ] **Step 4: Run the test again**

```bash
npx vitest run test/inspector-canvas.test.js
```

Expected: PASS on the round-trip; the second assertion passes once the cut is complete.

- [ ] **Step 5: Move the two rows out of `initFinish`**

Cut the Padding row and the Grain row — element creation, `syncPadUI`, `syncGrainUI`, and their `input` listeners — out of `initFinish` in `web/inspector-frame.js`, and rebuild them inside a new `initCanvasPanel()` in `web/inspector-canvas.js` mounted on a new section:

```js
export function initCanvasPanel() {
  const section = document.getElementById('canvasSection');
  if (!section) return null;
  // ... padding row, grain row, each built with makeSliderRow from
  // web/controls.js (Task 4 introduces it; until then, copy the existing
  // markup exactly and replace it in Task 4).
}
```

Add the section to `web/index.html`, inside `<aside id="sidebar">`, after `backgroundSection`:

```html
        <section class="inspector-section" id="canvasSection" inert>
          <h2 class="section-label">Canvas</h2>
        </section>
```

Add `'canvasSection'` to `CONTENT_SECTIONS` in `web/main.js` and call `initCanvasPanel()` beside the other inits.

- [ ] **Step 6: Update the Finish tests that referenced the moved rows**

In `test/inspector-frame.test.js`, change the import of the four helpers to `../web/inspector-canvas.js`. Do not delete those assertions — they are the round-trip proofs, and they are still true; only their address changed.

- [ ] **Step 7: Run the whole suite**

```bash
npx vitest run
```

Expected: PASS.

- [ ] **Step 8: Open the app and check both panels**

In a **fresh tab**, with a screenshot loaded:

- Padding and Grain are on the left under **Canvas**, and dragging each still changes the render;
- the right panel's Finish now holds only Corner radius, Stroke and Shadow, and its subject line still names the selected element;
- select a phone and confirm Padding does **not** change subject with it;
- the console is clean.

- [ ] **Step 9: Commit, deploy, and STOP**

```bash
git add web/inspector-canvas.js web/inspector-frame.js web/index.html web/main.js test/
git commit -m "feat(web): padding and grain belong to the canvas, not the element"
git push
```

> Say which controls moved, and why padding is on the left even though it feels like a finishing touch. That is the part Rock's first instinct put on the other side, so it is the part worth explaining once.

---

## Task 4: One slider row, and a Reset on every slider

**Files:**
- Create: `web/controls.js`
- Modify: `web/inspector-background.js`
- Modify: `web/inspector-canvas.js`
- Modify: `web/inspector-frame.js`
- Modify: `web/style.css`
- Test: `test/controls.test.js` (new)

> **DECIDED:** *"I think we could have just a reset button in front of the slider ... a small square button with the round arrow icon."* Cycle C built it for Background's three sliders. This generalises it.

**Interfaces:**
- Produces: `makeSliderRow({ label, min, max, step, ariaLabel, format, isDefault, onInput, onReset })` from `web/controls.js`, returning `{ row, input, value, reset, sync }`.

- [ ] **Step 1: Write the failing test for the shared row**

Create `test/controls.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

function codeOf(path) {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('every slider is built by the same function (Cycle D Task 4)', () => {
  // STRUCTURAL GUARDS. The behaviour they stand for — a Reset in the same
  // place on every slider, disabled when the value is already the app's own
  // — is checked in the browser, in this task's own steps. What these buy is
  // that the next slider someone adds cannot quietly skip it.
  const panels = [
    'web/inspector-background.js',
    'web/inspector-canvas.js',
    'web/inspector-frame.js',
  ];

  it('no panel builds a range input by hand any more', () => {
    for (const p of panels) {
      expect(codeOf(p), `${p} still builds a raw range input`)
        .not.toMatch(/\.type\s*=\s*'range'/);
    }
  });

  it('and every panel gets its rows from web/controls.js', () => {
    for (const p of panels) {
      expect(codeOf(p), `${p} does not import makeSliderRow`)
        .toContain("from './controls.js'");
    }
  });

  it('the shared row owns the Reset, so no panel can ship a slider without one', () => {
    const controls = codeOf('web/controls.js');
    expect(controls).toContain('slider-reset');
    expect(controls).toContain('#icon-reset');
    // Disabled, never hidden: a button that vanishes makes the row jump
    // mid-drag and hides the fact that the control has a default at all.
    expect(controls).toMatch(/reset\.disabled\s*=/);
    expect(controls).not.toMatch(/reset\.hidden\s*=/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run test/controls.test.js
```

Expected: FAIL — `web/controls.js` does not exist and every panel builds its own range input.

- [ ] **Step 3: Write `web/controls.js`**

```js
// web/controls.js — the slider row, once.
//
// EVERY SLIDER IN THIS APP HAS THE SAME SHAPE AND THE SAME RESET. That is
// this file's whole reason to exist, and it is not a style preference.
//
// Cycle C built a Reset for Background's three sliders inside that panel's
// own init closure, so Padding, Corner radius, Grain, Shadow and Stroke
// width did not get one. Rock: "I'm not sure I follow the logic of that
// reset button that only activates for luminosity." He was right — one
// slider having a reset and the others not is arbitrary, and it was
// arbitrary because of where the code lived.
//
// The Reset is DISABLED, never hidden, when the value is already the app's
// own choice. A button that vanishes makes the row jump mid-drag, and hides
// the fact that the control has a default to go back to.
export function makeSliderRow({
  label, min, max, step, ariaLabel, format, isDefault, onInput, onReset, resetLabel,
}) {
  const row = document.createElement('div');
  row.className = 'slider-row';
  row.innerHTML =
    `<div class="slider-label"><span></span><span class="mono slider-value"></span></div>`;
  row.querySelector('.slider-label span').textContent = label;

  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'slider';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.setAttribute('aria-label', ariaLabel);

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'slider-reset';
  reset.setAttribute('aria-label', resetLabel || `Reset ${label.toLowerCase()}`);
  reset.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-reset"></use></svg>';

  const track = document.createElement('div');
  track.className = 'slider-track-row';
  track.append(input, reset);
  row.appendChild(track);

  const valueEl = row.querySelector('.slider-value');

  /** Paint the row from a value: position, readout, fill and reset state.
   *  The fill is a CSS custom property the track's gradient reads — the
   *  same mechanism syncSliderFill used before this file existed. */
  function sync(current) {
    input.value = String(current);
    valueEl.textContent = format(current);
    const pct = ((current - min) / (max - min)) * 100;
    input.style.setProperty('--slider-fill', `${pct}%`);
    reset.disabled = isDefault(current);
  }

  input.addEventListener('input', () => onInput(input.value));
  reset.addEventListener('click', () => onReset());

  return { row, input, value: valueEl, reset, sync };
}
```

- [ ] **Step 4: Run the test**

```bash
npx vitest run test/controls.test.js
```

Expected: the third assertion passes; the first two still fail until the panels are converted.

- [ ] **Step 5: Convert the panels, one slider at a time**

Replace each hand-built row with a `makeSliderRow` call. The sliders and their defaults:

| Slider | Module | `isDefault` is true when |
|---|---|---|
| Hue | background | the ground is sampled (`isAutoGround`) |
| Angle | background | the angle equals `DEFAULT_ANGLE` |
| Luminosity | background | `config.luminosity` is null (sampled) |
| Padding | canvas | the value equals `DEFAULTS.pad * 100` |
| Grain | canvas | the value equals `DEFAULTS.grain * 100` |
| Corner radius | frame | the element's radius is `null` (the frame's own corner) |
| Shadow | frame | the value equals `100` (the verified alphas, unscaled) |
| Stroke width | frame | the value equals `STROKE_DEFAULTS.width * 100` |

Delete `makeResetButton` and `syncSliderFill` from `web/inspector-background.js`, and the **second copy** of `syncSliderFill` from `web/inspector-frame.js:372` — the two files carry the same seven-line function today, which is the duplication this task removes as much as the missing Resets. `makeSliderRow` replaces all three.

- [ ] **Step 6: Register the row in the shared off-state rule**

`.slider-reset:disabled` is already registered in `web/style.css`'s single off-state selector list (Cycle C). Confirm it is still there and that no bespoke disabled rule was added:

```bash
npx vitest run test/contrast.test.js
```

Expected: PASS. This suite fails on any `opacity` below 1 outside `@keyframes` and on any off state styled outside the shared list.

- [ ] **Step 7: Run the whole suite**

```bash
npx vitest run
```

Expected: PASS.

- [ ] **Step 8: Open the app and check every slider**

In a **fresh tab**, with a screenshot loaded, for **each of the eight sliders**:

- the Reset sits in the same place;
- it is **disabled** at the default and enabled once the value moves;
- clicking it returns the slider to the app's own value and re-disables itself;
- the readout and the fill agree with the thumb.

Record the eight in the task report as a table. A slider whose Reset never enables is a wrong `isDefault`, not a missing feature.

- [ ] **Step 9: Commit, deploy, and STOP**

```bash
git add web/controls.js web/inspector-*.js web/style.css test/controls.test.js
git commit -m "feat(web): every slider gets the same Reset"
git push
```

---

## Task 5: The UI is dim, and it is the surfaces

**Files:**
- Modify: `web/tokens.css`
- Test: `test/contrast.test.js`

Rock, 2026-09-06: *"the UI still is very dim and low contrast."*

**He is right, and the text is not the problem.** Measured before writing this:

| token | on `--surface-window` |
|---|---|
| `--text-primary` `#f5f7fb` | 18.25:1 |
| `--text-secondary` `#dfe1e5` | 14.95:1 |
| `--text-muted` `#cacdd2` | 12.28:1 |
| `--text-faint` `#b7babf` | 10.05:1 |
| `--text-fainter` `#a4a8ae` | 8.19:1 |

Cycle A's contrast work lifted that ladder and it is bright. What it never touched is the **surfaces**, and they are all the same near-black:

| adjacent pair | ratio |
|---|---|
| `--surface-window` → `--surface-canvas` | **1.021** |
| `--surface-canvas` → `--surface-raised-1` | 1.089 |
| `--surface-raised-1` → `--surface-raised-2` | **1.032** |
| `--surface-raised-2` → `--surface-hover` | **1.012** |
| `--surface-hover` → `--surface-control-active` | 1.098 |

The whole app spans 1.00 to 1.27. **This project's own floor for ladder separation is 1.2, and not one adjacent surface pair clears it.** A hover state at 1.012 is a hover state nobody can see. Bright text floating on one flat black is exactly what "dim" describes: nothing has shape, so nothing reads as raised, selected or hovered.

The borders are carrying the whole structure alone, and two of the four are faint doing it: `--border-hairline` 1.91:1, `--border-subtle` 2.31:1.

- [ ] **Step 1: Write the failing test the surfaces have never had**

The text ladder has a "keeps its rungs" guard. The surfaces have none — which is why they drifted to within 1% of each other without anything complaining. Add to `test/contrast.test.js`:

```js
// The SURFACE ladder, which never had a guard and drifted to nothing.
// Measured 2026-09-06, before Cycle D Task 5: the six surfaces spanned
// 1.00-1.27 against the window, with adjacent steps as small as 1.012 —
// a hover state a twentieth of the way to the app's own 1.2 floor.
//
// Surfaces are not text, so the bar is not 4.5. It is the same LADDER rule
// the text tokens keep: each rung must be visibly apart from the one below
// it, or the name is a lie.
const SURFACE_LADDER = [
  '--surface-window',
  '--surface-canvas',
  '--surface-raised-1',
  '--surface-raised-2',
  '--surface-hover',
  '--surface-control-active',
];

it('every surface is visibly above the one below it', () => {
  for (let i = 1; i < SURFACE_LADDER.length; i++) {
    const lower = SURFACE_LADDER[i - 1];
    const upper = SURFACE_LADDER[i];
    const r = ratio(tokenValue(upper), tokenValue(lower));
    expect(r, `${lower} -> ${upper} is ${r.toFixed(3)}, flat`).toBeGreaterThanOrEqual(1.2);
  }
});
```

Reuse that file's existing `ratio` and token-reading helpers rather than adding a second pair; if their names differ, use theirs.

- [ ] **Step 2: Run it and watch every rung fail**

```bash
npx vitest run test/contrast.test.js
```

Expected: FAIL, naming `--surface-window -> --surface-canvas is 1.021, flat`. Record every reported ratio in `docs/verification-2026-09-01.md` — that table is the before state, and it is the argument for the change.

- [ ] **Step 3: Raise the surfaces, keeping hue and saturation**

Each token keeps its own hue and saturation and moves only in lightness, the same discipline Cycle A used on the text ladder. Work up from `--surface-window`, which stays where it is — it is the floor everything else is measured from, and moving it would move every text ratio too.

After each edit, re-run the test and record the achieved ratio beside the value. **Do not tune to the floor.** Cycle A hit 4.53:1 against a 4.5 bar once and its own token comment records that as a habit to avoid; aim past 1.2, not at it.

- [ ] **Step 4: Confirm the text ladder survived the change**

```bash
npx vitest run test/contrast.test.js
```

Raising `--surface-raised-1` and `--surface-control-active` lowers every text ratio measured against them, and those pairs are already asserted in that file. Expected: PASS. If one fails, the surface moved too far — lower the surface rather than raising the text, which has least room left at the top of its own ladder.

- [ ] **Step 5: Look at it, with a shot loaded**

In a **fresh tab**, at 1440px:

- do the panels read as panels, distinct from the stage;
- is a hovered template row visibly different from an unhovered one;
- is a selected row visibly different from a hovered one;
- does the canvas still read as the brightest thing on screen, which it must — the shot is the subject and the chrome is not.

**If it now reads as grey rather than black, say so.** Going too far is a real outcome and the numbers alone cannot tell you.

- [ ] **Step 6: Commit, deploy, and STOP**

```bash
git add web/tokens.css test/contrast.test.js docs/verification-2026-09-01.md
git commit -m "fix(web): the surfaces were all one black"
git push
```

> Hand over with the before/after table, and answer Rock's sentence directly: it was dim because every surface sat within 1% of every other, and here is what they are now.

---

## Task 6: The accent colour

**Files:**
- Modify: `web/tokens.css`
- Modify: `web/style.css`
- Test: `test/contrast.test.js`

> Rock, 2026-09-02: *"I think we are too BW and not using our main accent color (which seems to be purple maybe?). just hold this suggestion for later."*

The brand gradient `#5b6cff → #a24ff0` appears on exactly one thing — the app-mark glyph, and now the favicon. Everything else says "active" with lightness alone.

**This comes after Task 5 deliberately.** An accent laid over surfaces that are all the same black would be doing the surfaces' job as well as its own, and the two changes would be impossible to judge apart.

- [ ] **Step 1: Measure what "active" costs today, before changing it**

For each of these, record the current pair and its contrast ratio in `docs/verification-2026-09-01.md`:

- `.rail-item.is-active`
- `.template-row.is-selected`
- `.segmented-cell.is-active`
- `.chip.is-selected`
- `.preset-tile.is-selected`
- `.sampled-row.is-active`
- the slider fill (`--text-primary` against `--border-strong`)
- every `:focus-visible` ring

An accent that lands on a surface already carrying a 3:1 boundary must keep it; one that replaces text ink must keep 7:1. Knowing which is which before choosing a colour is the difference between a design decision and a repaint.

- [ ] **Step 2: Add the tokens**

In `web/tokens.css`, beside `--color-brand-start` / `--color-brand-end`:

```css
  /* THE ACCENT. Derived from the brand mark rather than chosen beside it:
     the app already had an identity on one 20px glyph and nowhere else.
     --accent is the flat colour for boundaries and fills; --accent-ink is
     what sits ON it. Both are measured in test/contrast.test.js against the
     same bars Cycle A Task 3b set: 3:1 as a component boundary, 7:1 when it
     carries text. */
  --accent: #6b78ff;
  --accent-ink: #ffffff;
  --accent-quiet: #2a2f52;   /* the accent as a FILL behind ink, not as ink */
```

The exact values are a starting point, not a result — Step 3 measures them and Step 4 is where they are tuned to clear the bars.

- [ ] **Step 3: Add the contrast assertions before applying the colour**

In `test/contrast.test.js`, add the accent's pairs to the existing token table:

```js
  // The accent (Cycle D Task 6). It carries ink on .chip.is-selected and on
  // the active segmented cell, so it owes 7:1 there; everywhere else it is a
  // boundary or a fill and owes 3:1.
  ['--accent-ink', '--accent', TEXT_MIN],
  ['--accent', '--surface-window', BOUNDARY_MIN],
  ['--accent', '--surface-raised-1', BOUNDARY_MIN],
```

- [ ] **Step 4: Run it, and tune the token until it passes**

```bash
npx vitest run test/contrast.test.js
```

If a pair fails, **change the token, not the threshold**.

- [ ] **Step 5: Apply it where "active" is currently only lighter**

In `web/style.css`, and nowhere else:

- `.rail-item.is-active` — the icon and its left edge
- `.template-row.is-selected` — the left edge, keeping the raised fill
- `.segmented-cell.is-active` — the fill, with `--accent-ink` as its label
- `.chip.is-selected` — the pill
- `.preset-tile.is-selected` — the ring (it currently uses `--text-primary`)
- `.sampled-row.is-active` — the border
- `.slider::-webkit-slider-runnable-track` and `::-moz-range-progress` — the filled part
- every `:focus-visible` outline

Do **not** apply it to: body text, the section labels, the canvas surround, or any disabled state. A disabled control that keeps an accent reads as active.

- [ ] **Step 6: Run the whole suite**

```bash
npx vitest run
```

Expected: PASS, including the opacity and off-state guards.

- [ ] **Step 7: Look at it, with a shot loaded**

In a **fresh tab**: does the app read as designed, or as a greyscale app with purple sprinkled on it? Check the rail, a selected template, the Background type control, a selected preset tile, and every focus ring by tabbing through.

**This is the task where "the tests pass" says least.** If it looks like decoration, say so and propose fewer places rather than more.

- [ ] **Step 8: Commit, deploy, and STOP**

```bash
git add web/tokens.css web/style.css test/contrast.test.js docs/verification-2026-09-01.md
git commit -m "feat(web): the app has an accent colour"
git push
```

---

## Task 7: Hide the CLI card

**Files:**
- Modify: `web/index.html`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-02-shotkit-round-two-design.md`

The sidebar's footer shows `$ shotkit watch ./shots` above a green dot and the words **CLI connected**. There is no CLI — the README's own "Not built yet" list says so — so it is a status indicator asserting something untrue.

**DECIDED, Rock 2026-09-06:** *"but we are supposed to have CLI at some point, no? either way, you can hide it for now. but let's circle back on this later."*

So it is **hidden, not deleted**: the CLI is still planned, and deleting the card would throw away the design for its status line too. This is a deferral, and it is written down as one so it is not lost.

- [ ] **Step 1: Hide the card, and say in the markup why**

In `web/index.html`, add `hidden` to the `.cli-card` element and put the reason above it:

```html
        <!-- HIDDEN, NOT DELETED — Cycle D Task 7, Rock's call 2026-09-06:
             "we are supposed to have CLI at some point... you can hide it
             for now. but let's circle back on this later."

             The card showed a green dot and the words "CLI connected" while
             no CLI existed — see the README's "Not built yet". A status
             indicator asserting something untrue is the one thing this
             project's rules never allow. It stays in the markup because the
             CLI is still planned and this is its design. -->
        <div class="cli-card" hidden>
```

`[hidden] { display: none !important; }` is already the single global rule, so no CSS is added.

- [ ] **Step 2: Record the deferral where it will be found again**

In the spec's "Out of scope" section:

```markdown
- The CLI, and with it the sidebar's CLI card — hidden 2026-09-06, not
  deleted, because the CLI is still planned. The card asserted "CLI
  connected" with a green dot while no CLI existed. Rock: "let's circle back
  on this later."
```

In the README's "Not built yet" entry for the CLI, add one sentence: the sidebar carries a hidden status card for it, waiting.

- [ ] **Step 3: Confirm nothing else claims a live connection**

```bash
grep -rn "connected" web/
grep -rn "status-dot" web/
grep -rn "color-status-green" web/
```

Expected: only the hidden card and its token. Anything else claiming a connection is the same defect and goes with it.

- [ ] **Step 4: Check it in the browser and commit**

In a **fresh tab**: the card is gone from the sidebar, the panel's own scroll still behaves, and the console is clean.

```bash
git add web/index.html README.md docs/superpowers/specs/2026-09-02-shotkit-round-two-design.md
git commit -m "fix(web): hide the CLI card, which claimed a connection that does not exist"
git push
```

---

## Task 8: The whole-app verification pass

**Files:**
- Modify: `docs/verification-2026-09-01.md`

Cycle D moves controls between panels and repaints every surface, which is exactly the change that breaks keyboard order, focus rings and narrow-viewport drawers without failing a single test.

- [ ] **Step 1: Tab through the whole app and record the order**

From the rail to Export, with no screenshot loaded and then with one. Every stop must show a visible focus ring, and the order must follow the visual layout. Record the sequence.

- [ ] **Step 2: Re-run the target-size and contrast measurements**

The same script Cycle C used, recorded in `docs/verification-2026-09-01.md` under "The rest of the accessibility check": every interactive element's box, and for each one under 24×24, whether a 24px circle centred on it intersects another target. New rows in new panels are new adjacencies.

- [ ] **Step 3: Check the narrow-viewport drawers still hold both panels**

Below 900px the two panels are off-canvas drawers with `inert` applied when closed (`web/main.js`). Both now carry more. Open each, Tab into it, close it with Escape, and confirm focus returns to its toggle and that a closed drawer takes no Tab stops.

- [ ] **Step 4: Confirm the canvas did not shrink**

The spec names this as the risk of the split: *"The visible risk is that both sides get heavier and squeeze the canvas."* Measure `#stage`'s width at 1440px and compare with the number recorded before Task 1. If the canvas lost room, say so with the number — that is a real cost, not a rounding error.

- [ ] **Step 5: Commit and STOP**

```bash
git add docs/verification-2026-09-01.md
git commit -m "docs: Cycle D's verification pass"
git push
```

---

## Cycle close

After Task 8 is approved:

1. `npx vitest run` — green.
2. `git status --short test/golden` — clean. **No golden may move this cycle**: nothing in `core/` is touched, so a moved golden means something reached the renderer that should not have.
3. Update the README: the panel split in the "Inspector" bullet, the accent colour if it lands, and the CLI card's entry per Task 6.
4. Merge the PR to `main` with `--merge` (not squash), delete the branch, confirm CI on `main` and the production deploy.
5. **Verify the live site**, not just the preview.
6. **Stop and report before the next cycle.** What remains after this: the light theme (its own cycle, designed from scratch), keyboard selection on the canvas, named device frames, and saved projects.

---

## Self-review

**Spec coverage.** "Carried forward — the accent colour" → Task 6, including its 3:1 / 7:1 requirement. "The organising rule: left is the shot, right is the thing you clicked" → Tasks 2 and 3. "Templates and ratios become one tabbed control" → Task 1. "DECIDED — every slider carries its own Reset ... Cycle D generalises it to the rest" → Task 4. The spec's stated risk — the panels squeezing the canvas — is measured in Task 1 Step 9 and again in Task 7 Step 4.

**Not covered here, deliberately:** the light theme, which the spec keeps as its own cycle designed from scratch; keyboard selection on the canvas, still unbuilt since Cycle B; named device frames; saved projects and presets. Background images and wallpapers remain out of scope entirely.

**Raised by this plan, not by the spec:** two things. The CLI card (Task 7) is a fabricated status in shipped UI, found while mapping the sidebar for the panel split; Rock's answer on 2026-09-06 was to hide rather than delete it, since the CLI is still planned. And Task 5 exists because of his verdict the same day — *"the UI still is very dim and low contrast"* — which measurement traced to the surface ladder rather than to the text the earlier contrast work had already lifted.

**Where this plan is weakest, said plainly.** Task 6 is a visual identity decision with almost no test cover — contrast assertions prove an accent is *legible*, never that it is *good*, and the honest acceptance test is Rock looking at it. Task 4 converts eight sliders in one task, which is larger than this plan's own right-sizing rule likes; it is one task because a half-converted `web/controls.js` leaves two ways to build a slider, which is the exact condition it exists to remove. Its risk is mitigated by the browser check in Step 8 listing all eight by name.

**Type consistency.** `SIZE_TABS` / `activeSizeTab(config)` are Task 1's exports and used nowhere else. `makeSliderRow({ label, min, max, step, ariaLabel, format, isDefault, onInput, onReset, resetLabel })` returns `{ row, input, value, reset, sync }` and is the only slider constructor from Task 4 onward. `initCanvasPanel()` mounts on `#canvasSection`, matching `CONTENT_SECTIONS` in Task 2 Step 4. `activePadPercent` / `setPadPercent` / `activeGrainPercent` / `setGrainPercent` keep their exact names across the move in Task 3; only their module changes.
