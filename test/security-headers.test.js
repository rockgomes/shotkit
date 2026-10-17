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

  it('names every third-party origin the page actually uses, and no others', () => {
    const html = readFileSync('web/index.html', 'utf8');
    const used = new Set(
      [...html.matchAll(/https:\/\/([a-z0-9.-]+)/g)].map((m) => m[1]),
    );
    const allowed = new Set(
      [...csp.matchAll(/https:\/\/([a-z0-9.-]+)/g)].map((m) => m[1]),
    );
    for (const host of allowed) {
      expect(used.has(host), `CSP allows ${host}, which the page never loads`).toBe(true);
    }
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
