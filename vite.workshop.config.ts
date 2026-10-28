// Local component preview only. Not used by the application's production build.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { host: "127.0.0.1", port: 5174, strictPort: true },
});
