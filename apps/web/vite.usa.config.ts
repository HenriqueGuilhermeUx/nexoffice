import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, copyFileSync } from 'node:fs';
const currentFolder = fileURLToPath(new URL('.', import.meta.url));

/** Isolated, no-Brazil-import NexOffices USA demonstrator build. */
export default defineConfig({
  plugins: [{
    name: 'nexoffices-usa-route-copy',
    closeBundle() {
      // Render does not consume Netlify _redirects. Publish a real /us/ entry.
      const out = resolve(currentFolder, 'dist-usa');
      const us = resolve(out, 'us');
      mkdirSync(us, { recursive: true });
      copyFileSync(resolve(out, 'index.html'), resolve(us, 'index.html'));
    },
  }],
  root: resolve(currentFolder, 'usa-preview'),
  publicDir: resolve(currentFolder, 'usa-preview/public'),
  base: '/',
  build: {
    outDir: resolve(currentFolder, 'dist-usa'),
    emptyOutDir: true,
    sourcemap: false,
  },
});
