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
