import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Root-relative asset paths — correct once the custom domain (see public/CNAME)
  // is live, since GitHub Pages then serves this at the domain root. Before DNS
  // cuts over, the interim https://<user>.github.io/<repo>/ URL will 404 on
  // assets; test via `npm run preview` locally or wait for the custom domain.
  base: '/',
  // Load .env from the monorepo root, same convention as apps/web.
  envDir: resolve(__dirname, '../..'),
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
  },
  build: {
    // Build output is committed straight into the repo-root docs/ folder,
    // which GitHub Pages serves as-is (no CI build step — see docs/DEPLOY_FLY.md).
    outDir: resolve(__dirname, '../../docs'),
    emptyOutDir: true,
  },
});
