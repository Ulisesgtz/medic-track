import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

// En desarrollo (`npm run dev`) las páginas se dibujan al pedirlas con el mismo código que usa el prerender, así que lo que se ve aquí
// es lo que se publica. En producción las escribe scripts/prerender.ts después de `vite build`, que solo compila el CSS y menu.ts.
function sitePages(): Plugin {
  return {
    name: 'site-pages',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = (request.url ?? '/').split(/[?#]/)[0]
        if (request.method !== 'GET' || path.includes('.') || path.startsWith('/@') || path.startsWith('/src/')) return next()
        try {
          const dev = await server.ssrLoadModule('/src/dev.tsx')
          const html = dev.renderForDev(path) as string | undefined
          if (!html) return next()
          response.setHeader('content-type', 'text/html; charset=utf-8')
          response.end(await server.transformIndexHtml(request.url ?? '/', html))
        } catch (error) {
          server.ssrFixStacktrace(error as Error)
          next(error)
        }
      })
    },
  }
}

// `vite preview` se comporta como Cloudflare Pages: /funciones sirve funciones.html, manda /funciones/ y /funciones.html a /funciones (308) y lo que no existe responde 404 con
// `404.html` (y el estado 404, no la portada). Solo vista previa local y pruebas E2E: en producción lo hace Pages.
function previewPages(): Plugin {
  return {
    name: 'site-preview-pages',
    configurePreviewServer(server) {
      const dist = resolve(server.config.root, server.config.build.outDir)
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? '/').split(/[?#]/)[0]
        if ((request.method !== 'GET' && request.method !== 'HEAD') || path.includes('..')) return next()
        // Como Pages: `/ruta/` y `/ruta.html` pasan a `/ruta` con 308 (`/index.html` a `/`).
        const canonical = path === '/index.html' ? '/' : path !== '/404.html' && path.endsWith('.html') ? path.slice(0, -5) : path.length > 1 ? path.replace(/\/+$/, '') : path
        if (canonical !== path) {
          response.statusCode = 308
          response.setHeader('location', canonical)
          return response.end()
        }
        if (path.includes('.')) return next()
        const page = join(dist, path === '/' ? 'index.html' : `${path}.html`)
        const notFound = join(dist, '404.html')
        const file = existsSync(page) ? page : existsSync(notFound) ? notFound : undefined
        if (!file) return next()
        response.statusCode = file === page ? 200 : 404
        response.setHeader('content-type', 'text/html; charset=utf-8')
        response.end(request.method === 'HEAD' ? undefined : readFileSync(file))
      })
    },
  }
}

export default defineConfig({
  plugins: [tailwindcss(), sitePages(), previewPages()],
  // Multipágina: las páginas las sirve `previewPages` (`<ruta>.html`); lo que no existe responde 404 (no la portada).
  appType: 'mpa',
  build: { cssCodeSplit: false },
  server: { port: 5174 },
  preview: { port: 4173 },
})
