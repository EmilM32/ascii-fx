import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo',
  publicDir: 'public',
  base: './',
  build: {
    outDir: '../site',
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5173,
  },
});
