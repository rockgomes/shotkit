import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    // vitest's 5000ms default is too tight for this suite: several
    // compose.test.js cases composite multi-megapixel canvases with
    // @napi-rs/canvas and then pixel-diff them, which is legitimately slow,
    // not hung. Measured worst case (composeWithMeta > renders the mobile
    // layout, under full-suite contention, 5 runs) was 8.1s; 20s gives
    // ~2.5x headroom without being an arbitrary large number. If this ever
    // needs raising again, remeasure first - don't just bump it further.
    testTimeout: 20000,
  },
});
