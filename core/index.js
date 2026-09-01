import { normalise } from './config.js';
import { layout } from './layout.js';
import { groundFor, groundFromMeta } from './ground.js';
import { paintGround, paintGrain, paintWeb, paintPhone, paintCaption } from './render.js';

// Sample at 800px, matching ground.py's thumbnail step. Rendering still uses
// the full-resolution source.
function sampleOf(image, makeCanvas) {
  const scale = Math.min(1, 800 / image.width, 800 / image.height);
  const w = Math.max(1, Math.floor(image.width * scale));
  const h = Math.max(1, Math.floor(image.height * scale));
  const cv = makeCanvas(w, h);
  const ctx = cv.getContext('2d');
  ctx.drawImage(image, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/**
 * Paint a full shot into `target`, and return the colour analysis alongside it.
 * `target` is anything with width, height, and getContext('2d').
 * `makeCanvas(w, h)` supplies scratch canvases; core never creates one itself.
 * `precomputedMeta` is optional (default null) — see the comment above where
 * it's used, just below. Omitting it is byte-identical to every call this
 * function has ever accepted.
 *
 * `images.mobile` entries that failed to load are dropped here (`filter(Boolean)`),
 * matching frame.html's own behaviour (`if (r) mobMeta.push(r)` in its load loop):
 * a phone whose screenshot never decoded is silently omitted rather than drawn
 * at layout.js's PHONE_FALLBACK_RATIO guess. Because that filtering happens
 * before `sources.mobile` and `mobile` are built, the two arrays layout.js and
 * this function use always stay the same length and in the same order, so
 * `lay.phones[i]` always corresponds to `mobile[i]` with no gaps to guard against.
 */
export function composeWithMeta(target, rawConfig, images, makeCanvas, precomputedMeta = null) {
  const web = images.web || null;
  const mobile = (images.mobile || []).filter(Boolean).slice(0, 3);

  const c = normalise({ ...rawConfig, hasWeb: !!web, mobileCount: mobile.length });

  // `precomputedMeta` is optional and additive: every existing caller omits
  // it and gets exactly the behaviour above always had — samples built from
  // the live images, fed to groundFor. A caller that already knows the
  // images, forceHue and tone are unchanged since it last got a `meta` back
  // from this function (the app's job to track, not core's) can hand that
  // `meta` back in here and skip both sample-building and groundFor's own
  // analysis entirely - measured, groundFor is essentially the whole cost of
  // a render (~200ms of ~216ms; layout, painting and grain together are
  // single-digit ms), and none of that cost has anything to do with
  // layout-only changes like `pad`. See test/compose.test.js's "precomputed
  // meta" cases for the byte-identity proof, and web/state.js for the one
  // caller that uses this.
  const meta = precomputedMeta || (() => {
    const samples = [web, ...mobile].filter(Boolean).map(im => sampleOf(im, makeCanvas));
    return samples.length
      ? groundFor(samples, c.forceHue, c.tone)
      : groundFor([{ width: 1, height: 1, data: [128, 128, 128, 255] }], c.forceHue, c.tone);
  })();

  // `scale` renders this SAME composition at `c.scale` times the canvas
  // size, rather than inflating the composition itself (c.w/c.h above stay
  // what normalise() reported - the size the caller asked for). Every
  // geometric quantity core/ computes is a fraction of the canvas passed to
  // it (or, for `radius`, a fraction of that fraction) - w, h and radius are
  // the only ones expressed as raw numbers - so re-deriving layout() against
  // a config scaled on exactly those three fields reproduces the 1x
  // composition faithfully at the larger size: geometry follows for free.
  // paintGrain (below) is the one exception that needed its own fix, since
  // it tiles a fixed-size noise pattern rather than a canvas-relative one -
  // see its doc comment in render.js.
  const rc = c.scale === 1
    ? c
    : { ...c, w: c.w * c.scale, h: c.h * c.scale, radius: c.radius * c.scale };

  const lay = layout(rc, {
    web: web ? web.width / web.height : null,
    mobile: mobile.map(m => m.width / m.height),
  });

  target.width = rc.w;
  target.height = rc.h;
  const ctx = target.getContext('2d');
  ctx.clearRect(0, 0, rc.w, rc.h);

  paintGround(ctx, rc, meta.ground);
  if (lay.web && web) paintWeb(ctx, rc, lay.web, web);
  // lay.phones and mobile are always the same length and index-aligned (see
  // the filtering note above), so no `|| mobile[0]` fallback is needed here.
  lay.phones.forEach((box, i) => paintPhone(ctx, rc, box, mobile[i]));
  paintGrain(ctx, rc, makeCanvas);
  if (lay.caption) paintCaption(ctx, rc, lay.caption, c.caption);

  return { target, meta, config: c, layout: lay };
}

export function compose(target, rawConfig, images, makeCanvas) {
  return composeWithMeta(target, rawConfig, images, makeCanvas).target;
}

export { normalise, layout, groundFor, groundFromMeta };
export {
  RATIOS, HUES, DEFAULTS, TEMPLATES, FRAME_KINDS, SCALES, DEFAULT_ANGLE,
  LAYOUTS, FITS, TONES, BG_TYPES, CHROME_THEMES,
} from './presets.js';
