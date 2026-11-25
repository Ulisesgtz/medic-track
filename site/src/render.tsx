import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Layout } from './layout/Layout.tsx'
import type { Page } from './pages.ts'
import { Seo, type ArticleMeta } from './seo.tsx'
import { PageContext, SiteContext, type SiteContextValue } from './site.ts'

/** Los archivos que Vite generó (hojas de estilo y el script del menú); `prerender.ts` los lee de `dist/index.html`. */
export interface Assets {
  styles: string[]
  scripts: string[]
}

export interface RenderOptions {
  site: SiteContextValue
  assets: Assets
  article?: ArticleMeta
  /** El contenido de la página; por omisión, su componente. */
  content?: ReactNode
}

/** Una página como HTML completo: `<!doctype>`, `<head>` con su SEO y el cuerpo ya dibujado. Sin React en el navegador (R1). */
export function renderPage(page: Page, { site, assets, article, content }: RenderOptions): string {
  const Content = page.component
  const body = content ?? (Content ? <Content /> : null)
  const html = renderToStaticMarkup(
    <html lang="es-MX">
      <head>
        <Seo page={page} ctx={{ origin: site.origin, settings: site.settings, production: site.production, article }} />
        {assets.styles.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
        {assets.scripts.map((src) => (
          <script key={src} type="module" src={src} />
        ))}
      </head>
      <body>
        <SiteContext.Provider value={site}>
          <PageContext.Provider value={page}>
            <Layout currentPath={page.path}>{body}</Layout>
          </PageContext.Provider>
        </SiteContext.Provider>
      </body>
    </html>,
  )
  return `<!doctype html>${html}`
}
