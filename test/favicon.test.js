import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The site had no favicon at all: `/favicon.ico` returned 404 on the live
// domain, and that 404 was the only console error the shipped app produced.
//
// The mark is the app's own, the rounded square from `.brand-mark` in
// web/style.css, on the same brand gradient. That gradient's two colours
// live in web/tokens.css, which is the one file in web/ allowed to name a
// colour outright, and an SVG cannot read a CSS custom property. So the two
// hexes are duplicated in the image, and this file is what stops the copy
// drifting from the original.
describe('the favicon is the app\'s own mark, and stays that way', () => {
  const svg = readFileSync('web/public/favicon.svg', 'utf8');
  const html = readFileSync('web/index.html', 'utf8');
  const tokens = readFileSync('web/tokens.css', 'utf8');

  const tokenValue = (name) => {
    const m = tokens.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`));
    expect(m, `${name} not found in web/tokens.css`).toBeTruthy();
    return m[1].toLowerCase();
  };

  it('uses the brand gradient exactly as tokens.css defines it', () => {
    // Change --color-brand-start in tokens.css and this fails, which is the
    // whole point: the toolbar mark and the browser-tab mark are one design.
    expect(svg.toLowerCase()).toContain(tokenValue('--color-brand-start'));
    expect(svg.toLowerCase()).toContain(tokenValue('--color-brand-end'));
    expect(svg.toLowerCase()).toContain(tokenValue('--color-white'));
  });

  it('draws the S rather than setting it as text', () => {
    // <text> would render in whatever font the visitor happens to have, and
    // a favicon has no stylesheet to fall back on.
    expect(svg).toMatch(/<path[^>]*\sd="M/);
    expect(svg).not.toMatch(/<text/);
  });

  it('is linked from the document, so nothing asks for /favicon.ico', () => {
    // The 404 came from the browser's automatic request, which it only makes
    // when the document declares no icon.
    expect(html).toMatch(/<link[^>]+rel="icon"[^>]+href="\/favicon\.svg"/);
  });

  it('sits where vite will publish it to the site root', () => {
    // vite.config.js sets root: 'web', so web/public/ is the public
    // directory and its contents are copied to dist/ unchanged. A favicon
    // one directory out would build clean and 404 in production.
    expect(() => readFileSync('web/public/favicon.svg')).not.toThrow();
  });
});
