import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server (npm run dev) and preview server (npm run preview, used in Docker)
// proxy /api and /socket.io to the backend nested through the Docker network.
// The /api prefix is preserved: the backend exposes its routes under /api.
// In production the global nginx does the same routing (telemetry.conf).
const backendProxy = {
  '/api': {
    target: 'http://backend-nestjs:3000',
    changeOrigin: true,
  },
  '/socket.io': {
    target: 'http://backend-nestjs:3000',
    ws: true,
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: backendProxy,
  },
  preview: {
    host: true,
    port: 5173,
    proxy: backendProxy,
    allowedHosts: ['telemetry.artisandevs.site'],
  },
})