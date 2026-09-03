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

## Status — 2026-09-02

**Cycle A Task 8 no longer needs files in this directory.** The measurements
were taken directly from Figma layer geometry (file `ashXeowHsiwznytlLbuvuS`,
symbol `Desktop / Safari / Light`, node `1:3179`) and are written into the
plan verbatim, with their raw pixel values and provenance. Exact layer
geometry beats pixel-counting a raster, and it removed the measurement risk
from that task entirely.

The reference is a reconstruction of Safari, not a screenshot of one. That is
deliberate: shotkit renders a stylised browser for a Dribbble shot, so the
idealised form is the right register to copy. A real screenshot carries
clutter that would have to be stripped back out.

This directory stays for future frame work — Chrome, and the mobile browsers
in that same file (`Mobile / Safari` 390x844, `Mobile / Chrome` 375x812),
neither of which is in Cycle A.
