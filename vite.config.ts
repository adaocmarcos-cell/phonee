import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("/html2canvas/")) return "vendor-html2canvas";
          if (id.includes("/dompurify/")) return "vendor-dompurify";
          // NOTE: do NOT split recharts / d3 / victory-vendor into a separate
          // chunk. Recharts + d3 have circular imports internally; splitting
          // them across chunk boundaries breaks initialization order and
          // triggers a TDZ error ("Cannot access 'P' before initialization")
          // in production. Let Rollup co-locate them with their consumers.
          if (id.includes("/jspdf/")) return "vendor-jspdf";
          if (id.includes("/@supabase/")) return "vendor-supabase";
          if (id.includes("/@tanstack/")) return "vendor-query";
          if (id.includes("/react-router") || id.includes("/react-dom/") || id.match(/\/react\/[^/]+$/)) return "vendor-react";
        },
      },
    },
  },
}));
