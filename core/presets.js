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
  url: null,           // browser URL pill text - null means the pill stays
                        // empty (see URL_PILL_FONT_RATIO below and Task 6)
  tone: null,          // null | 'light' | 'mid'
  bgType: 'linear',    // 'linear' | 'solid' | 'mesh'
  seed: 1,
};

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

// Valid `fit` values. Anything else falls back to DEFAULTS.fit ('contain').
export const FITS = ['contain', 'cover'];

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
