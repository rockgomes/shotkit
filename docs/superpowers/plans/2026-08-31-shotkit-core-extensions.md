# shotkit core extensions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the finished `core/` library with named export templates, export scale, a gradient angle, mesh backgrounds, and device frames (browser / macOS / iPhone), so the app can later be built once against a complete library.

**Architecture:** `core/` is a zero-dependency ES-module library that paints Dribbble shots onto a canvas 2D context, running in both the browser (the product) and `@napi-rs/canvas` (tests, future CLI). It is complete for shotkit's original feature set: `presets.js`, `config.js`, `ground.js`, `layout.js`, `render.js`, `index.js`, 80 passing tests. This plan adds to it without disturbing what exists — every new capability defaults OFF, so all 80 existing tests must stay green unmodified.

**Tech Stack:** Vanilla JS (ES modules), Vitest, `@napi-rs/canvas` and `pixelmatch` (test-only).

**Spec:** `docs/superpowers/specs/2026-08-31-shotkit-web-design.md` — read **Amendment 1**, which governs this plan. The original spec body describes what Tasks 1–7 already built.

**Predecessor:** `2026-08-31-shotkit-web.md` Tasks 1–7 (complete). Its Tasks 8–12 are superseded.

## Global Constraints

Every task's requirements implicitly include this section.

- **`core/` has zero runtime dependencies.** No npm packages, no DOM types (`HTMLCanvasElement`, `Image`, `document`, `window`), no Node built-ins (`fs`, `path`, `process`). Test-only dependencies are fine.
- **`core/` never creates a canvas.** Scratch canvases come from the injected `makeCanvas(w, h)` factory.
- **No engine detection, ever.** No `process`, `navigator`, `isNode`, or capability sniffing in `core/`. This is load-bearing: a previous task tuned shadow alphas against `@napi-rs/canvas` and shipped values that were 65 RGB levels too dark in the browser. The browser is the product; napi-rs is a harness that renders shadows ~5.4× fainter. Read the doc comment above `paintShadow` in `core/render.js` before touching any shadow.
- **Every new feature defaults to OFF.** `frame: 'none'`, `background type: linear`, `scale: 1`, existing ratios unchanged. All 80 existing tests must pass **without modification**. If an existing test needs changing to accommodate new work, that is a design error — stop and report it.
- **The handoff is the visual reference, the way `frame.html` was the behavioural one.** `design_handoff_backdrop_1a/Backdrop Mockups.dc.html`, the section with `id="1a"`. Read real values out of it; do not invent them and do not round them to a 4/8px grid. Its README summarises but the HTML is authoritative.
- **Values from the handoff are given at mockup scale** (a 560×420 artboard, frame at 76% width). shotkit sizes everything as a proportion of the canvas. Every extracted constant must be converted to a fraction and the derivation recorded in a comment.
- ES modules. Node 20+. Commit after every task.
- Golden PNGs are generated under `@napi-rs/canvas` and are a napi-rs-vs-napi-rs regression baseline only. They encode a fainter shadow than the browser produces and must never be compared against a browser screenshot.
- Pixel-diff tests use `pixelmatch({threshold: 0})` with a ratio budget of `1e-5`. Do not loosen either. A previous baseline at `threshold: 0.1` / `1e-3` failed to detect a doubled shadow alpha — zero differing pixels.

---

### Task 1: Templates, export scale, format, and the angle parameter

Config-level only. No painting changes. This is the cheap groundwork every later task reads from.

