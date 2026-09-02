// The shadow, alone, on a blank canvas, at default settings.
//
// WHY THIS EXISTS: paintShadow's alphas were retuned once against
// @napi-rs/canvas (0.17/0.07 -> 0.40/0.30). Every Node test stayed green
// while the browser would have shipped a shadow ~65 RGB levels too dark.
// frame.html, the original reference, is now deleted. Every whole-shot
// golden under test/golden/render/ changed several times during Cycle A for
// unrelated reasons, so a shadow regression could hide inside a legitimate
// diff. This golden cannot: nothing else is drawn in it.
//
// HOW test/golden/shadow/default.png WAS ACTUALLY CAPTURED. This script ran
// FIRST, against the pre-Task-5 paintShadow, with its old positional
// signature (`paintShadow(ctx, box, H * 0.040, H * 0.105, 0.17, 0.07, 1)`).
// It was then rewritten to the call below and re-run, and the PNG did not
// change by a single byte — which is the whole claim Task 5 had to make.
//
// DO NOT RE-RUN THIS TO "FIX" A FAILING test/render-shadow.test.js. A
// regenerated golden is not a passing test, it is a deleted one. If the
// default output moved, the refactor is wrong; fix the refactor.
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'node:fs';
import { normalise } from '../core/config.js';
import { paintShadow } from '../core/render.js';

mkdirSync('test/golden/shadow', { recursive: true });

// Kept in step with test/render-shadow.test.js's own W/H/BOX. If either
// moves, both move.
const W = 1800, H = 1200;
const cv = createCanvas(W, H);
const ctx = cv.getContext('2d');
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, W, H);

const box = { x: 300, y: 220, w: 1200, h: 760, radius: 24 };
paintShadow(ctx, box, normalise({}).shadow, 0.17, 0.07, H);

writeFileSync('test/golden/shadow/default.png', cv.toBuffer('image/png'));
console.log('wrote test/golden/shadow/default.png');
