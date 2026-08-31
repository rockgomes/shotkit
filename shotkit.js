#!/usr/bin/env node
/**
 * shotkit — compose product shots and portfolio thumbnails from screenshots.
 *
 *   node shotkit.js --web=app.png --ratio=3:2
 *   node shotkit.js --mobile=a.png,b.png --layout=mobile
 *   node shotkit.js --web=app.png --mobile=phone.png --layout=web+mobile --out=karaoke.png
 *   node shotkit.js --config=jobs.json          # batch
 *
 * Flags
 *   --web=            desktop screenshot
 *   --mobile=         one or more phone screenshots, comma separated
 *   --layout=         web | mobile | web+mobile         (default: inferred)
 *   --ratio=          3:2 | 4:3 | 16:9 | 1:1            (default 3:2)
 *   --w= --h=         explicit canvas size, overrides ratio
 *   --ground=         auto | <hue 0-360> | a preset name (default auto)
 *   --tone=           light | mid   force the ground lightness
 *   --fit=            contain | cover   (default contain: never crops)
 *   --pad=            margin on every edge, fraction of the shorter side (default .052)
 *   --radius= --grain= --caption= --insetx= --insety=
 *   --out=            output path
 */
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const RATIOS = { '3:2': [1800, 1200], '4:3': [2000, 1500], '16:9': [1920, 1080], '1:1': [1500, 1500] };
const HUES = { lavender: 268, paper: 34, mint: 158, ember: 24, slate: 240, ash: 40, sky: 205, rose: 340 };

function parseFlags(argv) {
  const f = {};
  for (const a of argv) if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); f[k] = v === undefined ? true : v; }
  return f;
}

function groundFor(samples, flags) {
  let hue = null, tone = flags.tone || null;
  if (flags.ground && flags.ground !== 'auto') {
    hue = HUES[flags.ground] !== undefined ? HUES[flags.ground] : Number(flags.ground);
    if (Number.isNaN(hue)) hue = null;
  }
  const py = `
import sys, json
sys.path.insert(0, ${JSON.stringify(__dirname)})
from ground import ground_for
print(json.dumps(ground_for(${JSON.stringify(samples)}, ${hue === null ? 'None' : hue}, ${tone ? JSON.stringify(tone) : 'None'})))`;
  return JSON.parse(execFileSync('python3', ['-c', py]).toString());
}

function buildConfig(job) {
  const flags = job;
  const [rw, rh] = RATIOS[flags.ratio] || RATIOS['3:2'];
  const W = Number(flags.w) || rw, H = Number(flags.h) || rh;

  const web = flags.web ? path.resolve(flags.web) : null;
  const mobile = flags.mobile ? String(flags.mobile).split(',').map(s => path.resolve(s.trim())) : [];

  let layout = flags.layout;
  if (!layout) layout = web && mobile.length ? 'web+mobile' : (web ? 'web' : 'mobile');

  const samples = [web, ...mobile].filter(Boolean);
  const g = groundFor(samples, flags);

  return {
    canvas: { w: W, h: H },
    ground: g.ground,
    dark: false,
    darkUI: g.darkUI,
    layout,
    fit: flags.fit || 'contain',
    web: web ? 'file://' + web : null,
    mobile: mobile.map(m => 'file://' + m),
    radius: flags.radius !== undefined ? Number(flags.radius) : undefined,
    grain: flags.grain !== undefined ? Number(flags.grain) : undefined,
    pad: flags.pad !== undefined ? Number(flags.pad) : undefined,
    phoneScale: flags.phonescale !== undefined ? Number(flags.phonescale) : undefined,
    phoneBleed: flags.phonebleed !== undefined ? Number(flags.phonebleed) : undefined,
    insetX: flags.insetx !== undefined ? Number(flags.insetx) : undefined,
    insetY: flags.insety !== undefined ? Number(flags.insety) : undefined,
    caption: flags.caption && flags.caption !== true ? flags.caption : null,
    _meta: g,
  };
}

async function render(browser, cfg, out) {
  const page = await browser.newPage({
    viewport: { width: cfg.canvas.w, height: cfg.canvas.h }, deviceScaleFactor: 1,
  });
  const c = Buffer.from(unescape(encodeURIComponent(JSON.stringify(cfg)))).toString('base64');
  await page.goto('file://' + path.join(__dirname, 'frame.html') + '?c=' + encodeURIComponent(c),
    { waitUntil: 'networkidle' });
  await page.waitForSelector('body[data-ready="1"]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(300);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, type: 'png' });
  await page.close();
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`${path.basename(out).padEnd(34)} ${cfg.layout.padEnd(11)} ` +
              `hue ${String(cfg._meta.hue).padStart(5)}  ${cfg._meta.darkUI ? 'mid-tone' : 'pale    '}  ${kb} KB`);
}

(async () => {
  const flags = parseFlags(process.argv.slice(2));
  let jobs;
  if (flags.config) {
    jobs = JSON.parse(fs.readFileSync(flags.config, 'utf8'));
  } else {
    if (!flags.web && !flags.mobile) {
      console.error('need --web= and/or --mobile=  (see header of this file)');
      process.exit(1);
    }
    jobs = [flags];
  }

  const browser = await chromium.launch();
  for (const job of jobs) {
    const cfg = buildConfig(job);
    const base = path.basename(job.web || String(job.mobile).split(',')[0]).replace(/\.[^.]+$/, '');
    const out = path.resolve(job.out || path.join('out', `${base}--${cfg.layout.replace('+', '-')}.png`));
    await render(browser, cfg, out);
  }
  await browser.close();
})();
