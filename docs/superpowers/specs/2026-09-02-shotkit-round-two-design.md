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
19. Raise text readability throughout.

Bigger, truer preset tiles are not a separate item: they are part of item 7's
restructure, and are specified under Background below.

## Structural decision 1 — the config gains elements

`normalise()` returns one flat config today. "Tap the mobile and get the mobile
controls" cannot be true of that shape: there is nowhere for a phone to hold a
frame that differs from the web shot's.

**Canvas and ground stay global.** One ratio, one ground, one grain — they
describe the shot, not a thing in it.

**And grain is painted on the ground only** (added after Cycle A Task 4b).
It used to be an unclipped `soft-light` pass over the finished canvas, so it
landed on the screenshot and the phones as well: at `grain: 1` a flat source
came back with 105 distinct greys inside the picture. Grain is a property of
the backdrop. It is never applied to a user's own screenshot, and it is
achieved by paint ORDER — ground, grain, then the shots — not by clipping
around them, because an antialiased clip boundary would draw a 1px ring at the
shot's edge.

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
the canvas less a minimum margin — `MIN_MARGIN_RATIO = 0.02` of the shorter canvas
side — not to the safe box. Turning on a frame therefore consumes
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

## Structural decision 3 — WITHDRAWN

**The shadow rework was built, then reverted in full on 2026-09-02 at Rock's
instruction.** The shadow keeps the single strength slider it already had. Item 8
of the item list ("Real shadow control — distance, angle, blur, directional") is
withdrawn from this round, not deferred: it was built, it worked, and the churn
around it was not worth the feature. See the REVERTED note at the head of Cycle
A's Task 5 in the plan for what went wrong and what is worth keeping if it is
ever revisited.

The reasoning below is retained because the *guard* it describes is sound and
would apply to any future attempt.

## Structural decision 3 (withdrawn) — the shadow rework gets an isolated guard

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

**Task 5b, after Rock used it.** Three corrections, none of them to what is
drawn at the defaults:

- **Finish shows one shadow slider.** Strength stays in the panel; distance,
  angle, softness and directional move behind a collapsed **Advanced shadow
  settings** disclosure, mirroring the Screen Studio panel Rock supplied.
- **Angle is subordinate to Directional** — ordered under it, indented, and
  disabled while it is off. Task 5 left it enabled on the argument that a
  vanishing control confuses; a control that moves while nothing changes
  reads as broken, which is worse.
- **`blur` is called Softness in the UI, and its lower bound is no longer
  zero.** The name would otherwise collide with the Background blur above.
  The bound is `SHADOW_BLUR_RANGE = [0.035, 0.40]`: at 0 the two layers stop
  being a blur and become two hard-edged rectangles — which is both the
  "sharp shadow" and the "two shadows" Rock reported. 0.035 is 42.0px of
  `shadowBlur` (the worst measured requirement for the shadow's own edge to
  fall below 1% Weber contrast, over seven canvas sizes and the whole
  distance range, **measured in Chromium**) divided by 1200, the canvas
  height the default and the frozen golden both live at. The config field
  stays `shadow.blur`; it is `ctx.shadowBlur`.

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

Rewritten in Task 3b. The first version of this section set the floor at AA and
Task 3 duly tuned tokens to sit just above it. Rock's read of the result:
*"still dim. I think our greys need to get closer to white. I feel like we
using 'pass' as the floor... even the placeholder 'square' on the center of the
page is so dim that I can barely see the dashed lines and the ratio on the
corner."* Both halves of that are addressed below — the floor was too low, and
the audit measured text only while every border and graphic went unchecked.

Dark theme only; the light theme remains a later cycle, built from scratch.

1. **Informational text: at least 7:1** against every surface it sits on. Not
   4.5. AA is a legal minimum, not a design target, and a token pushed down to
   it is a token that will read as dim.

