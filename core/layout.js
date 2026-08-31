import {
  PHONE_FALLBACK_RATIO,
  PHONE_RADIUS_RATIO,
  PHONE_BEZEL_RATIO,
  PHONE_BEZEL_MIN,
  BROWSER_BAR_RATIO,
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
  // screenshot itself moves inside that same box, shorter by the bar height
  // and inset by the frame's own bezel: `screen` is carved out of `web`,
  // not the other way around. This must run strictly after the box above
  // is finalised, and must take no other branch when frameKind is 'none',
  // so the pre-frame output stays provably untouched.
  //
  // `screen` is genuinely the interior for every kind - the rect where the
  // screenshot goes, after both the bar and the bezel are subtracted - and
  // `frame` (the bezel thickness used to compute it) is always present on
  // the returned object, even when it's 0, so render.js never has to branch
  // on which fields exist for which kind.
  if (c.frameKind === 'none') return null;

  const w = web.w;
  const barH = c.frameKind === 'iphone' ? 0 : w * BROWSER_BAR_RATIO;
  const radius = c.frameKind === 'iphone' ? w * PHONE_RADIUS_RATIO : w * BROWSER_RADIUS_RATIO;
  // iPhone has a real bezel, reusing the exact same math as phoneBox()
  // below so an iPhone frame around a web shot looks like the same device
  // as the mobile layout's phones. The browser frame has none: the
  // mockup's screenshot area sits flush inside the frame wrapper, with no
  // padding between the image-slot and its parent (the frame's own 1px
  // hairline border is a stroke drawn by render.js's paintWebChrome, not a
  // geometry offset counted here).
  const frame = c.frameKind === 'iphone' ? Math.max(PHONE_BEZEL_MIN, w * PHONE_BEZEL_RATIO) : 0;

  return {
    kind: c.frameKind,
    barH,
    frame,
    screen: {
      x: web.x + frame,
      y: web.y + barH + frame,
      w: web.w - frame * 2,
      h: web.h - barH - frame * 2,
    },
    radius,
    innerRadius: radius - frame,
  };
}

function frameRatio(frameKind, s) {
  // The closed-form outer-frame ratio such that, once the bar (and for
  // iphone, the all-round bezel) is subtracted back out by chromeFor(), the
  // interior `screen` comes back at exactly the source ratio `s`. A frame
  // is sized BY its content - the way a real browser window is - not the
  // other way round. See the fix-round-2 section of the task report for
  // the full derivation; the short version:
  //
  // browser: only a top bar, spanning the full frame width, so
  //   frameH = screenH + frameW*B  =>  frameRatio = s / (1 + s*B)
  //
  // iphone: a bezel of thickness frameW*B on every side, so
  //   frameW = screenW / (1 - 2B)
  //   frameH = screenH + 2*frameW*B
  //   frameRatio = s / (1 + 2*B*(s - 1))
  //
  // Both formulas assume the bezel/bar is exactly a fraction of the frame's
  // own width - they do not account for PHONE_BEZEL_MIN's floor. That floor
  // only matters at frame widths below ~3 / PHONE_BEZEL_RATIO (~158px),
  // far smaller than any canvas this project ships (RATIOS/TEMPLATES in
  // presets.js all resolve to safe boxes well above that); chromeFor()
  // still applies the floor when it derives the real `frame` value, so a
  // pathologically small canvas would see a tiny, bounded mismatch between
  // this ratio and the actual bezel - not iterated away, and not expected
  // to occur at any size shotkit actually produces.
  if (frameKind === 'iphone') {
    const B = PHONE_BEZEL_RATIO;
    return s / (1 + 2 * B * (s - 1));
  }
  const B = BROWSER_BAR_RATIO;
  return s / (1 + s * B);
}

function webBox(c, box, ratio) {
  // In "contain" the screen takes the image's own ratio so NOTHING is ever
  // cropped. "cover" fills the box and accepts the crop - untouched by
  // frameKind, on purpose: only "contain" derives a frame from its content,
  // so cover's fill-and-crop behaviour never changes.
  //
  // When a frame is present, "contain" must fit the FRAME (screenshot + bar
  // + bezel) into the box, not the bare screenshot - fitting the bare
  // screenshot and then carving the bar/bezel back out of it (round 1's
  // approach) leaves `screen` at a different ratio than the source image.
  // frameRatio() is the adjusted ratio that makes the round trip exact.
  // When frameKind is 'none' this is `ratio` unchanged, so that path is
  // provably untouched.
  const fitRatio = (c.fit === 'contain' && c.frameKind !== 'none')
    ? frameRatio(c.frameKind, ratio)
    : ratio;

  let w = box.w, h = box.h;
  if (c.fit === 'contain') {
    if (fitRatio > box.w / box.h) { w = box.w; h = box.w / fitRatio; }
    else                          { h = box.h; w = box.h * fitRatio; }
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
