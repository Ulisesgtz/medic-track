import { test, expect } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { designs, signUp } from './helpers'

// Covers specs/004-detalle-consulta-hijo in both designs — the critical flow
// named in the constitution: registrar consulta (foto → confirmación manual) →
// ver el detalle con sus tomas → marcar una toma. Phone mocks 02/04/03, web
// mocks 06/14/13. Requires the backend running locally.

function writeTempImage(): string {
  const filePath = path.join(os.tmpdir(), `receta-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`)
  // A tiny valid JPEG isn't required — the backend only stores bytes, and
  // OCR failing on a non-photo is an explicitly covered case (FR-007).
  fs.writeFileSync(filePath, Buffer.from('fake-prescription-photo'))
  return filePath
}

for (const design of designs) {
  test.describe(`Consultas — diseño ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('registrar consulta → ver detalle con tomas → marcar una toma → volver a la lista', async ({ page }) => {
      await signUp(page)
      await page.getByRole('main').getByText('Luis Gómez').click()
      await expect(page).toHaveURL(/\/children\//)
      await expect(page.getByText(/todavía no hay consultas/i)).toBeVisible()

      // "Nueva consulta" is a page now (not a modal), reached by a link.
      await page
        .getByRole('link', { name: design.isWeb ? 'Nueva consulta' : '+ Nueva' })
        .click()
      await expect(page).toHaveURL(/\/consultations\/new/)
      await expect(page.getByRole('heading', { level: 1, name: 'Nueva consulta' })).toBeVisible()
      if (design.isWeb) {
        await expect(page.getByText(/^Para Luis Gómez · /)).toBeVisible()
        await expect(page.getByText('El procesamiento ocurre en tu equipo. La foto no se envía a ningún servidor.')).toBeVisible()
      } else {
        await expect(page.getByRole('link', { name: '← Cancelar' })).toBeVisible()
        await expect(page.getByText('El procesamiento ocurre en tu teléfono. La foto no sale del dispositivo.')).toBeVisible()
      }

      await page.getByLabel('Doctor').fill('Dra. López')
      await page.getByLabel('Fecha', { exact: true }).fill('2026-01-15')
      await page.getByLabel('Foto de la receta').setInputFiles(writeTempImage())
      await page.locator('#medications\\.0\\.name').fill('Amoxicilina')
      await page.locator('#medications\\.0\\.frequencyHours').fill('c/8 h')
      await page.locator('#medications\\.0\\.durationDays').fill('3 días')
      await page.locator('#medications\\.0\\.startTime').fill('08:00')

      await page.getByRole('button', { name: 'Guardar consulta' }).click()

      // FR-003/FR-013: saving navigates straight to the new consultation's detail.
      await expect(page).toHaveURL(/\/consultations\/(?!new)/)
      await expect(page.getByRole('heading', { name: 'Amoxicilina' })).toBeVisible()
      await expect(page.getByText('Cada 8 horas · 3 días · desde 08:00')).toBeVisible()

      // The treatment spans 3 days, so the day switcher is there: every dose stays reachable.
      const chips = page.getByRole('button', { name: /^Toma de / })
      await expect(chips.first()).toBeVisible()
      await expect(page.getByRole('button', { name: '← Día anterior' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Día siguiente →' })).toBeVisible()

      // FR-011: marking a dose works and is reflected immediately.
      const firstChip = chips.first()
      await expect(firstChip).toHaveAttribute('aria-pressed', 'false')
      await firstChip.click()
      await expect(firstChip).toHaveAttribute('aria-pressed', 'true')
      // Unmarking works too (no restriction on the dose's date).
      await firstChip.click()
      await expect(firstChip).toHaveAttribute('aria-pressed', 'false')

      // Back on the child's detail, the new consultation is now listed (FR-001).
      await page.goBack()
      await expect(page).toHaveURL(/\/children\/[^/]+$/)
      await expect(page.getByText('Dra. López')).toBeVisible()
      await expect(page.getByText('Tomas de hoy').first()).toBeVisible()
    })

    test('"Cancelar" vuelve al hijo, y pide confirmar solo si ya había algo capturado', async ({ page }) => {
      await signUp(page)
      await page.getByRole('main').getByText('Luis Gómez').click()
      await page.getByRole('link', { name: design.isWeb ? 'Nueva consulta' : '+ Nueva' }).click()
      await expect(page).toHaveURL(/\/consultations\/new/)

      // Nothing captured: leaves at once (the link is "← Cancelar" on the phone, "Cancelar" on the web).
      await page.getByRole('link', { name: /Cancelar/ }).click()
      await expect(page).toHaveURL(/\/children\/[^/]+$/)

      // With something typed, the parent is asked first; declining keeps them on the form.
      await page.getByRole('link', { name: design.isWeb ? 'Nueva consulta' : '+ Nueva' }).click()
      await page.getByLabel('Doctor').fill('Dr. Pérez')
      const dialogs: string[] = []
      page.once('dialog', async (dialog) => {
        dialogs.push(dialog.message())
        await dialog.dismiss()
      })
      await page.getByRole('link', { name: /Cancelar/ }).click()
      expect(dialogs).toEqual(['¿Descartar la consulta? Se perderá lo que capturaste.'])
      await expect(page).toHaveURL(/\/consultations\/new/)
      await expect(page.getByLabel('Doctor')).toHaveValue('Dr. Pérez')
    })

    test('guardar sin llenar nada muestra los errores y no crea la consulta', async ({ page }) => {
      await signUp(page)
      await page.getByRole('main').getByText('Luis Gómez').click()
      await page.getByRole('link', { name: design.isWeb ? 'Nueva consulta' : '+ Nueva' }).click()

      await page.getByRole('button', { name: 'Guardar consulta' }).click()

      await expect(page.getByText('El nombre del doctor es obligatorio')).toBeVisible()
      await expect(page.getByText('La fecha es obligatoria')).toBeVisible()
      await expect(page.getByText('La foto de la receta es obligatoria')).toBeVisible()
      await expect(page.getByRole('status')).toContainText('Completa los campos faltantes.')
      await expect(page).toHaveURL(/\/consultations\/new/)
    })

    test('agregar y quitar medicamentos', async ({ page }) => {
      await signUp(page)
      await page.getByRole('main').getByText('Luis Gómez').click()
      await page.getByRole('link', { name: design.isWeb ? 'Nueva consulta' : '+ Nueva' }).click()

      await expect(page.getByRole('button', { name: 'Quitar medicamento' })).toHaveCount(0)
      await page.getByRole('button', { name: '+ Otro medicamento' }).click()
      await expect(page.getByRole('group', { name: 'Medicamento 2' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Quitar medicamento' })).toHaveCount(2)

      await page.getByRole('button', { name: 'Quitar medicamento' }).nth(1).click()
      await expect(page.getByRole('group', { name: 'Medicamento 2' })).toHaveCount(0)
    })
  })
}

test.describe('web: un diálogo abierto desde la barra lateral queda por encima del contenido', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('el pop-up del plan gratuito no se pinta debajo de las tarjetas', async ({ page }) => {
    await signUp(page)
    await page.getByRole('main').getByText('Luis Gómez').click()
    await expect(page).toHaveURL(/\/children\//)

    await page.locator('aside').getByRole('button', { name: '+ Agregar hijo' }).click()
    const dialog = page.getByRole('dialog', { name: 'Llegaste a un hijo registrado' })
    await expect(dialog).toBeVisible()

    // Sample a grid of points across the dialog: every one must hit the dialog itself.
    const box = (await dialog.boundingBox())!
    const misses = await page.evaluate(({ x, y, width, height }) => {
      const dlg = document.querySelector('[role=dialog]')!
      const found: string[] = []
      for (let i = 1; i <= 5; i++) {
        for (let k = 1; k <= 5; k++) {
          const el = document.elementFromPoint(x + (width * i) / 6, y + (height * k) / 6)
          if (!el || !dlg.contains(el)) found.push(`${i},${k}`)
        }
      }
      return found
    }, box)
    expect(misses).toEqual([])

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })
})
