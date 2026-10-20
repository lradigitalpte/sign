import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(root, "src") },
    // One React for the app and the shared UI package.
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 3010,
    strictPort: true,
    // WorkOS AuthKit calls (authorize, authenticate, refresh, logout) go through this dev server, so the
    // browser only talks to localhost:3010 and no CORS origin has to be configured in WorkOS for development.
    proxy: {
      "/user_management": {
        target: "https://api.workos.com",
        changeOrigin: true,
        configure: (proxy) => proxy.on("proxyReq", (request) => request.removeHeader("origin")),
      },
    },
  },
  preview: { port: 3010, strictPort: true },
});
