import {
  PHONE_FALLBACK_RATIO,
  PHONE_RADIUS_RATIO,
  PHONE_BEZEL_RATIO,
  PHONE_BEZEL_MIN,
  BROWSER_BAR_RATIO,
  BROWSER_RADIUS_RATIO,
  MIN_MARGIN_RATIO,
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

// Outset thickness the frame contributes, in units of the SCREEN's own
// width - never of the composite's, so nothing here feeds back on itself.
// Browser: a bar above and nothing else (the mockup's screenshot area sits
// flush inside the frame wrapper, with no padding between the image slot
// and its parent; the frame's own hairline is a stroke paintChrome draws,
// not a geometry offset). Phone: a real bezel on all four sides, reusing
// phoneBox()'s exact math so a phone frame around a web shot looks like the
// same device as the mobile layout's phones.
//
// Kept as its own small function on purpose: Task 7 extends it to
// frameInsets(c, screenW, shorterSide) and adds a `stroke` field to the
// same accumulation, and Task 8 changes BROWSER_BAR_RATIO, both without
// touching webBox below.
function frameInsets(c, screenW) {
  if (c.frameKind === 'none') return { top: 0, right: 0, bottom: 0, left: 0 };
  if (c.frameKind === 'phone') {
    const bezel = Math.max(PHONE_BEZEL_MIN, screenW * PHONE_BEZEL_RATIO);
    return { top: bezel, right: bezel, bottom: bezel, left: bezel };
  }
  return { top: screenW * BROWSER_BAR_RATIO, right: 0, bottom: 0, left: 0 };
}

// A CONSUMER of insets that are already final, not a re-deriver of them:
// `screen` is carried through from webBox's step 1 rather than subtracted
// back out of the composite, which is why its ratio cannot drift from the
// source image's. `frame` (the bezel) and `barH` are always present on the
// returned object, even when 0, so render.js never branches on which fields
// exist for which kind.
function chromeFor(c, web, ins, screenW, screenH) {
  if (c.frameKind === 'none') return null;
  const radius = c.frameKind === 'phone'
    ? web.w * PHONE_RADIUS_RATIO
    : web.w * BROWSER_RADIUS_RATIO;
  // `barH` is a TITLE BAR, not "the top inset": a phone's top inset is its
  // bezel and is reported as `frame`, exactly as it always was, so
  // `screen.y === web.y + barH + frame` still holds for both kinds and
  // nothing double-counts. (The plan's sketch had `barH: ins.top`
  // unconditionally, which would have handed the phone a 9px title bar and
  // broken paintPhoneChrome's documented "chrome.barH is 0" contract.)
  const frame = c.frameKind === 'phone' ? ins.left : 0;
  return {
    kind: c.frameKind,
    barH: c.frameKind === 'phone' ? 0 : ins.top,
    frame,
    radius,
    innerRadius: Math.max(0, radius - frame),
    screen: {
      x: web.x + ins.left,
      y: web.y + ins.top,
      w: screenW,
      h: screenH,
    },
  };
}

function webBox(c, box, ratio) {
  // Cycle A Task 6: frames are OUTSETS. Round one fitted the FRAME into the
  // safe box and carved the screenshot out of it, so turning a frame on made
  // the picture smaller - the thing Rock actually complained about. The
  // closed-form frameRatio() that made that round trip land back on the
  // source ratio is deleted, not adjusted: under this model the interior is
  // the STARTING point, so there is nothing to invert.
  //
  // 1. The screenshot's own box: the SOURCE ratio, fitted to the safe area,
  //    exactly as frameKind 'none' has always computed it. This is the size
  //    the screenshot keeps - nothing below changes it unless step 3 has to.
  //    The screen always takes the image's own ratio, so nothing is ever
  //    cropped ('fit'/'cover' were retired in Task 4).
  let sw, sh;
  if (ratio > box.w / box.h) { sw = box.w; sh = box.w / ratio; }
  else                       { sh = box.h; sw = box.h * ratio; }

  // 2. Grow outward. What gives way is the PADDING, not the picture - see
  //    the spec's "frames and strokes are outsets". For frameKind 'none'
  //    every inset is 0, so that path is provably the unchanged original.
  const ins = frameInsets(c, sw);
  let ow = sw + ins.left + ins.right;
  let oh = sh + ins.top + ins.bottom;

  // 3. The floor, and the only thing that can still shrink the screenshot:
  //    the composite may not cross MIN_MARGIN_RATIO of the shorter canvas
  //    side. Past it the WHOLE composite scales down uniformly, screenshot
  //    included, so the picture is scaled and never squashed.
  const m = MIN_MARGIN_RATIO * Math.min(c.w, c.h);
  const shrink = Math.min(1, (c.w - m * 2) / ow, (c.h - m * 2) / oh);
  ow *= shrink; oh *= shrink; sw *= shrink; sh *= shrink;
  const s = {
    top: ins.top * shrink, right: ins.right * shrink,
    bottom: ins.bottom * shrink, left: ins.left * shrink,
  };

  // 4. Centre the composite. The safe box is itself always centred on the
  //    canvas (both branches of safeBox() are symmetric), so centring in it
  //    and centring on the canvas are the same placement - a composite wider
  //    than the safe box simply gets a negative offset and still sits
  //    centred. It is written against the box, not the canvas, so the
  //    frameKind 'none' path evaluates the bit-identical expression it
  //    always did and the frozen pre-frame baseline stays exact to the last
  //    ULP (test/layout.test.js's PRE_FRAME_BASELINE compares with toEqual).
  const x = box.x + (box.w - ow) / 2;
  const y = box.y + (box.h - oh) / 2;

  const web = { x, y, w: ow, h: oh, radius: c.radius };
  web.chrome = chromeFor(c, web, s, sw, sh);
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
  const out = { safe, web: null, phones: [] };

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

  return out;
}
