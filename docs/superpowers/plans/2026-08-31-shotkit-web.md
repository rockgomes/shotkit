# shotkit web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn shotkit from a Python + Playwright CLI into a dependency-free JS core plus a static web app that composes Dribbble shots in the browser.

**Architecture:** All logic moves into `core/` — pure ES modules with zero runtime dependencies, no DOM types, no Node built-ins. `core/` is handed a canvas-like target and paints into it, so the same code runs in a browser and under `@napi-rs/canvas` in Node. `web/` is a thin Vite shell that decodes dropped files, calls `core/`, and downloads the result. The preview canvas *is* the export canvas, rendered at full output resolution and scaled with CSS, so export can never disagree with the preview.

**Tech Stack:** Vanilla JS (ES modules), Vite, Vitest, `@napi-rs/canvas` (test + future CLI only), `pixelmatch` (test only), Netlify static hosting.

**Spec:** `docs/superpowers/specs/2026-08-31-shotkit-web-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **`core/` has zero runtime dependencies.** No npm packages, no DOM types (`HTMLCanvasElement`, `Image`, `document`), no Node built-ins (`fs`, `path`). Test-only and app-only dependencies are fine outside `core/`.
- **`core/` never creates a canvas.** `compose(target, config, images)` is handed a target exposing `width`, `height`, and `getContext("2d")`.
- Node 20+. ES modules throughout (`"type": "module"`).
- Every numeric constant ported from `ground.py` or `frame.html` must match **exactly**. They are reproduced verbatim in each task. Do not round, simplify, or "improve" them.
- Ground lightness rule is load-bearing: a light UI gets a pale tint, a dark UI gets a **mid-tone** ground, never a dark one.
- Padding is **one** number against the shorter canvas side. Never separate per-axis percentages unless `insetX`/`insetY` are explicitly set.
- Accessibility, checked before ship: contrast passes at every generated hue; no horizontal scroll between 320px and 1920px; `:focus-visible`, disabled, and loading states on every interactive control; `prefers-reduced-motion` fallback on every animation.
- Never fabricate statistics, customer counts, benchmarks, or testimonials in page copy. If a number is not supplied, change the layout.
- Commit after every task.

---

### Task 1: Scaffold, test harness, and golden values from `ground.py`

Sets up the repo and captures the reference numbers **before** anything is ported. Python is used once here and never again.

**Files:**
- Create: `package.json`, `vitest.config.js`, `.gitignore` (already exists — modify), `scripts/make-goldens.sh`
- Create: `test/golden/ground.json` (generated)
- Move: `src/*.png` → `samples/*.png`

**Interfaces:**
- Consumes: nothing.
- Produces: `test/golden/ground.json`, an object keyed by sample filename, each value `{ lum, hue, chroma, darkUI, ground: [hex, hex, hex] }`. Task 3 asserts against this.

- [ ] **Step 1: Move the sample screenshots**

```bash
git mv src samples
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "shotkit",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@napi-rs/canvas": "^0.1.80",
    "pixelmatch": "^7.1.0",
    "vite": "^7.1.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 3: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
```

- [ ] **Step 4: Install**

Run: `npm install`
Expected: completes, `node_modules/` created.

- [ ] **Step 5: Create `scripts/make-goldens.sh`**

Pillow is not installed on this machine. This script builds a throwaway virtualenv, runs the *existing* `ground.py` over every sample, writes the reference numbers, then deletes the venv.

```bash
#!/usr/bin/env bash
# Generates test/golden/ground.json from the original ground.py.
# Run ONCE. After this, Python is never needed again.
set -euo pipefail
cd "$(dirname "$0")/.."

python3 -m venv .venv-goldens
.venv-goldens/bin/pip install --quiet pillow

mkdir -p test/golden
.venv-goldens/bin/python - <<'PY' > test/golden/ground.json
import json, os, sys
sys.path.insert(0, ".")
from ground import ground_for

out = {}
for name in sorted(os.listdir("samples")):
    if name.endswith(".png"):
        out[name] = ground_for(["samples/" + name])
print(json.dumps(out, indent=1))
PY

rm -rf .venv-goldens
echo "wrote test/golden/ground.json"
```

- [ ] **Step 6: Generate the goldens**

Run: `chmod +x scripts/make-goldens.sh && ./scripts/make-goldens.sh`
Expected: prints `wrote test/golden/ground.json`. The file contains six entries.

If `python3 -m venv` fails, the machine has no usable Python. In that case **stop and report it** — do not invent reference numbers. The whole point of this file is that it was produced by the original implementation.

- [ ] **Step 7: Sanity-check the goldens**

Run: `cat test/golden/ground.json`
Expected: each entry has `lum`, `hue`, `chroma`, `darkUI`, and a `ground` array of three `#rrggbb` strings. Confirm at least one sample has `darkUI: true` and one has `darkUI: false`. If all six are the same, the sample set does not exercise the tone rule — note it in the commit message so Task 3 knows coverage is thin.

- [ ] **Step 8: Update `.gitignore`**

```
node_modules/
out/
dist/
.DS_Store
.venv/
.venv-goldens/
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold vite + vitest, capture ground.py golden values"
```

---

### Task 2: `core/presets.js` and `core/config.js`

Defaults and normalisation. Pure data and pure functions, so this is the cheapest place to lock the vocabulary every later task uses.

**Files:**
- Create: `core/presets.js`, `core/config.js`, `test/config.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `RATIOS: Record<string, [number, number]>`
  - `HUES: Record<string, number>`
  - `DEFAULTS: object`
  - `normalise(input: object) -> config` where `config` has resolved `w`, `h`, `layout`, `fit`, `pad`, `radius`, `grain`, `phoneScale`, `phoneBleed`, `insetX`, `insetY`, `caption`, `forceHue`, `tone`.

- [ ] **Step 1: Write the failing test**

`test/config.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { normalise } from '../core/config.js';

describe('normalise', () => {
  it('defaults to 3:2 at 1800x1200', () => {
    const c = normalise({ layout: 'web' });
    expect(c.w).toBe(1800);
    expect(c.h).toBe(1200);
  });

  it('resolves named ratios', () => {
    expect(normalise({ ratio: '4:3' }).w).toBe(2000);
    expect(normalise({ ratio: '16:9' }).h).toBe(1080);
    expect(normalise({ ratio: '1:1' })).toMatchObject({ w: 1500, h: 1500 });
  });

  it('explicit w/h beats ratio', () => {
    const c = normalise({ ratio: '3:2', w: 800, h: 800 });
    expect(c).toMatchObject({ w: 800, h: 800 });
  });

  it('resolves a named ground to its hue', () => {
    expect(normalise({ ground: 'lavender' }).forceHue).toBe(268);
    expect(normalise({ ground: 'rose' }).forceHue).toBe(340);
  });

  it('resolves a numeric ground to a hue', () => {
    expect(normalise({ ground: '210' }).forceHue).toBe(210);
  });

  it('treats auto and nonsense as no forced hue', () => {
    expect(normalise({ ground: 'auto' }).forceHue).toBe(null);
    expect(normalise({ ground: 'banana' }).forceHue).toBe(null);
  });

  it('carries the shipped defaults', () => {
    const c = normalise({});
    expect(c.pad).toBeCloseTo(0.052);
    expect(c.grain).toBeCloseTo(0.34);
    expect(c.phoneScale).toBeCloseTo(0.86);
    expect(c.phoneBleed).toBeCloseTo(0.10);
    expect(c.fit).toBe('contain');
    expect(c.radius).toBe(Math.round(1800 * 0.0133));
  });

  it('infers layout from which images are present', () => {
    expect(normalise({ hasWeb: true, mobileCount: 0 }).layout).toBe('web');
    expect(normalise({ hasWeb: false, mobileCount: 2 }).layout).toBe('mobile');
    expect(normalise({ hasWeb: true, mobileCount: 1 }).layout).toBe('web+mobile');
  });

  it('accepts an explicit layout over the inference', () => {
    expect(normalise({ hasWeb: true, mobileCount: 1, layout: 'web' }).layout).toBe('web');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/config.test.js`
Expected: FAIL — cannot resolve `../core/config.js`.

- [ ] **Step 3: Write `core/presets.js`**

```js
// Canvas sizes. Values are the shipped CLI's, unchanged.
export const RATIOS = {
  '3:2':  [1800, 1200],
  '4:3':  [2000, 1500],
  '16:9': [1920, 1080],
  '1:1':  [1500, 1500],
};

// Named grounds, as hue degrees.
export const HUES = {
  lavender: 268, paper: 34, mint: 158, ember: 24,
  slate: 240, ash: 40, sky: 205, rose: 340,
};

export const DEFAULTS = {
  ratio: '3:2',
  layout: null,        // inferred when null
  fit: 'contain',      // never crops
  pad: 0.052,          // fraction of the SHORTER canvas side, all four edges
  grain: 0.34,
  phoneScale: 0.86,
  phoneBleed: 0.10,
  caption: null,
  tone: null,          // null | 'light' | 'mid'
};

// Screen corner radius, as a fraction of canvas WIDTH.
export const RADIUS_RATIO = 0.0133;

// Fallback aspect ratio for a phone whose image failed to measure.
export const PHONE_FALLBACK_RATIO = 0.462;
```

- [ ] **Step 4: Write `core/config.js`**

```js
import { RATIOS, HUES, DEFAULTS, RADIUS_RATIO } from './presets.js';

function num(v, fallback) {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Resolve raw input (CLI flags, panel values, a jobs.json entry) into a
 * complete config. Same names and defaults as the shipped CLI, so a
 * jobs.json written for the old tool stays valid input here.
 */
