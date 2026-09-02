import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * A SOURCE-LEVEL GUARD, DELIBERATELY. Read this before "improving" it into a
 * pixel test.
 *
 * The defect it defends against does not exist under @napi-rs/canvas, which
 * is the only canvas this suite can run. In Chromium — the actual product —
 * a `fillRect` that COVERS its clip region is rasterised against the clip
 * mask's rounded-out device bounds rather than its own rectangle, and for an
 * antialiased non-rectangular clip those bounds overshoot the path by a
 * constant ~4px on the right and bottom. Measured in Chrome, canvas
 * 1800x1200, box {x:100, y:100, w:1600, h:1000}:
 *
 *   radius 0     clip + fillRect   -> right 1699, bottom 1099  (exact)
 *   radius 2-96  clip + fillRect   -> right 1703, bottom 1103  (+4 / +4)
 *   radius 24    clip + fill(path) -> right 1699, bottom 1099  (exact)
 *   radius 24    clip + drawImage  -> right 1699, bottom 1099  (exact)
 *
 * On the real shot that painted the BODY colour — white — as a 4px band
 * between the screenshot and the ground, plus a bottom-right corner whose
 * curve no longer followed the shot's radius. Both were reported by Rock:
 * "they have a white stroke", "even the roundness of the corner is off". It
 * is invisible on a pale screenshot, which is why it survived a whole cycle.
 *
 * A pixel assertion for it would pass vacuously here, in both directions,
 * which is worse than no test — five tests in this cycle turned out
 * incapable of failing. So this asserts the STRUCTURE that makes the bug
 * unreachable instead: no `fillRect` inside a clip, and every rounded body
 * fill routed through `fillRoundRect`. Break either and this goes red.
 *
 * KNOWN LIMIT, stated rather than papered over: the scan is lexical, so it
 * cannot see a `fillRect` that is inside a clip only at RUNTIME — which is
 * exactly what paintChrome's title-bar fill is, called from inside
 * paintWebChrome's clip. That one is safe and was measured: a bar spanning
 * the full clip width lands exactly on its own edges, because only a fill
 * covering the WHOLE clip triggers the overshoot. If a future painter grows
 * a covering fillRect behind a call boundary, this guard will not catch it.
 */

const SRC = readFileSync('core/render.js', 'utf8');

// Every `ctx.save()`-delimited block, flagged with whether a `ctx.clip()`
// is in effect inside it. Line-based, matching this file's one-statement-
// per-line style; `expect` on the parse's own bookkeeping below is what
// keeps a shape it cannot parse from passing silently.
function clippedFillRects(src) {
  const lines = src.split('\n');
  const stack = [];
  const hits = [];
  let unbalanced = 0;
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    if (/\bctx\.save\(\)/.test(code)) stack.push(false);
    if (/\bctx\.clip\(/.test(code) && stack.length) stack[stack.length - 1] = true;
    if (/\bfillRect\s*\(/.test(code) && stack.some(Boolean)) {
      hits.push(`${i + 1}: ${line.trim()}`);
    }
    if (/\bctx\.restore\(\)/.test(code)) {
      if (stack.length) stack.pop();
      else unbalanced += 1;
    }
  });
  return { hits, leftOpen: stack.length, unbalanced };
}

describe('core/render.js never fills a rect inside a clip', () => {
  const parsed = clippedFillRects(SRC);

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
    expect(clippedFillRects(poisoned).hits).toHaveLength(1);
  });
});

describe('every rounded body fill goes through fillRoundRect', () => {
  it('the helper exists', () => {
    expect(SRC).toMatch(/function fillRoundRect\(/);
  });

  // One entry per painter that fills a rounded body or screen. A painter
  // that stops calling the helper has almost certainly gone back to
  // clip + fillRect, which is the bug.
  for (const fn of [
    'paintWeb',
    'paintWebChrome',
    'paintDeviceBody',
    'paintPhoneChrome',
    'paintPhone',
  ]) {
    it(`${fn} calls it`, () => {
      const start = SRC.indexOf(`function ${fn}(`);
      expect(start, `${fn} not found`).toBeGreaterThan(-1);
      // Up to the next top-level `function ` / `export function ` — good
      // enough given this file declares every painter at the top level.
      const rest = SRC.slice(start + 1);
      const nextIdx = rest.search(/\n(?:export )?function /);
      const body = nextIdx === -1 ? rest : rest.slice(0, nextIdx);
      expect(body).toMatch(/fillRoundRect\(/);
    });
  }
});
