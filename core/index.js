import { normalise } from './config.js';
import { layout } from './layout.js';
import { groundFor } from './ground.js';
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
 *
 * `images.mobile` entries that failed to load are dropped here (`filter(Boolean)`),
 * matching frame.html's own behaviour (`if (r) mobMeta.push(r)` in its load loop):
 * a phone whose screenshot never decoded is silently omitted rather than drawn
 * at layout.js's PHONE_FALLBACK_RATIO guess. Because that filtering happens
 * before `sources.mobile` and `mobile` are built, the two arrays layout.js and
 * this function use always stay the same length and in the same order, so
 * `lay.phones[i]` always corresponds to `mobile[i]` with no gaps to guard against.
 */
export function composeWithMeta(target, rawConfig, images, makeCanvas) {
  const web = images.web || null;
  const mobile = (images.mobile || []).filter(Boolean).slice(0, 3);

  const c = normalise({ ...rawConfig, hasWeb: !!web, mobileCount: mobile.length });

  const samples = [web, ...mobile].filter(Boolean).map(im => sampleOf(im, makeCanvas));
  const meta = samples.length
    ? groundFor(samples, c.forceHue, c.tone)
    : groundFor([{ width: 1, height: 1, data: [128, 128, 128, 255] }], c.forceHue, c.tone);

  const lay = layout(c, {
    web: web ? web.width / web.height : null,
    mobile: mobile.map(m => m.width / m.height),
  });

  target.width = c.w;
  target.height = c.h;
  const ctx = target.getContext('2d');
  ctx.clearRect(0, 0, c.w, c.h);

  paintGround(ctx, c, meta.ground);
  if (lay.web && web) paintWeb(ctx, c, lay.web, web);
  // lay.phones and mobile are always the same length and index-aligned (see
  // the filtering note above), so no `|| mobile[0]` fallback is needed here.
  lay.phones.forEach((box, i) => paintPhone(ctx, c, box, mobile[i]));
  paintGrain(ctx, c, makeCanvas);
  if (lay.caption) paintCaption(ctx, c, lay.caption, c.caption);

  return { target, meta, config: c, layout: lay };
}

export function compose(target, rawConfig, images, makeCanvas) {
  return composeWithMeta(target, rawConfig, images, makeCanvas).target;
}

export { normalise, layout, groundFor };
export { RATIOS, HUES, DEFAULTS } from './presets.js';
