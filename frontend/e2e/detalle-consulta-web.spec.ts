import type { Page } from '@playwright/test'
import { test, expect, apiPost, seedChild } from './helpers'

// Consultation detail, web design (specs/056, «Detalle de la consulta PediTrack.dc.html»): the children sidebar, the common header
// (back link, date, doctor, «Editar consulta» and «Nueva consulta»), the treatment at the left — calendar, «Tomas de hoy» and a card
// per medication — and the next appointment, «Datos de la consulta» (open) and «Cómo leer el calendario» in a 300 px column at the
// right. Positions follow the design's 904 px column (main 28/48 px padding); only positions and widths are asserted.
// Requires the backend running locally.

const box = async (page: Page, locator: ReturnType<Page['locator']>) => {
  const b = (await locator.boundingBox())!
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
}

async function open(page: Page, width: number, ids: { accountId: string; consultationId?: string }) {
  await page.setViewportSize({ width, height: 900 })
  await page.goto(`/consultations/${ids.consultationId}`)
  await page.evaluate(() => document.fonts.ready)
}

test.describe('Detalle de consulta — diseño web (specs/056)', () => {
  for (const { width, colX, colW, asideX } of [
    { width: 1440, colX: 408, colW: 576, asideX: 1012 },
    { width: 1280, colX: 328, colW: 576, asideX: 932 },
    { width: 1024, colX: 328, colW: 320, asideX: 676 },
  ]) {
    test(`a ${width} px: barra lateral de 280 px, el tratamiento a la izquierda y una columna de 300 px a la derecha`, async ({ page }) => {
      const ids = await seedChild(page)
      await open(page, width, ids)

      expect(await box(page, page.locator('aside').first())).toMatchObject({ x: 0, w: 280 })
      const main = page.getByRole('main')
      expect(await box(page, main.getByRole('heading', { level: 1 }))).toMatchObject({ x: colX })
      expect(await box(page, main.getByRole('region', { name: 'Tratamiento', exact: true }))).toMatchObject({ x: colX, w: colW })
      expect(await box(page, main.getByRole('region', { name: 'Datos de la consulta' }))).toMatchObject({ x: asideX, w: 300 })
      await expect(main.getByRole('heading', { level: 1 })).toHaveCSS('font-size', '34px')
    })
  }

  test('bajo 1024 px no hay barra lateral y no hay desborde horizontal', async ({ page }) => {
    const ids = await seedChild(page)
    await open(page, 1000, ids)

    await expect(page.getByRole('navigation', { name: 'Tus hijos' })).toHaveCount(0)
    expect(await box(page, page.getByRole('main'))).toMatchObject({ x: 0, w: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  })

  test('muestra la barra lateral, el encabezado, el tratamiento con su mes y su leyenda, y los datos abiertos', async ({ page }) => {
    const ids = await seedChild(page, { durationDays: 7 })
    await open(page, 1280, ids)

    const sidebar = page.locator('aside').first()
    await expect(sidebar.getByRole('link', { name: /^Mateo/ })).toHaveAttribute('aria-current', 'page')
    await expect(sidebar.getByText('Plan completo')).toBeVisible()

    const main = page.getByRole('main')
    await expect(main.getByRole('link', { name: '← Mateo' })).toBeVisible()
    await expect(main.getByRole('heading', { level: 1, name: 'Dra. Laura Cázares' })).toBeVisible()
    await expect(main.getByRole('link', { name: 'Editar consulta' })).toBeVisible()
    await expect(main.getByRole('link', { name: 'Nueva consulta' })).toBeVisible()

    const treatment = main.getByRole('region', { name: 'Tratamiento', exact: true })
    await expect(treatment.getByText(/^En curso · termina el \d{1,2} \w{3}$/)).toBeVisible()
    const calendar = treatment.getByRole('region', { name: 'Calendario del tratamiento' })
    await expect(calendar.getByRole('list', { name: 'Medicamentos del calendario' })).toContainText('Amoxicilina')
    await expect(calendar.getByRole('button', { name: /Ver (mes|semana)/ })).toHaveCount(0)
    await expect(main.getByRole('heading', { level: 3, name: 'Amoxicilina' })).toBeVisible()
    await expect(main.getByText('c/8 h · 7 días · primera toma 00:00')).toBeVisible()

    const data = main.getByRole('region', { name: 'Datos de la consulta' })
    await expect(data.getByRole('button', { name: /Datos de la consulta/ })).toHaveAttribute('aria-expanded', 'true')
    await expect(data.getByText('Fiebre y tos', { exact: true })).toBeVisible()
    await expect(data.getByText('El texto se leyó en tu equipo; la foto se guarda solo en tu cuenta.')).toBeVisible()
    await expect(main.getByRole('region', { name: 'Cómo leer el calendario' })).toBeVisible()
  })

  test('las tomas van agrupadas en Mañana, Tarde y Noche (specs/015)', async ({ page }) => {
    const ids = await seedChild(page)
    await open(page, 1280, ids)

    await expect(page.getByRole('group', { name: 'Mañana' }).getByRole('button', { name: 'Toma de 08:00' })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Tarde' }).getByRole('button', { name: 'Toma de 16:00' })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Noche' }).getByRole('button', { name: 'Toma de 00:00' })).toBeVisible()
  })

  test('la barra de progreso sube al marcar una toma, sin recargar (specs/014)', async ({ page }) => {
    const ids = await seedChild(page)
    await open(page, 1280, ids)
    const bar = page.getByRole('progressbar', { name: 'Progreso de las tomas' })
    await expect(page.getByText('0 de 3 tomas')).toBeVisible()

    await page.getByRole('button', { name: 'Toma de 16:00' }).click()

    await expect(page.getByText('1 de 3 tomas')).toBeVisible()
    await expect(bar).toHaveAttribute('aria-valuenow', '1')
  })

  test('cada toma alterna entre marcada y sin marcar y se conserva al recargar', async ({ page }) => {
    const ids = await seedChild(page)
    await open(page, 1280, ids)
    const toggle = page.getByRole('button', { name: 'Toma de 00:00' })

    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(toggle).toHaveText(/^✓ \d\d:\d\d · por Ana$/) // who marked it (specs/032)

    await page.reload()
    await expect(page.getByRole('button', { name: 'Toma de 00:00' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Toma de 00:00' }).click()
    await expect(page.getByRole('button', { name: 'Toma de 00:00' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('los botones y enlaces llevan a donde dicen', async ({ page }) => {
    const ids = await seedChild(page)
    await open(page, 1280, ids)
    const main = page.getByRole('main')

    await main.getByRole('link', { name: 'Nueva consulta' }).click()
    await expect(page).toHaveURL(/\/consultations\/new$/)
    await page.goBack()

    await main.getByRole('link', { name: '← Mateo' }).click()
    await expect(page).toHaveURL(/\/children\/[^/]+$/)
    await page.goBack()

    // «Ver receta completa» opens the photo in the in-app viewer; Escape closes it.
    await main.getByRole('button', { name: 'Ver receta completa' }).nth(1).click()
    const viewer = page.getByRole('dialog', { name: 'Foto de la receta en tamaño completo' })
    await expect(viewer).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(viewer).toBeHidden()
  })

  test('una consulta cuyas tomas ya pasaron dice «Terminado el …»', async ({ page }) => {
    // A consultation from the past: its doses are all behind.
    const { accountId, childId, token } = await seedChild(page, { withConsultation: false })
    const created = await apiPost(page.context().request, token, `/children/${childId}/consultations`, {
      doctorName: 'Dr. Iván Robles',
      consultDate: '2026-01-10',
      photoBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      notes: 'Control',
      utcOffsetMinutes: 0,
      medications: [{ name: 'Vitamina D', frequencyHours: 24, durationDays: 2, startTime: '08:00' }],
    })
    await open(page, 1280, { accountId, consultationId: created.id })

    await expect(page.getByRole('main').getByRole('region', { name: 'Tratamiento' }).getByText(/^Terminado el \d{1,2} \w{3}$/)).toBeVisible()
  })
})
