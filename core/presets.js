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

// --- Browser frame geometry ---------------------------------------------
//
// REMEASURED IN CYCLE A TASK 8, AND THE OLD NUMBERS ARE GONE. Round one
// took these from the Backdrop handoff's own 425.6px-wide mockup, and the
// result was the first thing Rock said about the browser frame: "our
// current one is comically big and ugly". The bar was 7.5% of the window
// width; a real one is 4.1%.
//
// Source: the Figma community file *Apple iOS Browser Mockup - Safari &
// Chrome*, file key `ashXeowHsiwznytlLbuvuS`, page "Browser Mockup",
// symbols `Desktop / Safari / Light` (node 1:3179, 1280 wide) and
// `Desktop / Safari / Dark` (node 1:3209, 1268 wide). Read as LAYER
// GEOMETRY through the Figma MCP, not pixel-counted off a raster, so every
// number below is exact. The Light symbol is the one measured: it is the
// clean 1280 frame, where the Dark one is 1268 wide with its toolbar
// offset a stray -1px - authoring slop, not a design difference (the two
// agree on every value that matters: 53px bar, 24px window radius, 484x28
// pill, traffic lights 12px at x=21).
//
// It is a careful reconstruction of Safari rather than a screenshot of it,
// and that is CORRECT here: shotkit draws a stylised browser for a
// Dribbble shot, so the idealised form is the right register. A real
// screenshot would carry toolbar clutter and retina artefacts we would
// then have to strip back out.
//
// Every ratio is <measured px> / CHROME_REF_WIDTH - a fraction of the
// FRAME's own width, the same convention phoneBox() uses for the phone's
// bezel, so a frame drawn at any canvas size keeps identical proportions.

// AND THE DIVISOR IS NOT 1280, WHICH IS THE WHOLE POINT OF THIS CONSTANT.
//
// The reference window is 1280px wide, so dividing by 1280 draws its chrome
// at the size it would be if our frame were a 1280px browser window. It is
// not: at 3:2 the frame is 1675px wide, and every one of these ratios is
// then multiplied back up by that. The bar came out at 69px - correct as a
// proportion, and still visibly taller than the bar on a real desktop.
// Rock, after seeing the first rebuild: "I still feel like it's too big...
// in the small image the bar is almost as tall as the bar I have right now
// on my desktop. i think this could be, proportionally, about 1/4 shorter."
//
// He is describing a real property of browser chrome: its height is FIXED.
// A Safari window twice as wide still has a 53px toolbar - the chrome does
// not grow with the window, only the page does. Our frame is 1675px wide,
// so the honest divisor is the width of the window we are pretending to
// draw, not 1280.
//
// 1280 / 0.75 = 1706.67, which is Rock's "about 1/4 shorter" exactly. It
// also lands within 2% of 1675.2 - our actual frame width at 3:2 - so the
// bar now draws at very close to a literal 53 canvas pixels, which is what
// a real Safari bar would be. Two independent routes to the same number.
//
// EVERY RATIO BELOW SHARES THIS DIVISOR, deliberately. Shrinking the bar
// alone would leave a 28px pill in a 40px bar - the reference's internal
// proportions are what make it read as a browser, and they are preserved
// exactly. What changes is only how large the whole window chrome is
// relative to the screenshot inside it.
export const CHROME_REF_WIDTH = 1280 / 0.75; // = 1706.666...

// Bar (toolbar) height. `toolbar` (1:3181) is 1280 x 53 at y=0.
// WAS 10/133 = 0.0752, from the handoff's 32px bar on a 425.6px frame.
export const BROWSER_BAR_RATIO = 53 / CHROME_REF_WIDTH; // = 0.03105

// Outer window corner radius. THE ONE VALUE HERE THAT IS NOT THE
// REFERENCE'S. Safari's is 24: the `Desktop / Safari / Light` symbol itself
// carries `border-radius: 24px` with `overflow: clip`, so 24 is the corner
// the window actually shows. (Its `toolbar` child has its own 10px top
// corners, which the 24px clip overrides and which are therefore NOT the
// visible radius - do not use 10 here. `Body`, 1:3180, has no radius at all;
// it is a plain rect behind the clip.)
//
// Rock asked for less: "our base browser view can have less rounded
// corners. based on our sliders, 0.6% would be it." The Corner radius
// slider reads in percent of CANVAS width, so 0.6% is 10.8px on an 1800px
// canvas - and at 3:2 the frame is 1675.2px wide, so 11/1706.67 of the
// frame lands on 10.80px, which is 0.600% of the canvas exactly. Stated in
// the same <px>/CHROME_REF_WIDTH vocabulary as everything else so it stays
// comparable to Safari's own 24.
//
// A DELIBERATE CONSEQUENCE, so it is not a surprise later: the frameless
// screenshot's own corner is RADIUS_RATIO, 1.33% of canvas width, so
// turning the browser frame on now tightens the corner noticeably. The
// slider governs the former and this constant the latter; they are
// different corners on different objects, and Cycle B's per-element model
// is where they stop being two unrelated numbers.
export const BROWSER_RADIUS_RATIO = 11 / CHROME_REF_WIDTH; // = 0.006445

