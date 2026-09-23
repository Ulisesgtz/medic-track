import { test, expect } from '@playwright/test'
import { seedChild } from './helpers'

// Consultation detail, phone design (mock 03): dark header with the child's
// name and the date, the prescription photo card, the symptoms and each
// medication with its dose chips. Requires the backend running locally.

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const todayLong = () => {
  const now = new Date()
  return `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`
}

test.describe('Detalle de consulta — diseño móvil (mock 03)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('muestra el encabezado, la foto, los síntomas y el medicamento con su horario', async ({ page }) => {
    const { consultationId } = await seedChild(page)
    await page.goto(`/consultations/${consultationId}`)

    await expect(page.getByRole('link', { name: '← Mateo Morales' })).toBeVisible()
    await expect(page.getByText(todayLong(), { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Dra. Laura Cázares' })).toBeVisible()

    await expect(page.getByText('Foto de la receta', { exact: true })).toBeVisible()
    await expect(page.getByText('Leída con OCR en el dispositivo')).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Síntomas registrados' })).toBeVisible()
    await expect(page.getByText('Fiebre y tos', { exact: true })).toBeVisible()

    await expect(page.getByRole('heading', { level: 2, name: 'Medicamentos' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 3, name: 'Amoxicilina' })).toBeVisible()
    await expect(page.getByText('Cada 8 horas · 1 día · desde 00:00')).toBeVisible()
    // Doses at 00:00, 08:00 and 16:00 today, as chips; a one-day treatment has no day switcher.
    for (const time of ['00:00', '08:00', '16:00']) {
      await expect(page.getByRole('button', { name: `Toma de ${time}` })).toBeVisible()
    }
    await expect(page.getByRole('button', { name: 'Día siguiente →' })).toHaveCount(0)
    // Phone only: no sidebar, no web header button.
    await expect(page.locator('aside')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Nueva consulta' })).toHaveCount(0)
  })

  test('cada chip alterna entre marcada y sin marcar, y se conserva al recargar', async ({ page }) => {
    const { consultationId } = await seedChild(page)
    await page.goto(`/consultations/${consultationId}`)
    const chip = page.getByRole('button', { name: 'Toma de 00:00' })
    await expect(chip).toHaveAttribute('aria-pressed', 'false')

    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await expect(chip).toHaveText('00:00 ✓')
    await expect(chip).toHaveClass(/bg-confirmed/)

    await page.reload()
    await expect(page.getByRole('button', { name: 'Toma de 00:00' })).toHaveAttribute('aria-pressed', 'true')

    // Always enabled: the parent can correct a dose of any time.
    await page.getByRole('button', { name: 'Toma de 00:00' }).click()
    await expect(page.getByRole('button', { name: 'Toma de 00:00' })).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('button', { name: 'Toma de 00:00' })).toHaveText('00:00')
  })

  test('"Ver completa" y la miniatura abren la foto en un visor y se cierra con Cerrar o Escape', async ({ page }) => {
    const { consultationId } = await seedChild(page)
    await page.goto(`/consultations/${consultationId}`)
    const viewer = page.getByRole('dialog', { name: 'Foto de la receta en tamaño completo' })

    await page.getByRole('button', { name: 'Ver completa' }).click()
    await expect(viewer).toBeVisible()
    await viewer.getByRole('button', { name: 'Cerrar' }).click()
    await expect(viewer).toBeHidden()

    await page.getByRole('button', { name: 'Abrir la foto de la receta en tamaño completo' }).click()
    await expect(viewer).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(viewer).toBeHidden()
  })

  test('"← Mateo Morales" vuelve al detalle del hijo', async ({ page }) => {
    const { childId, consultationId } = await seedChild(page)
    await page.goto(`/consultations/${consultationId}`)

    await page.getByRole('link', { name: '← Mateo Morales' }).click()

    await expect(page).toHaveURL(new RegExp(`/children/${childId}$`))
  })

  test('es una columna centrada de máximo 430 px, como el mock, sin desborde horizontal', async ({ page }) => {
    const { consultationId } = await seedChild(page)
    await page.setViewportSize({ width: 700, height: 900 })
    await page.goto(`/consultations/${consultationId}`)

    // The page's own <main> (the "Cargando…" one, shown while the session and the data load, has no max width).
    await expect(page.getByRole('main')).toHaveClass(/max-w-\[430px\]/)
    const box = await page.getByRole('main').boundingBox()
    expect(Math.round(box!.width)).toBe(430)
    expect(Math.round(box!.x)).toBe(135)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  })
})
