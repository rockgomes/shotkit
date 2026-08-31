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
