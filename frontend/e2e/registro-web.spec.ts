import { test, expect, type Page } from '@playwright/test'
import { allowClerkOn, fillSignup, finishEmailVerificationIfAsked } from './helpers'

// Signup, web design (mock 11): split screen — dark panel with the value
// proposition and the checklist, the form with its title on the right. The numbers
// below were measured on the mock itself at each width (in Chromium: WebKit and
// Firefox draw the fonts with slightly different metrics, so heights are only
// asserted there; positions and widths are asserted everywhere). Requires the backend.

const box = async (page: Page, locator: ReturnType<Page['locator']>) => {
  const b = (await locator.boundingBox())!
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
}

/** Opens the signup at a width and waits for the fonts: text wraps (and so heights) depend on them. */
async function open(page: Page, width: number) {
  await allowClerkOn(page)
  await page.setViewportSize({ width, height: 900 })
  await page.goto('/signup')
  await page.evaluate(() => document.fonts.ready)
}

test.describe('Registro web (mock 11) — medidas del mock', () => {
  for (const { width, panel, formX, formW, h1 } of [
    { width: 1440, panel: 662, formX: 791, formW: 520, h1: '48px' },
    { width: 1280, panel: 589, formX: 674, formW: 520, h1: '48px' },
    { width: 1024, panel: 471, formX: 535, formW: 425, h1: '48px' },
  ]) {
    test(`a ${width} px: pantalla partida, panel de ${panel} px y formulario de ${formW} px`, async ({ page, browserName }) => {
      await open(page, width)

      const dark = await box(page, page.locator('section').first())
      expect(dark.w).toBe(panel)
      expect(dark.x).toBe(0)
      const title = await box(page, page.getByRole('heading', { level: 2, name: 'Crear cuenta' }))
      expect(title.x).toBe(formX)
      expect(title.w).toBe(formW)
      const email = await box(page, page.getByLabel('Correo'))
      expect(email).toMatchObject({ x: formX, w: formW })
      const submit = await box(page, page.getByRole('button', { name: 'Crear cuenta' }))
      expect(submit).toMatchObject({ x: formX, w: formW })
      if (browserName === 'chromium') {
        expect(email.h).toBe(50)
        expect(submit.h).toBe(56)
      }
      await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-size', h1)
      await expect(page.getByRole('heading', { level: 2, name: 'Crear cuenta' })).toHaveCSS('font-size', '30px')
      // The left texts start 64px from the edge, like the mock.
      expect((await box(page, page.getByRole('heading', { level: 1 }))).x).toBe(64)
    })
  }

  test('bajo 1024 px se apila: el panel oscuro arriba y el formulario debajo, con los tamaños del mock', async ({ page, browserName }) => {
    await open(page, 900)

    const dark = await box(page, page.locator('section').first())
    expect(dark).toMatchObject({ x: 0, y: 0, w: 900 })
    const formSection = await box(page, page.locator('section').nth(1))
    expect(formSection.w).toBe(900)
    // The form section starts right where the dark panel ends (stacked, not side by side).
    expect(formSection.y).toBe(dark.h)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-size', '36px')
    const title = await box(page, page.getByRole('heading', { level: 2, name: 'Crear cuenta' }))
    expect(title).toMatchObject({ x: 190, w: 520 })
    if (browserName === 'chromium') {
      expect(dark.h).toBe(469)
      expect(title.y).toBe(517)
    }
    expect((await box(page, page.getByRole('heading', { level: 1 }))).x).toBe(32)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  })

  test('el panel izquierdo lleva el logo, el mensaje y la lista de tres puntos del mock', async ({ page }) => {
    await open(page, 1440)
    const panel = page.locator('section').first()

    await expect(panel.getByRole('img', { name: 'PediTrack' })).toBeVisible()
    await expect(panel.getByRole('heading', { level: 1 })).toHaveText('La bitácora médica de tus hijos, en un solo lugar.')
    await expect(panel.getByText('Registra consultas, recetas y tomas de medicamento. La app registra datos, nunca los interpreta.')).toBeVisible()
    await expect(panel.getByRole('listitem')).toHaveText([
      '✓El OCR de la receta corre en tu dispositivo.',
      '✓Tu pediatra sigue siendo la única autoridad médica.',
      '✓El plan gratuito incluye un hijo.',
    ])
    await expect(page.getByText('Al crear la cuenta aceptas que los datos se guardan para tu uso personal. No se comparten con terceros.')).toBeVisible()
  })

  test('los campos de la cuenta y del hijo llevan sus bordes, placeholders y el foco del mock', async ({ page }) => {
    await open(page, 1440)
    const email = page.getByLabel('Correo')

    await expect(email).toHaveAttribute('placeholder', 'tu@correo.mx')
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveAttribute('placeholder', 'Mínimo 8 caracteres')
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveAttribute('type', 'password')
    // The child's fields have the bright cyan border.
    await expect(page.locator('#children\\.0\\.firstName')).toHaveCSS('border-top-color', 'rgb(103, 232, 249)')
    await expect(page.locator('#children\\.0\\.birthDate')).toHaveCSS('border-top-color', 'rgb(103, 232, 249)')

    await email.focus()
    await expect(email).toHaveCSS('border-top-width', '2px')
    await expect(email).toHaveCSS('border-top-color', 'rgb(4, 37, 43)')
  })

  test('los errores salen bajo el campo en rojo, con borde rojo, y el foco va al primer inválido (como el script del mock)', async ({ page }) => {
    await open(page, 1440)

    await page.getByRole('button', { name: 'Crear cuenta' }).click()

    // The first invalid field takes the focus (its focus border, ink, wins over the red one, as in the
    // mock); the others show the red border.
    await expect(page.getByLabel('Correo')).toBeFocused()
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveClass(/border-red-600/)
    await expect(page.locator('#children\\.0\\.firstName')).toHaveClass(/border-red-600/)
    const message = page.getByText('Escribe un correo válido.')
    await expect(message).toHaveClass(/text-red-700/)
    await expect(message).toHaveCSS('font-size', '13px')
    await expect(message).toHaveCSS('font-weight', '600')
    await expect(page.getByText('La contraseña no cumple con las reglas.')).toBeVisible()
    await expect(page.getByText('Escribe el nombre de tu hijo.')).toBeVisible()
    await expect(page.getByText('Elige la fecha de nacimiento.')).toBeVisible()
  })

  test('Tab recorre el formulario en el orden del mock: Correo, Contraseña, nombres, país, hijo, botones', async ({ page }) => {
    await open(page, 1440)

    await page.getByLabel('Correo').focus()
    const order: string[] = []
    for (let i = 0; i < 17; i++) {
      const current = await page.evaluate(() => (document.activeElement as HTMLElement).id || (document.activeElement as HTMLElement).textContent || '')
      // A date input has one Tab stop per segment (day, month, year): count it once.
      if (order[order.length - 1] !== current) order.push(current)
      await page.keyboard.press('Tab')
    }

    expect(order.slice(0, 13)).toEqual([
      'email',
      'password',
      'password-toggle',
      'firstName',
      'lastName',
      'countryCode',
      'children.0.firstName',
      'children.0.lastName',
      'children.0.birthDate',
      'children.0.height',
      'children.0.weight',
      'Crear cuenta',
      'Registrarme con Google',
    ])
  })

  test('el formulario completo crea la cuenta y lleva al home', async ({ page }) => {
    await open(page, 1440)
    await fillSignup(page)

    await page.getByRole('button', { name: 'Crear cuenta' }).click()
    await finishEmailVerificationIfAsked(page)

    await expect(page).toHaveURL(/\/home$/)
  })
})