2. **Ladder separation: at least 1.2:1** between adjacent rungs of the text
   ladder. Lifting must not compress: five rungs 1.2 apart above a 7:1 floor
   need 14.52:1 at the top, and pure white on the lightest text-bearing surface
   gives 16.86:1, so the design has 1.16x of total headroom. A sixth rung
   cannot come from a plain colour and would have to come from a lighter
   surface underneath it, or from a non-colour cue.

3. **Interactive component boundaries and meaningful graphics: at least 3:1**,
   measured against the lightest surface the element is drawn on. This covers
   control and input borders, the slider track, focus rings, status
   indicators, and the empty state's dashed frame and its ratio label. A
   logotype (the app-mark glyph on the brand gradient) is exempt from the text
   threshold per WCAG 1.4.3 and is held to this one instead.

4. **Purely decorative separators and the dot grid: 1.8-2.5:1.** No WCAG
   obligation applies, so the floor is a visibility judgement — but the range
   has a **ceiling as well as a floor**, and that is deliberate. Pane
   separators pushed to 3:1 on a dark UI stop reading as separators and start
   reading as a wireframe. Within the range, weight is set by how much of the
   element there is: long, repeated lines (pane and section edges) take the
   bottom, sparse marks (the dot grid, a short divider) take the top.

5. **Inert and disabled states: explicit colours at full alpha, never
   `opacity`.** Opacity composites toward whatever is behind the element — on
   this app the darkest surface on screen — so it spends lightness on the
   ground instead of on the thing being dimmed, and destroys contrast far
   faster than it reduces apparent brightness. `opacity: 0.42` on an inspector
   section ran 3.56:1 at the top down to 1.85:1 at the bottom, and the bottom
   rung carried every section label in the panel.

   Every off state — `[inert]` sections and every disabled control alike —
   re-declares the live tokens on itself at a single flat tone landing
   3:1-3.5:1: dimmer than 0.42 gave its brightest element, and far brighter
   than 0.42 gave its dimmest. Off is flat, because "unavailable" is one state
   and not five. Inert control borders are deliberately allowed below 3:1;
   WCAG 1.4.11 exempts inactive components, and a border as strong as a live
   one does not read as unavailable.

   **`web/style.css` carries no static `opacity` below 1 outside
   `@keyframes`.** That is the enforceable form of this item, and it is
   enforced: a guard that reads token values cannot see a composited colour,
   which is how nine rules survived the first pass with a green suite.

   Dimming is not always an off state. A control that is live and clickable but
   not currently in effect is informational, owes the full 7:1 of item 1, and
   dims by stepping down the ladder — not by joining the inert tone and not by
   compositing.

`web/tokens.css` remains the only file in `web/` allowed to hold a raw hex, and
`test/contrast.test.js` is the enforcement: it derives every pairing from
`web/style.css` and asserts all five items above.

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
inspector and so cannot collide: contrast (19), label spacing (11), Ground
dedup (12). Contrast rides here deliberately rather than waiting two cycles.

**B — Background and selection.** Item 7's restructure, item 10's selection
model, the rendered preset tiles, Angle (17), per-control Resets (18).

**C — Shell.** Zoom and pan (15), new/close project (14), nameable custom sizes
(13), export dropdown (16).

Each cycle is its own plan, run task by task, stopping after every task.

## Carried forward — controls that do nothing, from Rock 2026-09-02

Found while approving Task 6, and it sharpens the Cycle B selection model.

**Frames apply to the web element only.** `layout()` gives `out.web` a `chrome`
block; `out.phones` never gets one — phones are always drawn as phone bodies.
So dropping a portrait screenshot puts the app in the `mobile` layout, where
`frameKind` has nothing to act on. Rock: *"Browser and None don't do anything…
but then I shouldn't be able to select them, right?"* Padding and corner radius
are the same: `phoneBox()` takes neither, so both sliders are inert in that
layout.

**And the asymmetry he spotted is the real finding:** *"on the other hand, you
do allow me to add a phone border on a desktop screenshot. shouldn't it work the
same way?"* A phone frame around a web screenshot works; a browser frame around
a mobile screenshot does not exist. That is not a decision — it is `frameKind`
having been attached to one element while the mobile layout has its own hardcoded
device. The per-element `elements: { web, mobile }` block in "Structural decision
1" is what makes the two symmetric, so this is evidence for that design rather
than a separate feature.

