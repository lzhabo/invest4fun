import { defineConfig } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { contentSecurityPolicyHeader } from "./src/security-headers.js";

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ["**/node_modules/**", "**/.worktrees/**", "apps/**"]
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  root: ".",
  server: {
    port: 5173,
    headers: {
      "Content-Security-Policy": contentSecurityPolicyHeader(true),
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    },
    proxy: {
      "/api": process.env.API_PROXY_TARGET ?? "http://localhost:8787"
    }
  },
  build: {
    outDir: "dist/client",
    sourcemap: false
  }
});
