import { expect, test } from '@playwright/test'
import { SIZES, expectNoAxeViolations, expectNoHorizontalOverflow, expectOneH1, open, trackOutsideRequests } from './helpers'

// El blog contra un sitio compilado con artículos de muestra `ready: true` (e2e/fixtures/blog, servidor de playwright.config.ts en el
// puerto 4175). El borrador de muestra (`ready: false`) no se publica. Specs/080, Historia 5.

test.use({ baseURL: 'http://localhost:4175' })

for (const size of SIZES) {
  test.describe(`a ${size.width} px (${size.name})`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    test('/blog lista las guías listas, la más reciente destacada, y no el borrador', async ({ page }) => {
      await open(page, '/blog')
      await expect(page).toHaveTitle('Blog y guías de PediTrack: organiza recetas y tomas')
      await expectOneH1(page, 'Guías para organizar las recetas, tomas y consultas de tus hijos')
      const cards = page.locator('main article')
      await expect(cards).toHaveCount(2)
      await expect(cards.first().getByRole('heading', { level: 2 })).toHaveText('Guía de muestra para las pruebas')
      await expect(page.getByText('Borrador que no se publica')).toHaveCount(0)
      await expect(page.getByText('No son consejos médicos')).toBeVisible()
    })

    test('el pie enlaza a «Blog y guías» y la 404 también', async ({ page }) => {
      await open(page, '/')
      await expect(page.locator('footer').getByRole('link', { name: 'Blog y guías' })).toHaveAttribute('href', '/blog')
      await page.goto('/no-existe')
      await expect(page.getByRole('link', { name: 'Blog y guías' }).first()).toBeVisible()
    })

    test('el borrador no existe (404) y no entra al sitemap', async ({ page, request }) => {
      expect((await page.goto('/blog/borrador-de-muestra'))?.status()).toBe(404)
      const sitemap = await (await request.get('/sitemap.xml')).text()
      expect(sitemap).toContain('/blog/guia-de-muestra')
      expect(sitemap).toContain('<loc>https://pedi-track.com/blog</loc>')
      expect(sitemap).not.toContain('borrador-de-muestra')
    })

    test('el artículo: fecha real, aviso fijo, secciones, enlaces y datos estructurados', async ({ page }) => {
      await open(page, '/blog')
      await page.getByRole('link', { name: 'Leer la guía →' }).first().click()
      await expect(page).toHaveURL(/\/blog\/guia-de-muestra$/)
      await expectOneH1(page, 'Guía de muestra para las pruebas')
      await expect(page.locator('main article')).toContainText('1 de diciembre de 2026')
      await expect(page.getByRole('note')).toContainText('Esta guía habla de organización, no de salud.')
      await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Primera parte de la muestra', 'Segunda parte de la muestra'])
      await expect(page.getByRole('link', { name: 'Ver planes' })).toHaveAttribute('href', '/planes')
      await expect(page.getByRole('link', { name: /^Funciones de PediTrack/ })).toHaveAttribute('href', '/funciones')
      await expect(page.getByRole('link', { name: /Otra guía de muestra/ })).toHaveAttribute('href', '/blog/otra-guia-de-muestra')
      const json = (await page.locator('script[type="application/ld+json"]').allTextContents()).map((text) => JSON.parse(text))
      expect(json.find((data) => data['@type'] === 'Article')).toMatchObject({ datePublished: '2026-12-01', dateModified: '2026-12-02' })
      expect(json.find((data) => data['@type'] === 'BreadcrumbList').itemListElement).toHaveLength(3)
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow')
    })

    if (size.width === 1440) {
      test('el índice «En esta guía» salta a la sección', async ({ page }) => {
        await open(page, '/blog/guia-de-muestra')
        await page.getByRole('navigation', { name: 'Contenido' }).getByRole('link', { name: 'Segunda parte de la muestra' }).click()
        await expect(page).toHaveURL(/#segunda-parte-de-la-muestra$/)
        await expect(page.locator('#segunda-parte-de-la-muestra')).toBeInViewport()
      })
    }

    for (const path of ['/blog', '/blog/guia-de-muestra']) {
      test(`${path}: axe, sin desbordes y sin terceros`, async ({ page }) => {
        const outside = trackOutsideRequests(page)
        await open(page, path)
        await expectNoAxeViolations(page)
        await expectNoHorizontalOverflow(page)
        expect(outside).toEqual([])
      })
    }
  })
}
