import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * A SOURCE-LEVEL GUARD, DELIBERATELY. Read this before "improving" it into a
 * pixel test.
 *
 * The defects it defends against do not exist under @napi-rs/canvas, which
 * is the only canvas this suite can run. Both are the same Chromium
 * behaviour seen from two sides: A NON-RECTANGULAR CLIP IS RASTERISED
 * AGAINST ROUNDED DEVICE BOUNDS, NOT AGAINST ITS PATH.
 *
 * Measured in Chrome, canvas 1800x1200, box {x:100, y:100, w:1600, h:1000}
 * (Cycle A Task 4b):
 *
 *   radius 0     clip + fillRect   -> right 1699, bottom 1099  (exact)
 *   radius 2-96  clip + fillRect   -> right 1703, bottom 1103  (+4 / +4)
 *   radius 24    clip + fill(path) -> right 1699, bottom 1099  (exact)
 *
 * On the real shot that painted the BODY colour — white — as a 4px band
 * between the screenshot and the ground, plus a bottom-right corner whose
 * curve no longer followed the shot's radius. Both were reported by Rock:
 * "they have a white stroke", "even the roundness of the corner is off".
 *
 * And measured again in Chrome on the live geometry (Cycle A Task 4d),
 * after Task 4c snapped the screenshot's destination rect outward so that it
 * reached the clip instead of fading out inside it:
 *
 *   clip + snapped drawImage   right edge: shot covers 1.000, path 0.596
 *                              bottom edge: shot covers 1.000, path 0.502
 *                              bottom-right corner, shot's implied edge
 *                              against the arc: rows 1110-1121 within
 *                              0.03px, row 1122 +0.45px, row 1123 +14.0px
 *   tile + bleed + one mask    worst row 0.031px, worst step 0.026px,
 *                              every edge within 0.008 of the path
 *
 * Fourteen pixels of shot sticking out where the straight edge meets the
 * arc, a whole pixel of overshoot along the right and bottom, and up to a
 * whole source row cut off at the top and left. Both were reported without
 * zooming: "1px is cut from the top and left of the screenshot", "a visible
 * spike where the straight edge meets the corner arc".
 *
 * A pixel assertion for either would pass vacuously here, in both
 * directions, which is worse than no test — five tests in this cycle turned
 * out incapable of failing. So this asserts the STRUCTURE that makes both
 * unreachable: nothing is filled OR drawn inside a clip, every rounded
 * backing is filled as a path, and every shot is composed in its own tile
 * and cut by one mask.
 *
 * KNOWN LIMIT, stated rather than papered over: the scan is lexical, so it
 * cannot see a fill or a draw that is inside a clip only at RUNTIME. If a
 * future painter grows one behind a call boundary, this guard will not catch
 * it. The one call that used to rely on that exemption — paintChrome's
 * title-bar fillRect, reached from inside paintWebChrome's clip — no longer
 * does: paintWebChrome has no clip left to be inside.
 */

const SRC = readFileSync('core/render.js', 'utf8');

// Every `ctx.save()`-delimited block, flagged with whether a `ctx.clip()`
// is in effect inside it. Line-based, matching this file's one-statement-
// per-line style; `expect` on the parse's own bookkeeping below is what
// keeps a shape it cannot parse from passing silently.
//
// `what` is the regex for the operation being hunted: a covering fill
// (fillRect) or a draw (drawImage). Both are unsafe inside a clip for the
// same reason and are scanned by the same walk.
function clippedOps(src, what) {
  const lines = src.split('\n');
  const stack = [];
  const hits = [];
  let unbalanced = 0;
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    if (/\bctx\.save\(\)/.test(code)) stack.push(false);
    if (/\bctx\.clip\(/.test(code) && stack.length) stack[stack.length - 1] = true;
    if (what.test(code) && stack.some(Boolean)) {
      hits.push(`${i + 1}: ${line.trim()}`);
    }
    if (/\bctx\.restore\(\)/.test(code)) {
      if (stack.length) stack.pop();
      else unbalanced += 1;
    }
  });
  return { hits, leftOpen: stack.length, unbalanced };
}

