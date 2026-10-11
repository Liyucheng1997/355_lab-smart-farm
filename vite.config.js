import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { open: false },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: { output: { manualChunks: { three: ['three'], echarts: ['echarts'] } } },
  },
});
