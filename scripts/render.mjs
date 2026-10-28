// npm run render -- path/to/jobs.json
//
// Renders every shot in a jobs file (see scripts/render-jobs.js) with core/,
// inside a real Chromium driven by Playwright. Not @napi-rs/canvas: that
// renderer draws shadowBlur measurably fainter than a browser (see the README,
// under Tests), and these files ship. In Chromium the output matches what the
// app exports from the same settings.
//
// Nothing is served over the network. The page and every file it asks for
// are answered from disk by page.route, under a made-up origin.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { readJobs } from './render-jobs.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'http://shotkit.render';
const CONTENT_TYPES = {
  '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
};

const jobsPath = process.argv[2];
if (!jobsPath) {
  console.error('Usage: npm run render -- path/to/jobs.json');
  process.exit(1);
}
const { jobs } = readJobs(JSON.parse(fs.readFileSync(jobsPath, 'utf8')), path.dirname(path.resolve(jobsPath)));
for (const job of jobs) {
  for (const src of [job.web, ...job.mobile].filter(Boolean)) {
    if (!fs.existsSync(src)) throw new Error(`Missing image: ${src}`);
  }
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.route(`${ORIGIN}/**`, route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>render</title>' });
    // An image from the jobs file, by absolute path; anything else is core/.
    const file = url.pathname === '/image' ? url.searchParams.get('path') : path.join(ROOT, url.pathname);
    if (!file.startsWith('/') || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    route.fulfill({ contentType: CONTENT_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  await page.goto(`${ORIGIN}/`);

  for (const job of jobs) {
    const dataUrl = await page.evaluate(async ({ job }) => {
      const { composeWithMeta } = await import('/core/index.js');
      const load = async p => createImageBitmap(await (await fetch('/image?path=' + encodeURIComponent(p))).blob());
      const images = { web: job.web ? await load(job.web) : null, mobile: await Promise.all(job.mobile.map(load)) };
      const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
      const canvas = mk(1, 1);
      composeWithMeta(canvas, job.config, images, mk);
      return canvas.toDataURL(job.type, job.quality);
    }, { job });
    fs.mkdirSync(path.dirname(job.out), { recursive: true });
    fs.writeFileSync(job.out, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`wrote ${path.relative(process.cwd(), job.out)}`);
  }
} finally {
  await browser.close();
}
