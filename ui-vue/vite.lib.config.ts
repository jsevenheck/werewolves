import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],

  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../core/src'),
      '@': path.resolve(__dirname, './src'),
    },
  },

  build: {
    outDir: 'dist-lib',
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'WerewolvesGame',
      formats: ['es', 'umd'],
      fileName: (format) => `werewolves-game.${format}.js`,
    },
    rollupOptions: {
      external: ['vue', 'pinia', 'socket.io-client'],
      output: {
        globals: {
          vue: 'Vue',
          pinia: 'Pinia',
          'socket.io-client': 'io',
        },
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
