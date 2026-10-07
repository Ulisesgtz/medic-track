import { test, expect, seedChild } from './helpers'

// The free-plan limit pop-up, phone design (specs/034, mock LimiteModal): opened by "+ Agregar hijo" when the free plan already
// has its child. A sheet from the bottom with the `ink` band, the comparison and two ways out — «Ahora no» (the focus starts
// here) and «Ver el plan completo»; Tab stays inside, Escape or a tap on the backdrop closes it and the focus goes back to the
// opener. Requires the backend running locally.

test.describe('Pop-up del plan gratuito — diseño móvil (specs/034)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ page }) => {
    await seedChild(page, { withConsultation: false, plan: 'free' })
    await page.goto('/home')
  })

  const opener = (page: import('@playwright/test').Page) => page.getByRole('button', { name: '+ Agregar hijo' })
  const dialog = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: 'Tu plan incluye un hijo' })

  test('se abre de inmediato con la comparación, el precio y las dos salidas, sin pedir llenar un formulario', async ({ page }) => {
    await opener(page).click()

    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page).getByText('Plan completo', { exact: true })).toBeVisible()
    await expect(dialog(page).getByText('Intentaste agregar a otro hijo. El plan gratuito incluye uno.')).toBeVisible()
    const table = dialog(page).getByRole('table', { name: 'Comparación de planes' })
    await expect(table.getByRole('row').nth(1)).toContainText('Hijos')
    await expect(table.getByRole('row').nth(1)).toContainText('· lo que intentaste')
    await expect(table.getByRole('row').nth(1)).toContainText('Hasta 10')
    await expect(dialog(page).getByText('MX$499')).toBeVisible()
    await expect(dialog(page).getByText('Lo que ya registraste se queda igual con cualquier plan.')).toBeVisible()
    await expect(dialog(page).getByRole('button', { name: 'Ahora no' })).toBeVisible()
    await expect(dialog(page).getByRole('link', { name: 'Ver el plan completo' })).toBeVisible()
    await expect(page.getByLabel('Nombre')).toHaveCount(0)
  })

  test('es una hoja desde abajo con la franja ink, sin ámbar, y nada se desborda a los lados', async ({ page }) => {
    await opener(page).click()
    const box = (await dialog(page).boundingBox())!

    expect(Math.round(box.width)).toBeLessThanOrEqual(366) // 390 - 2 * 12
    expect(Math.round(box.x)).toBeGreaterThanOrEqual(12)
    expect(Math.round(box.y + box.height)).toBe(844 - 12) // pegada al fondo, a 12 px
    await expect(dialog(page).locator('div').first()).toHaveCSS('background-color', 'rgb(4, 37, 43)')
    await expect(dialog(page).getByRole('heading', { name: 'Tu plan incluye un hijo' })).toHaveCSS('color', 'rgb(255, 255, 255)')
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  })

  test('el foco empieza en «Ahora no» y Tab no sale del pop-up (da la vuelta entre sus tres controles)', async ({ page }) => {
    await opener(page).click()
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

  test('«Ahora no», la X y Escape lo cierran y el foco vuelve a «+ Agregar hijo»', async ({ page }) => {
    await opener(page).click()
    await dialog(page).getByRole('button', { name: 'Ahora no' }).click()
    await expect(dialog(page)).toBeHidden()
    await expect(opener(page)).toBeFocused()

    await opener(page).click()
    await dialog(page).getByRole('button', { name: 'Cerrar' }).click()
    await expect(dialog(page)).toBeHidden()
    await expect(opener(page)).toBeFocused()

    await opener(page).click()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
    await expect(opener(page)).toBeFocused()
  })

  test('un toque en el fondo lo cierra; dentro del pop-up no', async ({ page }) => {
    await opener(page).click()

    await dialog(page).getByRole('heading', { name: 'Tu plan incluye un hijo' }).click()
    await expect(dialog(page)).toBeVisible()

    await page.mouse.click(4, 4)
    await expect(dialog(page)).toBeHidden()
  })

  test('«Ver el plan completo» abre la pantalla de planes, con los dos recuadros', async ({ page }) => {
    await opener(page).click()

    await dialog(page).getByRole('link', { name: 'Ver el plan completo' }).click()

    await expect(page).toHaveURL(/\/planes$/)
    await expect(page.getByRole('heading', { name: 'Planes', level: 1 })).toBeVisible()
    await expect(page.getByRole('article', { name: 'Gratis' }).getByText('Tu plan actual')).toBeVisible()
    await expect(page.getByRole('article', { name: 'Plan completo' }).getByText('MX$499')).toBeVisible()
  })

  test('el home de fondo es una columna centrada de máximo 430 px, sin desborde horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 900 })

    // The page's own <main> (the "Cargando…" one, shown while the session and the data load, has no max width).
    await expect(page.getByRole('main')).toHaveClass(/max-w-\[430px\]/)
    const box = await page.getByRole('main').boundingBox()
    expect(Math.round(box!.width)).toBe(430)
    expect(Math.round(box!.x)).toBe(135)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)

    // The overlay still covers the whole window, not just the column.
    await opener(page).click()
    await expect(dialog(page)).toBeVisible()
    await page.mouse.click(4, 4)
    await expect(dialog(page)).toBeHidden()
  })
})
