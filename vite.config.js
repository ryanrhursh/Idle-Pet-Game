import { defineConfig } from 'vite';

export default defineConfig({
  // relative paths so the build works from any folder or sub-path (GitHub Pages, itch.io, Capacitor, ...)
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 1000 },
});
