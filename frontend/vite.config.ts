import { defineConfig, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

/*
 * The dev and preview proxies keep the browser same-origin with the API,
 * but they used to forward the browser's Origin header untouched while
 * rewriting Host to 8080. Spring's CORS filter then saw a request from
 * :5173 or :4173 arriving "at" :8080, a mismatch outside
 * CORS_ALLOWED_ORIGINS, and rejected every state-changing POST with
 * 403 "Invalid CORS request" (browsers omit Origin on same-origin GETs,
 * which is why browsing kept working while booking broke).
 *
 * Dropping the Origin header inside the proxy restores the same-origin
 * arrangement the backend was built for - no CORS surface, no backend
 * change. Set VITE_API_BASE_URL and CORS_ALLOWED_ORIGINS instead when the
 * frontend is served from a real different origin.
 */
const apiProxy: ProxyOptions = {
  target: 'http://localhost:8080',
  changeOrigin: true,
  configure(proxy) {
    proxy.on('proxyReq', (proxyReq) => {
      proxyReq.removeHeader('origin')
      proxyReq.removeHeader('referer')
    })
  },
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': apiProxy,
    },
  },
  // The production preview (`vite preview`) gets the same arrangement,
  // otherwise a built bundle served on 4173 would suddenly need CORS
  // exceptions that development never exercises.
  preview: {
    port: 4173,
    proxy: {
      '/api': apiProxy,
    },
  },
})
