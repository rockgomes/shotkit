# Browser chrome references

Cycle A Task 8 measures every image in this directory to derive
`BROWSER_BAR_RATIO`, `BROWSER_RADIUS_RATIO` and the traffic-light ratios in
`core/presets.js`. The task is blocked without them and must stop rather than
guess.

**What belongs here**

- **At least one screenshot of a real macOS Safari window.** Whole window,
  unscaled, nothing cropped — `⌘⇧4` then Space, then click the window. This is
  the authoritative source.
- Optionally, stylised mockups of a browser window. These are useful for
  matching a look, but they are one designer's interpretation and may
  exaggerate proportions, so they never outrank a real window.

Every measurement is reported as a fraction of the window's outer width, with
the raw pixel numbers and the file each came from, so a future change can be
argued with rather than re-guessed.
