import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";

export default defineConfig({
  plugins: [vue()],

  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../src/shared"),
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
    outDir: "dist",
    emptyOutDir: true,
  },
});
