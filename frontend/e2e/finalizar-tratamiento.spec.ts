import { test, expect, designs, seedChild } from './helpers'

// specs/016: ending a treatment early. seedChild registers today a medication every 8 h for 3 days from 00:00 (nine
// doses, the last ones days ahead), so there is always something ahead to end whatever time the suite runs.

for (const design of designs) {
  test.describe(`Finalizar tratamiento — diseño ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    async function open(page: import('@playwright/test').Page, ids: { consultationId?: string }) {
      await page.goto(`/consultations/${ids.consultationId}`)
      await expect(page.getByRole('heading', { level: 3, name: 'Amoxicilina' })).toBeVisible()
    }

    test('cancelar no cambia nada; confirmar termina el tratamiento y cancela las tomas que faltaban', async ({ page }) => {
      const ids = await seedChild(page, { durationDays: 3 })
      await open(page, ids)
      await expect(page.getByText('0 / 9 tomas')).toBeVisible()

      // Cancel: nothing changes.
      await page.getByRole('button', { name: 'Finalizar tratamiento' }).click()
      const dialog = page.getByRole('dialog', { name: '¿Finalizar el tratamiento de Amoxicilina?' })
      await expect(dialog).toContainText('No se puede deshacer.')
      await dialog.getByRole('button', { name: 'Cancelar' }).click()
      await expect(dialog).toBeHidden()
      await expect(page.getByText(/Terminado el/)).toHaveCount(0)

      // Confirm.
      await page.getByRole('button', { name: 'Finalizar tratamiento' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Finalizar tratamiento' }).click()

      await expect(page.getByRole('dialog')).toBeHidden()
      await expect(page.getByText(/^Terminado el \d{1,2} \w{3} · \d+ de \d+ tomas?$/)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Finalizar tratamiento' })).toHaveCount(0)

      // Tomorrow's and later doses were ahead: canceled, not markable. Go to the last day.
      for (let i = 0; i < 3; i++) {
        const next = page.getByRole('button', { name: 'Día siguiente →' })
        if (await next.isEnabled()) await next.click()
      }
      const canceled = page.getByRole('button', { name: 'Toma de 16:00' })
      await expect(canceled).toBeDisabled()
      await expect(canceled).toHaveAccessibleDescription('Cancelada')
      await expect(canceled).toContainText('cancelada')

      // It stays ended after a reload.
      await page.reload()
      await expect(page.getByText(/^Terminado el/)).toBeVisible()
    })

    test('una toma ya pasada de un tratamiento terminado se sigue pudiendo marcar', async ({ page }) => {
      const ids = await seedChild(page, { durationDays: 3 })
      await open(page, ids)
      await page.getByRole('button', { name: 'Finalizar tratamiento' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Finalizar tratamiento' }).click()
      await expect(page.getByText(/^Terminado el/)).toBeVisible()

      // 00:00 of the first day came before the end: it keeps its state and can be marked.
      const first = page.getByRole('button', { name: 'Toma de 00:00' })
      await expect(first).toBeEnabled()
      await first.click()
      await expect(first).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByText(/^Terminado el .* · 1 de \d+ tomas?$/)).toBeVisible()
    })
  })
}

test('el detalle del hijo ya no muestra el tratamiento terminado como activo', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const ids = await seedChild(page, { durationDays: 3 })
  await page.goto(`/children/${ids.childId}`)
  await expect(page.getByText('Tratamiento activo').locator('..')).toContainText('Amoxicilina')

  await page.goto(`/consultations/${ids.consultationId}`)
  await page.getByRole('button', { name: 'Finalizar tratamiento' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Finalizar tratamiento' }).click()
  await expect(page.getByText(/^Terminado el/)).toBeVisible()

  await page.goto(`/children/${ids.childId}`)
  const treatment = page.getByText('Tratamiento activo').locator('..')
  await expect(treatment).toContainText('Ninguno')
})
