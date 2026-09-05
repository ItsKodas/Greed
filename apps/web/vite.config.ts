import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The API, the auth routes and the socket are all proxied to the game server,
 * so in development the browser talks to one origin — exactly as it will in
 * production, where the server serves the built client itself. Without this the
 * session cookie would not travel with the socket handshake and a signed-in
 * player would look like a guest at the table.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
      "/auth": "http://localhost:3001",
      "/healthz": "http://localhost:3001",
      "/socket.io": { target: "http://localhost:3001", ws: true },
    },
  },
  optimizeDeps: { exclude: ["@greed/ui", "@greed/rules", "@greed/shared"] },
});