export function normalise(input = {}) {
  const [rw, rh] = RATIOS[input.ratio] || RATIOS[DEFAULTS.ratio];
  const w = num(input.w, rw);
  const h = num(input.h, rh);

  let forceHue = null;
  if (input.ground !== undefined && input.ground !== null && input.ground !== 'auto') {
    const named = HUES[input.ground];
    const parsed = named !== undefined ? named : Number(input.ground);
    if (Number.isFinite(parsed)) forceHue = parsed;
  }

  let layout = input.layout || null;
  if (!layout) {
    const hasWeb = !!input.hasWeb;
    const mobileCount = num(input.mobileCount, 0);
    layout = hasWeb && mobileCount > 0 ? 'web+mobile' : (hasWeb ? 'web' : 'mobile');
  }

  return {
    w, h, layout,
    fit: input.fit === 'cover' ? 'cover' : DEFAULTS.fit,
    pad: num(input.pad, DEFAULTS.pad),
    radius: num(input.radius, Math.round(w * RADIUS_RATIO)),
    grain: num(input.grain, DEFAULTS.grain),
    phoneScale: num(input.phoneScale, DEFAULTS.phoneScale),
    phoneBleed: num(input.phoneBleed, DEFAULTS.phoneBleed),
    insetX: input.insetX === undefined ? null : num(input.insetX, null),
    insetY: input.insetY === undefined ? null : num(input.insetY, null),
    caption: input.caption ? String(input.caption) : DEFAULTS.caption,
    forceHue,
    tone: input.tone === 'light' || input.tone === 'mid' ? input.tone : DEFAULTS.tone,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/config.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add core/presets.js core/config.js test/config.test.js
git commit -m "feat(core): add presets and config normalisation"
```

---

### Task 3: `core/ground.js` — port the colour analysis

The faithfulness test. Every threshold below is copied from `ground.py` and must not change.

**Files:**
- Create: `core/ground.js`, `test/ground.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `groundFor(samples, forceHue = null, mode = null) -> { ground: [string, string, string], lum: number, hue: number, chroma: number, darkUI: boolean }`
  - `samples` is an array of `{ width, height, data }` where `data` is an RGBA byte array (`Uint8ClampedArray` from `ImageData`, or a plain array). Already downscaled by the caller to fit 800×800.
  - `hue` is returned in **degrees**, rounded to 1 decimal. `lum` rounded to 3. `chroma` rounded to 3.

- [ ] **Step 1: Write the failing test**

`test/ground.test.js`. It decodes the samples with `@napi-rs/canvas`, downscales them the same way Pillow's `thumbnail` does, and compares against the goldens from Task 1.

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { groundFor } from '../core/ground.js';

const goldens = JSON.parse(readFileSync('test/golden/ground.json', 'utf8'));

// Mirrors PIL.Image.thumbnail((800, 800)): shrink to fit, never enlarge.
async function sample(path) {
  const img = await loadImage(path);
  const scale = Math.min(1, 800 / img.width, 800 / img.height);
  const w = Math.max(1, Math.floor(img.width * scale));
  const h = Math.max(1, Math.floor(img.height * scale));
  const cv = createCanvas(w, h);
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

describe('groundFor matches ground.py', () => {
  for (const name of Object.keys(goldens)) {
    it(name, async () => {
      const g = await groundFor([await sample('samples/' + name)]);
      const want = goldens[name];

      // Hue is circular: 359.5 and 0.5 are 1 degree apart.
      const d = Math.abs(g.hue - want.hue);
      expect(Math.min(d, 360 - d)).toBeLessThanOrEqual(1.5);

      expect(g.lum).toBeCloseTo(want.lum, 2);
      expect(g.chroma).toBeCloseTo(want.chroma, 2);
      expect(g.darkUI).toBe(want.darkUI);
    });
  }
});

describe('groundFor overrides', () => {
  it('honours a forced hue', async () => {
    const g = await groundFor([await sample('samples/fieldset.png')], 268);
    expect(g.hue).toBeCloseTo(268, 1);
  });

  it('tone "mid" forces the mid-tone ground', async () => {
    const g = await groundFor([await sample('samples/fieldset.png')], null, 'mid');
    expect(g.darkUI).toBe(true);
  });

  it('tone "light" forces the pale ground', async () => {
    const g = await groundFor([await sample('samples/fieldset.png')], null, 'light');
    expect(g.darkUI).toBe(false);
  });

  it('falls back to neutral on a blank image', async () => {
    const cv = createCanvas(64, 64);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 64, 64);
    const g = await groundFor([ctx.getImageData(0, 0, 64, 64)]);
    expect(g.chroma).toBe(0);
    expect(g.hue).toBeCloseTo(250, 0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/ground.test.js`
Expected: FAIL — cannot resolve `../core/ground.js`.

- [ ] **Step 3: Write `core/ground.js`**

Colour helpers are written inline. They are a dozen lines each and a colour library would break the zero-dependency rule.

```js
/**
 * ground.js - derive a background from the product screenshot itself.
 *
 * The ground is a tint of the product's own accent colour, and its lightness
 * is set so the UI SEPARATES from it. A light UI gets a pale tint. A dark UI
 * gets a MID-TONE tint, never a dark one - that is why dark-on-dark reads as
 * mush.
 *
 * Port of ground.py. Every threshold is unchanged.
 */

const BINS = 36;

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d !== 0) {
    if (mx === r)      h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else               h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return [h, mx === 0 ? 0 : d / mx, mx];
}

function hslToHex(h, s, l) {
  const f = n => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255);
  };
  const hex = n => f(n).toString(16).padStart(2, '0');
  return `#${hex(0)}${hex(8)}${hex(4)}`;
}

/**
 * Only FLAT pixels vote on hue: a button or a pill is one solid colour, a
 * photo is not. That keeps album art and product photography from hijacking
 * the brand colour.
 */
function analyse(samples) {
  const flat = [];   // flat pixels only, for hue
  const all = [];    // everything, for luminance
  let lumSum = 0, lumN = 0;

  for (const im of samples) {
    const { width: w, height: h, data } = im;
    const at = (x, y) => (y * w + x) * 4;

    for (let i = 0; i < w * h; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      all.push(r, g, b);
      lumSum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lumN++;
    }

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const c = at(x, y);
        const r = data[c], g = data[c + 1], b = data[c + 2];
        let isFlat = true;
        const nb = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
        for (const n of nb) {
          if (Math.abs(data[n] - r) + Math.abs(data[n + 1] - g) + Math.abs(data[n + 2] - b) > 18) {
            isFlat = false;
            break;
          }
        }
        if (isFlat) flat.push(r, g, b);
      }
    }
  }

  const lum = lumSum / (lumN * 255);

  const saturatedCount = pool => {
    let n = 0;
    for (let i = 0; i < pool.length; i += 3) {
      if (rgbToHsv(pool[i], pool[i + 1], pool[i + 2])[1] >= 0.22) n++;
    }
    return n;
  };

  // if the flat regions carry almost no colour, fall back to every pixel
  let px = flat;
  if (saturatedCount(flat) < 300) px = all;

  // Histogram of hue, weighted by saturation, then take the PEAK bin - not the
  // mean. A brand colour piles into one bin; photos and album art smear across
  // many, so the peak finds the accent instead of averaging it into mud.
  const hist = new Float64Array(BINS);
  let total = 0;
  for (let i = 0; i < px.length; i += 3) {
    const [h, s, v] = rgbToHsv(px[i], px[i + 1], px[i + 2]);
    if (s < 0.22 || v < 0.16 || v > 0.98) continue;
    const wgt = s * s;
    hist[Math.floor(h * BINS) % BINS] += wgt;
    total += wgt;
  }

  if (total < 1e-6) return { lum, hue: 250 / 360, chroma: 0 };  // neutral fallback

  let peak = 0, best = -Infinity;
  for (let i = 0; i < BINS; i++) {
    const score = hist[i] + 0.5 * (hist[(i - 1 + BINS) % BINS] + hist[(i + 1) % BINS]);
    if (score > best) { best = score; peak = i; }
  }

  // refine inside the winning bin with a local circular mean
  let sx = 0, sy = 0, wt = 0;
  for (let i = 0; i < px.length; i += 3) {
    const [h, s, v] = rgbToHsv(px[i], px[i + 1], px[i + 2]);
    if (s < 0.22 || v < 0.16 || v > 0.98) continue;
    const bin = Math.floor(h * BINS) % BINS;
    const raw = Math.abs(bin - peak);
    if (Math.min(raw, BINS - raw) > 1) continue;
    const wgt = s * s;
    sx += Math.cos(h * 2 * Math.PI) * wgt;
    sy += Math.sin(h * 2 * Math.PI) * wgt;
    wt += wgt;
  }
  let hue = wt ? (Math.atan2(sy, sx) / (2 * Math.PI)) : peak / BINS;
  hue = ((hue % 1) + 1) % 1;

  // how concentrated the accent is: share of weight in the winning bins
  const near = hist[(peak - 1 + BINS) % BINS] + hist[peak] + hist[(peak + 1) % BINS];
  const chroma = Math.min(1, (near / total) * 1.25);

  return { lum, hue, chroma };
}

export function groundFor(samples, forceHue = null, mode = null) {
  let { lum, hue, chroma } = analyse(samples);
  if (forceHue !== null && forceHue !== undefined) hue = forceHue / 360;

  let darkUI = lum < 0.34;
  if (mode === 'light') darkUI = false;
  if (mode === 'mid') darkUI = true;

  const sat = 0.16 + 0.26 * Math.min(chroma * 1.6, 1);   // never fully saturated

  const ground = darkUI
    // MID-TONE ground. This is what gives a dark UI its edge.
    ? [hslToHex(hue, sat * 0.42, 0.855),
       hslToHex(hue, sat * 0.40, 0.780),
       hslToHex(hue, sat * 0.44, 0.712)]
    // pale tint, brightest toward the top-left light source
    : [hslToHex(hue, sat * 0.55, 0.975),
       hslToHex(hue, sat * 0.62, 0.925),
       hslToHex(hue, sat * 0.66, 0.868)];

  return {
    ground,
    lum: Math.round(lum * 1000) / 1000,
    hue: Math.round(hue * 360 * 10) / 10,
    chroma: Math.round(chroma * 1000) / 1000,
    darkUI,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/ground.test.js`
Expected: PASS.

If hue is off by more than 1.5° on a sample, the cause is almost always **resampling**, not the algorithm: Pillow's `thumbnail` and canvas `drawImage` use different filters, so the downscaled pixels differ slightly. Before touching the maths, confirm by widening the tolerance to 5° — if it then passes on every sample, the port is faithful and the difference is resampling. Record the real tolerance in the test with a comment saying why. Do **not** silently loosen it without checking.

- [ ] **Step 5: Commit**

```bash
git add core/ground.js test/ground.test.js
git commit -m "feat(core): port ground.py colour analysis to JS"
```

---

### Task 4: `core/layout.js` — port the geometry

Pure numbers in, pure numbers out. No canvas, no images — it takes source aspect ratios, which is what makes the geometry testable.

**Files:**
- Create: `core/layout.js`, `test/layout.test.js`

**Interfaces:**
- Consumes: `normalise` output from Task 2, `PHONE_FALLBACK_RATIO` from `core/presets.js`.
- Produces: `layout(config, sources) -> { safe, web, phones, caption }`
  - `sources` is `{ web: number|null, mobile: number[] }` — aspect ratios (`width / height`), not pixels.
  - `safe` is `{ x, y, w, h }`.
  - `web` is `{ x, y, w, h, radius }` or `null`.
  - `phones` is an array of `{ x, y, w, h, radius, frame, innerRadius }` — `x`/`y` are the **top-left** corner.
  - `caption` is `{ x, y, fontSize }` or `null`. `y` is the **baseline-anchoring bottom** offset from the canvas top, i.e. already resolved from the CSS `bottom` value.

- [ ] **Step 1: Write the failing test**

`test/layout.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { normalise } from '../core/config.js';
import { layout } from '../core/layout.js';

const cfg = (o = {}) => normalise({ layout: 'web', ...o });

describe('safe box', () => {
  it('gives an identical margin on all four edges', () => {
    for (const ratio of ['3:2', '4:3', '16:9', '1:1']) {
      const c = cfg({ ratio });
      const { safe } = layout(c, { web: 1.6, mobile: [] });
      const left = safe.x;
      const top = safe.y;
      const right = c.w - (safe.x + safe.w);
      const bottom = c.h - (safe.y + safe.h);
      expect(left).toBeCloseTo(top, 6);
      expect(left).toBeCloseTo(right, 6);
      expect(left).toBeCloseTo(bottom, 6);
    }
  });

  it('measures padding against the shorter side', () => {
    const c = cfg({ ratio: '16:9', pad: 0.1 });   // 1920x1080, shorter = 1080
    const { safe } = layout(c, { web: 1.6, mobile: [] });
    expect(safe.x).toBeCloseTo(108, 6);
  });

  it('honours per-axis overrides when given', () => {
    const c = cfg({ ratio: '3:2', insetX: 0.10, insetY: 0.02 });
    const { safe } = layout(c, { web: 1.6, mobile: [] });
    expect(safe.x).toBeCloseTo(180, 6);
    expect(safe.y).toBeCloseTo(24, 6);
  });
});

describe('web screen', () => {
  it('contain never crops: keeps the source ratio inside the box', () => {
    const c = cfg({ ratio: '3:2' });
    const { safe, web } = layout(c, { web: 2.5, mobile: [] });   // wider than the box
    expect(web.w / web.h).toBeCloseTo(2.5, 6);
    expect(web.w).toBeLessThanOrEqual(safe.w + 1e-6);
    expect(web.h).toBeLessThanOrEqual(safe.h + 1e-6);
  });

  it('contain handles a source taller than the box', () => {
    const c = cfg({ ratio: '3:2' });
    const { safe, web } = layout(c, { web: 0.5, mobile: [] });
    expect(web.h).toBeCloseTo(safe.h, 6);
    expect(web.w / web.h).toBeCloseTo(0.5, 6);
  });

  it('centres the screen in the safe box', () => {
    const c = cfg({ ratio: '3:2' });
    const { safe, web } = layout(c, { web: 2.5, mobile: [] });
    expect(web.x + web.w / 2).toBeCloseTo(safe.x + safe.w / 2, 6);
    expect(web.y + web.h / 2).toBeCloseTo(safe.y + safe.h / 2, 6);
  });

  it('cover fills the whole safe box', () => {
    const c = cfg({ ratio: '3:2', fit: 'cover' });
    const { safe, web } = layout(c, { web: 2.5, mobile: [] });
    expect(web.w).toBeCloseTo(safe.w, 6);
    expect(web.h).toBeCloseTo(safe.h, 6);
  });
});

describe('mobile layout', () => {
  it('never squashes the phone', () => {
    const c = normalise({ layout: 'mobile', ratio: '3:2' });
    const { phones } = layout(c, { web: null, mobile: [0.5] });
    expect(phones[0].w / phones[0].h).toBeCloseTo(0.5, 6);
  });

  it('caps at three phones', () => {
    const c = normalise({ layout: 'mobile', ratio: '3:2' });
    const { phones } = layout(c, { web: null, mobile: [0.462, 0.462, 0.462, 0.462] });
    expect(phones).toHaveLength(3);
  });

  it('uses a bigger phone when there is only one', () => {
    const c = normalise({ layout: 'mobile', ratio: '3:2' });
    const one = layout(c, { web: null, mobile: [0.462] }).phones[0];
    const two = layout(c, { web: null, mobile: [0.462, 0.462] }).phones[0];
    expect(one.h).toBeCloseTo(1200 * 0.86, 6);
    expect(two.h).toBeCloseTo(1200 * 0.80, 6);
  });

  it('lifts the middle phone highest when there are three', () => {
    const c = normalise({ layout: 'mobile', ratio: '3:2' });
    const { phones } = layout(c, { web: null, mobile: [0.462, 0.462, 0.462] });
    expect(phones[1].y).toBeLessThan(phones[0].y);
    expect(phones[1].y).toBeLessThan(phones[2].y);
  });

  it('falls back to a sane ratio when the source ratio is missing', () => {
    const c = normalise({ layout: 'mobile', ratio: '3:2' });
    const { phones } = layout(c, { web: null, mobile: [null] });
    expect(phones[0].w / phones[0].h).toBeCloseTo(0.462, 6);
  });
});

describe('web+mobile layout', () => {
  it('draws both, with the phone bleeding past the bottom edge', () => {
    const c = normalise({ layout: 'web+mobile', ratio: '3:2' });
    const { web, phones } = layout(c, { web: 1.6, mobile: [0.462] });
    expect(web).not.toBeNull();
    expect(phones).toHaveLength(1);
    expect(phones[0].y + phones[0].h).toBeGreaterThan(1200);
  });

  it('drops to web-only when no phone image is present', () => {
    const c = normalise({ layout: 'web+mobile', ratio: '3:2' });
    const { web, phones } = layout(c, { web: 1.6, mobile: [] });
    expect(web).not.toBeNull();
    expect(phones).toHaveLength(0);
  });
});

describe('caption', () => {
  it('sits at the left margin, above the bottom edge', () => {
    const c = cfg({ caption: 'hello' });
    const { safe, caption } = layout(c, { web: 1.6, mobile: [] });
    expect(caption.x).toBeCloseTo(safe.x, 6);
    expect(caption.y).toBeCloseTo(1200 - 1200 * 0.035, 6);
    expect(caption.fontSize).toBe(Math.round(1200 * 0.021));
  });

  it('is null when no caption is set', () => {
    expect(layout(cfg(), { web: 1.6, mobile: [] }).caption).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/layout.test.js`
Expected: FAIL — cannot resolve `../core/layout.js`.

- [ ] **Step 3: Write `core/layout.js`**

```js
import { PHONE_FALLBACK_RATIO } from './presets.js';

/**
 * Everything here is proportional to the canvas. Padding, radius, shadow
 * offset and blur are all fractions, never fixed pixels. That is what makes a
 * row of shots at 3:2, 4:3, 16:9 and 1:1 look like one person made them.
 */

function safeBox(c) {
  // ONE padding number, in units of the shorter canvas side, so the margin is
  // the same on every edge. Two separate percentages (5% of width, 9% of
  // height) silently produced very different gaps and the UI floated.
  if (c.insetX !== null || c.insetY !== null) {
    const ix = c.insetX ?? 0.052;
    const iy = c.insetY ?? 0.052;
    return { x: c.w * ix, y: c.h * iy, w: c.w * (1 - ix * 2), h: c.h * (1 - iy * 2) };
  }
  const pad = c.pad * Math.min(c.w, c.h);
  return { x: pad, y: pad, w: c.w - pad * 2, h: c.h - pad * 2 };
}

function webBox(c, box, ratio) {
  // In "contain" the screen takes the image's own ratio so NOTHING is ever
  // cropped. "cover" fills the box and accepts the crop.
  let w = box.w, h = box.h;
  if (c.fit === 'contain') {
    if (ratio > box.w / box.h) { w = box.w; h = box.w / ratio; }
    else                       { h = box.h; w = box.h * ratio; }
  }
  return {
    x: box.x + (box.w - w) / 2,
    y: box.y + (box.h - h) / 2,
    w, h,
    radius: c.radius,
  };
}

function phoneBox(ratio, h, cx, cy) {
  // phone width follows the source ratio, so the screenshot is never squashed
  const w = h * (ratio || PHONE_FALLBACK_RATIO);
  const frame = Math.max(3, w * 0.019);   // bezel thickness
  const radius = w * 0.125;               // phone corner radius
  return { x: cx - w / 2, y: cy - h / 2, w, h, frame, radius, innerRadius: radius - frame };
}

export function layout(c, sources) {
  const safe = webBox.length && safeBox(c);
  const mobile = (sources.mobile || []).slice(0, 3);
  const out = { safe, web: null, phones: [], caption: null };

  if (c.layout === 'web' && sources.web) {
    out.web = webBox(c, safe, sources.web);
  }

  else if (c.layout === 'mobile' && mobile.length) {
    // 1-3 phones, staggered. Middle one sits highest.
    const n = mobile.length;
    const ph = c.h * (n === 1 ? 0.86 : 0.80);
    const pw = ph * (mobile[0] || PHONE_FALLBACK_RATIO);
    const step = pw * 0.86;               // slight overlap
    const total = step * (n - 1);
    for (let i = 0; i < n; i++) {
      const cx = c.w / 2 - total / 2 + i * step;
      const lift = n === 2
        ? (i === 0 ? c.h * 0.030 : -c.h * 0.030)
        : (i === 1 ? -c.h * 0.035 : c.h * 0.028);
      out.phones.push(phoneBox(mobile[i], ph, cx, c.h / 2 + lift));
    }
  }

  else if (c.layout === 'web+mobile' && sources.web) {
    out.web = webBox(c, safe, sources.web);
    if (mobile.length) {
      // The phone rises out of the bottom-right corner. Letting it bleed past
      // the bottom edge reads as deliberate layering and buries less of the
      // app than a phone parked in the middle of the right-hand side.
      const ph = c.h * c.phoneScale;
      const pw = ph * (mobile[0] || PHONE_FALLBACK_RATIO);
      const cx = safe.x + safe.w - pw * 0.46;
      const cy = c.h / 2 + c.h * c.phoneBleed;
      out.phones.push(phoneBox(mobile[0], ph, cx, cy));
    }
  }

  if (c.caption) {
    out.caption = {
      x: safe.x,
      y: c.h - c.h * 0.035,
      fontSize: Math.round(c.h * 0.021),
    };
  }

  return out;
}
```

- [ ] **Step 4: Fix the scaffolding slip**

`const safe = webBox.length && safeBox(c);` is nonsense left over from drafting. Replace that line with:

```js
  const safe = safeBox(c);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/layout.test.js`
Expected: PASS, 15 tests.

- [ ] **Step 6: Commit**

```bash
git add core/layout.js test/layout.test.js
git commit -m "feat(core): port frame.html geometry to a pure layout module"
```

---

### Task 5: `core/render.js` — ground and grain

First half of the painter: the background and the noise overlay. Split from the screen and phone so each half gets its own visual check.

**Files:**
- Create: `core/render.js`, `test/render-ground.test.js`

**Interfaces:**
- Consumes: `layout()` output from Task 4, `groundFor()` output from Task 3.
- Produces:
  - `paintGround(ctx, c, stops)` — `stops` is the 3-hex array.
  - `paintGrain(ctx, c)` — uses `c.grain` as alpha; no-op when `c.grain <= 0`.
  - `noiseTile(size)` — returns an `ImageData`-shaped `{ width, height, data }` of deterministic greyscale noise.

- [ ] **Step 1: Write the failing test**

`test/render-ground.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { normalise } from '../core/config.js';
import { paintGround, paintGrain, noiseTile } from '../core/render.js';

function px(ctx, x, y) {
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2]];
}

describe('paintGround', () => {
  it('fills every pixel', () => {
    const c = normalise({ ratio: '3:2' });
    const cv = createCanvas(c.w, c.h);
    const ctx = cv.getContext('2d');
    paintGround(ctx, c, ['#f7f4ff', '#ece6fb', '#ded3f5']);
    for (const [x, y] of [[0, 0], [c.w - 1, 0], [0, c.h - 1], [c.w - 1, c.h - 1], [900, 600]]) {
      expect(ctx.getImageData(x, y, 1, 1).data[3]).toBe(255);
    }
  });

  it('is lighter at the top-left than the bottom-right', () => {
    const c = normalise({ ratio: '3:2' });
    const cv = createCanvas(c.w, c.h);
    const ctx = cv.getContext('2d');
    paintGround(ctx, c, ['#f7f4ff', '#ece6fb', '#ded3f5']);
    const tl = px(ctx, 40, 40).reduce((a, b) => a + b, 0);
    const br = px(ctx, c.w - 40, c.h - 40).reduce((a, b) => a + b, 0);
    expect(tl).toBeGreaterThan(br);
  });
});

describe('noiseTile', () => {
  it('is deterministic', () => {
    const a = noiseTile(240), b = noiseTile(240);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it('is greyscale and opaque', () => {
    const t = noiseTile(64);
    for (let i = 0; i < t.data.length; i += 4) {
      expect(t.data[i]).toBe(t.data[i + 1]);
      expect(t.data[i + 1]).toBe(t.data[i + 2]);
      expect(t.data[i + 3]).toBe(255);
    }
  });

  it('actually varies', () => {
    const t = noiseTile(64);
    const vals = new Set();
    for (let i = 0; i < t.data.length; i += 4) vals.add(t.data[i]);
    expect(vals.size).toBeGreaterThan(20);
  });
});

describe('paintGrain', () => {
  it('changes the canvas when grain is on', () => {
    const c = normalise({ ratio: '1:1', grain: 0.34 });
    const cv = createCanvas(c.w, c.h);
    const ctx = cv.getContext('2d');
    paintGround(ctx, c, ['#f7f4ff', '#ece6fb', '#ded3f5']);
    const before = Array.from(ctx.getImageData(0, 0, 200, 200).data);
    paintGrain(ctx, c);
    const after = Array.from(ctx.getImageData(0, 0, 200, 200).data);
    expect(after).not.toEqual(before);
  });

  it('is a no-op when grain is 0', () => {
    const c = normalise({ ratio: '1:1', grain: 0 });
    const cv = createCanvas(c.w, c.h);
    const ctx = cv.getContext('2d');
    paintGround(ctx, c, ['#f7f4ff', '#ece6fb', '#ded3f5']);
    const before = Array.from(ctx.getImageData(0, 0, 200, 200).data);
    paintGrain(ctx, c);
    expect(Array.from(ctx.getImageData(0, 0, 200, 200).data)).toEqual(before);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/render-ground.test.js`
Expected: FAIL — cannot resolve `../core/render.js`.

- [ ] **Step 3: Write the ground and grain half of `core/render.js`**

The original CSS stacked two radial gradients over a 166° linear gradient. Canvas radial gradients are circular, not elliptical, so each one is drawn through a save / scale / restore to stretch it.

```js
/**
 * render.js - paint a layout onto a canvas 2D context.
 *
 * Handed a target context; never creates one. That keeps core/ free of DOM
 * types and lets Node reuse this file through @napi-rs/canvas.
 */

const SHADOW_RGB = '12,14,20';

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/**
 * An elliptical radial gradient, faded to transparent at `stop`.
 * CSS: radial-gradient(<rx>% <ry>% at <cx>% <cy>%, colour 0%, transparent stop%)
 */
function radial(ctx, c, hex, cxPct, cyPct, rxPct, ryPct, stopPct) {
  const cx = c.w * cxPct, cy = c.h * cyPct;
  const rx = c.w * rxPct, ry = c.h * ryPct;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, rgba(hex, 1));
  g.addColorStop(Math.min(1, stopPct), rgba(hex, 0));
  g.addColorStop(1, rgba(hex, 0));
  ctx.fillStyle = g;
  // generous rect: the scaled space is taller/shorter than the canvas
  ctx.fillRect(-c.w * 2, -c.h * 2, c.w * 4, c.h * 4);
  ctx.restore();
}

/**
 * The ground: a 166deg linear gradient through the three stops, with a
 * top-left highlight and a bottom-right deepening laid over it.
 * Ported from frame.html's `body` background.
 */
export function paintGround(ctx, c, stops) {
  const [g1, g2, g3] = stops;

  // linear-gradient(166deg, g1 0%, g2 52%, g3 100%)
  // CSS 0deg points up and angles run clockwise.
  const rad = (166 - 90) * Math.PI / 180;
  const len = Math.abs(c.w * Math.cos(rad)) + Math.abs(c.h * Math.sin(rad));
  const dx = Math.cos(rad) * len / 2, dy = Math.sin(rad) * len / 2;
  const lin = ctx.createLinearGradient(c.w / 2 - dx, c.h / 2 - dy, c.w / 2 + dx, c.h / 2 + dy);
  lin.addColorStop(0, g1);
  lin.addColorStop(0.52, g2);
  lin.addColorStop(1, g3);
  ctx.fillStyle = lin;
  ctx.fillRect(0, 0, c.w, c.h);

  // radial-gradient(115% 85% at 22% 6%,  g1 0%, transparent 58%)
  radial(ctx, c, g1, 0.22, 0.06, 1.15, 0.85, 0.58);
  // radial-gradient(105% 90% at 88% 97%, g3 0%, transparent 62%)
  radial(ctx, c, g3, 0.88, 0.97, 1.05, 0.90, 0.62);
}

/**
 * Deterministic fractal value noise. The original used an SVG feTurbulence
 * filter, which cannot be reproduced exactly on a canvas, so this is a
 * fixed-seed approximation with the same character: 3 octaves, fine grain.
 *
 * Fixed seed matters twice - the pixel-diff tests need it, and the user needs
 * the export to match the preview byte for byte.
 */
export function noiseTile(size = 240) {
  // mulberry32: tiny, seeded, no dependency
  let s = 0x9e3779b9;
  const rnd = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const grid = n => {
    const g = new Float64Array(n * n);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    return g;
  };

  // three octaves, wrapping so the tile is seamless
  const octaves = [
    { n: size / 2 | 0, amp: 0.5 },
    { n: size / 4 | 0, amp: 0.3 },
    { n: size / 8 | 0, amp: 0.2 },
  ].map(o => ({ ...o, g: grid(o.n) }));

  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const { n, amp, g } of octaves) {
        const gx = Math.floor(x * n / size) % n;
        const gy = Math.floor(y * n / size) % n;
        v += g[gy * n + gx] * amp;
      }
      const b = Math.round(v * 255);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

let tileCache = null;

/**
 * Fine grain, tiled at 240px. Keeps big flat gradients from banding.
 * soft-light, matching the original mix-blend-mode.
 */
export function paintGrain(ctx, c) {
  if (!c.grain || c.grain <= 0) return;

  if (!tileCache) {
    const t = noiseTile(240);
    const id = ctx.createImageData(240, 240);
    id.data.set(t.data);
    tileCache = id;
  }

  // Stamp the tile into a scratch canvas so it can be used as a pattern.
  const scratch = ctx.canvas.constructor === undefined
    ? null
    : null;

  ctx.save();
  ctx.globalAlpha = c.grain;
  ctx.globalCompositeOperation = 'soft-light';
  for (let y = 0; y < c.h; y += 240) {
    for (let x = 0; x < c.w; x += 240) {
      ctx.putImageData(tileCache, x, y);
    }
  }
  ctx.restore();
}
```

- [ ] **Step 4: Fix the two drafting slips in `paintGrain`**

Two problems in the code above, both real:

1. The `scratch` variable is dead code left from drafting. Delete those three lines.
2. `putImageData` **ignores** `globalAlpha` and `globalCompositeOperation`, so the grain would land at full strength and overwrite the ground. It must go through `drawImage` with a pattern instead.

Replace the whole `paintGrain` body, and the `tileCache` line above it, with:

```js
let tileCanvasCache = null;

/**
 * Fine grain, tiled at 240px. Keeps big flat gradients from banding.
 * soft-light, matching the original mix-blend-mode.
 *
 * Goes through a pattern, not putImageData: putImageData ignores globalAlpha
 * and globalCompositeOperation, so it would overwrite the ground at full
 * strength instead of blending into it.
 */
export function paintGrain(ctx, c, makeCanvas) {
  if (!c.grain || c.grain <= 0) return;

  if (!tileCanvasCache) {
    const t = noiseTile(240);
    const tc = makeCanvas(240, 240);
    const tctx = tc.getContext('2d');
    const id = tctx.createImageData(240, 240);
    id.data.set(t.data);
    tctx.putImageData(id, 0, 0);
    tileCanvasCache = tc;
  }

  ctx.save();
  ctx.globalAlpha = c.grain;
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = ctx.createPattern(tileCanvasCache, 'repeat');
  ctx.fillRect(0, 0, c.w, c.h);
  ctx.restore();
}
```

`makeCanvas(w, h)` is a factory the caller supplies. `core/` still never creates a canvas itself — this keeps the zero-DOM rule intact. Update the test's `paintGrain` calls to pass `(w, h) => createCanvas(w, h)`, and record the signature here:

- `paintGrain(ctx, c, makeCanvas)` where `makeCanvas: (w, h) => CanvasLike`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/render-ground.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 6: Eyeball the ground against the original**

Open `frame.html` in a browser with a hand-built config and compare it to a canvas render at the same stops. The gradient geometry is the part most likely to drift, because CSS radial gradients size by the `farthest-corner` rule and canvas has no equivalent.

```bash
node -e "
import('@napi-rs/canvas').then(async ({createCanvas}) => {
  const {normalise} = await import('./core/config.js');
  const {paintGround, paintGrain} = await import('./core/render.js');
  const c = normalise({ratio:'3:2'});
  const cv = createCanvas(c.w, c.h);
  const ctx = cv.getContext('2d');
  paintGround(ctx, c, ['#f7f4ff','#ece6fb','#ded3f5']);
  paintGrain(ctx, c, (w,h) => createCanvas(w,h));
  require('fs').writeFileSync('out/ground-check.png', cv.toBuffer('image/png'));
});
"
```

If the highlight sits noticeably off from the original, adjust the `rxPct`/`ryPct` multipliers in the two `radial()` calls and note the tuned values in a comment. This is expected work, not a failure.

- [ ] **Step 7: Commit**

```bash
git add core/render.js test/render-ground.test.js
git commit -m "feat(core): paint the ground gradient and deterministic grain"
```

---

### Task 6: `core/render.js` — the web screen and its shadow

**Files:**
- Modify: `core/render.js`
- Create: `test/render-screen.test.js`

**Interfaces:**
- Consumes: `layout()` output, `paintGround` from Task 5.
- Produces:
  - `roundRect(ctx, x, y, w, h, r)` — path helper.
  - `paintShadow(ctx, box, spreadY, blur, a1, a2)` — the two-pass shadow.
  - `paintWeb(ctx, c, box, image)` — screen body, image, hairline.

- [ ] **Step 1: Write the failing test**

`test/render-screen.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { normalise } from '../core/config.js';
import { layout } from '../core/layout.js';
import { paintGround, paintWeb } from '../core/render.js';

function px(ctx, x, y) {
  const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
  return [d[0], d[1], d[2]];
}

async function scene(overrides = {}) {
  const img = await loadImage('samples/fieldset.png');
  const c = normalise({ layout: 'web', ratio: '3:2', ...overrides });
  const lay = layout(c, { web: img.width / img.height, mobile: [] });
  const cv = createCanvas(c.w, c.h);
  const ctx = cv.getContext('2d');
  paintGround(ctx, c, ['#f7f4ff', '#ece6fb', '#ded3f5']);
  paintWeb(ctx, c, lay.web, img);
  return { c, lay, ctx, img };
}

describe('paintWeb', () => {
  it('paints inside the screen box', async () => {
    const { lay, ctx } = await scene();
    const before = px(ctx, 10, 10);              // ground, untouched
    const inside = px(ctx, lay.web.x + lay.web.w / 2, lay.web.y + lay.web.h / 2);
    expect(inside).not.toEqual(before);
  });

  it('leaves the corners rounded, not square', async () => {
    const { lay, ctx } = await scene();
    // 2px inside the bounding-box corner is outside a 24px radius
    const corner = px(ctx, lay.web.x + 2, lay.web.y + 2);
    const centre = px(ctx, lay.web.x + lay.web.w / 2, lay.web.y + 20);
    expect(corner).not.toEqual(centre);
  });

  it('darkens the ground below the screen with a shadow', async () => {
    const { c, lay, ctx } = await scene();
    const cv2 = createCanvas(c.w, c.h);
    const ctx2 = cv2.getContext('2d');
    paintGround(ctx2, c, ['#f7f4ff', '#ece6fb', '#ded3f5']);

    const y = Math.min(c.h - 2, lay.web.y + lay.web.h + 12);
    const x = lay.web.x + lay.web.w / 2;
    const sum = a => a.reduce((p, q) => p + q, 0);
    expect(sum(px(ctx, x, y))).toBeLessThan(sum(px(ctx2, x, y)));
  });

  it('is deterministic', async () => {
    const a = await scene();
    const b = await scene();
    const ga = Array.from(a.ctx.getImageData(0, 0, 400, 400).data);
    const gb = Array.from(b.ctx.getImageData(0, 0, 400, 400).data);
    expect(ga).toEqual(gb);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/render-screen.test.js`
Expected: FAIL — `paintWeb` is not exported.

- [ ] **Step 3: Add the screen painter to `core/render.js`**

Append:

```js
export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y,     x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x,     y + h, rr);
  ctx.arcTo(x,     y + h, x,     y,     rr);
  ctx.arcTo(x,     y,     x + w, y,     rr);
  ctx.closePath();
}

/**
 * The original CSS stacked two shadows on every element: a wide ambient one
 * and a tight contact one. Canvas takes a single shadow per draw, so this is
 * two passes over the same rounded rect.
 *
 * CSS blur-radius and canvas shadowBlur both resolve to sigma = value / 2,
 * so the numbers carry over directly. Verify by eye anyway - the kernels are
 * not guaranteed identical across engines.
 */
export function paintShadow(ctx, box, spreadY, blur, a1, a2) {
  for (const [dy, b, a] of [[spreadY, blur, a1], [spreadY * 0.28, blur * 0.3, a2]]) {
    ctx.save();
    ctx.shadowColor = `rgba(${SHADOW_RGB},${a})`;
    ctx.shadowBlur = b;
    ctx.shadowOffsetY = dy;
    ctx.fillStyle = '#000';
    roundRect(ctx, box.x, box.y, box.w, box.h, box.radius);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Draw `image` into `box` with object-fit and object-position: top center.
 * Assumes the path is already clipped by the caller.
 */
function drawFitted(ctx, box, image, fit) {
  const ir = image.width / image.height;
  const br = box.w / box.h;
  let dw, dh;
  if (fit === 'cover' ? ir > br : ir < br) { dh = box.h; dw = box.h * ir; }
  else                                     { dw = box.w; dh = box.w / ir; }
  ctx.drawImage(image, box.x + (box.w - dw) / 2, box.y, dw, dh);   // top center
}

export function paintWeb(ctx, c, box, image) {
  // shadow first, on an opaque rect, then the screen over it
  paintShadow(ctx, box, c.h * 0.040, c.h * 0.105, 0.17, 0.07);

  ctx.save();
  roundRect(ctx, box.x, box.y, box.w, box.h, box.radius);
  ctx.clip();
  ctx.fillStyle = '#ffffff';                       // --screen-bg
  ctx.fillRect(box.x, box.y, box.w, box.h);
  drawFitted(ctx, box, image, c.fit);
  ctx.restore();

  // inset 0 0 0 1px hairline
  ctx.save();
  ctx.strokeStyle = 'rgba(16,18,27,0.07)';         // --hairline
  ctx.lineWidth = 1;
  roundRect(ctx, box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1, box.radius);
  ctx.stroke();
  ctx.restore();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/render-screen.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Compare the shadow against the original by eye**

This is the one part of the port that arithmetic cannot prove. Render `samples/fieldset.png` through the new path and through the old `frame.html`, and put them side by side.

```bash
mkdir -p out
node -e "
import('@napi-rs/canvas').then(async ({createCanvas, loadImage}) => {
  const fs = await import('node:fs');
  const {normalise} = await import('./core/config.js');
  const {layout} = await import('./core/layout.js');
  const {paintGround, paintWeb, paintGrain} = await import('./core/render.js');
  const {groundFor} = await import('./core/ground.js');
  const img = await loadImage('samples/fieldset.png');
  const c = normalise({layout:'web', ratio:'3:2'});
  const s = createCanvas(800, Math.round(800*img.height/img.width));
  s.getContext('2d').drawImage(img, 0, 0, s.width, s.height);
  const g = groundFor([s.getContext('2d').getImageData(0,0,s.width,s.height)]);
  const lay = layout(c, {web: img.width/img.height, mobile: []});
  const cv = createCanvas(c.w, c.h);
  const ctx = cv.getContext('2d');
  paintGround(ctx, c, g.ground);
  paintWeb(ctx, c, lay.web, img);
  paintGrain(ctx, c, (w,h) => createCanvas(w,h));
  fs.writeFileSync('out/fieldset-new.png', cv.toBuffer('image/png'));
  console.log('wrote out/fieldset-new.png  hue', g.hue, 'darkUI', g.darkUI);
});
"
```

If the shadow reads heavier or lighter than the original, tune the two alpha values in `paintWeb` and leave a comment recording the original CSS values (`0.17` / `0.07`) next to the tuned ones. Do not change `spreadY` or `blur` — those are proportional and correct.

- [ ] **Step 6: Commit**

```bash
git add core/render.js test/render-screen.test.js
git commit -m "feat(core): paint the web screen with its two-pass shadow"
```

---

### Task 7: `core/render.js` — the phone, the caption, and `compose()`

Completes the painter and wires the whole pipeline into one entry point.

**Files:**
- Modify: `core/render.js`
- Create: `core/index.js`, `test/compose.test.js`
- Create: `test/golden/render/` (reference PNGs)

**Interfaces:**
- Consumes: everything from Tasks 2–6.
- Produces:
  - `paintPhone(ctx, c, box, image)`
  - `paintCaption(ctx, c, cap, text)`
  - `compose(target, config, images, makeCanvas) -> target`, where `images` is `{ web: ImageLike|null, mobile: ImageLike[] }` and `ImageLike` exposes `width`, `height`, and is accepted by `ctx.drawImage`. `config` is **raw** input; `compose` calls `normalise` itself.
  - `compose` also returns colour info on the target-independent path via `composeWithMeta(target, config, images, makeCanvas) -> { target, meta }` where `meta` is the `groundFor` result. The web app needs `meta` to tint its chrome.

- [ ] **Step 1: Write the failing test**

`test/compose.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { composeWithMeta } from '../core/index.js';

const mk = (w, h) => createCanvas(w, h);

async function run(config, files) {
  const web = files.web ? await loadImage(files.web) : null;
  const mobile = [];
  for (const m of files.mobile || []) mobile.push(await loadImage(m));
  const first = createCanvas(10, 10);
  const { target, meta } = composeWithMeta(first, config, { web, mobile }, mk);
  return { target, meta };
}

describe('composeWithMeta', () => {
  it('sizes the target from the ratio', async () => {
    const { target } = await run({ ratio: '4:3' }, { web: 'samples/fieldset.png' });
    expect(target.width).toBe(2000);
    expect(target.height).toBe(1500);
  });

  it('returns the ground meta for chrome tinting', async () => {
    const { meta } = await run({ ratio: '3:2' }, { web: 'samples/fieldset.png' });
    expect(meta.ground).toHaveLength(3);
    expect(meta.ground[0]).toMatch(/^#[0-9a-f]{6}$/);
    expect(typeof meta.hue).toBe('number');
    expect(typeof meta.darkUI).toBe('boolean');
  });

  it('renders the mobile layout', async () => {
    const { target } = await run(
      { layout: 'mobile', ratio: '3:2' },
      { mobile: ['samples/karaoke-mobile.png', 'samples/karaoke-mobile-2.png'] },
    );
    expect(target.width).toBe(1800);
    const ctx = target.getContext('2d');
    expect(ctx.getImageData(900, 600, 1, 1).data[3]).toBe(255);
  });

  it('renders web+mobile', async () => {
    const { target } = await run(
      { layout: 'web+mobile', ratio: '3:2' },
      { web: 'samples/karaoke-web.png', mobile: ['samples/karaoke-mobile.png'] },
    );
    expect(target.width).toBe(1800);
  });

  it('is byte-identical across two runs', async () => {
    const a = await run({ ratio: '3:2' }, { web: 'samples/fieldset.png' });
    const b = await run({ ratio: '3:2' }, { web: 'samples/fieldset.png' });
    expect(Buffer.compare(a.target.toBuffer('image/png'), b.target.toBuffer('image/png'))).toBe(0);
  });

  it('draws a caption without throwing', async () => {
    const { target } = await run(
      { ratio: '3:2', caption: 'Fieldset — 2026' },
      { web: 'samples/fieldset.png' },
    );
    expect(target.width).toBe(1800);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/compose.test.js`
Expected: FAIL — cannot resolve `../core/index.js`.

- [ ] **Step 3: Add the phone and caption painters to `core/render.js`**

Append:

```js
export function paintPhone(ctx, c, box, image) {
  paintShadow(ctx, box, box.h * 0.055, box.h * 0.14, 0.22, 0.10);

  // body
  ctx.save();
  roundRect(ctx, box.x, box.y, box.w, box.h, box.radius);
  ctx.clip();
  ctx.fillStyle = '#111318';                       // --phone-frame
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.restore();

  // screen, inset by the bezel. Always cover, anchored top center.
  const inner = {
    x: box.x + box.frame,
    y: box.y + box.frame,
    w: box.w - box.frame * 2,
    h: box.h - box.frame * 2,
  };
  ctx.save();
  roundRect(ctx, inner.x, inner.y, inner.w, inner.h, box.innerRadius);
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
  drawFitted(ctx, inner, image, 'cover');
  ctx.restore();

  // inset 0 0 0 1px rgba(255,255,255,0.10)
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  roundRect(ctx, box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1, box.radius);
  ctx.stroke();
  ctx.restore();
}

export function paintCaption(ctx, c, cap, text) {
  ctx.save();
  ctx.font = `${cap.fontSize}px Inter, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#101218';                       // --ink
  ctx.fillText(text, cap.x, cap.y);
  ctx.restore();
}
```

- [ ] **Step 4: Write `core/index.js`**

```js
import { normalise } from './config.js';
import { layout } from './layout.js';
import { groundFor } from './ground.js';
import { paintGround, paintGrain, paintWeb, paintPhone, paintCaption } from './render.js';

// Sample at 800px, matching ground.py's thumbnail step. Rendering still uses
// the full-resolution source.
function sampleOf(image, makeCanvas) {
  const scale = Math.min(1, 800 / image.width, 800 / image.height);
  const w = Math.max(1, Math.floor(image.width * scale));
  const h = Math.max(1, Math.floor(image.height * scale));
  const cv = makeCanvas(w, h);
  const ctx = cv.getContext('2d');
  ctx.drawImage(image, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/**
 * Paint a full shot into `target`, and return the colour analysis alongside it.
 * `target` is anything with width, height, and getContext('2d').
 * `makeCanvas(w, h)` supplies scratch canvases; core never creates one itself.
 */
export function composeWithMeta(target, rawConfig, images, makeCanvas) {
  const web = images.web || null;
  const mobile = (images.mobile || []).filter(Boolean).slice(0, 3);

  const c = normalise({ ...rawConfig, hasWeb: !!web, mobileCount: mobile.length });

  const samples = [web, ...mobile].filter(Boolean).map(im => sampleOf(im, makeCanvas));
  const meta = samples.length
    ? groundFor(samples, c.forceHue, c.tone)
    : groundFor([{ width: 1, height: 1, data: [128, 128, 128, 255] }], c.forceHue, c.tone);

  const lay = layout(c, {
    web: web ? web.width / web.height : null,
    mobile: mobile.map(m => m.width / m.height),
  });

  target.width = c.w;
  target.height = c.h;
  const ctx = target.getContext('2d');
  ctx.clearRect(0, 0, c.w, c.h);

  paintGround(ctx, c, meta.ground);
  if (lay.web && web) paintWeb(ctx, c, lay.web, web);
  lay.phones.forEach((box, i) => paintPhone(ctx, c, box, mobile[i] || mobile[0]));
  paintGrain(ctx, c, makeCanvas);
  if (lay.caption) paintCaption(ctx, c, lay.caption, c.caption);

  return { target, meta, config: c, layout: lay };
}

export function compose(target, rawConfig, images, makeCanvas) {
  return composeWithMeta(target, rawConfig, images, makeCanvas).target;
}

export { normalise, layout, groundFor };
export { RATIOS, HUES, DEFAULTS } from './presets.js';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/compose.test.js`
Expected: PASS, 6 tests.

Note: the grain is painted **before** the caption, matching the original where `.grain` sits at `z-index: 9` and `.caption` at `z-index: 10`.

- [ ] **Step 6: Freeze the reference renders**

Only after Task 6's eyeball check is satisfied. These become the pixel-diff baseline.

```bash
mkdir -p test/golden/render
node scripts/make-render-goldens.js
```

Create `scripts/make-render-goldens.js`:

```js
import { writeFileSync, mkdirSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { composeWithMeta } from '../core/index.js';

const mk = (w, h) => createCanvas(w, h);
mkdirSync('test/golden/render', { recursive: true });

const CASES = [
  ['web',        { ratio: '3:2' },                     { web: 'samples/fieldset.png', mobile: [] }],
  ['mobile',     { layout: 'mobile', ratio: '3:2' },   { web: null, mobile: ['samples/karaoke-mobile.png', 'samples/karaoke-mobile-2.png'] }],
  ['web-mobile', { layout: 'web+mobile', ratio: '3:2' }, { web: 'samples/karaoke-web.png', mobile: ['samples/karaoke-mobile.png'] }],
];

for (const [name, cfg, files] of CASES) {
  const web = files.web ? await loadImage(files.web) : null;
  const mobile = [];
  for (const m of files.mobile) mobile.push(await loadImage(m));
  const { target } = composeWithMeta(createCanvas(10, 10), cfg, { web, mobile }, mk);
  writeFileSync(`test/golden/render/${name}.png`, target.toBuffer('image/png'));
  console.log('wrote', name);
}
```

- [ ] **Step 7: Add the pixel-diff test**

Append to `test/compose.test.js`:

```js
import pixelmatch from 'pixelmatch';
import { existsSync } from 'node:fs';

describe('pixel-diff against frozen renders', () => {
  const CASES = [
    ['web',        { ratio: '3:2' },                       { web: 'samples/fieldset.png' }],
    ['mobile',     { layout: 'mobile', ratio: '3:2' },     { mobile: ['samples/karaoke-mobile.png', 'samples/karaoke-mobile-2.png'] }],
    ['web-mobile', { layout: 'web+mobile', ratio: '3:2' }, { web: 'samples/karaoke-web.png', mobile: ['samples/karaoke-mobile.png'] }],
  ];

  for (const [name, cfg, files] of CASES) {
    it(name, async () => {
      const path = `test/golden/render/${name}.png`;
      expect(existsSync(path), `missing ${path} - run scripts/make-render-goldens.js`).toBe(true);

      const { target } = await run(cfg, files);
      const ref = await loadImage(path);
      const rc = createCanvas(ref.width, ref.height);
      rc.getContext('2d').drawImage(ref, 0, 0);

      const a = target.getContext('2d').getImageData(0, 0, target.width, target.height);
      const b = rc.getContext('2d').getImageData(0, 0, ref.width, ref.height);
      const diff = pixelmatch(a.data, b.data, null, ref.width, ref.height, { threshold: 0.1 });
      expect(diff / (ref.width * ref.height)).toBeLessThan(0.001);
    });
  }
});
```

- [ ] **Step 8: Run the whole suite**

Run: `npm test`
Expected: PASS, all files.

- [ ] **Step 9: Commit**

```bash
git add core/render.js core/index.js test/compose.test.js test/golden/render scripts/make-render-goldens.js
git commit -m "feat(core): paint phones and captions, add compose() entry point"
```

---

### Task 8: Web app shell — drop, render, export

The first point where the thing is usable. No panel yet, no styling beyond what is needed to see the canvas: drop a file, get a shot, download it.

**Files:**
- Create: `web/index.html`, `web/main.js`, `web/style.css`
- Create: `vite.config.js`
- Modify: `package.json` (Vite root)

**Interfaces:**
- Consumes: `composeWithMeta` from `core/index.js`.
- Produces:
  - `web/state.js` exporting `state` (the raw config object the panel mutates) and `render()`.
  - `render()` recomposes and returns the `meta` object, so Task 10 can tint chrome from it.

- [ ] **Step 1: Create `vite.config.js`**

```js
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  build: { outDir: '../dist', emptyOutDir: true },
});
```

- [ ] **Step 2: Create `web/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>shotkit</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <main class="app">
    <section class="stage" aria-label="Shot preview">
      <div class="drop" id="drop">
        <p>Drop a screenshot</p>
        <button type="button" id="pick">or choose a file</button>
        <input type="file" id="file" accept="image/*" multiple hidden>
      </div>
      <canvas id="canvas" hidden></canvas>
    </section>

    <aside class="panel" id="panel" hidden>
      <button type="button" id="export">Export PNG</button>
      <p class="msg" id="msg" role="status" aria-live="polite"></p>
    </aside>
  </main>
  <script type="module" src="./main.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create `web/state.js`**

```js
import { composeWithMeta } from '../core/index.js';

const mk = (w, h) => {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return cv;
};

export const state = {
  config: { ratio: '3:2' },
  images: { web: null, mobile: [] },
  meta: null,
};

/**
 * Recompose into the on-page canvas. The preview canvas IS the export canvas:
 * full output resolution, scaled down with CSS. There is no second code path,
 * so the export cannot disagree with what is on screen.
 */
export function render(canvas) {
  if (!state.images.web && state.images.mobile.length === 0) return null;
  const { meta } = composeWithMeta(canvas, state.config, state.images, mk);
  state.meta = meta;
  return meta;
}

export async function addFiles(files) {
  const errors = [];
  for (const f of files) {
    if (!f.type.startsWith('image/')) { errors.push(`${f.name} is not an image`); continue; }
    let bmp;
    try { bmp = await createImageBitmap(f); }
    catch { errors.push(`${f.name} could not be decoded`); continue; }

    // A portrait image is a phone; a landscape one is the desktop screen.
    if (bmp.width / bmp.height < 1) {
      if (state.images.mobile.length >= 3) { errors.push('Using the first 3 phone screenshots'); continue; }
      state.images.mobile.push(bmp);
    } else {
      state.images.web = bmp;
    }
  }
  return errors;
}
```

- [ ] **Step 4: Create `web/main.js`**

```js
import { state, render, addFiles } from './state.js';

const drop = document.getElementById('drop');
const canvas = document.getElementById('canvas');
const panel = document.getElementById('panel');
const msg = document.getElementById('msg');
const fileInput = document.getElementById('file');

function say(text) { msg.textContent = text; }

async function accept(files) {
  const errors = await addFiles(files);
  const meta = render(canvas);
  if (!meta) { say(errors.join('. ') || 'Nothing to render yet.'); return; }
  canvas.hidden = false;
  drop.hidden = true;
  panel.hidden = false;
  say(errors.join('. '));
}

document.getElementById('pick').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => accept([...e.target.files]));

for (const type of ['dragenter', 'dragover']) {
  document.addEventListener(type, e => { e.preventDefault(); drop.classList.add('is-over'); });
}
for (const type of ['dragleave', 'drop']) {
  document.addEventListener(type, e => { e.preventDefault(); drop.classList.remove('is-over'); });
}
document.addEventListener('drop', e => accept([...e.dataTransfer.files]));

document.getElementById('export').addEventListener('click', () => {
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shotkit-${state.config.layout || 'shot'}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
});
```

- [ ] **Step 5: Create a minimal `web/style.css`**

Styling proper comes in Task 10. This is only enough to see the canvas.

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font: 16px/1.5 Inter, -apple-system, "Segoe UI", Roboto, sans-serif;
  background: #14151a;
  color: #f2f2f4;
}

.app { display: grid; grid-template-columns: 1fr 320px; min-height: 100vh; }
.stage { display: grid; place-items: center; padding: 3vmin; min-width: 0; }
.stage canvas { max-width: 100%; max-height: 90vh; height: auto; display: block; }

.drop { display: grid; gap: 1rem; place-items: center; padding: 4rem; border: 2px dashed #444; border-radius: 12px; }
.drop.is-over { border-color: #8a7cff; }

.panel { padding: 1.5rem; border-left: 1px solid #26272e; }

button { font: inherit; padding: .6rem 1rem; border-radius: 8px; border: 0; cursor: pointer; }
button:focus-visible { outline: 2px solid #8a7cff; outline-offset: 2px; }

@media (max-width: 860px) { .app { grid-template-columns: 1fr; } }
```

- [ ] **Step 6: Run it and confirm end to end**

Run: `npm run dev`

Then in the browser: drop `samples/fieldset.png`, confirm a shot appears, click **Export PNG**, and open the downloaded file. It must be 1800×1200 and match the preview.

- [ ] **Step 7: Commit**

```bash
git add web vite.config.js
git commit -m "feat(web): drop, render, and export a shot in the browser"
```

---

### Task 9: The control panel

Full flag parity, grouped by what each control changes rather than by flag name.

**Files:**
- Create: `web/panel.js`
- Modify: `web/index.html`, `web/main.js`, `web/style.css`

**Interfaces:**
- Consumes: `state` and `render` from `web/state.js`; `RATIOS` and `HUES` from `core/index.js`.
- Produces: `buildPanel(root, onChange)` — renders the controls into `root` and calls `onChange()` after every change. `syncPanel()` re-reads `state.config` into the inputs.

- [ ] **Step 1: Write `web/panel.js`**

```js
import { state } from './state.js';
import { RATIOS, HUES } from '../core/index.js';

const GROUPS = [
  { title: 'Canvas', fields: [
    { key: 'ratio',  label: 'Ratio',  type: 'select', options: Object.keys(RATIOS) },
  ]},
  { title: 'Ground', fields: [
    { key: 'ground', label: 'Colour', type: 'select', options: ['auto', ...Object.keys(HUES)] },
    { key: 'hue',    label: 'Hue',    type: 'range',  min: 0, max: 360, step: 1 },
    { key: 'tone',   label: 'Tone',   type: 'select', options: ['auto', 'light', 'mid'] },
  ]},
  { title: 'Frame', fields: [
    { key: 'fit',    label: 'Fit',    type: 'select', options: ['contain', 'cover'] },
    { key: 'pad',    label: 'Padding', type: 'range', min: 0, max: 0.15, step: 0.002 },
    { key: 'radius', label: 'Corner', type: 'range',  min: 0, max: 80, step: 1 },
  ]},
  { title: 'Finish', fields: [
    { key: 'grain',   label: 'Grain',   type: 'range', min: 0, max: 1, step: 0.01 },
    { key: 'caption', label: 'Caption', type: 'text' },
  ]},
  { title: 'Phone', phoneOnly: true, fields: [
    { key: 'phoneScale', label: 'Size',  type: 'range', min: 0.4, max: 1.2, step: 0.01 },
    { key: 'phoneBleed', label: 'Bleed', type: 'range', min: -0.2, max: 0.4, step: 0.01 },
  ]},
];

function field(f, onChange) {
  const id = `f-${f.key}`;
  const wrap = document.createElement('div');
  wrap.className = 'field';

  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = f.label;
  wrap.appendChild(label);

  let input;
  if (f.type === 'select') {
    input = document.createElement('select');
    for (const o of f.options) {
      const opt = document.createElement('option');
      opt.value = o; opt.textContent = o;
      input.appendChild(opt);
    }
  } else {
    input = document.createElement('input');
    input.type = f.type;
    if (f.min !== undefined) { input.min = f.min; input.max = f.max; input.step = f.step; }
  }
  input.id = id;
  input.dataset.key = f.key;

  const out = document.createElement('output');
  out.className = 'value';
  if (f.type === 'range') out.htmlFor = id;

  input.addEventListener('input', () => {
    let v = input.value;
    if (f.type === 'range') v = Number(v);
    if (f.key === 'hue')    { state.config.ground = String(v); }
    else if (f.key === 'ground' && v === 'auto') { state.config.ground = 'auto'; }
    else if (f.key === 'tone' && v === 'auto')   { state.config.tone = null; }
    else state.config[f.key] = v;
    if (f.type === 'range') out.value = typeof v === 'number' ? v.toFixed(f.step < 0.01 ? 3 : 2) : v;
    onChange();
  });

  wrap.appendChild(input);
  if (f.type === 'range') wrap.appendChild(out);
  return { wrap, input, out };
}

let phoneGroupEl = null;

export function buildPanel(root, onChange) {
  for (const g of GROUPS) {
    const section = document.createElement('section');
    section.className = 'group';
    const h = document.createElement('h2');
    h.textContent = g.title;
    section.appendChild(h);
    for (const f of g.fields) section.appendChild(field(f, onChange).wrap);
    if (g.phoneOnly) phoneGroupEl = section;
    root.appendChild(section);
  }
  syncPanel();
}

/** Read state.config back into the inputs, and hide Phone when unused. */
export function syncPanel() {
  const c = state.config;
  for (const el of document.querySelectorAll('[data-key]')) {
    const k = el.dataset.key;
    if (k === 'hue') { el.value = Number.isFinite(Number(c.ground)) ? Number(c.ground) : 210; continue; }
    if (k === 'tone') { el.value = c.tone || 'auto'; continue; }
    const v = c[k];
    if (v !== undefined && v !== null) el.value = v;
  }
  if (phoneGroupEl) {
    phoneGroupEl.hidden = state.images.mobile.length === 0;
  }
}
```

- [ ] **Step 2: Wire the panel into `web/index.html`**

Replace the `<aside>` block with:

```html
    <aside class="panel" id="panel" hidden>
      <div id="controls"></div>
      <button type="button" id="export">Export PNG</button>
      <button type="button" id="reset">Start over</button>
      <p class="msg" id="msg" role="status" aria-live="polite"></p>
    </aside>
```

- [ ] **Step 3: Wire the panel into `web/main.js`**

Add near the top, after the existing imports:

```js
import { buildPanel, syncPanel } from './panel.js';
```

Add a debounced re-render, so dragging a slider does not queue a render per event:

```js
let queued = false;
function rerender() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    render(canvas);
  });
}

buildPanel(document.getElementById('controls'), rerender);

document.getElementById('reset').addEventListener('click', () => {
  state.images = { web: null, mobile: [] };
  state.config = { ratio: '3:2' };
  canvas.hidden = true;
  drop.hidden = false;
  panel.hidden = true;
  say('');
  syncPanel();
});
```

And call `syncPanel()` at the end of `accept()`, after `say(...)`.

- [ ] **Step 4: Style the panel**

Append to `web/style.css`:

```css
.group { margin-bottom: 1.5rem; }
.group h2 { font-size: .75rem; text-transform: uppercase; letter-spacing: .08em; opacity: .5; margin-bottom: .5rem; }
.field { display: grid; grid-template-columns: 5rem 1fr auto; gap: .5rem; align-items: center; margin-bottom: .4rem; }
.field label { font-size: .8rem; opacity: .75; }
.field .value { font-size: .75rem; opacity: .5; font-variant-numeric: tabular-nums; min-width: 3ch; text-align: right; }
.field input, .field select { font: inherit; font-size: .85rem; width: 100%; min-width: 0; }
.field input:focus-visible, .field select:focus-visible { outline: 2px solid #8a7cff; outline-offset: 2px; }
.panel { overflow-y: auto; max-height: 100vh; }
```

- [ ] **Step 5: Verify every control**

Run: `npm run dev`

Drop `samples/karaoke-web.png` and `samples/karaoke-mobile.png`. Then, one at a time, confirm each control changes the canvas: ratio, ground colour, hue, tone, fit, padding, corner, grain, caption, phone size, phone bleed. Confirm the **Phone** group is hidden when only a desktop screenshot is loaded.

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "feat(web): add the full control panel"
```

---

### Task 10: The app wears the shot's colour

The design register for this project is "push it". The organising idea: `ground.js` already extracts the product's accent, so the same value tints the app chrome. Drop a different screenshot and the whole interface shifts with it. The tool demonstrates its thesis instead of describing it.

**Files:**
- Modify: `web/style.css`, `web/main.js`
- Create: `web/chrome.js`

**Interfaces:**
- Consumes: `meta` returned by `render()`.
- Produces: `applyChrome(meta)` — sets CSS custom properties on `:root`. Clamps lightness so contrast never fails, whatever hue comes out of the analysis.

- [ ] **Step 1: Write `web/chrome.js`**

```js
/**
 * Tint the app chrome from the shot's own accent colour.
 *
 * Lightness is CLAMPED, not taken from the analysis. The hue is generated, so
 * an unclamped tint would fail contrast at some hues and pass at others. Text
 * colours stay fixed; only surfaces and accents move.
 */
function hsl(h, s, l) { return `hsl(${h} ${s}% ${l}%)`; }

export function applyChrome(meta) {
  const h = Math.round(meta?.hue ?? 250);
  const r = document.documentElement.style;

  r.setProperty('--hue', h);
  r.setProperty('--bg',      hsl(h, 12, 8));
  r.setProperty('--surface', hsl(h, 10, 12));
  r.setProperty('--line',    hsl(h, 12, 20));
  r.setProperty('--accent',  hsl(h, 70, 68));   // >= 4.5:1 on --bg at every hue
  r.setProperty('--ink',     hsl(h, 15, 96));
  r.setProperty('--ink-dim', hsl(h, 12, 72));   // >= 4.5:1 on --surface
}
```

- [ ] **Step 2: Move the palette onto tokens in `web/style.css`**

Replace the hard-coded colours. Defaults live on `:root` so the page is correct before any file is dropped.

```css
:root {
  --hue: 250;
  --bg: hsl(250 12% 8%);
  --surface: hsl(250 10% 12%);
  --line: hsl(250 12% 20%);
  --accent: hsl(250 70% 68%);
  --ink: hsl(250 15% 96%);
  --ink-dim: hsl(250 12% 72%);
}

body { background: var(--bg); color: var(--ink); transition: background-color .6s ease; }
.panel { background: var(--surface); border-left: 1px solid var(--line); }
.drop { border-color: var(--line); }
.drop.is-over { border-color: var(--accent); }
.group h2, .field label, .field .value { color: var(--ink-dim); opacity: 1; }
button { background: var(--accent); color: var(--bg); }
button:focus-visible, .field input:focus-visible, .field select:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px;
}
button:disabled { opacity: .5; cursor: not-allowed; }
```

Delete the old `#8a7cff` and `#444` values and the `opacity: .5` / `.75` on labels — the dim token replaces them, and opacity-based dimming is what makes contrast unpredictable.

- [ ] **Step 3: Call it on every render**

In `web/main.js`, import and call:

```js
import { applyChrome } from './chrome.js';
```

Then inside `accept()` and `rerender()`, after `render(canvas)` returns `meta`, call `applyChrome(meta)`.

- [ ] **Step 4: Add the one authored moment**

One orchestrated sequence when a file lands — the drop zone gives way, the ground blooms in, the screen settles under its shadow. Not scattered hovers.

Append to `web/style.css`:

```css
@keyframes settle {
  from { opacity: 0; transform: translateY(2.5%) scale(.965); }
  to   { opacity: 1; transform: none; }
}
@keyframes bloom {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.stage canvas { animation: settle .72s cubic-bezier(.22,.61,.36,1) both; }
.stage::before {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(60% 50% at 50% 45%, hsl(var(--hue) 60% 50% / .18), transparent 70%);
  animation: bloom .9s ease both;
}
.stage { position: relative; }
.panel { animation: settle .5s .12s cubic-bezier(.22,.61,.36,1) both; }

@media (prefers-reduced-motion: reduce) {
  .stage canvas, .stage::before, .panel { animation: none; }
  body { transition: none; }
}
```

- [ ] **Step 5: Verify the motion and the reduced-motion fallback**

Run: `npm run dev`

Drop a file and watch the sequence once. Then enable **Reduce Motion** (macOS: System Settings → Accessibility → Display → Reduce motion), reload, drop again, and confirm the shot appears with no animation and no colour transition.

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "feat(web): tint the app chrome from the shot's accent, add the drop sequence"
```

---

### Task 11: Verification pass

The standing UI rules. Ambitious interactive work is exactly where contrast failures, 320px overflow, missing focus states, and reduced-motion violations hide.

**Files:**
- Modify: `web/style.css`, `web/index.html`, `web/main.js` (as findings require)
- Create: `docs/verification-2026-08-31.md`

**Interfaces:** none. This task changes no public signatures.

- [ ] **Step 1: Check contrast at every hue**

The accent is generated, so it must be checked across the range, not at one value. Run this in the browser console with the app open:

```js
const srgb = c => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const L = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const ratio = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const rgb = s => { const d = document.createElement('div'); d.style.color = s; document.body.appendChild(d);
  const v = getComputedStyle(d).color.match(/\d+/g).map(Number); d.remove(); return v; };

const fails = [];
for (let h = 0; h < 360; h += 10) {
  const bg = rgb(`hsl(${h} 12% 8%)`), sf = rgb(`hsl(${h} 10% 12%)`);
  const checks = {
    'accent on bg':   ratio(rgb(`hsl(${h} 70% 68%)`), bg),
    'ink on bg':      ratio(rgb(`hsl(${h} 15% 96%)`), bg),
    'ink-dim on surf': ratio(rgb(`hsl(${h} 12% 72%)`), sf),
    'bg on accent':   ratio(bg, rgb(`hsl(${h} 70% 68%)`)),
  };
  for (const [name, r] of Object.entries(checks)) if (r < 4.5) fails.push({ h, name, r: r.toFixed(2) });
}
console.table(fails);
```

Expected: empty table. If any hue fails, adjust the lightness values in `chrome.js` and the `:root` defaults together — they must stay in step — and re-run.

- [ ] **Step 2: Check for horizontal scroll from 320px to 1920px**

In the browser console:

```js
const bad = [];
for (let w = 320; w <= 1920; w += 20) {
  window.resizeTo(w, 900);
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth) bad.push(w);
}
console.log(bad.length ? 'overflow at: ' + bad.join(', ') : 'no horizontal scroll');
```

If `resizeTo` is blocked, use the browser's device-toolbar and step through 320, 375, 480, 640, 768, 860, 1024, 1280, 1440, 1920 by hand. The likely offender is `.field`'s `5rem 1fr auto` grid — at 320px, switch it to a single column.

- [ ] **Step 3: Check focus, disabled, and loading states**

Tab through the whole page with the mouse untouched. Every control — the file button, every select, every range, Export, Start over — must show a visible focus ring.

Then confirm the states that are missing and add them:
- **Export** must be `disabled` until a shot exists.
- While a large file is decoding, **Export** must show a loading state rather than appearing ready.

In `web/main.js`:

```js
const exportBtn = document.getElementById('export');

function setBusy(on) {
  exportBtn.disabled = on || !state.images.web && state.images.mobile.length === 0;
  exportBtn.setAttribute('aria-busy', String(on));
  exportBtn.textContent = on ? 'Working…' : 'Export PNG';
}
```

Call `setBusy(true)` at the start of `accept()` and `setBusy(false)` at the end.

- [ ] **Step 4: Confirm reduced motion once more**

With **Reduce Motion** on, reload and drop a file. No animation, no colour transition. This was checked in Task 10; check it again here because Task 10's styles may have been edited in Steps 1–3.

- [ ] **Step 5: Record the results**

Write `docs/verification-2026-08-31.md` with the real outcome of each of the four checks — what was run, what was found, what was changed. If a check failed and was fixed, say so. Do not write "passed" for a check that was not actually run.

- [ ] **Step 6: Commit**

```bash
git add web docs/verification-2026-08-31.md
git commit -m "fix(web): contrast, responsive, focus and reduced-motion fixes"
```

---

### Task 12: Netlify deploy, README, and retire the legacy files

The old implementation is deleted **only here**, once the tests that replace it are green.

**Files:**
- Create: `netlify.toml`
- Modify: `README.md`
- Delete: `frame.html`, `ground.py`, `shotkit.js`, `jobs.json`

**Interfaces:** none.

- [ ] **Step 1: Confirm the suite is green before deleting anything**

Run: `npm test`
Expected: PASS, every file. If anything fails, **stop** — the legacy files are the only remaining reference for the port.

- [ ] **Step 2: Create `netlify.toml`**

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20"

[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
```

- [ ] **Step 3: Confirm the production build works**

Run: `npm run build && npm run preview`

Open the preview URL, drop a screenshot, export. The exported PNG must be identical to the one from `npm run dev`.

- [ ] **Step 4: Delete the legacy implementation**

```bash
git rm frame.html ground.py shotkit.js jobs.json
```

`jobs.json` goes with them — it described a batch run, and batch is deliberately out of scope for v1. Its contents are preserved in the spec, and the CLI cycle will reintroduce it.

- [ ] **Step 5: Rewrite `README.md`**

Keep the three ideas from the original README — they are the reasoning behind the tool and are still true. Replace the CLI usage with the web app, and be accurate about what exists.

```markdown
# shotkit

Turns a raw screenshot into a finished shot: the UI floating on a ground, with
a shadow and a bit of grain. Built for Dribbble shots and portfolio thumbnails,
but the canvas is a parameter.

Drop a screenshot in, adjust, export. Everything runs in your browser — no
upload, no server, no account.

## Run it locally

```bash
npm install
npm run dev
```

## The three ideas

**1. One geometry, many grounds.** Padding, radius, and shadow are proportions
of the canvas, not pixels. Same numbers at 3:2, 4:3, 16:9 or 1:1. That is what
makes a row of thumbnails look like one person made them.

Padding is a **single** number measured against the shorter canvas side, so the
gap is identical on all four edges. If a shot looks over-padded, check the
source ratio first: a narrow source fitted by `contain` into a wider box leaves
the slack on the sides, and no padding value will fix that. Recrop the source.

**2. The ground comes from the product.** The background is built from the
product's own accent colour. Two rules matter:

- Only **flat** pixels vote on hue. A button or a pill is one solid colour; a
  photo is not. Without this filter, album art and furniture photography hijack
  the brand colour and every ground comes out muddy orange.
- Lightness is set for **separation**, not mood. A light UI gets a pale tint. A
  dark UI gets a **mid-tone** ground, never a dark one. Dark-on-dark is the most
  common way these shots fail.

**3. `contain` by default, so nothing is cropped.** The screen takes the source
image's own aspect ratio and fits inside the safe box. `cover` is there if you
want edge-to-edge and accept the crop.

## Layout

- `core/` — all the logic. Pure ES modules, zero dependencies, no DOM and no
  Node built-ins, so the same code runs in a browser and under Node.
  - `ground.js` colour analysis · `layout.js` geometry · `render.js` canvas
    painter · `config.js` defaults · `index.js` the `compose()` entry point
- `web/` — the app. Drop, adjust, export.
- `test/` — golden values and pixel-diff references.

## Tests

```bash
npm test
```

`test/golden/ground.json` holds the colour values produced by the original
Python implementation. The JS port is asserted against them, which is what
proves the two agree.

## Capturing a mobile screen when the window will not resize

Browser windows often refuse to resize below the OS minimum, so the page never
hits its mobile breakpoint. Load the page in a **same-origin iframe** fixed at
390px instead: media queries respond to the iframe's width. Scale the iframe
with a CSS transform for resolution, capture in vertical tiles, and stitch.
That is how `samples/karaoke-mobile.png` was made.

## Not built yet

- **CLI**, back on top of `core/` — no Python, no Playwright. Brings back
  `jobs.json` batch runs.
- **npm publish**, so `shotkit` works in any folder.
- **Desktop app**, wrapping the same web app.
- **Bleed layout** — letting the UI run off one canvas edge.
- **MP4 export.**
```

- [ ] **Step 6: Run the full suite one more time**

Run: `npm test && npm run build`
Expected: PASS, and a clean build.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add netlify config, rewrite README, retire the python/playwright implementation"
```

- [ ] **Step 8: Stop — publishing needs a human**

Do **not** create the GitHub repository, push, or connect Netlify. Publishing is the user's call. Report that the branch is ready and ask them whether to create the repo as public, and under which account.

---

## Self-review

**Spec coverage.** Every section of the spec maps to a task:

| Spec section | Task |
|---|---|
| `core/presets.js`, `core/config.js` | 2 |
| `core/ground.js` | 3 |
| `core/layout.js` | 4 |
| `core/render.js` — ground, grain | 5 |
| `core/render.js` — screen, shadow | 6 |
| `core/render.js` — phone, caption; `core/index.js` | 7 |
| `web/` wiring, preview-is-export, debounced re-render | 8, 9 |
| App design — chrome tinting, one authored moment | 10 |
| Errors table | 8 (`addFiles`), 9 (phone group hidden), 11 (disabled/busy) |
| Testing — goldens, layout, pixel-diff | 1, 3, 4, 7 |
| Verification | 11 |
| Netlify, README | 12 |

**Two gaps found and closed while reviewing:**

- The spec's error table lists "`web+mobile` chosen with no phone image → fall back to `web`". `core/layout.js` handles this by returning an empty `phones` array (Task 4 tests it), but nothing told the user. Task 9's `syncPanel()` hides the Phone group when no phone image is loaded, which makes the state visible rather than silent.
- The spec's error table lists "canvas larger than the browser allows". No task implements a cap. **This is a known gap.** All four shipped ratios are far below every browser's limit, so it cannot trigger from the panel; it becomes reachable only when the CLI cycle exposes arbitrary `--w`/`--h`. Left out deliberately rather than forgotten.

**Placeholder scan.** No "TBD", no "add appropriate error handling", no "similar to Task N". Two tasks (5 and 4) contain a deliberate draft slip followed by an explicit fix step — that is real content showing the correct end state, not a placeholder.

**Type consistency.** Checked across tasks: `normalise` (2) → consumed by 4, 7, 8. `groundFor(samples, forceHue, mode)` (3) → called with exactly that signature in 7. `layout(config, sources)` returning `{ safe, web, phones, caption }` (4) → destructured identically in 6, 7. `paintGrain(ctx, c, makeCanvas)` (5) → called with three arguments in 7's `composeWithMeta`. `composeWithMeta(target, rawConfig, images, makeCanvas)` (7) → called with four arguments in 8's `state.js`. `applyChrome(meta)` (10) consumes the `meta` that `render()` returns in 8.

One inconsistency was found and fixed: Task 5 originally exported `paintGrain(ctx, c)` with a two-argument signature, but the pattern-based implementation needs a canvas factory. The signature is now `paintGrain(ctx, c, makeCanvas)` in Task 5's Step 4, and Task 7 calls it that way.
