import { defineConfig, createLogger } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";

const isE2E = process.env.E2E_TESTS === "1";
const baseLogger = createLogger();
const e2eLogger = {
  ...baseLogger,
  error(msg: string | Error, options?: { clear?: boolean; timestamp?: boolean }) {
    if (isE2E && typeof msg === "string" && msg.includes("ws proxy")) {
      return;
    }
    baseLogger.error(msg, options);
  },
};

export default defineConfig({
  customLogger: isE2E ? e2eLogger : undefined,
  plugins: [vue()],

  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../core/src"),
      "@": path.resolve(__dirname, "./src"),
    },
  },

  server: {
    port: 5173,
    proxy: {
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
        configure: (proxy) => {
          if (process.env.E2E_TESTS === "1") {
            proxy.removeAllListeners("error");
            proxy.on("error", () => {});
          }
        },
      },
      "/health": "http://localhost:3001",
    },
  },

  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
});
