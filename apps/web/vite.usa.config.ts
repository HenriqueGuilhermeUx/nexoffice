import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/** Isolated, no-Brazil-import NexOffices USA demonstrator build. */
export default defineConfig({
  root: resolve(__dirname, 'usa-preview'),
  publicDir: resolve(__dirname, 'usa-preview/public'),
  base: '/',
  build: {
    outDir: resolve(__dirname, 'dist-usa'),
    emptyOutDir: true,
    sourcemap: false,
  },
});
