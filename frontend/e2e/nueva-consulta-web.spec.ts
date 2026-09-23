import type { Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { test, expect, seedChild } from './helpers'

// "Nueva consulta", web design (mock 14): the children sidebar, a header ("← Cancelar", the
// title and "Para Mateo Morales · 5 años 6 meses"), the dark OCR panel, the "Sugerido por
// OCR" group, the medication cards with their row of fields, "+ Otro medicamento"
// and "Guardar consulta". The positions were measured on the mock at each width (Chromium;
// other engines draw fonts with other metrics, so heights are only asserted there).
// Requires the backend running locally.

function photo(): string {
  const filePath = path.join(os.tmpdir(), `receta-w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.png`)
  fs.writeFileSync(
    filePath,
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
  )
  return filePath
}

const box = async (locator: ReturnType<Page['locator']>) => {
  const b = (await locator.boundingBox())!
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
}

async function open(page: Page, width: number) {
  const { accountId, childId } = await seedChild(page, { withConsultation: false })
  await page.setViewportSize({ width, height: 900 })
  await page.goto(`/children/${childId}/consultations/new`)
  await page.evaluate(() => document.fonts.ready)
  return { accountId, childId }
}

test.describe('Nueva consulta — diseño web (mock 14)', () => {
  for (const { width, titleX, panelW, nameW, freqX, freqW, sinceInRow } of [
    // With room (the card is 720px or wider) "Desde" is a fourth column and the fields are a bit shorter than the
    // mock's row of three (408/204/204); at 1024 px with the sidebar the card is narrower and the row is the mock's.
    { width: 1440, titleX: 412, panelW: 896, nameW: 320, freqX: 772, freqW: 160, sinceInRow: true },
    { width: 1280, titleX: 332, panelW: 896, nameW: 320, freqX: 692, freqW: 160, sinceInRow: true },
    { width: 1024, titleX: 328, panelW: 648, nameW: 284, freqX: 652, freqW: 142, sinceInRow: false },
  ]) {
    test(`a ${width} px: barra lateral, título, panel del OCR y la fila del medicamento (Desde ${sinceInRow ? 'en el mismo renglón' : 'debajo, como el mock de tres campos'})`, async ({ page, browserName }) => {
      await open(page, width)

      expect(await box(page.locator('aside').first())).toMatchObject({ x: 0, w: 280 })
      expect(await box(page.getByRole('heading', { level: 1, name: 'Nueva consulta' }))).toMatchObject({ x: titleX })
      await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-size', '36px')
      const ocr = await box(page.getByText('Foto de la receta', { exact: true }).locator('..').locator('..'))
      expect(ocr).toMatchObject({ x: titleX, w: panelW })
      expect(await box(page.getByText('Nombre y dosis', { exact: true }))).toMatchObject({ x: titleX + 24, w: nameW })
      expect(await box(page.getByText('Frecuencia', { exact: true }))).toMatchObject({ x: freqX, w: freqW })
      expect(await box(page.getByText('Duración', { exact: true }))).toMatchObject({ w: freqW })
      const freq = await box(page.getByText('Frecuencia', { exact: true }))
      const since = await box(page.getByText('Desde', { exact: true }))
      if (sinceInRow) {
        expect(since.y).toBe(freq.y)
        expect(since).toMatchObject({ x: freqX + 2 * (freqW + 16), w: freqW })
      } else {
        expect(since.x).toBe(freq.x)
        expect(since.y).toBeGreaterThan(freq.y)
      }
      if (browserName === 'chromium') {
        expect((await box(page.getByRole('button', { name: 'Guardar consulta' }))).h).toBe(52)
        expect((await box(page.getByRole('button', { name: '+ Otro medicamento' }))).h).toBe(51)
      }
    })
  }

  test('bajo 1024 px no hay barra lateral y los márgenes son de 24 px, como el mock', async ({ page }) => {
    await open(page, 1000)

    await expect(page.getByRole('navigation', { name: 'Tus hijos' })).toHaveCount(0)
    expect(await box(page.getByRole('main'))).toMatchObject({ x: 0, w: 1000 })
    expect(await box(page.getByRole('heading', { level: 1, name: 'Nueva consulta' }))).toMatchObject({ x: 52 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  })

  test('título con "Para <hijo> · edad", "← Cancelar" y el panel del OCR antes y después de elegir foto', async ({ page }) => {
    await open(page, 1280)

    await expect(page.getByText(/^Para Mateo Morales · \d+ años?/)).toBeVisible()
    await expect(page.getByRole('link', { name: '← Cancelar' })).toBeVisible()
    await expect(page.getByText('El procesamiento ocurre en tu equipo. La foto no se envía a ningún servidor.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Seleccionar archivo' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cambiar foto' })).toHaveCount(0)

    await page.getByLabel('Foto de la receta').setInputFiles(photo())

    await expect(page.getByText('Leyendo receta')).toBeVisible()
    await expect(page.getByText('Listo')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    // As in the mock the panel has no chooser row; changing the photo is at the header's right end.
    await expect(page.getByRole('button', { name: 'Seleccionar archivo' })).toHaveCount(0)
    const change = page.getByRole('button', { name: 'Cambiar foto' })
    await expect(change).toBeVisible()
    const chooser = page.waitForEvent('filechooser')
    await change.click()
    await (await chooser).setFiles(photo())
    await expect(page.getByText('Listo')).toBeVisible({ timeout: 60_000 })
  })

  test('el grupo "Sugerido por OCR" lleva Doctor, Fecha y Síntomas; los campos de la fila del medicamento, sus placeholders', async ({ page }) => {
    await open(page, 1280)

    const group = page.getByRole('group', { name: 'Sugerido por OCR · revisa y confirma' })
    await expect(group.getByLabel('Doctor')).toHaveClass(/border-bright/)
    await expect(group.getByLabel('Fecha')).toHaveClass(/border-bright/)
    await expect(group.getByLabel('Síntomas')).toHaveAttribute('placeholder', 'Lo que observaste antes de la consulta')
    await expect(page.locator('#medications\\.0\\.name')).toHaveAttribute('placeholder', 'Amoxicilina 250 mg')
    await expect(page.locator('#medications\\.0\\.frequencyHours')).toHaveAttribute('placeholder', 'c/8 h')
    await expect(page.locator('#medications\\.0\\.durationDays')).toHaveAttribute('placeholder', '7 días')
    // "Desde" is not in the mock's row: with room it is a fourth column of the same row.
    const freq = await box(page.getByText('Frecuencia', { exact: true }))
    const since = await box(page.getByText('Desde', { exact: true }))
    expect(since.y).toBe(freq.y)
    expect(since.x).toBeGreaterThan(freq.x)
  })

  test('medicamentos: el primero sin "Quitar"; se agregan, se numeran y se quitan', async ({ page }) => {
    await open(page, 1280)
    await expect(page.getByRole('group', { name: 'Medicamento 1' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Quitar medicamento' })).toHaveCount(0)

    await page.getByRole('button', { name: '+ Otro medicamento' }).click()
    await expect(page.getByRole('group', { name: 'Medicamento 2' })).toBeVisible()
    await page.getByRole('button', { name: 'Quitar medicamento' }).first().click()

    await expect(page.getByRole('group', { name: 'Medicamento 2' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Quitar medicamento' })).toHaveCount(0)
  })

  test('guardar sin llenar nada: errores bajo los campos, aviso en rojo y foco en el primero', async ({ page }) => {
    await open(page, 1280)

    await page.getByRole('button', { name: 'Guardar consulta' }).click()

    const status = page.getByRole('status')
    await expect(status).toHaveText('Completa los campos faltantes.')
    await expect(status).toHaveClass(/text-red-700/)
    await expect(page.getByLabel('Doctor')).toBeFocused()
    await expect(page.getByText('El nombre del doctor es obligatorio')).toBeVisible()
    await expect(page.getByText('La fecha es obligatoria')).toBeVisible()
    await expect(page.getByText('La foto de la receta es obligatoria')).toBeVisible()
    await expect(page.getByText('Escribe el nombre del medicamento.')).toBeVisible()
    await expect(page.getByText('Elige la hora de la primera toma.')).toBeVisible()
  })

  test('guardar con todo lleno crea la consulta y abre su detalle', async ({ page }) => {
    await open(page, 1280)
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

  test('"← Cancelar" vuelve al hijo, y con algo capturado pide confirmar antes de descartarlo', async ({ page }) => {
    const { childId } = await open(page, 1280)

    await page.getByRole('link', { name: '← Cancelar' }).click()
    await expect(page).toHaveURL(new RegExp(`/children/${childId}$`))

    await page.goBack()
    await page.getByLabel('Doctor').fill('Dr. Pérez')
    const messages: string[] = []
    page.once('dialog', async (dialog) => {
      messages.push(dialog.message())
      await dialog.dismiss()
    })
    await page.getByRole('link', { name: '← Cancelar' }).click()
    expect(messages).toEqual(['¿Descartar la consulta? Se perderá lo que capturaste.'])
    await expect(page.getByLabel('Doctor')).toHaveValue('Dr. Pérez')
  })

  test('la barra lateral marca al hijo activo y su "+ Agregar hijo" abre el pop-up del plan', async ({ page }) => {
    await open(page, 1280)
    const sidebar = page.getByRole('navigation', { name: 'Tus hijos' })

    await expect(sidebar.getByRole('link', { name: /^Mateo/ })).toHaveAttribute('aria-current', 'page')
    await sidebar.getByRole('button', { name: '+ Agregar hijo' }).click()

    await expect(page.getByRole('dialog', { name: 'Llegaste a un hijo registrado' })).toBeVisible()
  })
})
