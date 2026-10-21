import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// In dev, /api is proxied to the Go backend (when VITE_API=http).
export default defineConfig({
  plugins: [svelte()],
  server: {
    proxy: {
      '/api': { target: process.env.API_TARGET ?? 'http://localhost:8080', changeOrigin: true },
    },
  },
})
