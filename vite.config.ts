import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: false,
    modulePreload: { polyfill: false },
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 8080,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
