import { createElement } from 'react'
import { loadArticles, readyArticles, type BlogArticle } from './content/blog.ts'
import { PAGES, type Crumb, type Page } from './pages.ts'
import { ArticlePage, Blog } from './pages/Blog.tsx'
import { DEFAULT_SITE_ORIGIN, isProduction, loadSettings, siteOrigin, type SiteContextValue } from './site.ts'

type Env = Record<string, string | undefined>

/** El contexto con que se dibuja el sitio al compilar, según las variables de entorno de la compilación. */
export function siteContext(env: Env = process.env, hasBlog = false): SiteContextValue {
  return { settings: loadSettings(env), production: isProduction(env), hasBlog, origin: siteOrigin(env) || DEFAULT_SITE_ORIGIN }
}

const withoutBrand = (title: string) => title.replace(/ \| PediTrack$/, '')

/** La página de un artículo: la de la tabla de SEO si el slug está en ella; si no, una con lo que dice el archivo. */
function articlePage(article: BlogArticle, others: BlogArticle[], base: Page | undefined): Page {
  const path = `/blog/${article.slug}`
  const blogCrumb: Crumb = { name: 'Blog y guías', path: '/blog' }
  const h1 = base?.h1 ?? withoutBrand(article.title)
  return {
    path,
    title: article.title,
    description: article.description,
    h1,
    schema: ['Article', 'BreadcrumbList'],
    index: true,
    ogImage: base?.ogImage ?? `/og/blog-${article.slug}.png`,
    breadcrumbs: base?.breadcrumbs ?? [{ name: 'Inicio', path: '/' }, blogCrumb, { name: h1, path }],
    article: { headline: h1, datePublished: article.datePublished, dateModified: article.dateModified },
    component: () => createElement(ArticlePage, { article, others }),
  }
}

/**
 * Las páginas que se escriben: las que ya tienen componente más el blog, que solo existe con artículos listos (FR-014). Sin
 * artículos `ready: true` no hay `/blog`, ni artículo, ni enlace «Blog» (hasBlog = false en el contexto).
 */
export function builtPages(pages: Page[] = PAGES, articles: BlogArticle[] = loadArticles()): Page[] {
  const ready = readyArticles(articles)
  const fixed = pages.filter((page) => !page.path.startsWith('/blog') && page.component)
  if (ready.length === 0) return fixed
  const listing = pages.find((page) => page.path === '/blog')
  const blog: Page[] = []
  if (listing) blog.push({ ...listing, component: () => createElement(Blog, { articles: ready }) })
  for (const article of ready) {
    const others = ready.filter((other) => other.slug !== article.slug)
    blog.push(articlePage(article, others, pages.find((page) => page.path === `/blog/${article.slug}`)))
  }
  return [...fixed, ...blog]
}

/** ¿Hay blog? Con artículos listos el menú y el pie enlazan a él. */
export function hasBlog(articles: BlogArticle[] = loadArticles()): boolean {
  return readyArticles(articles).length > 0
}
