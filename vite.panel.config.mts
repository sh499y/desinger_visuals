// Panel sterowania: osobna aplikacja React serwowana przez backend (:4000).
// Dev: Vite na :5174 z proxy do backendu. Build: out/panel.
import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const backend = 'http://127.0.0.1:4000'

export default defineConfig({
  root: resolve('src/panel'),
  base: './',
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@panel': resolve('src/panel/src')
    }
  },
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/media': { target: backend, changeOrigin: true },
      '/ws': { target: backend, changeOrigin: true, ws: true }
    }
  },
  build: {
    outDir: resolve('out/panel'),
    emptyOutDir: true
  }
})
