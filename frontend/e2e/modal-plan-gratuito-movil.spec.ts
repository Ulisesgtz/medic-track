import { test, expect, seedChild } from './helpers'

// The free-plan limit pop-up, phone design (mock 05): opened by "+ Agregar hijo"
// when the free plan already has its child. Amber header, message, "Entendido" and
// "Ver planes"; focus starts on "Ver planes", Tab stays between the two buttons,
// Escape or a tap on the backdrop closes it and the focus goes back to the opener.
// Requires the backend running locally.

test.describe('Pop-up del plan gratuito — diseño móvil (mock 05)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ page }) => {
    await seedChild(page, { withConsultation: false })
    await page.goto('/home')
  })

  const opener = (page: import('@playwright/test').Page) => page.getByRole('button', { name: '+ Agregar hijo' })
  const dialog = (page: import('@playwright/test').Page) =>
    page.getByRole('dialog', { name: 'Llegaste a un hijo registrado' })

  test('se abre de inmediato con el mensaje del mock, sin pedir llenar un formulario', async ({ page }) => {
    await opener(page).click()

    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page).getByText('Plan gratuito', { exact: true })).toBeVisible()
    await expect(
      dialog(page).getByText('Para dar de alta a otro hijo necesitas ampliar tu plan. Tus datos actuales se mantienen intactos.'),
    ).toBeVisible()
    await expect(dialog(page).getByRole('button', { name: 'Entendido' })).toBeVisible()
    await expect(dialog(page).getByRole('button', { name: 'Ver planes' })).toBeVisible()
    // The phone message does not name the child (the web one does), and there is no form.
    await expect(dialog(page)).not.toContainText('sigue disponible')
    await expect(page.getByLabel('Nombre')).toHaveCount(0)
  })

  test('cabecera ámbar, ocupa el ancho menos 16 px por lado y queda centrado', async ({ page }) => {
    await opener(page).click()
    const box = (await dialog(page).boundingBox())!

    expect(Math.round(box.width)).toBe(358) // 390 - 2 * 16
    expect(Math.round(box.x)).toBe(16)
    const centerY = box.y + box.height / 2
    expect(Math.abs(centerY - 844 / 2)).toBeLessThan(2)
    await expect(dialog(page).locator('div').first()).toHaveCSS('background-color', 'rgb(245, 158, 11)')
    await expect(dialog(page).getByRole('heading', { name: 'Llegaste a un hijo registrado' })).toHaveCSS('color', 'rgb(69, 26, 3)')
  })

  test('el foco empieza en "Ver planes" y Tab no sale del pop-up (da la vuelta entre sus dos botones)', async ({ page }) => {
    await opener(page).click()
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

  test('"Entendido" y Escape lo cierran y el foco vuelve a "+ Agregar hijo"', async ({ page }) => {
    await opener(page).click()
    await dialog(page).getByRole('button', { name: 'Entendido' }).click()
    await expect(dialog(page)).toBeHidden()
    await expect(opener(page)).toBeFocused()

    await opener(page).click()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
    await expect(opener(page)).toBeFocused()
  })

  test('un toque en el fondo lo cierra; dentro del pop-up no', async ({ page }) => {
    await opener(page).click()

    await dialog(page).getByText('Plan gratuito', { exact: true }).click()
    await expect(dialog(page)).toBeVisible()

    await page.mouse.click(4, 4)
    await expect(dialog(page)).toBeHidden()
  })

  test('"Ver planes" abre la pantalla de planes', async ({ page }) => {
    await opener(page).click()

    await dialog(page).getByRole('button', { name: 'Ver planes' }).click()

    await expect(page).toHaveURL(/\/planes$/)
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