**Two things to settle when it is built:**

1. **Inert controls must say so.** A control that appears to work and does not
   is the defect this whole round exists to remove. Disable them, using Task 3b's
   explicit-colour treatment — never `opacity`, which the stylesheet no longer
   permits outside `@keyframes`.
2. **Phones should probably take a corner radius.** Rock: *"shouldn't we allow
   'some' adjustment for corner radius on mobile? I think android phones can have
   a different ratio."* `PHONE_RADIUS_RATIO` is a fixed 0.125 of the phone's
   width. Exposing it needs a bounded range — a phone with square corners or with
   a radius past half its width stops reading as a phone — so it is a range
   question, not a slider question.

## Carried forward — corner radius is inert under a frame, from Rock 2026-09-03

Found while approving Task 7. *"corner radius slider is not working when
browser is selected. it either should, or the control should be disabled."*

He is right, and it is worse than the browser: `c.radius` reaches the canvas
only on the unframed path. `paintWebChrome` rounds the window to
`chrome.radius` (`BROWSER_RADIUS_RATIO`, a fixed 25/1064 of the frame's
width) and draws the screenshot inside it as a plain rect; `paintPhoneChrome`
rounds to `PHONE_RADIUS_RATIO`, a fixed 0.125. So the Corner radius slider is
fully inert under BOTH frames, not just Browser — the same defect as the
inert Padding and Frame controls in the `mobile` layout, in a third place.

**This is now three findings with one cause**, and they should be fixed
together rather than patched one at a time:

- Browser and None do nothing in the `mobile` layout
- Padding and Corner radius do nothing in the `mobile` layout
- Corner radius does nothing under either frame in the `web` layout

Every one of them is a control bound to the element that happens to be drawn
unframed. The per-element `elements: { web, mobile }` block in "Structural
decision 1" is the fix; until it lands, the interim rule stands: **a control
that cannot act must be disabled**, with Task 3b's explicit-colour treatment
and never `opacity`.

**Which way for corner radius, when it is built.** Prefer making it WORK over
disabling it. A browser window's own corner is a real, adjustable thing, and
the phone already wants a bounded radius for the same reason (see the
carried-forward note above). Disabling is the fallback if the frame's radius
turns out to be tied to geometry that cannot move.

## Mesh is built, and withheld — Rock 2026-09-03

Item 9 of the list ("Mesh rebuilt so it is worth having") was built in Cycle
A Task 9 and passes all three gates it was given: it spans real hue variety,
`spread`/`stops`/`seed` each steer it, and it does not go muddy at the widest
spread. Rock then used it:

> *"honestly, I can barely see anything. like, I can see it on your
> screenshots, but when there's a screen on top, there isn't much to see, and
> our current colors are very faint. I'm not sure about this. would it be a
> good idea to turn mesh option off for now and revisit it later?"*

**He is diagnosing it correctly, and the diagnosis is why this is a hide and
not a delete.** A shot is a screenshot with a border of ground around it. Any
ground effect only has that border to work in, and on a pale palette the
border shows almost nothing — the linear gradient included. What fails is the
palette, not the mesh: rendered on a saturated ground the same mesh is
unmistakable.

So the way in is closed (`UI_BG_TYPES` in `web/inspector-background.js`) and
nothing else is: `paintMesh`, the `mesh` config block, `MESH_*` in presets,
both goldens and all sixteen tests stay, fully guarded. Restoring it is one
line.

**Revisit it after the palette work**, which is already in this spec's
Background section — bigger, truer preset tiles and a stronger set of
grounds. Mesh should be judged again then, on a ground that can carry it, and
with a shot on top rather than on its own. If it still cannot be seen at that
point, delete it rather than hiding it a second time.

## Carried forward — Background panel, from Rock 2026-09-02

