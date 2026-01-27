import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],

  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../src/shared'),
      '@': path.resolve(__dirname, './src')
    }
  },

  server: {
    port: 5174,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        configure: (proxy) => {
          if (process.env.E2E_TESTS === '1') {
            proxy.removeAllListeners('error');
            proxy.on('error', () => {});
          }
        }
      },
      '/health': 'http://localhost:3001'
    }
  },

  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'WerewolvesGame',
      formats: ['es', 'umd'],
      fileName: (format) => `werewolves-game.${format}.js`
    },
    rollupOptions: {
      external: ['vue', 'pinia', 'socket.io-client'],
      output: {
        globals: {
          vue: 'Vue',
          pinia: 'Pinia',
          'socket.io-client': 'io'
        },
        assetFileNames: 'werewolves-game.[ext]'
      }
    }
  }
});
