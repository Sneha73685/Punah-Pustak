import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Minimal config for the Milestone 0 placeholder scaffold. Proxying to the
// API, path aliases, etc. are added starting Milestone 5 when real pages
// and data-fetching are built.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
