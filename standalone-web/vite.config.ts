import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],

  root: __dirname,
  // Reuse ui-vue public assets (narrator audio, etc.)
  publicDir: path.resolve(__dirname, '../ui-vue/public'),

  resolve: {
    alias: {
      // Reuse the same aliases as ui-vue for shared imports
      '@shared': path.resolve(__dirname, '../core/src'),
      '@': path.resolve(__dirname, '../ui-vue/src'),
    },
    // Avoid duplicate Vue/Pinia instances when ui-vue has its own node_modules.
    dedupe: ['vue', 'pinia'],
  },

  server: {
    port: 5173,
    proxy: {
      // Proxy Socket.IO requests to the standalone server
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        configure: (proxy) => {
          // Suppress errors during E2E tests
          if (process.env.E2E_TESTS === '1') {
            proxy.removeAllListeners('error');
            proxy.on('error', () => {});
          }
        },
      },
      '/health': 'http://localhost:3001',
    },
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
