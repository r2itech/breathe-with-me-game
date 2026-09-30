import { defineConfig } from 'vite';

export default defineConfig({
  // relative paths so dist/index.html works over file:// inside Electron
  base: './',
  server: { port: 5173 },
  build: {
    outDir: 'dist',
    target: 'es2022',
    // shipped inside the installer, maps would just be dead weight
    sourcemap: false,
    minify: true,
    // no inlined assets sticking around as separate copies of the font
    assetsInlineLimit: 0,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 2500,
  },
});
