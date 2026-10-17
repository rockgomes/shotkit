import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// THE HEADERS THE SITE SENDS.
//
// Audited 2026-10-17: the live site sent nosniff, Referrer-Policy and
// Netlify's own HSTS, and nothing else. No CSP, no frame-ancestors, no
// Permissions-Policy.
//
// There is no XSS vector in the app today, and that was tested rather than
// assumed (see docs/audit-2026-10-17.md). The CSP is defence in depth: it
// turns a future injection from "runs anything" into "blocked", and the
// policy can be genuinely tight because this app has no backend, no
// analytics and no third-party JavaScript at all.
//
// Verified against a real `npm run build` served by `netlify serve`:
// canvas painted, all 8 preset tiles painted, Inter loaded from gstatic,
// export produced its blob download, zero console errors. A remote script
// and an inline script were both blocked.

const toml = readFileSync('netlify.toml', 'utf8');
const csp = (toml.match(/Content-Security-Policy\s*=\s*"([^"]+)"/) || [])[1] || '';
const directive = (name) => {
  const hit = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `) || d === name);
  return hit ? hit.slice(name.length).trim() : null;
};

describe('netlify.toml sends a CSP', () => {
  it('has one at all', () => {
    expect(csp, 'no Content-Security-Policy in netlify.toml').not.toBe('');
  });

  it('locks script to self, with no unsafe escape hatch', () => {
    expect(directive('script-src')).toBe("'self'");
    // The two that would make the whole policy decorative.
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain('unsafe-eval');
  });

  it('allows the blob and data images the app makes for itself', () => {
    // Every screenshot is an object URL or a canvas blob, made locally.
    expect(directive('img-src')).toContain('blob:');
    expect(directive('img-src')).toContain('data:');
  });

  it('forbids network calls, because the app makes none', () => {
    // This is the directive that would catch a dependency, or a future
    // change, quietly starting to phone home with someone's screenshot.
    expect(directive('connect-src')).toBe("'none'");
  });

  it('closes the usual holes', () => {
    expect(directive('object-src')).toBe("'none'");
    expect(directive('base-uri')).toBe("'none'");
    expect(directive('form-action')).toBe("'none'");
    expect(directive('frame-ancestors')).toBe("'none'");
  });

  it('names no third-party origin at all', () => {
    // Inter is self-hosted (audit finding S4), so every directive is
    // 'self' or 'none' and there is no host list to keep in step with the
    // markup. If one ever comes back, this fails and whoever added it has
    // to say why in the same breath.
    expect([...csp.matchAll(/https:\/\/([a-z0-9.-]+)/g)].map((m) => m[1])).toEqual([]);
  });

  it('keeps fonts on this origin, which is the point of self-hosting them', () => {
    expect(directive('font-src')).toBe("'self'");
  });
});

describe('the other headers', () => {
  it('denies framing for anything that does not read frame-ancestors', () => {
    expect(toml).toMatch(/X-Frame-Options\s*=\s*"DENY"/);
  });

  it('turns off the device APIs this app has no use for', () => {
    const pp = (toml.match(/Permissions-Policy\s*=\s*"([^"]+)"/) || [])[1] || '';
    for (const feature of ['camera', 'microphone', 'geolocation']) {
      expect(pp, `${feature} is not denied`).toContain(`${feature}=()`);
    }
  });

  it('still sends what it already sent', () => {
    expect(toml).toContain('X-Content-Type-Options = "nosniff"');
    expect(toml).toContain('Referrer-Policy = "strict-origin-when-cross-origin"');
  });
});


// ---------------------------------------------------------------------
// INTER IS OURS NOW
//
// Audit finding S4: every visitor's IP address and user agent went to
// fonts.googleapis.com and fonts.gstatic.com just to draw the interface,
// and the page's text depended on Google staying up.
// ---------------------------------------------------------------------

describe('the font', () => {
  // Comments stripped from both. The note explaining the move names the
  // Google hosts and the unused family, and without this the tests fail
  // on their own fix. Fifth time in this suite.
  const html = readFileSync('web/index.html', 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const tokens = readFileSync('web/tokens.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('is not fetched from Google any more', () => {
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('fonts.gstatic.com');
  });

  it('is declared once, as a variable face covering every weight used', () => {
    // v20 is variable, so 400/500/600/700 all come out of one request.
    expect(tokens).toContain('font-weight: 100 900');
    expect((tokens.match(/@font-face/g) || [])).toHaveLength(1);
  });

  it('ships the file it points at', () => {
    const src = (tokens.match(/src:\s*url\('([^']+)'\)/) || [])[1];
    expect(src).toBe('/fonts/inter-latin-var.woff2');
    const bytes = readFileSync(`web/public${src}`);
    // wOF2 magic, so a broken or truncated download fails here and not in
    // someone's browser.
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('wOF2');
  });

  it('does not ask for a family nothing uses', () => {
    // `Inter+Tight` was in the old Google request and referenced in no
    // stylesheet: a download nobody used.
    const css = readFileSync('web/style.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') + tokens;
    expect(html).not.toContain('Inter+Tight');
    expect(css).not.toContain('Inter Tight');
  });
});
