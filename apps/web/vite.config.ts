import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3000" },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "charts", test: /node_modules[\\/](echarts|zrender)/ },
            {
              name: "motion",
              test: /node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)/,
            },
          ],
        },
      },
    },
  },
});
