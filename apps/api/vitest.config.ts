import { defineConfig } from 'vitest/config';

// Local, self-contained config so vitest does not walk up the directory
// tree and pick up an unrelated vite.config.js outside the repo. Root is
// pinned to this package; only our own test files are collected.
export default defineConfig({
  root: __dirname,
  // Inline, empty PostCSS config so vite does not walk up the tree and
  // load an unrelated postcss.config.js (the API has no CSS to process).
  css: { postcss: { plugins: [] } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
