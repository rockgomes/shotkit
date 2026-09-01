import { defineConfig } from 'vite';

// The web app lives in web/ and builds to dist/ at the repo root, kept
// separate from core/ (the rendering engine) and test/ (its vitest suite).
// vitest has its own config (vitest.config.js) and never loads this file.
export default defineConfig({
  root: 'web',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
