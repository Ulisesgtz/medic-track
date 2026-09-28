import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type ProxyOptions } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Testing on a phone through a temporary HTTPS tunnel (DEPLOY.md, "Prueba con túnel"): the phone only
// reaches this server, so `/api/*` is forwarded to the local backend — one tunnel, same origin, no
// CORS. The app uses it when VITE_API_BASE_URL is `/api` (`--mode tunnel`, .env.tunnel).
const apiProxy: Record<string, ProxyOptions> = {
  '/api': { target: 'http://localhost:8080', changeOrigin: true, rewrite: (path) => path.replace(/^\/api/, '') },
}
// Vite only answers requests for hosts it knows; these are the tunnel services' domains.
const tunnelHosts = ['.trycloudflare.com', '.ngrok-free.app']

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // The service worker that receives the dose reminders (specs/011-recordatorios-push). Written in
    // TypeScript (src/sw.ts) and compiled by the plugin; no precache (working offline is out of scope)
    // and our own public/manifest.webmanifest stays as it is.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      manifest: false,
      injectRegister: 'script-defer',
      injectManifest: { injectionPoint: undefined },
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
  server: { proxy: apiProxy, allowedHosts: tunnelHosts },
  preview: { proxy: apiProxy, allowedHosts: tunnelHosts },
})
