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
  pad: 0.052,          // fraction of the SHORTER canvas side, all four edges
  grain: 0.34,
  phoneScale: 0.86,
  phoneBleed: 0.10,
  url: null,           // browser URL pill text - null means the pill stays
                        // empty (see URL_PILL_FONT_RATIO below and Task 6)
  tone: null,          // null | 'light' | 'mid'
  bgType: 'linear',    // 'linear' | 'solid' | 'mesh'
  seed: 1,
  shadowScale: 1,      // 1 = frame.html's own alphas, unchanged - see
                        // SHADOW_SCALE_RANGE below and core/render.js's
                        // paintShadow doc comment.
};

// Task 6b: `shadowScale` is a MULTIPLIER applied on top of paintShadow's
// verified alphas (0.17/0.07 web+browser, 0.22/0.10 phone) - it is not, and
// must never become, a replacement for them. 1 (DEFAULTS.shadowScale above)
// reproduces frame.html's own values exactly; the range is bounded well
// past 1 in both directions purely so a UI slider has somewhere to go, not
// because either bound is itself a verified value. Exported here (rather
// than left as a magic 0/2 in core/config.js and web/inspector-frame.js) so
// both share the exact same bounds instead of two literals that could drift
// apart.
export const SHADOW_SCALE_RANGE = [0, 2];

// Cycle A Task 5: the rest of the shadow, as a config block.
//
// `distance` and `blur` are fractions of a BASE LENGTH, not pixels — the
// same proportional-geometry rule everything else in core/ follows. For the
// three canvas-sized call sites (paintWeb, paintWebChrome, paintPhoneChrome)
// that base is the canvas height, and 0.040 / 0.105 are exactly the
// `c.h * 0.040` and `c.h * 0.105` those call sites already hard-coded: the
// numbers moved into config without changing value.
//
// `angle` is degrees clockwise from the positive x-axis in CANVAS space,
// where y grows downward — so 90 is straight down, which is what the
// non-directional construction has always done, and 0 is to the right.
//
// `directional: false` is the shipped look: two layers, both offset
// straight down, angle ignored. `directional: true` offsets the direct
// layer along `angle`; the ambient layer follows at 0.28 of the distance,
// exactly as it already did downward.
export const SHADOW_DEFAULTS = {
  scale: 1,
  distance: 0.040,
  angle: 90,
  blur: 0.105,
  directional: false,
};

// Slider bounds, wide enough either side of the defaults to be worth
// dragging and no wider. Exported (rather than left as literals in
// core/config.js and web/inspector-frame.js) for the same reason
// SHADOW_SCALE_RANGE above is: one source of truth for the clamp, so the UI
// and normalise() cannot drift apart.
export const SHADOW_DISTANCE_RANGE = [0, 0.20];

// SOFTNESS (the UI's name for `blur`) HAS A FLOOR, AND THE FLOOR IS 0.035.
// Cycle A Task 5b. Rock: "blur is useless atm... you put it on zero and it
// becomes this weird thing with the 'shadow' being sharp" - and of the same
// render, "but still weird that we have 2 shadows, no?". One artefact, seen
// twice: at blur 0 paintShadow's two layers stop being a blur at all and
// become two hard-edged rectangles, offset by `distance` and
// `0.28 * distance`, each with a ~40-level step at its edge.
//
// 0.035 is measured, not chosen. The artefact is a visible EDGE, so the
// threshold is the classic Weber one - 1% of the background, 2.55 of 255
// levels per pixel, on the worst-case white ground - which here coincides
// with the render's own 8-bit banding, so "below it" also means "no sharper
// than the gradient it sits in". Bisecting for the smallest softness that
// clears it, over seven canvas sizes x the whole SHADOW_DISTANCE_RANGE, on
// the real boxes layout() produces:
//
//   twitter-header 1500x500   0.0674 = 33.7px    3:2  1800x1200  0.0311 = 37.2px
//   twitter-post   1600x900   0.0432 = 38.8px    4:3  2000x1500  0.0225 = 33.8px
//   16:9           1920x1080  0.0271 = 29.3px    insta 2160x2160 0.0107 = 23.1px
//   dribbble       2800x2100  0.0200 = 42.0px
//
// The requirement is a roughly constant number of PIXELS - 23-42 of
// shadowBlur, worst case 42.0 - because edge sharpness is per-pixel while
// this parameter is a fraction. No single fraction can hold at every canvas
// height, so the floor is pinned to the height the shipped default and the
// frozen golden both live at: 42.0 / 1200 = 0.035. Below 1200 tall the same
// fraction buys fewer pixels (at 1600x900 the worst step is 3 levels rather
// than 2 - marginal, and nothing like the 40 at softness 0).
//
// MEASURED IN CHROMIUM. @napi-rs/canvas renders the same shadowBlur far
// fainter and clears the same threshold at 0.005, a floor six times too
// low; at softness 0 the two engines agree exactly (21 levels), because
// there is no blur to disagree about. Same trap as the alphas that were
// once retuned to 0.40/0.30 with every Node test green. The full method and
// the two-layer fusion check are in the plan's Task 5b.
//
// The default 0.105 is far above the floor, so nothing about the shipped
// render moves: test/golden/shadow/default.png and all ten whole-shot
// goldens stay byte-identical.
export const SHADOW_BLUR_RANGE = [0.035, 0.40];

