import {fileURLToPath,URL} from 'node:url';
import {defineConfig} from 'vite';

// Deliberately bundle only this USA public entry. The Brazilian NexOffice
// landing and production routers are never imported into the USA deploy.
export default defineConfig({
 root:fileURLToPath(new URL('.',import.meta.url)),
 esbuild:{jsx:'automatic'},
 build:{
  outDir:'dist',
  emptyOutDir:true,
  sourcemap:false
 }
});
