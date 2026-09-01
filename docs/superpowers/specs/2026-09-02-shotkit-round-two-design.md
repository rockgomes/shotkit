# shotkit round two — design

Date: 2026-09-02. Follows the deployed app at
https://shotkit-app.netlify.app (branch `feat/shotkit-web`, commit `5634e10`).

## Why

The app shipped and Rock used it. Nineteen items came back. They are not a
defect list — most of them say the same thing twice: **controls exist that
don't do what their name promises**, and **the shot's own look is decided by
constants nobody can reach**. `cover` only crops. `Fit` names something the
user could not identify. Mesh has two colours and a reroll button. Zoom is
disabled. The export menu cycles. `frame: none` draws a frame.

So this round is less "add features" than "make the visible surface honest".
Three things genuinely change shape: the config gains per-element structure,
frames and strokes become outsets, and Background becomes type-first.

## The nineteen items

Rendering (`core/`):

1. `frame: none` must draw no stroke.
2. Strokes as a deliberate feature: light, glass, custom colour + width.
3. Rebuild the browser chrome — Safari-like, much smaller bar.
4. Frames grow outward; the screenshot does not shrink.
5. Delete `cover`, and with it the `Fit` control.
6. Drop the caption.
7. Background restructured type-first, each type with its own set.
8. Real shadow control: distance, angle, blur, directional.
9. Mesh rebuilt so it is worth having.

App:

10. Click an element to select it; controls follow the selection.
11. Template and ratio labels need a space.
12. Drop Ground from the left rail — it duplicates Background.
13. Nameable custom sizes.
14. New / close project.
15. Zoom and pan the artboard.
16. Export dropdown must open, not cycle.
17. Angle made legible.
18. Per-control Reset, disabled at default.
19. Raise text readability throughout; bigger, truer preset tiles.

## Structural decision 1 — the config gains elements

`normalise()` returns one flat config today. "Tap the mobile and get the mobile
controls" cannot be true of that shape: there is nowhere for a phone to hold a
frame that differs from the web shot's.

**Canvas and ground stay global.** One ratio, one ground, one grain — they
describe the shot, not a thing in it.

**Frame, stroke, radius and shadow move into a per-element block:**

```
elements: {
  web:    { frameKind, chromeTheme, url, radius, stroke, shadow },
  mobile: { frameKind, chromeTheme, url, radius, stroke, shadow },
}
```

`mobile` covers every phone in the `web+mobile` layout as one class. Selecting
one phone selects the phones — per-phone settings are not a goal and would not
survive a layout change.

**One compatibility rule, so callers and golden scripts stay short:** a flat
key at the top level of the input is a default for *every* element; an entry
in `elements` overrides it for that element. `normalise({frameKind:'browser'})`
therefore keeps meaning exactly what it means today.

## Structural decision 2 — frames and strokes are outsets

Rock chose "image keeps its size, frame grows outward". Applied consistently, a
stroke is the same idea: a white mat around a shot makes the shot bigger, it
does not eat into the picture.

So both are outsets, resolved in one place:

1. `screen` — the screenshot's own box, its ratio taken from the source image,
   fitted to the safe area. **This is the size the screenshot keeps.**
2. Add the browser bar and any bezel outward.
3. Add the stroke width outward.
4. The result is the composite.

**What gives way is the padding, not the picture.** The composite is fitted to
the canvas less a minimum margin (`MIN_MARGIN_RATIO`, a fraction of the shorter
canvas side), not to the safe box. Turning on a frame therefore consumes
padding and leaves the screenshot alone — which is the visible behaviour Rock
asked for. This must be stated in the UI copy for padding, because padding
stops being an absolute promise.

Only when the composite exceeds the canvas minus that minimum margin does the
whole composite scale down uniformly. That is a floor, not the normal path.

