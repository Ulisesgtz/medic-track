import type { Page } from '@playwright/test'
import { test, expect, seedChild } from './helpers'

// Web design, mock 15: the home ("Hola, Ana / Tus hijos", the child's card, the dashed plan
// tile and the sidebar) and the free-plan pop-up opened by "Agregar hijo" — from the button
// in the page or from the sidebar. The positions were measured on the mock at each width
// (Chromium; other engines draw fonts with other metrics, so heights are asserted there only).
// Requires the backend running locally.

const box = async (locator: ReturnType<Page['locator']>) => {
  const b = (await locator.boundingBox())!
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
}

async function open(page: Page, width: number) {
  await seedChild(page, { withConsultation: false })
  await page.setViewportSize({ width, height: 900 })
  await page.goto('/home')
  await page.evaluate(() => document.fonts.ready)
}

const pageButton = (page: Page) => page.getByRole('main').getByRole('button', { name: 'Agregar hijo' })
const sidebarButton = (page: Page) => page.getByRole('navigation', { name: 'Tus hijos' }).getByRole('button', { name: '+ Agregar hijo' })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Llegaste a un hijo registrado' })

test.describe('Home web y pop-up del plan gratuito (mock 15)', () => {
  for (const { width, titleX, buttonX, tileX, tileW, dialogX } of [
    { width: 1440, titleX: 412, buttonX: 1173, tileX: 870, tileW: 438, dialogX: 432 },
    { width: 1280, titleX: 332, buttonX: 1093, tileX: 790, tileW: 438, dialogX: 352 },
    { width: 1024, titleX: 328, buttonX: 841, tileX: 662, tileW: 314, dialogX: 224 },
  ]) {
    test(`a ${width} px: home, tarjeta, recuadro del plan y pop-up en la posición del mock`, async ({ page, browserName }) => {
      await open(page, width)

      expect(await box(page.locator('aside').first())).toMatchObject({ x: 0, w: 280 })
      expect(await box(page.getByRole('heading', { level: 1, name: 'Tus hijos' }))).toMatchObject({ x: titleX })
      await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-size', '36px')
      // Text-button width/x is font-rendering-dependent: CI's Chromium measures "Agregar hijo"
      // 1px wider than this suite was authored against, so allow a 1px tolerance here.
      const btn = await box(pageButton(page))
      expect(Math.abs(btn.x - buttonX)).toBeLessThanOrEqual(1)
      expect(Math.abs(btn.w - 135)).toBeLessThanOrEqual(1)
      const tile = await box(page.getByText('Tu plan incluye un hijo'))
      expect(tile).toMatchObject({ x: tileX, w: tileW })
      if (browserName === 'chromium') expect(tile.h).toBe(104)

      await pageButton(page).click()
      const dlg = await box(dialog(page))
      expect(dlg).toMatchObject({ x: dialogX, w: 576 })
      if (browserName === 'chromium') expect(dlg.h).toBe(337)
      // Centered in the window.
      expect(Math.abs(dlg.y + dlg.h / 2 - 450)).toBeLessThan(2)
    })
  }

  test('bajo 1024 px no hay barra lateral y los márgenes son de 24 px, como el mock', async ({ page }) => {
    await open(page, 1000)

    await expect(page.getByRole('navigation', { name: 'Tus hijos' })).toHaveCount(0)
    expect(await box(page.getByRole('main'))).toMatchObject({ x: 0, w: 1000 })
    expect(await box(page.getByRole('heading', { level: 1, name: 'Tus hijos' }))).toMatchObject({ x: 52 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    // The pop-up still works without the sidebar.
    await pageButton(page).click()
    await expect(dialog(page)).toBeVisible()
  })

  test('la página lleva "Hola, Ana / Tus hijos", la tarjeta del hijo, el recuadro del plan y la barra lateral', async ({ page }) => {
    await open(page, 1280)

    await expect(page.getByText('Hola, Ana')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Tus hijos' })).toBeVisible()
    await expect(pageButton(page)).toBeVisible()
    const card = page.getByRole('main').getByRole('link', { name: /Mateo Morales/ })
    await expect(card).toContainText('5 años 6 meses')
    await expect(page.getByText('Tu plan incluye un hijo')).toBeVisible()
    // The web card is plain (the phone one carries status chips), and the plan note is the tile, not the phone's line.
    await expect(page.getByText('0 consultas')).toHaveCount(0)
    await expect(page.getByText('El plan gratuito incluye un hijo.')).toHaveCount(0)
    const sidebar = page.getByRole('navigation', { name: 'Tus hijos' })
    await expect(sidebar.getByRole('link', { name: /^Mateo/ })).not.toHaveAttribute('aria-current', 'page')
    await expect(sidebarButton(page)).toBeVisible()

    await card.click()
    await expect(page).toHaveURL(/\/children\/[^/]+$/)
  })

  test('el pop-up dice el mensaje del mock y nombra al hijo (en móvil no)', async ({ page }) => {
    await open(page, 1280)

    await pageButton(page).click()

    await expect(dialog(page).getByText('Plan gratuito', { exact: true })).toBeVisible()
    await expect(dialog(page).getByRole('heading', { name: 'Llegaste a un hijo registrado' })).toHaveCSS('font-size', '30px')
    await expect(dialog(page)).toContainText(
      'Para dar de alta a otro hijo necesitas ampliar tu plan. Tus datos actuales se mantienen intactos y Mateo sigue disponible sin cambios.',
    )
    await expect(dialog(page).getByRole('button', { name: 'Entendido' })).toBeVisible()
    await expect(dialog(page).getByRole('button', { name: 'Ver planes' })).toBeVisible()
    await expect(dialog(page).locator('div').first()).toHaveCSS('background-color', 'rgb(245, 158, 11)')
  })

  test('el foco empieza en "Ver planes" y Tab no sale del pop-up', async ({ page }) => {
    await open(page, 1280)
    await pageButton(page).click()
    const stay = dialog(page).getByRole('button', { name: 'Entendido' })
    const plans = dialog(page).getByRole('button', { name: 'Ver planes' })
    await expect(plans).toBeFocused()

    await page.keyboard.press('Tab')
    await expect(stay).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(plans).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(stay).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(plans).toBeFocused()
  })

  for (const [name, opener] of [
    ['el botón "Agregar hijo" de la página', pageButton],
    ['el "+ Agregar hijo" de la barra lateral', sidebarButton],
  ] as const) {
    test(`abierto con ${name}: Entendido, Escape y un clic en el fondo lo cierran y el foco vuelve a ese botón`, async ({ page }) => {
      await open(page, 1280)

      await opener(page).click()
      await dialog(page).getByRole('button', { name: 'Entendido' }).click()
      await expect(dialog(page)).toBeHidden()
      await expect(opener(page)).toBeFocused()

      await opener(page).click()
      await page.keyboard.press('Escape')
      await expect(dialog(page)).toBeHidden()
      await expect(opener(page)).toBeFocused()

      await opener(page).click()
      await dialog(page).getByText('Plan gratuito', { exact: true }).click()
      await expect(dialog(page)).toBeVisible() // a click inside does not close it
      await page.mouse.click(4, 4)
      await expect(dialog(page)).toBeHidden()
      await expect(opener(page)).toBeFocused()
    })
  }

  test('"Ver planes" abre la pantalla de planes', async ({ page }) => {
    await open(page, 1280)
    await sidebarButton(page).click()

    await dialog(page).getByRole('button', { name: 'Ver planes' }).click()

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
