#!/usr/bin/env python3
"""
ground.py — derive a background from the product screenshot itself.

The rule, lifted from the shots that actually work: the ground is a tint of the
product's own accent colour, and its lightness is set so the UI SEPARATES from
it. A light UI gets a pale tint. A dark UI gets a MID-TONE tint, never a dark
one - that is why dark-on-dark reads as mush.

    python3 ground.py screenshot.png          -> prints JSON
"""
import sys, json, colorsys
from PIL import Image

PRESETS = {
    #            hue   light-UI tint      dark-UI mid-tone
    "lavender": 268, "slate": None, "paper": 34, "mint": 158, "ember": 24, "ash": None,
}


def analyse(paths):
    """Sample one or more screenshots. Only FLAT pixels vote on hue: a button or
    a pill is one solid colour, a photo is not. That keeps album art and product
    photography from hijacking the brand colour."""
    if isinstance(paths, str):
        paths = [paths]

    px = []          # flat pixels only, for hue
    all_px = []      # everything, for luminance
    for p in paths:
        im = Image.open(p).convert("RGB")
        im.thumbnail((800, 800))
        w, h = im.size
        d = im.load()
        for y in range(0, h):
            for x in range(0, w):
                all_px.append(d[x, y])
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                c = d[x, y]
                flat = True
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    n = d[nx, ny]
                    if abs(n[0] - c[0]) + abs(n[1] - c[1]) + abs(n[2] - c[2]) > 18:
                        flat = False
                        break
                if flat:
                    px.append(c)

    lum = sum(0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in all_px) / (len(all_px) * 255)

    def saturated(pool):
        return sum(1 for r, g, b in pool if colorsys.rgb_to_hsv(r/255, g/255, b/255)[1] >= 0.22)

    # if the flat regions carry almost no colour, fall back to every pixel
    if saturated(px) < 300:
        px = all_px

    # Histogram of hue, weighted by saturation, then take the PEAK bin - not the
    # mean. A brand colour piles into one bin; photos and album art smear across
    # many, so the peak finds the accent instead of averaging it into mud.
    import math
    BINS = 36
    hist = [0.0] * BINS
    total = 0.0
    for r, g, b in px:
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if s < 0.22 or v < 0.16 or v > 0.98:
            continue
        w = s * s
        hist[int(h * BINS) % BINS] += w
        total += w

    if total < 1e-6:
        return lum, 250 / 360, 0.0            # neutral fallback

    peak = max(range(BINS), key=lambda i: hist[i] + 0.5 * (hist[(i - 1) % BINS] + hist[(i + 1) % BINS]))
    # refine inside the winning bin with a local circular mean
    sx = sy = wt = 0.0
    for r, g, b in px:
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if s < 0.22 or v < 0.16 or v > 0.98:
            continue
        d = min(abs(int(h * BINS) % BINS - peak), BINS - abs(int(h * BINS) % BINS - peak))
        if d > 1:
            continue
        w = s * s
        sx += math.cos(h * 2 * math.pi) * w
        sy += math.sin(h * 2 * math.pi) * w
        wt += w
    hue = (math.atan2(sy, sx) / (2 * math.pi)) % 1.0 if wt else peak / BINS
    # how concentrated the accent is: share of weight in the winning bins
    near = sum(hist[(peak + d) % BINS] for d in (-1, 0, 1))
    chroma = min(1.0, near / total * 1.25)
    return lum, hue, chroma


def hsl(h, s, l):
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return "#%02x%02x%02x" % (round(r * 255), round(g * 255), round(b * 255))


def ground_for(paths, force_hue=None, mode=None):
    lum, hue, chroma = analyse(paths)
    if force_hue is not None:
        hue = force_hue / 360.0

    dark_ui = lum < 0.34
    if mode == "light":
        dark_ui = False
    if mode == "mid":
        dark_ui = True

    sat = 0.16 + 0.26 * min(chroma * 1.6, 1.0)     # never fully saturated

    if dark_ui:
        # MID-TONE ground. This is what gives a dark UI its edge.
        g = [hsl(hue, sat * 0.42, 0.855),
             hsl(hue, sat * 0.40, 0.780),
             hsl(hue, sat * 0.44, 0.712)]
    else:
        # pale tint, brightest toward the top-left light source
        g = [hsl(hue, sat * 0.55, 0.975),
             hsl(hue, sat * 0.62, 0.925),
             hsl(hue, sat * 0.66, 0.868)]

    return {"ground": g, "dark": False, "lum": round(lum, 3),
            "hue": round(hue * 360, 1), "chroma": round(chroma, 3),
            "darkUI": dark_ui}


if __name__ == "__main__":
    print(json.dumps(ground_for(sys.argv[1:]), indent=1))