**Files:**
- Modify: `core/presets.js`, `core/config.js`
- Modify: `test/config.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `TEMPLATES: Record<string, {w, h, label}>` in `presets.js` — `dribbble` 2800×2100, `twitter-post` 1600×900, `twitter-header` 1500×500, `app-store` 2880×1800, `open-graph` 2400×1260, `instagram` 2160×2160.
  - `normalise()` gains: `template` (resolves to `w`/`h`), `scale` (1 | 2 | 3, default 1), `format` (`'png'` | `'jpeg'` | `'webp'`, default `'png'`), `angle` (degrees, default **166** — the value hardcoded in `frame.html`'s linear gradient).
  - Resolution order, most specific wins: explicit `w`/`h` → `template` → `ratio` → default `3:2`.

- [ ] **Step 1: Write the failing tests**

Append to `test/config.test.js`:

```js
describe('templates', () => {
  it('resolves a named template to its pixel size', () => {
    expect(normalise({ template: 'dribbble' })).toMatchObject({ w: 2800, h: 2100 });
    expect(normalise({ template: 'twitter-post' })).toMatchObject({ w: 1600, h: 900 });
    expect(normalise({ template: 'instagram' })).toMatchObject({ w: 2160, h: 2160 });
  });

  it('template beats ratio', () => {
    expect(normalise({ ratio: '16:9', template: 'dribbble' })).toMatchObject({ w: 2800, h: 2100 });
  });

  it('explicit w/h beats template', () => {
    expect(normalise({ template: 'dribbble', w: 100, h: 50 })).toMatchObject({ w: 100, h: 50 });
  });

  it('an unknown template falls back to the ratio', () => {
    expect(normalise({ template: 'nope', ratio: '1:1' })).toMatchObject({ w: 1500, h: 1500 });
  });

  it('ratios still work untouched', () => {
    expect(normalise({ ratio: '3:2' })).toMatchObject({ w: 1800, h: 1200 });
  });
});

describe('export settings', () => {
  it('defaults to scale 1 and png', () => {
    expect(normalise({})).toMatchObject({ scale: 1, format: 'png' });
  });

  it('accepts scale 2 and 3', () => {
    expect(normalise({ scale: 2 }).scale).toBe(2);
    expect(normalise({ scale: '3' }).scale).toBe(3);
  });

  it('rejects a nonsense scale back to 1', () => {
    expect(normalise({ scale: 7 }).scale).toBe(1);
    expect(normalise({ scale: 'big' }).scale).toBe(1);
  });

  it('accepts the three formats and rejects others', () => {
    expect(normalise({ format: 'jpeg' }).format).toBe('jpeg');
    expect(normalise({ format: 'webp' }).format).toBe('webp');
    expect(normalise({ format: 'gif' }).format).toBe('png');
  });

  it('scale does NOT change the canvas size', () => {
    // scale is applied at export, not by inflating the composition
    expect(normalise({ ratio: '3:2', scale: 3 })).toMatchObject({ w: 1800, h: 1200 });
  });
});

