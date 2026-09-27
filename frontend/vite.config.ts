import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

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
})
