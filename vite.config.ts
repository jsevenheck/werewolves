import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname, 'client'),
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        configure: (proxy) => {
          if (process.env.E2E_TESTS === '1') {
            // Entferne alle Error-Listener
            proxy.removeAllListeners('error');
            proxy.removeAllListeners('proxyReqWs');
            
            // Füge stille Handler hinzu
            proxy.on('error', () => {});
            proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
              socket.removeAllListeners('error');
              socket.on('error', () => {});
            });
          }
        }
      },
      '/health': 'http://localhost:3001'
    }
  },
  customLogger: process.env.E2E_TESTS === '1' ? {
    info: () => {},
    warn: () => {},
    error: () => {},
    clearScreen: () => {},
    hasErrorLogged: () => false,
    hasWarned: false,
    warnOnce: () => {}
  } : undefined,
  build: {
    outDir: path.resolve(__dirname, 'dist/client'),
    emptyOutDir: true
  }
});