The closed-form `frameRatio()` maths in `layout.js` exists to make the interior
come back at the source ratio after the bar is subtracted. Under the outset
model the interior is the *starting* point, so **`frameRatio()` is deleted**,
not adjusted. The round-trip property it defended is now structural: `screen`
is never derived, so it cannot drift. A test must still assert
`screen.w / screen.h === sourceRatio` to within 1e-12.

## Structural decision 3 — the shadow rework gets an isolated guard

`paintShadow`'s alphas (0.17 / 0.07 web and browser, 0.22 / 0.10 phone) have
been broken once already: a pass retuned them against `@napi-rs/canvas` to
0.40 / 0.30, every Node test stayed green, and the browser — the actual
product — would have shipped a shadow roughly 65 RGB levels too dark. It was
caught only because a reviewer measured Chromium directly.

Adding distance, angle, blur and a directional mode means touching that
function again, and `frame.html` is now deleted, so the original cannot be
re-derived from it.

**Required guard: an isolated shadow golden.** A test renders `paintShadow`
alone, at default parameters, on a blank canvas, and compares against a stored
PNG. Not a golden of a whole shot — every whole-shot golden is changing this
round for other reasons and would hide a shadow regression inside a legitimate
diff.

Defaults must reproduce today's output exactly:

```
shadow: { scale: 1, distance: 0.040, angle: 90, blur: 0.105, directional: false }
```

`distance` and `blur` are fractions of the canvas height, which is what
`c.h * 0.040` and `c.h * 0.105` already are — the numbers move into config
without changing value. `directional: false` keeps the present two-layer
ambient-plus-direct construction. `directional: true` offsets the direct layer
along `angle` by `distance`; the ambient layer stays centred.

## Strokes

```
stroke: { style: 'none' | 'light' | 'glass' | 'custom',
          width: <fraction of the shorter canvas side>,
          color: '#rrggbb' }
```

Default `{ style: 'none', width: 0.008, color: '#ffffff' }`. `none` paints
nothing at all — item 1 is satisfied by deleting the unconditional hairline at
`core/render.js:377`, not by making it transparent.

- **light** — opaque near-white mat.
- **glass** — translucent white with an inner highlight and a faint outer
  hairline, so the ground reads through it.
- **custom** — solid `color`.

Painted as a ring behind the composite: outer radius = inner radius + width, so
the corner stays concentric. The shadow applies to the outer, stroked box. The
stroke is never drawn inside the clip, so it can never cover the screenshot.

## Browser chrome

The present bar is `BROWSER_BAR_RATIO = 10/133` of the frame **width** — about
126px on a 1675px-wide shot, roughly twice what the reference windows show, and
it carries the handoff's generic bar rather than a recognisable browser.

The implementer **measures** the bar height as a fraction of window width from
the supplied reference images and records the measurement in the task report.
No number is invented here, and the existing ratio is not simply halved by
feel. The measured value must still leave the traffic lights legible at the
smallest supported canvas.

Contents, all proportional, in light and dark:

- three traffic-light dots, left;
- a centred URL pill carrying `url` when set, empty when not — no invented
  placeholder text, which has been the rule since Task 6;
- two or three muted glyphs, right.

## Background, type-first

Type becomes the top control. Each type carries its own set, and **sampled
lives inside each type** rather than being a fourth option:

- **Gradient** (default) — sampled gradient, plus gradient presets.
- **Solid** — sampled solid, plus solid presets.
- **Mesh** — sampled mesh, plus mesh presets.

`bgType`'s internal value stays `'linear'` for gradient; the label changes, the
stored value does not. There is no Image type: no background images are
bundled or uploaded this round.

**Preset tiles are rendered by the real generator** into a small canvas, at
roughly 44px, not approximated in CSS. `.preset-swatch` is 14×14 today, which
is why eight hues are indistinguishable — and CSS approximations are how the
swatches came to lie about the sampled ground once before.

## Mesh, rebuilt

`paintMesh` takes `[g1, , g3]` — two tints of one hue — and offers a single
integer seed. It can only produce a blotchier linear gradient, which is why it
has no use.

