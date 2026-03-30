import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    {
      name: 'mock-mp3',
      resolveId(id) {
        if (id.endsWith('.mp3')) {
          return path.resolve(__dirname, '__tests__/mocks/audioFile.ts');
        }
      },
    },
  ],
  resolve: {
    alias: [{ find: /^@shared\/(.*)/, replacement: path.resolve(__dirname, 'core/src/$1') }],
  },
  test: {
    globals: true,
    environment: 'node',
    clearMocks: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/__tests__/**/*.test.ts'],
  },
});
