import path from 'node:path';

// Reads the jobs file behind `npm run render` and resolves it into a list
// the renderer can run as is. Pure: no file is read or written here, so the
// rules are tested without a browser. See test/render-jobs.test.js.
//
// A jobs file:
//   {
//     "defaults": { "w": 1940, "h": 1576 },    any core/ config, for every job
//     "quality": 0.9,                           jpeg and webp only
//     "jobs": [
//       { "out": "cards/ai.jpg", "web": "sources/ai.png" },
//       { "out": "cards/loan.jpg", "mobile": ["a.png", "b.png"], "config": { "pad": 0.08 } }
//     ]
//   }
// Paths are relative to the jobs file. The output type comes from `out`.

const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const MAX_PHONES = 3; // what core/ composes; composeWithMeta drops the rest silently

export function readJobs(file, baseDir) {
  if (!file || !Array.isArray(file.jobs) || file.jobs.length === 0) {
    throw new Error('The jobs file needs a "jobs" list with at least one job.');
  }
  const quality = Number.isFinite(file.quality) ? file.quality : 0.9;
  const defaults = file.defaults || {};
  const at = p => path.resolve(baseDir, p);

  const jobs = file.jobs.map((job, i) => {
    const name = `job ${i + 1}`;
    if (!job.out) throw new Error(`${name}: needs an "out" path.`);
    const mobile = job.mobile || [];
    if (!job.web && mobile.length === 0) throw new Error(`${name}: needs a web or mobile image.`);
    if (mobile.length > MAX_PHONES) throw new Error(`${name}: a shot holds at most three phones.`);
    const ext = path.extname(job.out).toLowerCase();
    if (!TYPES[ext]) throw new Error(`${name}: cannot write ${ext || 'a file with no extension'}, use .png, .jpg or .webp.`);
    return {
      out: at(job.out),
      web: job.web ? at(job.web) : null,
      mobile: mobile.map(at),
      config: { ...defaults, ...(job.config || {}) },
      type: TYPES[ext],
      quality,
    };
  });

  return { jobs };
}
