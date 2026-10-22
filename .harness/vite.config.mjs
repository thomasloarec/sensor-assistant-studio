import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import path from "node:path";
export default {
  root: path.resolve("/dev-server/.harness"),
  publicDir: "/dev-server/public",
  plugins: [react(), tailwind()],
  optimizeDeps: { include: ["three", "three/examples/jsm/loaders/GLTFLoader.js"] },
  resolve: { dedupe: ["three", "react", "react-dom"], alias: { "@": "/dev-server/src" } },
  server: { port: 5199, host: "127.0.0.1", fs: { allow: ["/dev-server"] } },
};
