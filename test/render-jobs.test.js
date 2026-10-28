import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { readJobs } from '../scripts/render-jobs.js';

// THE JOBS FILE BEHIND `npm run render`
//
// One JSON file lists every shot to render, so a set of thumbnails can be
// made again in one command and always with the same settings. Paths in it
// are relative to the file itself, so the file can live in the project whose
// images it makes (the portfolio keeps its own).
// ---------------------------------------------------------------------

const base = '/projects/site/thumbnails';

describe('readJobs', () => {
  it('resolves every path against the jobs file folder', () => {
    const { jobs } = readJobs({
      jobs: [{ out: '../src/cards/a.jpg', web: 'sources/a.png', mobile: ['p1.png', 'p2.png'] }],
    }, base);
    expect(jobs[0].out).toBe(path.resolve(base, '../src/cards/a.jpg'));
    expect(jobs[0].web).toBe(path.resolve(base, 'sources/a.png'));
    expect(jobs[0].mobile).toEqual([path.resolve(base, 'p1.png'), path.resolve(base, 'p2.png')]);
  });

  it('merges shared settings under each job, the job winning', () => {
    const { jobs } = readJobs({
      defaults: { w: 1940, h: 1576, pad: 0.05 },
      jobs: [{ out: 'a.png', web: 'a.png', config: { pad: 0.08 } }, { out: 'b.png', web: 'b.png' }],
    }, base);
    expect(jobs[0].config).toEqual({ w: 1940, h: 1576, pad: 0.08 });
    expect(jobs[1].config).toEqual({ w: 1940, h: 1576, pad: 0.05 });
  });

  it('resolves groundFrom, so a set of shots can share one background', () => {
    const { jobs } = readJobs({
      defaults: { groundFrom: 'sources/ai.png' },
      jobs: [{ out: 'a.png', web: 'a.png' }, { out: 'b.png', web: 'b.png', groundFrom: 'b.png' }, { out: 'c.png', web: 'c.png', groundFrom: null }],
    }, base);
    expect(jobs.map(j => j.groundFrom)).toEqual([path.resolve(base, 'sources/ai.png'), path.resolve(base, 'b.png'), null]);
    expect(jobs[0].config).not.toHaveProperty('groundFrom');
  });

  it('takes the output format from the file name', () => {
    const { jobs } = readJobs({
      quality: 0.8,
      jobs: [{ out: 'a.jpg', web: 'a.png' }, { out: 'b.webp', web: 'b.png' }, { out: 'c.png', web: 'c.png' }],
    }, base);
    expect(jobs.map(j => j.type)).toEqual(['image/jpeg', 'image/webp', 'image/png']);
    expect(jobs[0].quality).toBe(0.8);
  });

  it('defaults jpeg and webp quality to 0.9', () => {
    const { jobs } = readJobs({ jobs: [{ out: 'a.jpg', web: 'a.png' }] }, base);
    expect(jobs[0].quality).toBe(0.9);
  });

  it('refuses a file with no jobs', () => {
    expect(() => readJobs({}, base)).toThrow(/jobs/);
    expect(() => readJobs({ jobs: [] }, base)).toThrow(/jobs/);
  });

  it('refuses a job without an output, or without any image', () => {
    expect(() => readJobs({ jobs: [{ web: 'a.png' }] }, base)).toThrow(/out/);
    expect(() => readJobs({ jobs: [{ out: 'a.png' }] }, base)).toThrow(/web or mobile/);
  });

  it('refuses more than three phones, the most a shot can hold', () => {
    const mobile = ['1.png', '2.png', '3.png', '4.png'];
    expect(() => readJobs({ jobs: [{ out: 'a.png', mobile }] }, base)).toThrow(/three/);
  });

  it('refuses an output type a canvas cannot write', () => {
    expect(() => readJobs({ jobs: [{ out: 'a.gif', web: 'a.png' }] }, base)).toThrow(/\.gif/);
  });

  it('names the job in every error, so a long file is easy to fix', () => {
    expect(() => readJobs({ jobs: [{ out: 'a.png', web: 'a.png' }, { out: 'b.png' }] }, base)).toThrow(/job 2/);
  });
});
