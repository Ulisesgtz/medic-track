import type { Page } from '@playwright/test'
import { test, expect, designs, seedChild, apiPost, PNG_BASE64 } from './helpers'

// specs/020: extending a treatment. The consultation is from two days ago with a medication every 8 h for 3 days from
// 08:00, so several doses are already "sin registrar" whatever time the suite runs.

const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

async function seedOldConsultation(page: Page) {
  const { childId, token } = await seedChild(page, { withConsultation: false })
  const now = new Date()
  const twoDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2)
  const created = await apiPost(page.context().request, token, `/children/${childId}/consultations`, {
    doctorName: 'Dra. Laura Cázares',
    consultDate: localDate(twoDaysAgo),
    photoBase64: PNG_BASE64,
    notes: '',
    utcOffsetMinutes: -now.getTimezoneOffset() || 0,
    medications: [{ name: 'Amoxicilina', frequencyHours: 8, durationDays: 3, startTime: '08:00' }],
  })
  return created.id as string
}

for (const design of designs) {
  test.describe(`Recorrer tratamiento — diseño ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    async function open(page: Page, id: string) {
      await page.goto(`/consultations/${id}`)
      await expect(page.getByRole('heading', { level: 3, name: 'Amoxicilina' })).toBeVisible()
    }

    test('cancelar no cambia nada; el botón no recomienda nada y el diálogo pregunta por el médico', async ({ page }) => {
      const id = await seedOldConsultation(page)
      await open(page, id)

      await page.getByRole('button', { name: 'Recorrer tratamiento' }).click()
      const dialog = page.getByRole('dialog', { name: '¿Recorrer el tratamiento de Amoxicilina?' })
      await expect(dialog).toContainText('¿Tu médico te indicó reponer las tomas?')
      await expect(dialog).toContainText('Esto queda registrado en tu cuenta. No se puede deshacer.')
      await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused()
      await dialog.getByRole('button', { name: 'Cancelar' }).click()

      await expect(dialog).toBeHidden()
      await expect(page.getByText(/Se recorrió el/)).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Recorrer tratamiento' })).toBeVisible()
    })

    test('confirmar con el número propuesto agrega las tomas, lo dice la tarjeta y el botón se va', async ({ page }) => {
      const id = await seedOldConsultation(page)
      await open(page, id)
      await expect(page.getByText(/^0 \/ 9 tomas/)).toBeVisible()

      await page.getByRole('button', { name: 'Recorrer tratamiento' }).click()
      const dialog = page.getByRole('dialog')
      const proposed = Number(await dialog.getByRole('textbox', { name: 'Tomas a agregar' }).inputValue())
      expect(proposed).toBeGreaterThan(0)
      await expect(dialog.getByText(/ingresaste tú manualmente/)).toHaveCount(0)
      await dialog.getByRole('button', { name: 'Sí, recorrer' }).click()

      await expect(dialog).toBeHidden()
      const unit = proposed === 1 ? 'toma' : 'tomas'
      await expect(page.getByText(`Se recorrió el`, { exact: false })).toContainText(`+${proposed} ${unit}`)
      await expect(page.getByText(/número ingresado manualmente/)).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Recorrer tratamiento' })).toHaveCount(0)
      // The added doses count in the progress total, and the unregistered ones stay history.
      await expect(page.getByText(new RegExp(`^0 / ${9 + proposed} tomas`))).toBeVisible()

      await page.reload()
      await expect(page.getByText(/Se recorrió el/)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Recorrer tratamiento' })).toHaveCount(0)
    })

    test('un número propio muestra la nota, se manda y la tarjeta dice que lo ingresó el padre', async ({ page }) => {
      const id = await seedOldConsultation(page)
      await open(page, id)

      await page.getByRole('button', { name: 'Recorrer tratamiento' }).click()
      const dialog = page.getByRole('dialog')
      const field = dialog.getByRole('textbox', { name: 'Tomas a agregar' })
      await field.fill('2')

      await expect(dialog.getByRole('status')).toContainText('Cambiaste el número propuesto: quedará registrado que lo ingresaste tú manualmente.')
      await dialog.getByRole('button', { name: 'Sí, recorrer' }).click()

      await expect(dialog).toBeHidden()
      await expect(page.getByText(/^Se recorrió el .* · \+2 tomas · número ingresado manualmente$/)).toBeVisible()
      await expect(page.getByText(/^0 \/ 11 tomas/)).toBeVisible()
    })

    test('no deja confirmar un número que no sea entero de 1 a 60', async ({ page }) => {
      const id = await seedOldConsultation(page)
      await open(page, id)

      await page.getByRole('button', { name: 'Recorrer tratamiento' }).click()
      const dialog = page.getByRole('dialog')
      const field = dialog.getByRole('textbox', { name: 'Tomas a agregar' })
      for (const bad of ['0', '61', '2.5', '']) {
        await field.fill(bad)
        await expect(dialog.getByRole('alert')).toContainText('Escribe un número entero de 1 a 60.')
        await expect(dialog.getByRole('button', { name: 'Sí, recorrer' })).toBeDisabled()
      }
    })
  })
}
