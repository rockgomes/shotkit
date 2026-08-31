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
  bgType: 'linear',    // 'linear' | 'solid' | 'mesh'
  seed: 1,
};

// Screen corner radius, as a fraction of canvas WIDTH.
export const RADIUS_RATIO = 0.0133;

// Fallback aspect ratio for a phone whose image failed to measure.
export const PHONE_FALLBACK_RATIO = 0.462;

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
