import {
  PHONE_FALLBACK_RATIO,
  PHONE_RADIUS_RATIO,
  PHONE_BEZEL_RATIO,
  PHONE_BEZEL_MIN,
  BROWSER_BAR_RATIO,
  MACOS_BAR_RATIO,
  BROWSER_RADIUS_RATIO,
} from './presets.js';

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

function chromeFor(c, web) {
  // The outer frame takes exactly the box the screenshot used to occupy
  // (computed above, untouched by frameKind) - so a framed shot is never
  // larger or smaller than an unframed one at the same settings. The
  // screenshot itself moves inside that same box, shorter by the bar
  // height: `screen` is carved out of `web`, not the other way around. This
  // must run strictly after the box above is finalised, and must take no
  // other branch when frameKind is 'none', so the pre-frame output stays
  // provably untouched.
  if (c.frameKind === 'none') return null;

  const w = web.w;

  if (c.frameKind === 'iphone') {
    // No title bar - the phone's whole body is screen. Reuses the exact
    // same corner-radius and bezel math as phoneBox() below, so an iPhone
    // frame around a web shot looks like the same device as the mobile
    // layout's phones.
    const radius = w * PHONE_RADIUS_RATIO;
    const bezel = Math.max(PHONE_BEZEL_MIN, w * PHONE_BEZEL_RATIO);
    return {
      kind: 'iphone',
      barH: 0,
      screen: { x: web.x, y: web.y, w: web.w, h: web.h },
      radius,
      innerRadius: radius - bezel,
    };
  }

  // browser / macos: a title bar sits above the screenshot. Bar height and
  // frame radius are fractions of the frame's own width (see presets.js for
  // the mockup arithmetic behind each ratio).
  const barH = w * (c.frameKind === 'macos' ? MACOS_BAR_RATIO : BROWSER_BAR_RATIO);
  const radius = w * BROWSER_RADIUS_RATIO;
  return {
    kind: c.frameKind,
    barH,
    screen: { x: web.x, y: web.y + barH, w: web.w, h: web.h - barH },
    radius,
    // The mockup's screenshot area sits flush against the frame body - no
    // padding between the image-slot and its parent - so there is no bezel
    // to subtract here, unlike the phone. innerRadius equals the outer
    // radius; Task 5's painter is responsible for only rounding the bottom
    // corners, since the top ones are flush with the bar.
    innerRadius: radius,
  };
}

function webBox(c, box, ratio) {
  // In "contain" the screen takes the image's own ratio so NOTHING is ever
  // cropped. "cover" fills the box and accepts the crop.
  let w = box.w, h = box.h;
  if (c.fit === 'contain') {
    if (ratio > box.w / box.h) { w = box.w; h = box.w / ratio; }
    else                       { h = box.h; w = box.h * ratio; }
  }
  const x = box.x + (box.w - w) / 2;
  const y = box.y + (box.h - h) / 2;
  const web = { x, y, w, h, radius: c.radius };
  web.chrome = chromeFor(c, web);
  return web;
}

function phoneBox(ratio, h, cx, cy) {
  // phone width follows the source ratio, so the screenshot is never squashed
  const w = h * (ratio || PHONE_FALLBACK_RATIO);
  const frame = Math.max(PHONE_BEZEL_MIN, w * PHONE_BEZEL_RATIO);   // bezel thickness
  const radius = w * PHONE_RADIUS_RATIO;                            // phone corner radius
  return { x: cx - w / 2, y: cy - h / 2, w, h, frame, radius, innerRadius: radius - frame };
}

export function layout(c, sources) {
  const safe = safeBox(c);
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
