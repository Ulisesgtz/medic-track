import { test, expect, type Page } from '@playwright/test'
import { seedChild, saveAccount } from './helpers'

// Consultation detail, web design (mock 13): the children sidebar, a header row with the
// back link, the date, the doctor and "Nueva consulta", medications and symptoms on the
// left, the photo and the active treatment on the right. The positions below were measured
// on the mock at each width (Chromium; other engines draw fonts with other metrics, so
// only positions and widths are asserted everywhere). Requires the backend running locally.

const box = async (page: Page, locator: ReturnType<Page['locator']>) => {
  const b = (await locator.boundingBox())!
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
}

async function open(page: Page, width: number, ids: { accountId: string; consultationId?: string }) {
  await page.setViewportSize({ width, height: 900 })
  await saveAccount(page, ids.accountId)
  await page.goto(`/consultations/${ids.consultationId}`)
  await page.evaluate(() => document.fonts.ready)
}

test.describe('Detalle de consulta — diseño web (mock 13)', () => {
  for (const { width, mainX, mainW, titleX, colW, asideX, asideW } of [
    { width: 1440, mainX: 280, mainW: 1160, titleX: 412, colW: 523, asideX: 983, asideW: 301 },
    { width: 1280, mainX: 280, mainW: 1000, titleX: 332, colW: 523, asideX: 903, asideW: 301 },
    { width: 1024, mainX: 280, mainW: 744, titleX: 328, colW: 374, asideX: 750, asideW: 202 },
  ]) {
    test(`a ${width} px: barra lateral de 280 px y dos columnas 1.5fr / 1fr como el mock`, async ({ page, request }) => {
      const ids = await seedChild(request)
      await open(page, width, ids)

      expect(await box(page, page.locator('aside').first())).toMatchObject({ x: 0, w: 280 })
      expect(await box(page, page.getByRole('main'))).toMatchObject({ x: mainX, w: mainW })
      expect(await box(page, page.getByRole('heading', { level: 1 }))).toMatchObject({ x: titleX })
      expect(await box(page, page.getByRole('heading', { level: 2, name: 'Medicamentos' }))).toMatchObject({ x: titleX, w: colW })
      expect(await box(page, page.getByRole('heading', { level: 2, name: 'Foto de la receta' }))).toMatchObject({ x: asideX, w: asideW })
      await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-size', '36px')
    })
  }

  test('bajo 1024 px no hay barra lateral y la página va en una columna con márgenes de 24 px, como el mock', async ({ page, request }) => {
    const ids = await seedChild(request)
    await open(page, 1000, ids)

    // (The right column of the page is also an <aside>: the sidebar is the "Tus hijos" navigation.)
    await expect(page.getByRole('navigation', { name: 'Tus hijos' })).toHaveCount(0)
    expect(await box(page, page.getByRole('main'))).toMatchObject({ x: 0, w: 1000 })
    const meds = await box(page, page.getByRole('heading', { level: 2, name: 'Medicamentos' }))
    const photo = await box(page, page.getByRole('heading', { level: 2, name: 'Foto de la receta' }))
    // Single column: the photo card is below the medications, in the same column.
    expect(meds).toMatchObject({ x: 52, w: 896 }) // the title sits outside the cards (24px margin + centered 896px column)
    expect(photo).toMatchObject({ x: 76, w: 848 })
    expect(photo.y).toBeGreaterThan(meds.y)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  })

  test('muestra la barra lateral con el hijo activo, el encabezado, los medicamentos, los síntomas, la foto y el tratamiento', async ({
    page,
    request,
  }) => {
    const ids = await seedChild(request, { durationDays: 7 })
    await open(page, 1280, ids)

    const sidebar = page.locator('aside')
    await expect(sidebar.getByRole('link', { name: /^Mateo/ })).toHaveAttribute('aria-current', 'page')
    await expect(sidebar.getByRole('button', { name: '+ Agregar hijo' })).toBeVisible()
    await expect(sidebar.getByText('Ana Morales')).toBeVisible()
    await expect(sidebar.getByText('Plan gratuito')).toBeVisible()

    await expect(page.getByRole('link', { name: '← Mateo Morales' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Dra. Laura Cázares' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Nueva consulta' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Medicamentos' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 3, name: 'Amoxicilina' })).toBeVisible()
    await expect(page.getByText('Cada 8 horas · 7 días · desde 00:00')).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Síntomas registrados' })).toBeVisible()
    await expect(page.getByText('Fiebre y tos', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Foto de la receta' })).toBeVisible()
    await expect(page.getByText('Leída con OCR en el dispositivo. La imagen no salió de tu equipo.')).toBeVisible()

    const treatment = page.getByText('Tratamiento activo').locator('..')
    await expect(treatment).toContainText('Amoxicilina')
    await expect(treatment).toContainText(/termina el \d{1,2} \w{3}/)
  })

  test('cada chip alterna entre marcada y sin marcar y se conserva al recargar', async ({ page, request }) => {
    const ids = await seedChild(request)
    await open(page, 1280, ids)
    const chip = page.getByRole('button', { name: 'Toma de 00:00' })

    await expect(chip).toHaveAttribute('aria-pressed', 'false')
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await expect(chip).toHaveText('00:00 ✓')

    await page.reload()
    await expect(page.getByRole('button', { name: 'Toma de 00:00' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Toma de 00:00' }).click()
    await expect(page.getByRole('button', { name: 'Toma de 00:00' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('los botones y enlaces llevan a donde dice el mock', async ({ page, request }) => {
    const ids = await seedChild(request)
    await open(page, 1280, ids)

    await page.getByRole('link', { name: 'Nueva consulta' }).click()
    await expect(page).toHaveURL(/\/consultations\/new$/)
    await page.goBack()

    await page.getByRole('link', { name: '← Mateo Morales' }).click()
    await expect(page).toHaveURL(/\/children\/[^/]+$/)
    await page.goBack()

    // "Ver completa" opens the photo in the in-app viewer; Escape closes it.
    await page.getByRole('button', { name: 'Ver completa' }).click()
    const viewer = page.getByRole('dialog', { name: 'Foto de la receta en tamaño completo' })
    await expect(viewer).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(viewer).toBeHidden()

    // The sidebar's "+ Agregar hijo" opens the free-plan pop-up (the account has its one child) above the page.
    await page.locator('aside').getByRole('button', { name: '+ Agregar hijo' }).click()
    await expect(page.getByRole('dialog', { name: 'Llegaste a un hijo registrado' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
  })

  test('el tratamiento activo dice "Ninguno" cuando no queda nada por delante', async ({ page, request }) => {
    // A consultation from the past: its doses are all behind.
    const { accountId, childId } = await seedChild(request, { withConsultation: false })
    const created = await request.post(`http://localhost:8080/children/${childId}/consultations`, {
      data: {
        doctorName: 'Dr. Iván Robles',
        consultDate: '2026-01-10',
        photoBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        symptoms: 'Control',
        utcOffsetMinutes: 0,
        medications: [{ name: 'Vitamina D', frequencyHours: 24, durationDays: 2, startTime: '08:00' }],
      },
    })
    await open(page, 1280, { accountId, consultationId: (await created.json()).id })

    const treatment = page.getByText('Tratamiento activo').locator('..')
    await expect(treatment).toContainText('Ninguno')
    await expect(treatment).toContainText('sin tomas pendientes')
  })
})