// Traffic lights. `Core / Traffic Lights (Big Sur)` (1:35) is 52 x 12 at
// x=21, y=20 in the bar, and its own SVG puts the three circles at cx 6,
// 26 and 46 with r=6 - so 12px across, 20px centre to centre, and the
// group's left edge 21px from the window's.
export const TRAFFIC_DOT_RATIO = 12 / CHROME_REF_WIDTH;    // = 0.00703, diameter
export const TRAFFIC_GAP_RATIO = 20 / CHROME_REF_WIDTH;    // = 0.01172, centre to centre
export const TRAFFIC_INSET_RATIO = 21 / CHROME_REF_WIDTH;  // = 0.01230, frame edge to first dot's edge

// URL pill. `URL Form` (4008:386) is 484 x 28 at x=398, y=12. It is
// CENTRED, not flowed after the dots: 398 + 484/2 = 640, exactly half of
// 1280, and the Figma node carries `left:50%; translateX(-50%)` to say so.
// Round one's pill filled whatever width was left after the dot group,
// which is why it never lined up with anything.
export const URL_PILL_WIDTH_RATIO = 484 / CHROME_REF_WIDTH;   // = 0.28359
export const URL_PILL_HEIGHT_RATIO = 28 / CHROME_REF_WIDTH;   // = 0.01641

// Pill corner radius, read off the `URL Background` SVG's own path
// (`M0 9.6 C ...`): 9.6px on a 28px-tall pill. WAS 25/2128 = 0.01175,
// which against the new 28px pill would be 15px - past half its height, so
// it would have collapsed into a stadium.
export const URL_PILL_RADIUS_RATIO = 9.6 / CHROME_REF_WIDTH; // = 0.005625

// Pill text size. `URL Address` (4008:390) is SF Pro Display Medium 14px.
// WAS 5/224 = 0.0223, sized for the old 45/1064 pill; at 1280 that is
// 28.6px, which would not fit inside a 28px pill at all. This is the
// change that makes the URL legible instead of clipped.
export const URL_PILL_FONT_RATIO = 14 / CHROME_REF_WIDTH; // = 0.0082

// Vertical placement, stated once because both groups share it: the dots
// (20 + 12/2 = 26) and the pill (12 + 28/2 = 26) are both centred in the
// 53px bar, whose own centre is 26.5. The half-pixel is authoring slop;
// paintChrome centres both and does not reproduce it.

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

// The composite (screenshot + chrome, and from Task 7 the stroke too) grows
// OUTWARD from the screenshot and is allowed to consume the safe area's
// padding — that is what makes turning on a frame leave the screenshot's own
// size alone (see the spec's "frames and strokes are outsets"). This is the
// floor it may not cross: a fraction of the shorter canvas side, kept as
// breathing room at the canvas edge. It is a floor, not the normal path —
// only a composite that would otherwise cross it is scaled down, and then
// uniformly, screenshot included.
export const MIN_MARGIN_RATIO = 0.02;

// --- Strokes (Cycle A Task 7) -------------------------------------------
// An opt-in mat around the shot. Round one stroked an inset hairline on
// every unframed screen and Rock read it, correctly, as an unrequested
// border; Task 1 deleted it. This is the deliberate version of the same
// idea - the white/glassy edge in the Dribbble references he sent - and it
// is 'none' by default, so nothing gains an edge it did not ask for.
export const STROKE_STYLES = ['none', 'light', 'glass', 'custom'];

// Width is a fraction of the SHORTER canvas side, like every other
// proportional value here, so a stroke keeps its visual weight across ratios.
export const STROKE_WIDTH_RANGE = [0, 0.06];

export const STROKE_DEFAULTS = { style: 'none', width: 0.008, color: '#ffffff' };

// --- Mesh (Cycle A Task 9) ----------------------------------------------
//
// Mesh was two tints of ONE hue with a reroll button, which is why it could
// only ever look like a blotchier linear gradient. Rock: "I still don't know
// what mesh does. you're gonna need to show me the value of it."
//
// `stops` is how many distinct hues are placed. `spread` is the total hue
// arc in DEGREES they are distributed across, CENTRED on the ground's own
// hue - so a sampled mesh still belongs to the screenshot it came from, and
// spread 0 reproduces the single-hue behaviour exactly. That centring is
// what keeps core/ground.js's "the ground comes from the product" rule
// intact while still letting the mesh do something a linear ramp cannot.
//
// NO `seed` HERE, DELIBERATELY. `seed` already exists at the top level of
// the config, is already clamped, and already has a UI control. Giving it a
// second home inside this block would create two writable sources for one
// value - which is precisely how Task 5b killed the shadow slider: a nested
// default silently outranked the flat field, and the control went dead
// while still displaying the old number. One value, one home.
export const MESH_STOPS_RANGE = [3, 5];
export const MESH_SPREAD_RANGE = [0, 180];
export const MESH_DEFAULTS = { stops: 4, spread: 70 };

// --- Per-element settings (Cycle B) -------------------------------------
//
// Frame, stroke, corner radius and shadow are properties of a THING IN THE
// SHOT, not of the shot. Round two attached them to the config's top level,
// which in practice meant the desktop screenshot: on a mobile-only shot the
// Frame and Padding controls did nothing, corner radius did nothing under
// either frame, and a browser frame around a phone screenshot did not
// exist at all. Rock found all three separately; they are one cause.
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
