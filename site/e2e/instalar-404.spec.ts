import { expect, test } from '@playwright/test'
import { SIZES, expectNoAxeViolations, expectNoHorizontalOverflow, expectOneH1, open, trackOutsideRequests } from './helpers'

// Instalar la app y la 404 a 390 y 1440 px, en Chromium y WebKit (specs/080, Historias 4 y 6).

for (const size of SIZES) {
  test.describe(`a ${size.width} px (${size.name})`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    test('/instalar: iPhone y Android, cuatro pasos cada uno, con la dirección de la app', async ({ page }) => {
      await open(page, '/instalar')
      await expect(page).toHaveTitle('Instalar PediTrack en iPhone y Android, paso a paso')
      await expectOneH1(page, 'Instalar PediTrack en tu teléfono, paso a paso')
      await expect(page.getByRole('heading', { level: 2, name: 'iPhone (Safari)' })).toBeVisible()
      await expect(page.getByRole('heading', { level: 2, name: 'Android (Chrome)' })).toBeVisible()
      const lists = page.locator('main ol')
      await expect(lists).toHaveCount(2)
      for (const at of [0, 1]) await expect(lists.nth(at).locator('> li')).toHaveCount(4)
      await expect(lists.nth(0)).toContainText('Entra a app.pedi-track.com desde Safari.')
      await expect(lists.nth(0)).toContainText('Toca Compartir')
      await expect(lists.nth(0)).toContainText('«Agregar a pantalla de inicio»')
      await expect(lists.nth(1)).toContainText('desde Chrome.')
      await expect(page.locator('main [role="img"]')).toHaveCount(8)
    })

    test('/instalar: «Ver preguntas sobre la instalación» abre ese tema', async ({ page }) => {
      await open(page, '/instalar')
      await page.getByRole('link', { name: /Ver preguntas sobre la instalación/ }).click()
      await expect(page).toHaveURL(/\/preguntas-frecuentes#instalacion-y-uso$/)
      await expect(page.locator('#instalacion-y-uso')).toBeInViewport()
    })

    test('/instalar: axe, sin desbordes y sin terceros', async ({ page }) => {
      const outside = trackOutsideRequests(page)
      await open(page, '/instalar')
      await expectNoAxeViolations(page)
      await expectNoHorizontalOverflow(page)
      expect(outside).toEqual([])
    })

    test('una dirección que no existe responde 404 con la página «No encontramos esta página»', async ({ page }) => {
      const response = await page.goto('/no-existe')
      expect(response?.status()).toBe(404)
      await page.evaluate(() => document.fonts.ready)
      await expect(page).toHaveTitle('Página no encontrada | PediTrack')
      await expectOneH1(page, 'No encontramos esta página')
      const destinos = page.getByRole('navigation', { name: 'Páginas que te pueden servir' }).getByRole('link')
      await expect(destinos).toHaveText(['Inicio', 'Funciones', 'Planes', 'Preguntas frecuentes'])
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)
    })

    test('404: los destinos y «Ir al inicio» llevan a su página; axe y sin desbordes', async ({ page }) => {
      await page.goto('/no-existe')
      await page.evaluate(() => document.fonts.ready)
      await expectNoAxeViolations(page)
      await expectNoHorizontalOverflow(page)
      await page.getByRole('navigation', { name: 'Páginas que te pueden servir' }).getByRole('link', { name: 'Planes' }).click()
      await expect(page).toHaveURL(/\/planes$/)
      await page.goto('/no-existe')
      await page.getByRole('link', { name: 'Ir al inicio' }).click()
      await expect(page).toHaveURL('/')
    })

    test('sin blog publicado no hay /blog (404) ni enlace «Blog» en el menú, el pie ni la portada', async ({ page }) => {
      expect((await page.goto('/blog'))?.status()).toBe(404)
      expect((await page.goto('/blog/organizar-recetas-hijos'))?.status()).toBe(404)
      await open(page, '/')
      await expect(page.getByRole('link', { name: /^Blog/ })).toHaveCount(0)
    })
  })
}