Raised while approving Task 5, and explicitly deferred by him: *"I guess this
is for another phase, but already leaving this feedback here."*

**Preset rows need a full-width click target.** *"the color names's clickable
area should be the whole row, like we have for templates. short names atm have
also a short click target."* Cycle A Task 2 fixed exactly this for the template
and ratio rows — `.template-row` shrink-wrapped to its text, so a short name
gave a short target, and `width: 100%` fixed it. The Background panel's preset
rows have the same defect and did not get the same fix. Reuse the reasoning,
and check the sampled row and the type cells while there.

**A preset sets the hue but not the angle.** *"selecting a background changes
the hue, but not the angle. why?"* Because nothing wires them together: a
preset writes `forceHue` only, and `angle` is an independent field defaulting
to `DEFAULT_ANGLE` (166°). That is not a decision anyone took — it is how the
CLI's flags happened to map. Whether a preset should carry its own angle (so
each named ground has a considered direction) is a real design question for the
type-first rebuild, where each type gets its own set.

**Background blur belongs here too.** Rock described Screen Studio's control:
it blurs a *wallpaper* — waves, glass reflections. It is meaningless against a
flat gradient, so it only becomes real once the Background rebuild has image or
generated-wallpaper types. Do not confuse it with the shadow's own softness,
which is a different control that Cycle A Task 5b renames for exactly this
reason.

## Carried forward — a dark ground

Raised by Rock 2026-09-02: *"in the ground tone, why don't we have dark
anymore? or you never had it?"* and, clarifying: *"by dark I mean like a black
(or near black) option."*

**It never existed.** `TONES` has only ever been `['light', 'mid']`, and both
branches of `tail()` in `core/ground.js` produce *light* grounds — the "light"
branch at HSL lightness 0.975/0.925/0.868, the "mid" branch at
0.855/0.780/0.712. "Mid" means *less pale*, not dark, and it is selected
automatically when the screenshot itself is dark (`darkUI = lum < 0.34`), on the
inherited premise that a near-white ground blows out around a dark UI. A
genuinely dark ground — lightness around 0.15 — exists nowhere in the tool.

The label is misleading: "Mid" reads as the middle of a range that includes
dark, and there is no such range.

**This is a new feature, not a restoration**, and it belongs in Cycle B's
type-first Background rebuild, where sampled lives inside each type — a sampled
*dark* ground is exactly what that structure should make reachable. It also
wants a rename, since "Light / Mid" stops making sense once a third option
exists.

Note the knock-on: `paintWeb` fills the screen with `#ffffff` behind the
screenshot, and `paintShadow`'s alphas were verified against pale grounds. Both
want re-checking against a near-black ground before it ships.

## Carried forward — the accent colour

Raised by Rock 2026-09-02, after approving Task 3b: *"I think we are too BW and
not using our main accent color (which seems to be purple maybe?). just hold
this suggestion for later."*

He is right that it is barely used. The palette has `--color-brand-start`
`#5b6cff` and `--color-brand-end` `#a24ff0` — an indigo-to-purple gradient — and
they appear on exactly one thing, the app-mark glyph. Everything else in the
chrome is neutral. The contrast work of Task 3/3b raised the greys but did not
introduce any colour, so the app is now a brighter greyscale rather than a
brighter design.

**Deliberately not acted on in Cycle A.** Introducing an accent is a visual
identity decision, not a contrast fix, and folding it into a task about
readability is how the two would get confused. Candidates when it is taken up:
selected states in the rail and template list, the active segmented cell, focus
rings, slider fills, and the sampled-ground indicator — all places where the
app currently says "active" with lightness alone.

Any accent must clear the same bars Task 3b set: 3:1 as a component boundary,
7:1 if it carries text, in both themes once the light theme exists.

## Out of scope

- The light theme — still its own later cycle, designed from scratch, not
  derived from the handoff's option 1b.
- Named device frames. `phone` stays deliberately unnamed.
- Saved projects and saved presets, beyond named custom sizes.
- Background images or bundled wallpapers.
- Cross-browser verification. One engine, as every round so far.
