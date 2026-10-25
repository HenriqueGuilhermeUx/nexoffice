import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const currentFolder = fileURLToPath(new URL('.', import.meta.url));

/** Isolated, no-Brazil-import NexOffices USA demonstrator build. */
export default defineConfig({
  root: resolve(currentFolder, 'usa-preview'),
  publicDir: resolve(currentFolder, 'usa-preview/public'),
  base: '/',
  build: {
    outDir: resolve(currentFolder, 'dist-usa'),
    emptyOutDir: true,
    sourcemap: false,
  },
});
