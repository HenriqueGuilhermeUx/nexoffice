import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, copyFileSync } from 'node:fs';
const currentFolder = fileURLToPath(new URL('.', import.meta.url));
// Render supplies this documented build-time commit SHA for static sites.
// Never claim an exact source revision when the build has no verified SHA.
const renderSha = process.env.RENDER_GIT_COMMIT;
const sourceSha = renderSha || process.env.USA_PREVIEW_SOURCE_SHA || '';
if (sourceSha && !/^[a-f0-9]{40}$/i.test(sourceSha)) {
  throw new Error('USA preview source SHA must be a full Git commit SHA');
}
if (process.env.RENDER === 'true' && !renderSha) {
  throw new Error('Render USA staging build is missing RENDER_GIT_COMMIT');
}
const source = renderSha ? 'render' : sourceSha ? 'ci' : 'unverified';


/** Isolated, no-Brazil-import NexOffices USA demonstrator build. */
export default defineConfig({
  plugins: [{
    name: 'nexoffices-usa-route-copy',
    transformIndexHtml(html) {
      // Public, non-secret provenance for human comparison with the Render deploy API.
      // This is a claim from the build environment, not independent deploy verification.
      return html.replace('</head>',
        `  <meta name="usa-preview-source-sha" content="${sourceSha || 'unverified'}" />\n` +
        `  <meta name="usa-preview-source" content="${source}" />\n</head>`);
    },
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