// The body of a top-level function, by name — up to its closing brace in
// column 0. Cutting at the NEXT function declaration instead would swallow
// whatever sits between the two, which here is the CHROME_THEME table and
// its `#ffffff`: paintWeb's scan below would then go red on a colour that
// is nowhere near it.
function bodyOf(name) {
  const start = SRC.indexOf(`function ${name}(`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const rest = SRC.slice(start);
  const end = rest.indexOf('\n}\n');
  expect(end, `${name} has no closing brace in column 0`).toBeGreaterThan(-1);
  return rest.slice(0, end + 2);
}

describe('core/render.js never fills a rect inside a clip', () => {
  const parsed = clippedOps(SRC, /\bfillRect\s*\(/);

  it('parses save/restore in balanced pairs — otherwise the scan below is meaningless', () => {
    expect(parsed.unbalanced, 'a ctx.restore() with no matching ctx.save()').toBe(0);
    expect(parsed.leftOpen, 'a ctx.save() left unrestored').toBe(0);
  });

  it('finds no fillRect inside a clipped block', () => {
    expect(parsed.hits.join('\n')).toBe('');
  });

  it('the scan can actually see a violation', () => {
    // The exact shape the fix removed, fed back in. If this comes up empty
    // the scan is broken and the test above proves nothing.
    const poisoned = `
      ctx.save();
      roundRect(ctx, box.x, box.y, box.w, box.h, box.radius);
      ctx.clip();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.restore();
    `;
    expect(clippedOps(poisoned, /\bfillRect\s*\(/).hits).toHaveLength(1);
  });
});

/**
 * Task 4d's own half. A screenshot drawn inside a clip has TWO antialiased
 * edges on the same line — the clip's and its own — and the way out is not
 * to make them agree but to stop having two: compose the shot in a tile,
 * draw everything a pixel past where the shot ends, cut the shape once with
 * a `destination-in` fill, and stamp the tile down at integer coordinates.
 */
describe('no shot is drawn inside a clip; every shot is composed in a tile', () => {
  it('finds no drawImage inside a clipped block', () => {
    const parsed = clippedOps(SRC, /\bdrawImage\s*\(/);
    expect(parsed.hits.join('\n')).toBe('');
  });

  it('that scan can actually see a violation', () => {
    const poisoned = `
      ctx.save();
      roundRect(ctx, box.x, box.y, box.w, box.h, box.radius);
      ctx.clip();
      ctx.drawImage(image, box.x, box.y, box.w, box.h);
      ctx.restore();
    `;
    expect(clippedOps(poisoned, /\bdrawImage\s*\(/).hits).toHaveLength(1);
  });

  it('the tile helper exists and cuts the shape with one destination-in fill', () => {
    const body = bodyOf('placeShot');
    expect(body, 'placeShot does not ask the injected factory for its tile')
      .toMatch(/makeCanvas\(/);
    expect(body, 'placeShot does not mask with destination-in')
      .toMatch(/destination-in/);
    expect(body, 'placeShot stamps the tile somewhere other than integer coords')
      .toMatch(/ctx\.drawImage\(tile, ox, oy\)/);
    // Task 4c's snap is gone: the picture is drawn at its true rect again.
    expect(SRC).not.toMatch(/SNAP_TO_PIXELS/);
  });

  // One entry per painter that puts a screenshot on the canvas. A painter
  // that stops calling placeShot has almost certainly gone back to clipping,
  // which is the bug at the top of this file.
  for (const fn of ['paintWeb', 'paintWebChrome', 'paintPhoneChrome', 'paintPhone']) {
    it(`${fn} composes its shot through placeShot`, () => {
      expect(bodyOf(fn)).toMatch(/placeShot\(ctx, makeCanvas,/);
    });
  }

  it('every image drawn in this file is drawn by drawFitted or placeShot', () => {
    const inside = bodyOf('drawFitted') + bodyOf('placeShot');
    const sites = SRC.split('\n')
      .map((line, i) => [i + 1, line.replace(/\/\/.*$/, '')])
      .filter(([, code]) => /\.drawImage\(/.test(code));
    expect(sites.length, 'expected the picture, its four clamp strips, and the tile stamp')
      .toBe(6);
    const stray = sites.filter(([, code]) => !inside.includes(code.trim()));
    expect(stray.map(([i, code]) => `${i}: ${code.trim()}`)).toEqual([]);
  });

  it('drawFitted clamps its edges outward under destination-over', () => {
    const body = bodyOf('drawFitted');
    expect(SRC).toMatch(/const TILE_BLEED = 1;/);
    expect(body, 'the clamp is not composited behind the picture')
      .toMatch(/destination-over/);
    expect((body.match(/TILE_BLEED/g) || []).length,
      'expected the four clamp strips to be expressed in TILE_BLEED')
      .toBeGreaterThanOrEqual(1);
  });
});

/**
 * NOTHING IS PAINTED BEHIND A SHOT. This is the rule Task 4d ended on, and
 * it is worth a guard because it has been broken twice with two different
 * colours: frame.html's white `--screen-bg` card, and then (Task 4c) a
 * second pass of the ground over the same path. Both existed only to cover
 * paintShadow's opaque caster, and both leaked around the picture's edge,
 * because a backing can only ever show through partial coverage.
 */
describe('nothing is painted behind a shot', () => {
  it('paintShadow clips the box out of itself instead', () => {
    const body = bodyOf('paintShadow');
    expect(body, 'the caster is not clipped out of the box').toMatch(/clip\('evenodd'\)/);
    expect(body, 'the clip is not traced as one path with the box').toMatch(/traceRoundRect\(/);
  });

  for (const fn of ['paintWeb', 'paintWebChrome', 'paintPhoneChrome', 'paintPhone']) {
    it(`${fn} paints no backing behind its screenshot`, () => {
      // Comments stripped: both painters DESCRIBE the fills they no longer
      // do, and a scan that read the prose would go red on the explanation
      // of why it is green.
      const body = bodyOf(fn).replace(/\/\/.*$/gm, '');
      expect(body, `${fn} re-paints the ground behind the shot`).not.toMatch(/paintGround\(/);
      expect(body, `${fn} fills a white card behind the shot`).not.toMatch(/#ffffff/);
    });
  }

  // The device body is NOT a backing in this sense and is deliberately kept:
  // what is behind a phone's screen is the phone. It is drawn content, it is
  // filled as a path so its own edge against the ground is a single
  // antialiased boundary, and backing the screen with the ground instead was
  // measured at +52 levels of light halo inside the bezel.
  it('the device body is still filled as a path', () => {
    expect(SRC).toMatch(/function fillRoundRect\(/);
    expect(bodyOf('paintDeviceBody')).toMatch(/fillRoundRect\(/);
  });
});
