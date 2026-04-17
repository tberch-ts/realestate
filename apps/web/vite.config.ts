import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Load .env from the monorepo root so VITE_* vars live with the backend's .env.
  envDir: resolve(__dirname, '../..'),
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
});
