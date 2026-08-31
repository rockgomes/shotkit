# shotkit

Turns a raw screenshot into a finished shot: the UI floating on a ground, with a
shadow and a bit of grain. Built for Dribbble shots (4:3) and portfolio
thumbnails (3:2), but the canvas is a parameter.

```
node shotkit.js --web=app.png --ratio=3:2
node shotkit.js --mobile=a.png,b.png --layout=mobile
node shotkit.js --web=app.png --mobile=phone.png --layout=web+mobile --out=out/karaoke.png
node shotkit.js --config=jobs.json
```

Needs `playwright` (chromium) and `python3` with `Pillow`.

## The three ideas

**1. One geometry, many grounds.** Padding, radius, and shadow are proportions of
the canvas, not pixels. Same numbers at 3:2, 4:3, 16:9 or 1:1. That is what makes
a row of thumbnails look like one person made them.

Padding is a **single** number measured against the shorter canvas side, so the
gap is identical on all four edges. An earlier version used separate percentages
per axis (5% of width, 9.2% of height); those resolve to very different pixel
gaps and the UI floats in the middle looking small. If a shot looks over-padded,
check the source ratio first: a narrow source fitted by `contain` into a wider
box leaves the slack on the sides, and no padding value will fix that. Recrop
the source instead.

**2. The ground comes from the product.** `ground.py` samples the screenshot and
builds the background from the product's own accent colour. Two rules matter:

- Only **flat** pixels vote on hue. A button or a pill is one solid colour; a
  photo is not. Without this filter, album art and furniture photography hijack
  the brand colour and every ground comes out muddy orange.
- Lightness is set for **separation**, not mood. A light UI gets a pale tint. A
  dark UI gets a **mid-tone** ground, never a dark one. Dark-on-dark is the most
  common way these shots fail.

**3. `contain` by default, so nothing is cropped.** The screen element takes the
source image's own aspect ratio and fits inside the safe box. `--fit=cover` is
there if you want edge-to-edge and accept the crop.

## Flags

| flag | default | what |
|---|---|---|
| `--web=` | | desktop screenshot |
| `--mobile=` | | phone screenshots, comma separated, up to 3 |
| `--layout=` | inferred | `web` · `mobile` · `web+mobile` |
| `--ratio=` | `3:2` | `3:2` `4:3` `16:9` `1:1` |
| `--w= --h=` | | explicit canvas, beats `--ratio` |
| `--ground=` | `auto` | `auto`, a hue `0-360`, or `lavender` `paper` `mint` `ember` `slate` `ash` `sky` `rose` |
| `--tone=` | auto | `light` or `mid`, forces the ground lightness |
| `--fit=` | `contain` | `contain` never crops · `cover` fills |
| `--radius=` | 1.33% of width | screen corner radius, px |
| `--grain=` | `0.34` | 0 turns it off |
| `--pad=` | `.052` | margin on **every** edge, as a fraction of the shorter canvas side |
| `--phonescale= --phonebleed=` | `.86` `.10` | phone size and how far it drops past the bottom edge in `web+mobile` |
| `--insetx= --insety=` | | per-axis override, if you really want uneven margins |
| `--caption=` | | one line, bottom left |
| `--out=` | `out/<name>--<layout>.png` | |

## Batch

`jobs.json` is an array of the same flags as objects:

```json
[
 {"web":"src/fieldset.png","ratio":"3:2","out":"out/fieldset.png"},
 {"web":"src/karaoke-web.png","mobile":"src/karaoke-mobile.png",
  "layout":"web+mobile","out":"out/karaoke.png"}
]
```

## Files

- `frame.html` — the renderer. Reads a base64 JSON config from `?c=`. All layout
  maths lives here. Open it directly in a browser with a config to debug.
- `ground.py` — colour analysis. Run it alone to see what it decided:
  `python3 ground.py shot.png` prints hue, luminance, and the three stops.
- `shotkit.js` — CLI. Parses flags, calls `ground.py`, screenshots `frame.html`.

## Capturing a mobile screen when the window will not resize

Browser windows often refuse to resize below the OS minimum, so the page never
hits its mobile breakpoint. Load the page in a **same-origin iframe** fixed at
390px instead: media queries respond to the iframe's width. Scale the iframe
with a CSS transform for resolution, capture in vertical tiles, and stitch. That
is how `src/karaoke-mobile.png` was made.

## Ideas worth building next

- **Bleed layout.** Let the UI run off one edge. Common in the shots that do best
  and it currently is not supported.
- **A live preview.** `frame.html` already takes a config; put a control panel
  beside it and you have a real builder instead of a CLI.
- **MP4 out.** Dribbble takes video up to 20MB. Same frame, animated screen.
- **Cache `ground.py` results** keyed on file hash. It is the slow step in a
  batch and the answer never changes for the same file.
