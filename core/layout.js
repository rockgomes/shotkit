import {
  PHONE_FALLBACK_RATIO,
  PHONE_RADIUS_RATIO,
  PHONE_BEZEL_RATIO,
  PHONE_BEZEL_MIN,
  BROWSER_BAR_RATIO,
  BROWSER_RADIUS_RATIO,
  BROWSER_RADIUS_RANGE,
  PHONE_RADIUS_RANGE,
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
// Kept as its own small function on purpose: it is the ONE place an outset
// is declared. Task 7 plugged the stroke in here and Task 8 changes
// BROWSER_BAR_RATIO, both without touching webBox below.
//
// Task 7: the stroke wraps EVERYTHING else - it is the outermost ring, so
// it is added to all four edges of every kind, including 'none'. It is
// reported separately as `stroke` as well, because the painters need to
// know how far in the frame body starts; the four edge totals already
// include it, so nothing that consumes them double-counts.
//
// `shorterSide` (not screenW) is the stroke's unit, matching how `pad` and
// MIN_MARGIN_RATIO are measured: a mat should keep the same visual weight
// whatever ratio the screenshot happens to be, whereas a bezel belongs to
// the device and scales with it.
function frameInsets(c, el, screenW, shorterSide) {
  const sw = el.stroke.style === 'none' ? 0 : shorterSide * el.stroke.width;
  if (el.frameKind === 'none') {
    return { top: sw, right: sw, bottom: sw, left: sw, stroke: sw };
  }
  if (el.frameKind === 'phone') {
    const bezel = Math.max(PHONE_BEZEL_MIN, screenW * PHONE_BEZEL_RATIO);
    return {
      top: bezel + sw, right: bezel + sw, bottom: bezel + sw, left: bezel + sw,
      stroke: sw,
    };
  }
  return {
    top: screenW * BROWSER_BAR_RATIO + sw, right: sw, bottom: sw, left: sw,
    stroke: sw,
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * The composite's OUTER corner - Cycle B Task 3.
 *
 * `el.radius` is null ("this frame's own corner") or a pixel count, the same
 * unit the flat `radius` has always used. Resolved HERE and not in
 * config.js, because the answer depends on which frame is on and on the
 * element's own width, and normalise() knows neither.
 *
 * The ranges are per frame because the shapes are not interchangeable - see
 * BROWSER_RADIUS_RANGE / PHONE_RADIUS_RANGE in presets.js. Clamping rather
 * than rejecting means a stale jobs.json or a slider at either stop still
 * produces a shape, never an inverted or self-intersecting one.
 *
 * ONE SOURCE, DELIBERATELY. chromeFor used to recompute this from its own
 * constant while webBox put `c.radius` on the box - two numbers for one
 * corner, and the box's was simply dead whenever a frame was on. That is
 * the shape this whole cycle exists to remove, so chromeFor now reads
 * `web.radius` instead of deriving its own.
 */
function radiusFor(c, el, w) {
  if (el.frameKind === 'phone') {
    return el.radius === null
      ? w * PHONE_RADIUS_RATIO
      : clamp(el.radius, w * PHONE_RADIUS_RANGE[0], w * PHONE_RADIUS_RANGE[1]);
  }
  if (el.frameKind === 'browser') {
    return el.radius === null
      ? w * BROWSER_RADIUS_RATIO
      : clamp(el.radius, w * BROWSER_RADIUS_RANGE[0], w * BROWSER_RADIUS_RANGE[1]);
  }
  // No frame: the screenshot's own corner, and its default is the canvas-
  // derived `c.radius` normalise() already resolved - unchanged, which is
  // why every frameless golden holds.
  return el.radius === null ? c.radius : Math.max(0, el.radius);
}

// Cycle B Task 2: `el` is the resolved element block (c.elements.web or
// c.elements.mobile); `c` keeps only what belongs to the CANVAS - w, h,
// pad, radius. That split is the whole point: a frame is a property of a
// thing in the shot, not of the shot.
//
// A CONSUMER of insets that are already final, not a re-deriver of them:
// `screen` is carried through from webBox's step 1 rather than subtracted
// back out of the composite, which is why its ratio cannot drift from the
// source image's. `frame` (the bezel) and `barH` are always present on the
// returned object, even when 0, so render.js never branches on which fields
// exist for which kind.
function chromeFor(c, el, web, ins, screenW, screenH) {
  if (el.frameKind === 'none') return null;
  // ONE source for the corner: webBox already resolved it through
  // radiusFor. Recomputing it here is what let the box and its chrome
  // disagree.
  const radius = web.radius;
  // `barH` is a TITLE BAR, not "the top inset": a phone's top inset is its
  // bezel and is reported as `frame`, exactly as it always was, so
  // `screen.y === web.y + barH + frame` still holds for both kinds and
  // nothing double-counts. (The plan's sketch had `barH: ins.top`
  // unconditionally, which would have handed the phone a 9px title bar and
  // broken paintPhoneChrome's documented "chrome.barH is 0" contract.)
  //
  // Task 7: every field below is net of the stroke, because the frame sits
  // INSIDE the mat. `ins.top`/`ins.left` carry the stroke (frameInsets adds
  // it to all four edges), so the bar height and the bezel each subtract it
  // back out - otherwise a mat would silently make the title bar taller and
  // the bezel thicker. `screen` is the one field that does NOT subtract: it
  // is an absolute position, and the screenshot really does start a full
  // stroke-plus-bezel in from the composite's outer edge.
  const frame = el.frameKind === 'phone' ? ins.left - ins.stroke : 0;
  // The frame body's own corner, concentric inside the mat: one stroke
  // width tighter than the composite's outer radius. With no stroke this is
  // `radius` unchanged.
  const bodyRadius = Math.max(0, radius - ins.stroke);
  return {
    kind: el.frameKind,
    barH: el.frameKind === 'phone' ? 0 : ins.top - ins.stroke,
    frame,
    radius,
    bodyRadius,
    innerRadius: Math.max(0, bodyRadius - frame),
    screen: {
      x: web.x + ins.left,
      y: web.y + ins.top,
      w: screenW,
      h: screenH,
    },
  };
}

function webBox(c, el, box, ratio) {
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
  const ins = frameInsets(c, el, sw, Math.min(c.w, c.h));
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
    stroke: ins.stroke * shrink,
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

  const web = { x, y, w: ow, h: oh };
  // The composite's outer corner, which under a frame is the FRAME's corner
  // and not the screenshot's - see radiusFor above.
  web.radius = radiusFor(c, el, ow);
  // Task 7. `inner` is the composite MINUS the mat: what every painter
  // actually draws into, and what the render tests measure the picture
  // against. With no stroke it is `web`'s own rect to the last ULP
  // (s.stroke is exactly 0, and c.radius is never negative), which is why
  // the frozen goldens cannot move.
  web.strokeWidth = s.stroke;
  web.inner = {
    x: web.x + s.stroke, y: web.y + s.stroke,
    w: ow - s.stroke * 2, h: oh - s.stroke * 2,
    radius: Math.max(0, web.radius - s.stroke),
  };
  web.chrome = chromeFor(c, el, web, s, sw, sh);
  return web;
}

/**
 * A phone box, built exactly the way webBox builds a web one - Cycle B
 * Task 4.
 *
 * It used to be its own little model: `h` was the DEVICE's outer height and
 * the screen was carved out of it by insetting a bezel, with `frame` and
 * `innerRadius` reported as bespoke fields. That is the inset model Cycle A
 * Task 6 replaced everywhere else, and keeping it here is why the mobile
 * layout could not take any frame but a phone: there was nothing for
 * `frameKind` to act on.
 *
 * Now `h` is the SCREENSHOT's height and the frame grows outward from it,
 * through the same `frameInsets` and `chromeFor` the web box uses. Turning
 * the bezel off therefore makes the picture bigger rather than leaving a
 * hole where the bezel was - and a phone in the mobile layout, a phone
 * frame around a web shot, and a browser frame around a portrait shot are
 * all one piece of geometry instead of three that agree by accident.
 *
 * NO MIN_MARGIN SHRINK HERE, unlike webBox. A phone in the web+mobile
 * layout deliberately bleeds past the canvas edge (see layout() below), so
 * a floor that pulled it back would fight the composition on purpose.
 */
/**
 * The sizes a phone box will have, without placing it.
 *
 * Split out because layout() needs the OUTER width before it can position
 * anything: the stagger's step and the web+mobile offset are both fractions
 * of the device's outer width, and were so before this task too - `h` used
 * to be the device's own height, so `h * ratio` was its outer width. Now
 * that `h` is the screenshot's height, the outer width has to be asked for
 * rather than assumed, or the arrangement quietly tightens by two bezels.
 */
function phoneMetrics(c, el, ratio, h) {
  // The screenshot's own box. Width follows the SOURCE ratio, so the
  // picture is never squashed.
  const sh = h;
  const sw = sh * (ratio || PHONE_FALLBACK_RATIO);
  // Grow the frame outward from it - the same call webBox makes.
  const ins = frameInsets(c, el, sw, Math.min(c.w, c.h));
  return { sw, sh, ins, ow: sw + ins.left + ins.right, oh: sh + ins.top + ins.bottom };
}

function phoneBox(c, el, ratio, h, cx, cy) {
  const { sw, sh, ins, ow, oh } = phoneMetrics(c, el, ratio, h);

  const box = { x: cx - ow / 2, y: cy - oh / 2, w: ow, h: oh };
  box.radius = radiusFor(c, el, ow);
  box.strokeWidth = ins.stroke;
  box.inner = {
    x: box.x + ins.stroke, y: box.y + ins.stroke,
    w: ow - ins.stroke * 2, h: oh - ins.stroke * 2,
    radius: Math.max(0, box.radius - ins.stroke),
  };
  box.chrome = chromeFor(c, el, box, ins, sw, sh);
  return box;
}

export function layout(c, sources) {
  const safe = safeBox(c);
  const mobile = (sources.mobile || []).slice(0, 3);
  const out = { safe, web: null, phones: [] };

  if (c.layout === 'web' && sources.web) {
    out.web = webBox(c, c.elements.web, safe, sources.web);
  }

  else if (c.layout === 'mobile' && mobile.length) {
    // 1-3 phones, staggered. Middle one sits highest.
    const n = mobile.length;
    const ph = c.h * (n === 1 ? 0.86 : 0.80);
    // The device's OUTER width, not the screenshot's - see phoneMetrics.
    const pw = phoneMetrics(c, c.elements.mobile, mobile[0], ph).ow;
    const step = pw * 0.86;               // slight overlap
    const total = step * (n - 1);
    for (let i = 0; i < n; i++) {
      const cx = c.w / 2 - total / 2 + i * step;
      const lift = n === 2
        ? (i === 0 ? c.h * 0.030 : -c.h * 0.030)
        : (i === 1 ? -c.h * 0.035 : c.h * 0.028);
      out.phones.push(phoneBox(c, c.elements.mobile, mobile[i], ph, cx, c.h / 2 + lift));
    }
  }

  else if (c.layout === 'web+mobile' && sources.web) {
    out.web = webBox(c, c.elements.web, safe, sources.web);
    if (mobile.length) {
      // The phone rises out of the bottom-right corner. Letting it bleed past
      // the bottom edge reads as deliberate layering and buries less of the
      // app than a phone parked in the middle of the right-hand side.
      const ph = c.h * c.phoneScale;
      const pw = phoneMetrics(c, c.elements.mobile, mobile[0], ph).ow;
      const cx = safe.x + safe.w - pw * 0.46;
      const cy = c.h / 2 + c.h * c.phoneBleed;
      out.phones.push(phoneBox(c, c.elements.mobile, mobile[0], ph, cx, cy));
    }
  }

  return out;
}
