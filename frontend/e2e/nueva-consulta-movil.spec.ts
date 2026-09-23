import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { test, expect, seedChild } from './helpers'

// "Nueva consulta", phone design (mock 04): dark header with "← Cancelar" and the
// OCR panel, the "Sugerido por OCR" group, the medication cards and the save
// button. Requires the backend running locally.

function photo(): string {
  const filePath = path.join(os.tmpdir(), `receta-m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.png`)
  fs.writeFileSync(
    filePath,
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
  )
  return filePath
}

test.describe('Nueva consulta — diseño móvil (mock 04)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ page }) => {
    const { childId } = await seedChild(page, { withConsultation: false })
    await page.goto(`/children/${childId}/consultations/new`)
  })

  test('sin foto: el panel ofrece elegirla; con foto pasa a "Leyendo receta" como el mock', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Nueva consulta' })).toBeVisible()
    await expect(page.getByRole('link', { name: '← Cancelar' })).toBeVisible()
    await expect(page.getByText('Foto de la receta', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Seleccionar archivo' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cambiar foto' })).toHaveCount(0)

    await page.getByLabel('Foto de la receta').setInputFiles(photo())

    await expect(page.getByText('Leyendo receta')).toBeVisible()
    await expect(page.getByText('Listo')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    await expect(page.getByText('El procesamiento ocurre en tu teléfono. La foto no sale del dispositivo.')).toBeVisible()
    // As in the mock the panel has no chooser row; changing the photo lives next to "← Cancelar".
    await expect(page.getByRole('button', { name: 'Seleccionar archivo' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Cambiar foto' })).toBeVisible()
  })

  test('"Cambiar foto" abre el selector de archivos y lee la nueva foto', async ({ page }) => {
    await page.getByLabel('Foto de la receta').setInputFiles(photo())
    await expect(page.getByText('Listo')).toBeVisible({ timeout: 60_000 })

    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Cambiar foto' }).click()
    await (await chooser).setFiles(photo())

    await expect(page.getByText('Listo')).toBeVisible({ timeout: 60_000 })
  })

  test('el grupo "Sugerido por OCR" tiene Doctor y Fecha con borde brillante; Síntomas va aparte', async ({ page }) => {
    const group = page.getByRole('group', { name: 'Sugerido por OCR · revisa y confirma' })
    await expect(group.getByLabel('Doctor')).toHaveClass(/border-bright/)
    await expect(group.getByLabel('Fecha')).toHaveClass(/border-bright/)
    await expect(group.getByLabel('Síntomas')).toHaveCount(0)
    await expect(page.getByLabel('Síntomas')).toBeVisible()
  })

  test('medicamentos: el primero sin "Quitar"; los siguientes se numeran y se pueden quitar', async ({ page }) => {
    await expect(page.getByRole('group', { name: 'Medicamento 1' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Quitar medicamento' })).toHaveCount(0)
    await expect(page.locator('#medications\\.0\\.name')).toHaveAttribute('placeholder', 'Nombre y dosis')
    await expect(page.locator('#medications\\.0\\.frequencyHours')).toHaveAttribute('placeholder', 'c/8 h')
    await expect(page.locator('#medications\\.0\\.durationDays')).toHaveAttribute('placeholder', '7 días')

    await page.getByRole('button', { name: '+ Otro medicamento' }).click()
    await expect(page.getByRole('group', { name: 'Medicamento 2' })).toBeVisible()
    await page.getByRole('button', { name: 'Quitar medicamento' }).first().click()

    await expect(page.getByRole('group', { name: 'Medicamento 2' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Quitar medicamento' })).toHaveCount(0)
  })

  test('guardar sin llenar nada avisa "Completa los campos faltantes." en rojo y pone el foco en el primer campo', async ({ page }) => {
    await page.getByRole('button', { name: 'Guardar consulta' }).click()

    const status = page.getByRole('status')
    await expect(status).toHaveText('Completa los campos faltantes.')
    await expect(status).toHaveClass(/text-red-700/)
    await expect(page.getByLabel('Doctor')).toBeFocused()
  })

  test('guardar con todo lleno crea la consulta y abre su detalle', async ({ page }) => {
    await page.getByLabel('Doctor').fill('Dra. Laura Cázares')
    await page.getByLabel('Fecha', { exact: true }).fill('2026-09-12')
    await page.getByLabel('Foto de la receta').setInputFiles(photo())
    await page.locator('#medications\\.0\\.name').fill('Amoxicilina 250 mg')
    await page.locator('#medications\\.0\\.frequencyHours').fill('c/8 h')
    await page.locator('#medications\\.0\\.durationDays').fill('7 días')
    await page.locator('#medications\\.0\\.startTime').fill('08:00')
    await page.getByLabel('Síntomas').fill('Fiebre y tos')

    await page.getByRole('button', { name: 'Guardar consulta' }).click()

    await expect(page).toHaveURL(/\/consultations\/(?!new)/)
    await expect(page.getByRole('heading', { level: 1, name: 'Dra. Laura Cázares' })).toBeVisible()
    await expect(page.getByText('Fiebre y tos')).toBeVisible()
  })

  test('es una columna centrada de máximo 430 px, como el mock, sin desborde horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 900 })

    // The page's own <main> (the "Cargando…" one, shown while the session and the data load, has no max width).
    await expect(page.getByRole('main')).toHaveClass(/max-w-\[430px\]/)
    const box = await page.getByRole('main').boundingBox()
    expect(Math.round(box!.width)).toBe(430)
    expect(Math.round(box!.x)).toBe(135)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  })
})