Rebuilt: three to five stops at distinct hues. For a sampled mesh the stops are
derived from the sampled hue by rotation, so a mesh still belongs to the
screenshot it came from. Controls: **stop count**, **hue spread**, **seed**,
plus presets. Blob placement stays seeded and deterministic; each blob takes a
distinct stop rather than alternating between two.

## Selection

`layout()` already returns the boxes. A canvas click hit-tests them and sets
`selection: 'web' | 'mobile' | null`; the inspector renders the selected
element's block.

**The selection outline is a DOM overlay, never painted into the canvas.** The
preview canvas is the export canvas — anything drawn into it ships in the PNG.
A test must prove an active selection leaves the export byte-identical.

## Zoom and pan

View-only, and structurally incapable of being otherwise: a CSS transform on
the canvas element. Canvas dimensions and composition are untouched, so the
export cannot follow the view. Wheel-zoom with modifier, drag to pan, a working
stepper, fit-to-window, and reset.

## Smaller items

- **Labels** — `sidebar.js:418` and `:440` concatenate name and dimensions with
  no separator, giving "Dribbble shot2800×2100".
- **Ground leaves the left rail.** It duplicates the Background panel.
- **Custom sizes** gain a name, stored in `localStorage`: per browser, not
  synced, lost when site data is cleared. Nothing else persists.
- **New / close project** clears the images and resets config to defaults,
  behind a confirm when a file is open. No saved projects.
- **Export menu** opens as a menu instead of cycling.
- **Angle** gets a readable readout and a direction that can be seen.
- **Per-control Reset**, disabled when the control is already at default.
- **Caption** is removed from config, layout, render, the UI and its golden.
- **`fit` / `FITS` / `cover`** are removed. The screen always takes the image
  ratio, which is what `contain` did.

## Contrast

Body text at least 7:1 against its background; secondary text and controls at
least 4.5:1; decorative and disabled states at least 3:1. Deliberately inert
states (the empty state's 0.42) stay inert but must clear 3:1. Dark theme only;
the light theme remains a later cycle, built from scratch.

## Invariants that must survive

Every one of these has been verified repeatedly and must still hold:

- `composeWithMeta` is called from exactly one place in `web/`.
- The preview canvas is the export canvas.
- No engine detection anywhere in `core/`.
- `core/` has zero runtime dependencies.
- `web/tokens.css` is the only file containing raw colour.
- `[hidden] { display: none !important; }` stays a single global rule.
- Geometry is proportional to the canvas, never fixed pixels, except the
  documented minimums.

## Testing

- Goldens are rebuilt; they will encode the new look. The verification against
  `frame.html` is complete and recorded, and is not re-run.
- The isolated shadow golden above.
- `screen.w / screen.h === sourceRatio` to 1e-12, under every frame kind and
  stroke width.
- Selection does not alter the export.
- Hit-testing, stroke geometry, mesh determinism by seed, and custom-size
  persistence against a `localStorage` stub.
- Contrast recomputed across the token pairs and the generated hues.

## Three cycles

**A — Render.** Items 1–9, plus three app fixes that touch nothing in the
inspector and so cannot collide: contrast (18), label spacing (11), Ground
dedup (12). Contrast rides here deliberately rather than waiting two cycles.

**B — Background and selection.** Item 7's restructure, item 10's selection
model, bigger preset tiles (19), Angle (17), per-control Resets (18).

**C — Shell.** Zoom and pan (15), new/close project (14), nameable custom sizes
(13), export dropdown (16).

Each cycle is its own plan, run task by task, stopping after every task.

## Out of scope

- The light theme — still its own later cycle, designed from scratch, not
  derived from the handoff's option 1b.
- Named device frames. `phone` stays deliberately unnamed.
- Saved projects and saved presets, beyond named custom sizes.
- Background images or bundled wallpapers.
- Cross-browser verification. One engine, as every round so far.
