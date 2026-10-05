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
  // Frequency and duration hold a couple of digits: a fixed 112 px (7rem) each, and the name takes the rest.
  // With room (the card is 720px or wider) "Primera toma" is a fourth column of 160 px; at 1024 px with the sidebar
  // the card is narrower and it goes under "Frecuencia" and "Duración" (both columns wide).
  const freqW = 112
  for (const { width, titleX, panelW, nameW, freqX, sinceW, sinceInRow } of [
    { width: 1440, titleX: 412, panelW: 896, nameW: 416, freqX: 868, sinceW: 160, sinceInRow: true },
    { width: 1280, titleX: 332, panelW: 896, nameW: 416, freqX: 788, sinceW: 160, sinceInRow: true },
    { width: 1024, titleX: 328, panelW: 648, nameW: 344, freqX: 712, sinceW: 240, sinceInRow: false },
  ]) {
    test(`a ${width} px: barra lateral, título, panel del OCR y la fila del medicamento (Primera toma ${sinceInRow ? 'en el mismo renglón' : 'debajo de frecuencia y duración'})`, async ({ page, browserName }) => {
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
      const since = await box(page.getByText('Primera toma', { exact: true }))
      if (sinceInRow) {
        expect(since.y).toBe(freq.y)
        expect(since).toMatchObject({ x: freqX + 2 * (freqW + 16), w: sinceW })
      } else {
        expect(since).toMatchObject({ x: freqX, w: sinceW })
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
    await expect(page.getByText('El texto se lee en tu equipo; la foto se guarda solo en tu cuenta.')).toBeVisible()
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

  test('el grupo "Leído de tu receta" lleva Doctor y Fecha (síntomas y notas van aparte); los campos de la fila del medicamento, sus placeholders', async ({ page }) => {
    await open(page, 1280)

    const group = page.getByRole('group', { name: 'Leído de tu receta · revisa y confirma' })
    await expect(group.getByLabel('Doctor')).toHaveClass(/border-bright/)
    await expect(group.getByLabel('Fecha')).toHaveClass(/border-bright/)
    await expect(group.getByLabel('Notas previas a la consulta')).toHaveCount(0)
    await expect(page.getByLabel('Notas previas a la consulta')).toHaveAttribute(
      'placeholder',
      'Qué comió antes, cómo se sentía, cómo fue cambiando desde que empezó…',
    )
    await expect(page.getByRole('group', { name: '¿Qué síntomas tuvo?' }).getByRole('button')).toHaveCount(23)
    await expect(page.locator('#medications\\.0\\.name')).toHaveAttribute('placeholder', 'Amoxicilina 250 mg')
    await expect(page.locator('#medications\\.0\\.frequencyHours')).toHaveAttribute('placeholder', 'c/8 h')
    await expect(page.locator('#medications\\.0\\.durationDays')).toHaveAttribute('placeholder', '7 días')
    // "Primera toma" is not in the mock's row: with room it is a fourth column of the same row.
    const freq = await box(page.getByText('Frecuencia', { exact: true }))
    const since = await box(page.getByText('Primera toma', { exact: true }))
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
    await expect(status).toHaveText('Falta: la foto de la receta, el doctor, la fecha, el nombre del medicamento, cada cuántas horas, cuántos días, la hora de la primera toma.')
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
    await page.getByRole('button', { name: 'Tos' }).click()
    await page.getByRole('button', { name: 'Fiebre' }).click()
    await page.getByRole('button', { name: 'Escalofríos' }).click()
    await page.getByRole('button', { name: 'Escalofríos' }).click() // tapped again: off
    await expect(page.getByRole('button', { name: 'Fiebre' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Escalofríos' })).toHaveAttribute('aria-pressed', 'false')
    await page.getByLabel('Notas previas a la consulta').fill('Comió poco desde el domingo')

    await page.getByRole('button', { name: 'Guardar consulta' }).click()

    await expect(page).toHaveURL(/\/consultations\/(?!new)/)
    await expect(page.getByRole('heading', { level: 1, name: 'Dra. Laura Cázares' })).toBeVisible()
    // specs/012: the marked symptoms as pills in catalog order, then the notes.
    const symptoms = page.getByRole('main').getByRole('list').filter({ hasText: 'Fiebre' })
    await expect(symptoms.getByRole('listitem')).toHaveText(['Fiebre', 'Tos'])
    await expect(page.getByRole('heading', { level: 2, name: 'Notas previas a la consulta' })).toBeVisible()
    await expect(page.getByText('Comió poco desde el domingo')).toBeVisible()

    // And the child's list sums them up.
    await page.getByRole('main').getByRole('link', { name: /^← / }).click()
    await expect(page.getByRole('main').getByRole('link', { name: /Dra. Laura Cázares/ })).toContainText('Fiebre, Tos · 1 medicamento')
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
