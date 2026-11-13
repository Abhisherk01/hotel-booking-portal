import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Keep the browser same-origin with the API during development so no
    // CORS surface exists at all; requests hit Spring Boot on 8080 behind
    // the dev server.
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  // The production preview (`vite preview`) gets the same arrangement,
  // otherwise a built bundle served on 4173 would suddenly need CORS
  // exceptions that development never exercises.
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
