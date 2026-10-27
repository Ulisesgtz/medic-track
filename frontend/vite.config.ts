import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin, type ProxyOptions } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Testing on a phone through a temporary HTTPS tunnel (DEPLOY.md, "Prueba con túnel"): the phone only
// reaches this server, so `/api/*` is forwarded to the local backend — one tunnel, same origin, no
// CORS. The app uses it when VITE_API_BASE_URL is `/api` (`--mode tunnel`, .env.tunnel).
const apiProxy: Record<string, ProxyOptions> = {
  '/api': { target: 'http://localhost:8080', changeOrigin: true, rewrite: (path) => path.replace(/^\/api/, '') },
}
// Vite only answers requests for hosts it knows; these are the tunnel services' domains.
const tunnelHosts = ['.trycloudflare.com', '.ngrok-free.app']

// The id of this build (specs/017): compiled into the app and published in dist/version.json, so a phone with the
// app open can tell that a newer one is out. Same value for both: it is read once, here.
const appVersion = (process.env.CF_PAGES_COMMIT_SHA ?? process.env.GITHUB_SHA ?? String(Date.now())).slice(0, 12)
const versionFile: Plugin = {
  name: 'peditrack-version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: appVersion }) })
  },
}

// The child's phone installs an app of its own (specs/047), whose manifest starts at /hijo. Safari loads the manifest the HTML names
// as soon as it parses it and keeps that one for the whole page: a manifest swapped later by a script is never the one «Agregar a
// pantalla de inicio» uses, and the installed app opened at the parents' /home. So each child route of App.tsx is served with an HTML
// that already names the child's manifest: a copy of the built index.html (Cloudflare Pages and `vite preview` serve /hijo/hoy from
// hijo/hoy.html), and the dev server rewrites it on the fly.
const CHILD_PAGES = ['hijo.html', 'hijo/hoy.html']
const PARENTS_MANIFEST = 'href="/manifest.webmanifest"'
function childHtml(html: string): string {
  if (html.split(PARENTS_MANIFEST).length !== 2) throw new Error(`index.html must name ${PARENTS_MANIFEST} exactly once`)
  return html.replace(PARENTS_MANIFEST, 'href="/manifest-hijo.webmanifest"')
}
const childPages: Plugin = {
  name: 'peditrack-child-pages',
  enforce: 'post',
  transformIndexHtml(html, ctx) {
    const path = ctx.originalUrl?.split(/[?#]/)[0] ?? ''
    if (ctx.server && (path === '/hijo' || path.startsWith('/hijo/'))) return childHtml(html)
  },
  generateBundle(_, bundle) {
    const index = bundle['index.html']
    if (index?.type !== 'asset') return this.error('index.html is not in the bundle')
    const source = childHtml(String(index.source))
    for (const fileName of CHILD_PAGES) this.emitFile({ type: 'asset', fileName, source })
  },
}

// https://vite.dev/config/
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  plugins: [
    react(),
    tailwindcss(),
    versionFile,
    childPages,
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