describe('angle', () => {
  it("defaults to frame.html's 166 degrees", () => {
    expect(normalise({}).angle).toBe(166);
  });

  it('accepts a number and wraps out-of-range values', () => {
    expect(normalise({ angle: 45 }).angle).toBe(45);
    expect(normalise({ angle: 420 }).angle).toBe(60);
    expect(normalise({ angle: -30 }).angle).toBe(330);
  });

  it('falls back to 166 on nonsense', () => {
    expect(normalise({ angle: 'sideways' }).angle).toBe(166);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/config.test.js`
Expected: FAIL — the new keys are undefined.

- [ ] **Step 3: Add `TEMPLATES` to `core/presets.js`**

```js
// Named export sizes. Real platform dimensions, not ratios — a Dribbble shot is
// 2800x2100 (4:3 at @2x), which is what the site actually wants.
export const TEMPLATES = {
  'dribbble':       { w: 2800, h: 2100, label: 'Dribbble shot' },
  'twitter-post':   { w: 1600, h: 900,  label: 'Twitter post' },
  'twitter-header': { w: 1500, h: 500,  label: 'Twitter header' },
  'app-store':      { w: 2880, h: 1800, label: 'App Store' },
  'open-graph':     { w: 2400, h: 1260, label: 'Open Graph' },
  'instagram':      { w: 2160, h: 2160, label: 'Instagram' },
};

// frame.html's linear gradient is hardcoded to 166deg. It becomes a parameter.
export const DEFAULT_ANGLE = 166;

export const SCALES = [1, 2, 3];
export const FORMATS = ['png', 'jpeg', 'webp'];
```

- [ ] **Step 4: Extend `normalise()` in `core/config.js`**

Resolution order matters — explicit dimensions beat a template, a template beats a ratio.

```js
  const tpl = TEMPLATES[input.template];
  const [rw, rh] = RATIOS[input.ratio] || RATIOS[DEFAULTS.ratio];
  const baseW = tpl ? tpl.w : rw;
  const baseH = tpl ? tpl.h : rh;
  const w = num(input.w, baseW);
  const h = num(input.h, baseH);
```

And on the returned object:

```js
    scale: SCALES.includes(num(input.scale, 1)) ? num(input.scale, 1) : 1,
    format: FORMATS.includes(input.format) ? input.format : 'png',
    angle: (() => {
      const a = num(input.angle, DEFAULT_ANGLE);
      return ((a % 360) + 360) % 360;
    })(),
    template: tpl ? input.template : null,
```

`scale` deliberately does NOT inflate `w`/`h` — the composition is authored at the template size and scaled at export, so geometry stays identical at 1x and 3x.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS — 80 pre-existing plus the new cases, nothing modified.

- [ ] **Step 6: Commit**

```bash
git add core/presets.js core/config.js test/config.test.js
git commit -m "feat(core): add export templates, scale, format and gradient angle"
```

---

### Task 2: `paintGround` honours the angle

Small, and it must not disturb the frozen goldens.

**Files:**
- Modify: `core/render.js`
- Modify: `test/render-ground.test.js`

**Interfaces:**
- `paintGround(ctx, c, stops)` reads `c.angle` instead of the literal 166.

- [ ] **Step 1: Write the failing test**

```js
describe('paintGround angle', () => {
  it('defaults to 166 degrees — byte-identical to the hardcoded original', () => {
    const a = renderGround({ angle: 166 });
    const b = renderGround({});                 // angle omitted
    expect(Buffer.compare(a, b)).toBe(0);
  });

  it('a different angle changes the render', () => {
    const a = renderGround({ angle: 166 });
    const b = renderGround({ angle: 20 });
    expect(Buffer.compare(a, b)).not.toBe(0);
  });

  it('90 degrees puts the light source up the left edge, not the top-left', () => {
    // sanity check that the angle actually rotates the linear stop, in the
    // direction CSS uses: 0deg points up, angles run clockwise.
    const ctx = renderGroundCtx({ angle: 90 });
    const left = lum(px(ctx, 20, 600));
    const right = lum(px(ctx, 1780, 600));
    expect(left).toBeGreaterThan(right);
  });
});
```

Write `renderGround` / `renderGroundCtx` / `lum` helpers in the same file, following the existing helpers' style.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/render-ground.test.js`
Expected: FAIL on the angle cases.

- [ ] **Step 3: Read `c.angle` in `paintGround`**

The existing line computes `rad` from a literal 166. Replace the literal with `c.angle ?? 166`, leaving the CSS-angle conversion (`- 90`, clockwise) exactly as it is.

- [ ] **Step 4: Verify the goldens did not move**

Run: `npx vitest run`
Expected: PASS, 80+ tests, and specifically the three pixel-diff cases still green — `normalise()` defaults `angle` to 166, so the default render must be byte-identical to what is frozen. If a golden fails here, the angle conversion changed the default render and that is a defect, not a reason to regenerate.

- [ ] **Step 5: Commit**

```bash
git add core/render.js test/render-ground.test.js
git commit -m "feat(core): make the ground gradient angle a parameter"
```

---

### Task 3: Mesh gradient background

A new background type. `type: 'linear'` stays the default and the existing path is untouched.

**Files:**
- Modify: `core/presets.js`, `core/config.js`, `core/render.js`
- Create: `test/render-mesh.test.js`

**Interfaces:**
- `normalise()` gains `bgType`: `'linear'` (default) | `'solid'` | `'mesh'`, and `seed` (integer, default 1).
- `core/render.js` exports `paintMesh(ctx, c, stops)` and `paintSolid(ctx, c, stops)`.
- `paintGround(ctx, c, stops)` dispatches on `c.bgType`. Callers keep calling `paintGround`; nothing downstream learns about the split.

- [ ] **Step 1: Write the failing tests**

`test/render-mesh.test.js`:

```js
describe('paintGround dispatch', () => {
  it('defaults to linear and is byte-identical to before', () => {
    expect(Buffer.compare(render({}), render({ bgType: 'linear' }))).toBe(0);
  });

  it('solid fills flat with the middle stop', () => {
    const ctx = renderCtx({ bgType: 'solid' });
    expect(px(ctx, 40, 40)).toEqual(px(ctx, 1760, 1160));
  });

  it('mesh differs from linear', () => {
    expect(Buffer.compare(render({ bgType: 'mesh' }), render({}))).not.toBe(0);
  });
});

describe('paintMesh', () => {
  it('is deterministic for a given seed', () => {
    expect(Buffer.compare(render({ bgType: 'mesh', seed: 7 }), render({ bgType: 'mesh', seed: 7 }))).toBe(0);
  });

  it('a different seed gives a different field', () => {
    expect(Buffer.compare(render({ bgType: 'mesh', seed: 7 }), render({ bgType: 'mesh', seed: 8 }))).not.toBe(0);
  });

  it('fills every pixel opaquely', () => {
    const ctx = renderCtx({ bgType: 'mesh' });
    for (const [x, y] of [[0,0],[1799,0],[0,1199],[1799,1199],[900,600]]) {
      expect(ctx.getImageData(x, y, 1, 1).data[3]).toBe(255);
    }
  });

  it('stays within the ground palette — no colour outside the three stops\' hue range', () => {
    // a mesh built from the sampled stops must not invent a hue the product
    // does not have; that would break the "ground comes from the product" rule.
    const ctx = renderCtx({ bgType: 'mesh' });
    const hues = samplePoints(ctx, 200).map(hueOf);
    const spread = circularSpread(hues);
    expect(spread).toBeLessThan(40);   // degrees
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/render-mesh.test.js`
Expected: FAIL — `paintMesh` is not exported.

- [ ] **Step 3: Implement `paintSolid` and `paintMesh`**

`paintSolid` is a flat `fillRect` in `stops[1]`.

`paintMesh` places N soft radial blobs, seeded, each coloured from one of the three stops, over a base fill of `stops[1]`:

- Use the same `mulberry32` seeded PRNG already in `core/render.js` for `noiseTile` — reuse it, do not write a second one. Seed it from `c.seed`.
- 5–7 blobs. For each: a position drawn from the seeded PRNG within a margin of the canvas, a radius of 40–75% of the shorter canvas side, and a colour cycling through `stops[0]`, `stops[2]`, `stops[0]`…
- Draw each as a `createRadialGradient` from `rgba(colour, 0.75)` at the centre to `rgba(colour, 0)` at the edge, composited normally.
- Finish with the same two corner radials `paintGround`'s linear path uses, so the top-left highlight and bottom-right deepening survive — that is what ties a mesh ground to the rest of the system.

Colour comes only from the three sampled stops. Do not introduce hues that are not in them; the "ground comes from the product" rule is the reason this library exists.

- [ ] **Step 4: Dispatch in `paintGround`**

```js
export function paintGround(ctx, c, stops) {
  if (c.bgType === 'solid') return paintSolid(ctx, c, stops);
  if (c.bgType === 'mesh')  return paintMesh(ctx, c, stops);
  // ... the existing linear path, unchanged
}
```

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS. The three frozen goldens must still match byte-for-byte — `bgType` defaults to `'linear'`.

- [ ] **Step 6: Add a mesh golden**

Add a `mesh` case to `scripts/make-render-goldens.js` with a fixed `seed`, regenerate, and add it to the pixel-diff `CASES` array. Confirm the new case fails if the seed changes.

- [ ] **Step 7: Commit**

```bash
git add core/presets.js core/config.js core/render.js test/render-mesh.test.js scripts/make-render-goldens.js test/golden/render/mesh.png test/compose.test.js
git commit -m "feat(core): add solid and seeded mesh background types"
```

---

### Task 4: Frame geometry in `core/layout.js`

**The most invasive task in this plan.** `core/layout.js` is closed, fully tested, and every existing assertion must survive unmodified.

**Files:**
- Modify: `core/presets.js`, `core/config.js`, `core/layout.js`
- Modify: `test/layout.test.js`

**Interfaces:**
- `normalise()` gains `frameKind`: `'none'` (default) | `'browser'` | `'macos'` | `'iphone'`, and `chromeTheme`: `'dark'` (default) | `'light'`.
- `layout()`'s `web` object gains a `chrome` field: `null` when `frameKind === 'none'`, otherwise `{kind, barH, screen: {x, y, w, h}, radius, innerRadius}` where `screen` is where the screenshot goes **inside** the frame.
- When `frameKind === 'none'`, `layout()` output must be **identical** to today's, field for field.

**First, read the mockup.** Open `design_handoff_backdrop_1a/Backdrop Mockups.dc.html`, find `id="1a"`, and extract the real browser-frame values: bar height, radius, the traffic-dot size and gap, the URL pill dimensions. They are given at mockup scale — a 560×420 artboard with the frame at 76% width. Convert each to a fraction of the **frame width** (the way the phone's bezel is `w * 0.019` and its radius `w * 0.125`) and record the arithmetic in a comment. Do not guess and do not snap to a round number.

- [ ] **Step 1: Write the failing tests**

```js
describe('frame: none (the existing behaviour)', () => {
  it('produces exactly the same layout as before for every existing case', () => {
    // parameterise over the existing web / mobile / web+mobile cases and assert
    // deep equality against the pre-frame output, with chrome === null.
    const out = layout(normalise({ layout: 'web', ratio: '3:2' }), { web: 1.6, mobile: [] });
    expect(out.web.chrome).toBeNull();
    expect(out.web).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
  });
});

describe('frame: browser', () => {
  it('adds a chrome block above the screenshot', () => {
    const c = normalise({ layout: 'web', ratio: '3:2', frameKind: 'browser' });
    const { web } = layout(c, { web: 1.6, mobile: [] });
    expect(web.chrome).not.toBeNull();
    expect(web.chrome.barH).toBeGreaterThan(0);
  });

  it('shrinks the screenshot area by exactly the bar height', () => {
    const c = normalise({ layout: 'web', ratio: '3:2', frameKind: 'browser' });
    const { web } = layout(c, { web: 1.6, mobile: [] });
    expect(web.chrome.screen.h).toBeCloseTo(web.h - web.chrome.barH, 6);
    expect(web.chrome.screen.y).toBeCloseTo(web.y + web.chrome.barH, 6);
    expect(web.chrome.screen.w).toBeCloseTo(web.w, 6);
  });

  it('scales the bar with the canvas, not with fixed pixels', () => {
    const small = layout(normalise({ ratio: '3:2', frameKind: 'browser' }), { web: 1.6, mobile: [] });
    const big = layout(normalise({ template: 'dribbble', frameKind: 'browser' }), { web: 1.6, mobile: [] });
    const ratioSmall = small.web.chrome.barH / small.web.w;
    const ratioBig = big.web.chrome.barH / big.web.w;
    expect(ratioSmall).toBeCloseTo(ratioBig, 6);
  });

  it('keeps the outer frame inside the safe box', () => {
    const c = normalise({ layout: 'web', ratio: '3:2', frameKind: 'browser' });
    const { safe, web } = layout(c, { web: 1.6, mobile: [] });
    expect(web.x).toBeGreaterThanOrEqual(safe.x - 1e-6);
    expect(web.y + web.h).toBeLessThanOrEqual(safe.y + safe.h + 1e-6);
  });
});

describe('frame: macos', () => {
  it('has a bar, and a shorter one than the browser frame', () => {
    const b = layout(normalise({ ratio: '3:2', frameKind: 'browser' }), { web: 1.6, mobile: [] });
    const m = layout(normalise({ ratio: '3:2', frameKind: 'macos' }), { web: 1.6, mobile: [] });
    expect(m.web.chrome.barH).toBeGreaterThan(0);
    expect(m.web.chrome.barH).toBeLessThan(b.web.chrome.barH);
  });
});

describe('frame: iphone', () => {
  it('has no title bar and uses the phone corner radius', () => {
    const c = normalise({ layout: 'web', ratio: '3:2', frameKind: 'iphone' });
    const { web } = layout(c, { web: 0.462, mobile: [] });
    expect(web.chrome.barH).toBe(0);
    expect(web.chrome.radius / web.w).toBeCloseTo(0.125, 3);
  });
});
```

**The critical case is the first one.** Add an explicit regression test that runs every pre-existing layout scenario and asserts the output is unchanged when `frameKind` is absent.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/layout.test.js`
Expected: the new cases fail; all 16 pre-existing cases still pass.

- [ ] **Step 3: Add frame constants to `core/presets.js`**

Derived from the mockup, with the derivation in a comment beside each. Bar heights as fractions of frame width.

- [ ] **Step 4: Extend `webBox()` in `core/layout.js`**

Compute `chrome` after the existing box maths, never before — the outer frame occupies the box the screenshot used to, and the screenshot moves inside it. Return `chrome: null` when `frameKind === 'none'` and take no other branch, so the existing path is provably untouched.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS, all 16 pre-existing layout tests unmodified, all three goldens still byte-identical.

- [ ] **Step 6: Commit**

```bash
git add core/presets.js core/config.js core/layout.js test/layout.test.js
git commit -m "feat(core): compute device-frame geometry in layout"
```

---

### Task 5: Browser and macOS chrome painters

**Files:**
- Modify: `core/render.js`
- Create: `test/render-frames.test.js`

**Interfaces:**
- `paintChrome(ctx, c, box, theme)` — dispatches on `box.chrome.kind`, draws the bar, traffic dots and (browser only) the URL pill.
- `paintWeb(ctx, c, box, image)` grows a chrome branch: when `box.chrome` is non-null it paints the frame body, the chrome, then the screenshot into `box.chrome.screen`; when null it behaves exactly as today.

**Read the mockup for every colour.** Dark: chrome `#1b1d22`, body `#101114`, border `rgba(255,255,255,.09)`, URL pill `rgba(255,255,255,.07)` with mono text `#9ba1ab`. Light: chrome `#f6f7f9`, body `#fff`, borders `#e3e5ea`. Traffic dots `#ff5f57 #febc2e #28c840`. Confirm each against the HTML.

- [ ] **Step 1: Write the failing tests**

Cover: the bar is painted in the theme colour; three traffic dots exist in the right colours at the left of the bar; the screenshot lands inside `chrome.screen` and not under the bar; light theme differs from dark; `frameKind: 'none'` renders byte-identically to a render with no chrome code at all.

That last one is the important one — assert it with a buffer comparison, not a spot check.

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Implement `paintChrome`**

Reuse `roundRect` and the existing `rgba`/`hexToRgb` helpers. Do not add a second rounded-rect implementation. **Do not touch `paintShadow` or any alpha value** — the shadow attaches to the outer frame exactly as it attaches to the bare screen today, with `frame.html`'s original alphas.

- [ ] **Step 4: Branch in `paintWeb`**

The `box.chrome === null` path must be the untouched original code, not a re-derivation.

- [ ] **Step 5: Run the full suite**

Expected: PASS, three goldens byte-identical.

- [ ] **Step 6: Commit**

```bash
git add core/render.js test/render-frames.test.js
git commit -m "feat(core): paint browser and macOS window chrome"
```

---

### Task 6: iPhone frame, goldens, and `compose()` wiring

Completes the plan. The iPhone frame has no title bar — it is a bezel, a large corner radius, and a screenshot filling the interior.

**Files:**
- Modify: `core/render.js`, `core/index.js`, `scripts/make-render-goldens.js`, `test/compose.test.js`

**Interfaces:**
- `composeWithMeta(target, rawConfig, images, makeCanvas)` passes `frameKind`, `chromeTheme`, `bgType`, `seed` and `angle` through. Its signature does not change.
- `compose()` unchanged.

- [ ] **Step 1: Write the failing tests**

An iPhone-frame case, plus a matrix test through `composeWithMeta` covering each `frameKind` × each `chromeTheme`, asserting each combination renders and differs from its neighbours.

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Implement the iPhone frame**

Reuse `paintPhone`'s bezel arithmetic where it genuinely applies rather than duplicating it. The phone painter already draws a body, an inset screen and an inner highlight; if the iPhone frame is that shape at a different scale, factor the shared part out rather than copying it.

- [ ] **Step 4: Freeze the new goldens**

Add cases for browser-dark, browser-light, macos-dark and iphone. Regenerate.

Then **prove the new goldens guard**: change the chrome bar height, then a traffic-dot colour, and confirm each fails the pixel-diff. Report the ratios. A golden that does not fail on a real change is decoration — a previous baseline in this project missed a doubled shadow alpha entirely.

- [ ] **Step 5: Run the full suite**

Expected: PASS. Every pre-existing test unmodified, every pre-existing golden byte-identical.

- [ ] **Step 6: Commit**

```bash
git add core/render.js core/index.js scripts/make-render-goldens.js test/compose.test.js test/golden/render
git commit -m "feat(core): add the iPhone frame and wire frames through compose()"
```

---

## Self-review

**Spec coverage** against Amendment 1:

| Amendment section | Task |
|---|---|
| Templates, export scale, format | 1 |
| Angle parameter | 1, 2 |
| Mesh (and solid) background | 3 |
| Device frames — geometry | 4 |
| Device frames — browser / macOS paint | 5 |
| Device frames — iPhone, chrome theme, wiring | 6 |
| Background panel ordering (auto → presets → manual → mesh) | UI concern; the config surface all four need lands in 1 and 3 |
| Obsidian tokens, four-pane shell, inspector | the app plan, written after this one |
| Canvas surround | the app plan — it is chrome, and `core/` must never learn about it |

**Known gaps, stated rather than hidden:**

- **The surround is not in this plan at all**, deliberately. It is chrome, the spec forbids `core/` from knowing about it, and its byte-identical-export test belongs with the app.
- **No light theme for the app chrome.** Deferred per the spec; the handoff's option 1b is the likely source.
- **`scale` is defined but nothing consumes it.** Export happens in the app, so Task 1 lands the config surface and the app plan spends it. Flagged so it is not mistaken for an oversight.

**Type consistency:** `normalise()` (Task 1) → consumed by Tasks 2, 3, 4, 6. `layout()`'s new `chrome` field (Task 4) → consumed by Task 5's `paintChrome` and `paintWeb`, and Task 6's iPhone path. `paintGround`'s dispatch (Task 3) keeps its `(ctx, c, stops)` signature, so `composeWithMeta` needs no change for background types — only for the frame fields.

**The constraint every task shares, restated because it is the one that will break:** every new capability defaults OFF, all 80 existing tests pass unmodified, and the three frozen goldens stay byte-identical until Task 6 deliberately adds to them.