// THE PHONE'S SHADOW HAS ITS OWN, LARGER BASIS, AND ALWAYS HAS.
//
// core/render.js's paintPhone (the mobile-layout phone, not the phone FRAME)
// measures its shadow against the PHONE's own height, not the canvas's:
// `box.h * 0.055` and `box.h * 0.14`, paired with alphas 0.22/0.10. A phone
// is a fraction of the canvas tall, so a canvas-based distance would be far
// too big for it. (Task 5's plan sketch claims all four call sites pass
// `c.h * 0.040` / `c.h * 0.105`. Three do. This one never has — folding it
// onto the canvas basis would have silently changed every mobile shot, and
// moved a whole-shot golden this task is required not to move.)
//
// These two are that pairing, kept as ratios of the phone's height. A user
// distance/blur is carried across as a RATIO OF ITS OWN DEFAULT (see
// phoneShadow in core/render.js), so at the defaults the multiplier is
// exactly 1 and the phone's numbers come out bit-for-bit as they were.
export const PHONE_SHADOW_DISTANCE_RATIO = 0.055;
export const PHONE_SHADOW_BLUR_RATIO = 0.14;

// Screen corner radius, as a fraction of canvas WIDTH.
export const RADIUS_RATIO = 0.0133;

// Fallback aspect ratio for a phone whose image failed to measure.
export const PHONE_FALLBACK_RATIO = 0.462;

// Phone corner radius, as a fraction of the phone's own width. Pulled out of
// layout.js's phoneBox() (it used to be an inline 0.125 literal there) so
// the phone device frame below can share the exact same, already-verified
// value instead of duplicating it.
export const PHONE_RADIUS_RATIO = 0.125;

// Phone bezel thickness, as a fraction of the phone's own width, floored at
// 3px. Also pulled out of phoneBox() for the same reason: the phone frame's
// innerRadius reuses this exact bezel math.
export const PHONE_BEZEL_RATIO = 0.019;
export const PHONE_BEZEL_MIN = 3;

// Valid `frameKind` values for normalise(). 'none' means no device frame —
// the screenshot renders exactly as it always has. 'phone' describes the
// SHAPE (a bezelled, all-round-rounded body) rather than a specific device —
// deliberately not named 'iphone', so it never promises a device-size picker
// this v1 isn't opening; named devices can extend this frame later without a
// rename. macOS is deliberately absent: every image-slot in the mockup sits
// inside the same "browser" chrome, and "macOS" appears only as an inert
// inspector chip with no rendered frame anywhere in the handoff — shipping a
// bar-height constant for it would mean inventing a value the mockup doesn't
// contain. It comes back once it has an actual design.
export const FRAME_KINDS = ['none', 'browser', 'phone'];

