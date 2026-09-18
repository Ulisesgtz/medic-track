import { test, expect } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

// Covers quickstart.md Escenarios 2, 5 y 6 (specs/004-detalle-consulta-hijo): the
// critical flow named explicitly in the constitution — registrar consulta
// (foto→confirmación manual) → ver el detalle con sus tomas generadas →
// marcar una toma. Requires the backend running locally.

function writeTempImage(): string {
  const filePath = path.join(os.tmpdir(), `receta-${Date.now()}.jpg`)
  // A tiny valid JPEG isn't required — the backend only stores bytes, and
  // OCR failing on a non-photo is an explicitly covered case (FR-007).
  fs.writeFileSync(filePath, Buffer.from('fake-prescription-photo'))
  return filePath
}

test('registrar consulta → ver detalle con tomas generadas → marcar una toma', async ({ page }) => {
  await page.goto('/signup')

  await page.getByLabel('Nombre').fill('Ana')
  await page.getByLabel('Apellido').fill('Gómez')
  await page.getByLabel('Correo electrónico').fill(`ana.consulta.e2e.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`)

  await page.getByRole('button', { name: 'Agregar hijo' }).click()
  await page.locator('#children\\.0\\.firstName').fill('Luis')
  await page.locator('#children\\.0\\.lastName').fill('Gómez')
  await page.locator('#children\\.0\\.birthDate').fill('2020-01-15')
  await page.getByRole('button', { name: 'Guardar' }).click()

  await expect(page).toHaveURL(/\/home/)
  await page.getByRole('main').getByText('Luis Gómez').click()

  await expect(page).toHaveURL(/\/children\//)
  await expect(page.getByText(/todavía no hay consultas/i)).toBeVisible()

  await page.getByRole('button', { name: 'Nueva consulta' }).click()
  await expect(page.getByRole('heading', { name: 'Registrar consulta' })).toBeVisible()

  await page.getByLabel('Doctor').fill('Dra. López')
  await page.getByLabel('Fecha de la consulta').fill('2026-01-15')
  await page.getByLabel('Foto de la receta').setInputFiles(writeTempImage())
  await page.locator('#medications\\.0\\.name').fill('Amoxicilina')
  await page.locator('#medications\\.0\\.frequencyHours').fill('8')
  await page.locator('#medications\\.0\\.durationDays').fill('3')
  await page.locator('#medications\\.0\\.startTime').fill('08:00')

  await page.getByRole('button', { name: 'Guardar' }).click()

  // FR-003/FR-013: saving navigates straight to the new consultation's detail.
  await expect(page).toHaveURL(/\/consultations\//)
  await expect(page.getByText('Amoxicilina')).toBeVisible()
  await expect(page.getByText(/Cada 8h, por 3 días/)).toBeVisible()

  // FR-009: 3 days * 24h / 8h = 9 doses generated at once.
  const doseCheckboxes = page.getByRole('checkbox')
  await expect(doseCheckboxes).toHaveCount(9)

  // FR-011: marking a dose works and is reflected immediately.
  const firstDose = doseCheckboxes.first()
  await expect(firstDose).not.toBeChecked()
  // The checkbox is visually hidden inside a chip <label> (feature 005): click the chip, as a parent would.
  await page.locator('label', { has: doseCheckboxes }).first().click()
  await expect(firstDose).toBeChecked()

  // Back on the child's detail, the new consultation is now listed (FR-001).
  await page.goBack()
  await expect(page.getByText('Dra. López')).toBeVisible()
  // The mock's "Tomas de hoy" panel and summary cards are part of that screen.
  await expect(page.getByRole('heading', { name: 'Tomas de hoy' })).toBeVisible()
  await expect(page.getByText('Tratamiento activo')).toBeVisible()

  // A dialog opened from the desktop sidebar must sit above the page content
  // (it used to paint under the consultation cards).
  await page.locator('aside').getByRole('button', { name: 'Agregar hijo' }).click()
  const dialog = page.getByRole('dialog', { name: 'Agregar hijo' })
  await expect(dialog).toBeVisible()
  // Sample a grid of points across the dialog: every one must hit the dialog itself.
  const box = (await dialog.boundingBox())!
  const covered = await page.evaluate(({ x, y, width, height }) => {
    const dlg = document.querySelector('[role=dialog]')!
    const misses: string[] = []
    for (let i = 1; i <= 5; i++) {
      for (let k = 1; k <= 5; k++) {
        const el = document.elementFromPoint(x + (width * i) / 6, y + (height * k) / 6)
        if (!el || !dlg.contains(el)) misses.push(`${i},${k}`)
      }
    }
    return misses
  }, box)
  expect(covered).toEqual([])
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
