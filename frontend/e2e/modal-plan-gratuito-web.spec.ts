import type { Page } from '@playwright/test'
import { test, expect, seedChild } from './helpers'

// Web design of the home (specs/055, `Inicio PediTrack.dc.html`: «Hola, Ana», the children in two columns with the dashed
// «+ Agregar hijo» and its plan note, and the sidebar) and the free-plan pop-up opened by «+ Agregar hijo» — from the page or
// from the sidebar. The pop-up's positions were measured on its mock at each width.
// Requires the backend running locally.

const box = async (locator: ReturnType<Page['locator']>) => {
  const b = (await locator.boundingBox())!
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
}

async function open(page: Page, width: number) {
  await seedChild(page, { withConsultation: false, plan: 'free' })
  await page.setViewportSize({ width, height: 900 })
  await page.goto('/home')
  await page.evaluate(() => document.fonts.ready)
}

const pageButton = (page: Page) => page.getByRole('main').getByRole('button', { name: /Agregar hijo/ })
const sidebarButton = (page: Page) => page.getByRole('navigation', { name: 'Tus hijos' }).getByRole('button', { name: '+ Agregar hijo' })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Tu plan incluye un hijo' })

test.describe('Home web y pop-up del plan gratuito (mock 15)', () => {
  for (const { width, dialogX } of [
    { width: 1440, dialogX: 430 },
    { width: 1280, dialogX: 350 },
    { width: 1024, dialogX: 222 },
  ]) {
    test(`a ${width} px: la tarjeta y «+ Agregar hijo» en dos columnas y el pop-up centrado`, async ({ page }) => {
      await open(page, width)

      expect(await box(page.locator('aside').first())).toMatchObject({ x: 0, w: 280 })
      await expect(page.getByRole('heading', { level: 1, name: 'Hola, Ana' })).toHaveCSS('font-size', '34px')
      const card = await box(page.getByRole('main').locator('article').first())
      const tile = await box(pageButton(page))
      expect(tile.y).toBe(card.y)
      expect(tile.x).toBeGreaterThan(card.x + card.w)
      expect(Math.abs(tile.w - card.w)).toBeLessThanOrEqual(1)
      await expect(pageButton(page)).toContainText('Tu plan incluye un hijo')

      await pageButton(page).click()
      const dlg = await box(dialog(page))
      expect(dlg).toMatchObject({ x: dialogX, w: 580 })
      expect(Math.abs(dlg.y + dlg.h / 2 - 450)).toBeLessThan(2)
    })
  }

  test('bajo 1024 px no hay barra lateral y la página no se sale de lado', async ({ page }) => {
    await open(page, 1000)

    await expect(page.getByRole('navigation', { name: 'Tus hijos' })).toHaveCount(0)
    expect(await box(page.getByRole('main'))).toMatchObject({ x: 0, w: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    await pageButton(page).click()
    await expect(dialog(page)).toBeVisible()
  })

  test('la página lleva «Hola, Ana», «Tu día», la tarjeta del hijo con su día, «+ Agregar hijo» y la barra lateral', async ({ page }) => {
    await open(page, 1280)

    await expect(page.getByRole('heading', { level: 1, name: 'Hola, Ana' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Tus hijos' })).toBeVisible()
    const card = page.getByRole('main').getByRole('link', { name: 'Ver detalle de Mateo' })
    await expect(card).toContainText(/\d+ años( \d+ meses?)?/) // the age moves with the calendar
    await expect(card).toContainText('Hoy no hay tomas ni actividades')
    await expect(page.getByText('0 consultas')).toHaveCount(0)
    const sidebar = page.getByRole('navigation', { name: 'Tus hijos' })
    await expect(sidebar.getByRole('link', { name: /^Mateo/ })).not.toHaveAttribute('aria-current', 'page')
    await expect(sidebarButton(page)).toBeVisible()

    await card.click()
    await expect(page).toHaveURL(/\/children\/[^/]+$/)
  })

  test('el pop-up dice la comparación, el precio y las dos salidas, con la franja ink', async ({ page }) => {
    await open(page, 1280)

    await pageButton(page).click()

    await expect(dialog(page).getByText('Plan completo', { exact: true })).toBeVisible()
    await expect(dialog(page).getByRole('heading', { name: 'Tu plan incluye un hijo' })).toHaveCSS('font-size', '24px')
    await expect(dialog(page)).toContainText('Intentaste agregar a otro hijo. El plan gratuito incluye uno.')
    await expect(dialog(page).getByRole('table', { name: 'Comparación de planes' }).getByRole('row').nth(1)).toContainText('Hasta 10')
    await expect(dialog(page)).toContainText('MX$499')
    await expect(dialog(page).getByRole('button', { name: 'Ahora no' })).toBeVisible()
    await expect(dialog(page).getByRole('link', { name: 'Ver el plan completo' })).toBeVisible()
    await expect(dialog(page).locator('div').first()).toHaveCSS('background-color', 'rgb(4, 37, 43)')
  })

  test('el foco empieza en «Ahora no» y Tab no sale del pop-up', async ({ page }) => {
    await open(page, 1280)
    await pageButton(page).click()
    const close = dialog(page).getByRole('button', { name: 'Cerrar' })
    const stay = dialog(page).getByRole('button', { name: 'Ahora no' })
    const plans = dialog(page).getByRole('link', { name: 'Ver el plan completo' })
    await expect(stay).toBeFocused()

    await page.keyboard.press('Tab')
    await expect(plans).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(close).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(plans).toBeFocused()
  })

  for (const [name, opener] of [
    ['el «+ Agregar hijo» de la página', pageButton],
    ['el "+ Agregar hijo" de la barra lateral', sidebarButton],
  ] as const) {
    test(`abierto con ${name}: «Ahora no», Escape y un clic en el fondo lo cierran y el foco vuelve a ese botón`, async ({ page }) => {
      await open(page, 1280)

      await opener(page).click()
      await dialog(page).getByRole('button', { name: 'Ahora no' }).click()
      await expect(dialog(page)).toBeHidden()
      await expect(opener(page)).toBeFocused()

      await opener(page).click()
      await page.keyboard.press('Escape')
      await expect(dialog(page)).toBeHidden()
      await expect(opener(page)).toBeFocused()

      await opener(page).click()
      await dialog(page).getByRole('heading', { name: 'Tu plan incluye un hijo' }).click()
      await expect(dialog(page)).toBeVisible() // a click inside does not close it
      await page.mouse.click(4, 4)
      await expect(dialog(page)).toBeHidden()
      await expect(opener(page)).toBeFocused()
    })
  }

  test('«Ver el plan completo» abre la pantalla de planes', async ({ page }) => {
    await open(page, 1280)
    await sidebarButton(page).click()

    await dialog(page).getByRole('link', { name: 'Ver el plan completo' }).click()

    await expect(page).toHaveURL(/\/planes$/)
  })

  test('el pop-up queda por encima de la barra lateral y de la página (todo el fondo se oscurece)', async ({ page }) => {
    await open(page, 1280)
    await sidebarButton(page).click()

    const overlay = await page.evaluate(() => {
      const d = document.querySelector('[role=dialog]')!.parentElement!
      const r = d.getBoundingClientRect()
      const top = document.elementFromPoint(40, 100)
      return { w: Math.round(r.width), h: Math.round(r.height), coversSidebar: d === top || d.contains(top) }
    })
    expect(overlay).toMatchObject({ w: 1280, h: 900, coversSidebar: true })
  })
})