// --- Device frame geometry ----------------------------------------------
// Source: design_handoff_backdrop_1a/Backdrop Mockups.dc.html, section
// id="1a" ("Obsidian" — the only in-scope screen per that folder's README;
// 1b/1c are explicitly out of scope, and were checked anyway: neither
// renders a browser frame at a different, disagreeing scale worth using,
// and neither renders a macOS or iPhone frame at all).
//
// The canvas artboard in 1a is 560x420px, and the browser frame inside it
// is sized to `width:76%` of that artboard (README: "Inside, browser frame
// at 76% width"). So the frame's own width in mockup pixels is:
//   frameW = 560 * 0.76 = 425.6
// Every ratio below is <measured mockup px> / 425.6 — a fraction of the
// FRAME's own width, the same convention phoneBox() already uses for the
// phone's bezel (w * 0.019) and corner radius (w * 0.125), so a frame drawn
// at any canvas size keeps identical proportions.

// Bar (title bar) height. HTML line ~101:
//   <div style="...height:32px;padding:0 11px;background:{{ fBg }};...">
// 32 / 425.6 = 10/133.
export const BROWSER_BAR_RATIO = 10 / 133; // ≈ 0.075188

// Outer frame corner radius (also the browser body's own radius — both are
// `border-radius:10px` on the same wrapper). HTML line ~100:
//   <div style="width:76%;border-radius:10px;...">
// 10 / 425.6 = 25/1064.
export const BROWSER_RADIUS_RATIO = 25 / 1064; // ≈ 0.023496

// Traffic-light dot diameter. HTML line ~102:
//   <span style="width:8px;height:8px;border-radius:50%;...">
// 8 / 425.6 = 5/266.
export const CHROME_DOT_RATIO = 5 / 266; // ≈ 0.018797

// Gap between the three traffic-light dots. HTML line ~102:
//   <div style="display:flex;gap:5px">...
// 5 / 425.6 = 25/2128.
export const CHROME_DOT_GAP_RATIO = 25 / 2128; // ≈ 0.011749

// Bar's own left/right padding. HTML line ~101: `padding:0 11px`.
// 11 / 425.6 = 55/2128.
export const CHROME_BAR_PADDING_RATIO = 55 / 2128; // ≈ 0.025847

// Gap between the dot group and the URL pill. HTML line ~101: `gap:8px` on
// the bar itself (coincidentally the same 8px as the dot diameter, but a
// distinct measurement — the bar's own flex gap, not the dot size).
// 8 / 425.6 = 5/266.
export const CHROME_BAR_GAP_RATIO = 5 / 266; // ≈ 0.018797

// URL pill height. HTML line ~103:
//   <div style="flex:1;height:18px;border-radius:5px;...">
// 18 / 425.6 = 45/1064.
export const URL_PILL_HEIGHT_RATIO = 45 / 1064; // ≈ 0.042293

// URL pill corner radius. Same element, `border-radius:5px`.
// 5 / 425.6 = 25/2128 (coincidentally equal to CHROME_DOT_GAP_RATIO — both
// are a real, distinct 5px measurement in the mockup).
export const URL_PILL_RADIUS_RATIO = 25 / 2128; // ≈ 0.011749

// URL pill text size, Geist Mono. HTML line ~103, same element as above:
//   font-family:'Geist Mono',monospace;font-size:9.5px
// 9.5 / 425.6 = 95/4256 = 5/224 exactly.
export const URL_PILL_FONT_RATIO = 5 / 224; // ≈ 0.022321

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

// Valid `layout` values for normalise(). Anything else is treated as absent
// and falls back to the existing web/mobile/web+mobile inference.
export const LAYOUTS = ['web', 'mobile', 'web+mobile'];

// Valid `tone` overrides for the ground's light/dark call. Anything else
// falls back to DEFAULTS.tone (null - infer from the screenshot's own
// luminance).
export const TONES = ['light', 'mid'];

// Valid `bgType` values - which ground painter core/render.js's paintGround
// dispatches to. Anything else falls back to DEFAULTS.bgType ('linear').
export const BG_TYPES = ['linear', 'solid', 'mesh'];

// Valid `chromeTheme` values for a 'browser' frameKind. Anything else falls
// back to 'dark'.
export const CHROME_THEMES = ['dark', 'light'];
