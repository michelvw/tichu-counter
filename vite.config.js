import { defineConfig } from "vite";

// Bundles src/cloud/index.js into a single classic script (js/cloud.js)
// that exposes window.TichuCloud. The HTML pages and legacy scripts are
// not processed by Vite.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "js",
    emptyOutDir: false,
    lib: {
      entry: "src/cloud/index.js",
      formats: ["iife"],
      name: "TichuCloudBundle",
      fileName: () => "cloud.js",
    },
  },
});
