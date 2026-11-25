import { expect, test } from '@playwright/test'
import { APP, SIZES, expectNoAxeViolations, expectNoHorizontalOverflow, expectOneH1, open, trackOutsideRequests } from './helpers'

// Funciones, Planes y Preguntas frecuentes a 390 y 1440 px, en Chromium y WebKit (specs/080, Historia 2).

for (const size of SIZES) {
  test.describe(`a ${size.width} px (${size.name})`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    test.describe('/funciones', () => {
      test('título, un H1, los cuatro grupos y la etiqueta de plan de cada tarjeta', async ({ page }) => {
        await open(page, '/funciones')
        await expect(page).toHaveTitle('Funciones de PediTrack: recetas, tomas, vacunas, crecimiento')
        await expectOneH1(page, 'Funciones de PediTrack: consultas, medicamentos, vacunas y crecimiento')
        for (const group of ['Consultas y medicamentos', 'Cada hijo', 'Toda la familia', 'Siempre contigo']) {
          await expect(page.getByRole('heading', { level: 2, name: group })).toBeVisible()
        }
        await expect(page.locator('main article')).toHaveCount(18)
        await expect(page.locator('#crecimiento')).toContainText('Gráfica: Plan completo')
        await expect(page.locator('#vacunacion')).toContainText('Plan gratis')
        await expect(page.locator('#botiquin')).toContainText('Plan completo')
      })

      test('las anclas llevan a la tarjeta (también desde otra página)', async ({ page }) => {
        await open(page, '/funciones#vacunacion')
        await expect(page.locator('#vacunacion')).toBeInViewport()
        await open(page, '/funciones')
        await page.getByRole('link', { name: 'Toda la familia' }).first().click()
        await expect(page).toHaveURL(/#grupo-familia$/)
        await expect(page.locator('#grupo-familia')).toBeInViewport()
      })

      test('«Ver planes y precios» lleva a /planes', async ({ page }) => {
        await open(page, '/funciones')
        await page.getByRole('link', { name: 'Ver planes y precios' }).click()
        await expect(page).toHaveURL(/\/planes$/)
      })

      test('axe, sin desbordes y sin terceros', async ({ page }) => {
        const outside = trackOutsideRequests(page)
        await open(page, '/funciones')
        await expectNoAxeViolations(page)
        await expectNoHorizontalOverflow(page)
        expect(outside).toEqual([])
      })
    })

    test.describe('/planes', () => {
      test('precio, los dos planes y los botones hacia la app', async ({ page }) => {
        await open(page, '/planes')
        await expect(page).toHaveTitle('Planes y precios de PediTrack: gratis o MX$499 al año')
        await expectOneH1(page, 'Planes y precios: gratis o Plan completo de MX$499 al año')
        await expect(page.getByText('MX$0', { exact: true }).first()).toBeVisible()
        await expect(page.getByText('MX$499', { exact: true })).toBeVisible()
        await expect(page.getByRole('link', { name: 'Empezar gratis' })).toHaveAttribute('href', `${APP}/signup`)
        const elegir = page.getByRole('link', { name: 'Elegir Plan completo' })
        await expect(elegir).toHaveAttribute('href', `${APP}/planes`)
        expect((await elegir.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
      })

      test('la tabla es una tabla con sus 17 filas, el precio al final y texto en «Incluido»', async ({ page }) => {
        await open(page, '/planes')
        const table = page.getByRole('table', { name: 'Comparación de planes' })
        await expect(table).toBeVisible()
        await expect(table.getByRole('columnheader')).toHaveCount(3)
        await expect(table.getByRole('row')).toHaveCount(19)
        await expect(table.getByRole('row').last()).toContainText('MX$499 al año')
        await expect(table.getByRole('cell', { name: 'No incluido' }).first()).toBeVisible()
        if (size.width === 1440) await expect(table.getByText('No incluido', { exact: true }).first()).toBeVisible()
      })

      test('los acordeones del cobro abren y cierran', async ({ page }) => {
        await open(page, '/planes')
        const items = page.locator('main details')
        await expect(items).toHaveCount(3)
        await expect(items.nth(0)).toHaveJSProperty('open', true)
        await items.nth(1).locator('summary').click()
        await expect(items.nth(1)).toHaveJSProperty('open', true)
        await expect(items.nth(1)).toContainText('Lo registrado nunca se borra')
        await items.nth(0).locator('summary').click()
        await expect(items.nth(0)).toHaveJSProperty('open', false)
      })

      test('axe, sin desbordes y sin terceros', async ({ page }) => {
        const outside = trackOutsideRequests(page)
        await open(page, '/planes')
        await expectNoAxeViolations(page)
        await expectNoHorizontalOverflow(page)
        expect(outside).toEqual([])
      })
    })

    test.describe('/preguntas-frecuentes', () => {
      test('15 preguntas en 5 temas, la primera abierta', async ({ page }) => {
        await open(page, '/preguntas-frecuentes')
        await expect(page).toHaveTitle('Preguntas frecuentes de PediTrack: planes, instalar, datos')
        await expectOneH1(page, 'Preguntas frecuentes sobre PediTrack')
        await expect(page.locator('main h2')).toHaveCount(5)
        await expect(page.locator('main details')).toHaveCount(15)
        await expect(page.locator('main details[open]')).toHaveCount(1)
        await expect(page.locator('main details').first()).toHaveJSProperty('open', true)
      })

      test('un acordeón se abre con un toque y muestra la respuesta', async ({ page }) => {
        await open(page, '/preguntas-frecuentes')
        const item = page.locator('#es-gratis')
        await item.locator('summary').click()
        await expect(item).toHaveJSProperty('open', true)
        await expect(item).toContainText('MX$499 al año')
      })

      test('los temas llevan a su sección y la instalación nombra la app', async ({ page }) => {
        await open(page, '/preguntas-frecuentes')
        await page.getByRole('navigation', { name: 'Temas' }).getByRole('link', { name: 'Tus datos' }).click()
        await expect(page).toHaveURL(/#tus-datos$/)
        await expect(page.locator('#tus-datos')).toBeInViewport()
        await expect(page.locator('#instalar-iphone')).toContainText('Abre app.pedi-track.com en Safari')
        await expect(page.locator('#descargar-datos')).toContainText('«Mi cuenta»')
        await expect(page.locator('#eliminar-cuenta')).toContainText('«Eliminar mi cuenta»')
      })

      test('lleva los datos estructurados FAQPage (15 preguntas) y solo aquí', async ({ page }) => {
        await open(page, '/preguntas-frecuentes')
        const json = await page.locator('script[type="application/ld+json"]').allTextContents()
        const faq = json.map((text) => JSON.parse(text)).find((data) => data['@type'] === 'FAQPage')
        expect(faq.mainEntity).toHaveLength(15)
        await open(page, '/planes')
        expect((await page.locator('script[type="application/ld+json"]').allTextContents()).join('')).not.toContain('FAQPage')
      })

      test('axe, sin desbordes y sin terceros', async ({ page }) => {
        const outside = trackOutsideRequests(page)
        await open(page, '/preguntas-frecuentes')
        await expectNoAxeViolations(page)
        await expectNoHorizontalOverflow(page)
        expect(outside).toEqual([])
      })
    })
  })
}
