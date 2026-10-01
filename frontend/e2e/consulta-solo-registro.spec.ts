import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { test, expect, designs, seedChild, apiPost, PNG_BASE64 } from './helpers'

// specs/024: a consultation saved only as a record has no schedule: no "Primera toma", no doses, no calendar, no
// active treatment. Requires the backend running locally (with migration 0016).

function writeTempImage(): string {
  const filePath = path.join(os.tmpdir(), `receta-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`)
  fs.writeFileSync(filePath, Buffer.from('fake-prescription-photo'))
  return filePath
}

const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

for (const design of designs) {
  test.describe(`Consulta solo registro — diseño ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('marcar «solo como registro» guarda la consulta sin tomas, con su etiqueta, sin calendario ni tratamiento activo', async ({ page }) => {
      const { childId, token } = await seedChild(page, { withConsultation: false })
      // A normal consultation of the same child keeps its doses and its calendar.
      const now = new Date()
      const normal = await apiPost(page.context().request, token, `/children/${childId}/consultations`, {
        doctorName: 'Dr. Normal',
        consultDate: localDate(now),
        photoBase64: PNG_BASE64,
        notes: '',
        utcOffsetMinutes: -now.getTimezoneOffset() || 0,
        medications: [{ name: 'Paracetamol', frequencyHours: 8, durationDays: 2, startTime: '00:00' }],
      })

      await page.goto(`/children/${childId}/consultations/new`)
      await expect(page.getByRole('heading', { level: 1, name: 'Nueva consulta' })).toBeVisible()
      await expect(page.locator('#medications\\.0\\.startTime')).toBeVisible()

      // Marked: "Primera toma" is not asked for.
      const recordOnly = page.getByRole('checkbox', { name: 'Consulta anterior: guardar solo como registro' })
      await expect(recordOnly).not.toBeChecked()
      await recordOnly.check()
      await expect(page.getByText('No se crearán horarios de tomas ni avisos. Esto no se puede cambiar después.')).toBeVisible()
      await expect(page.locator('#medications\\.0\\.startTime')).toHaveCount(0)

      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 15)
      await page.getByLabel('Doctor').fill('Dra. Anterior')
      await page.getByLabel('Fecha', { exact: true }).fill(localDate(threeMonthsAgo))
      await page.getByLabel('Foto de la receta').setInputFiles(writeTempImage())
      await page.locator('#medications\\.0\\.name').fill('Amoxicilina')
      await page.locator('#medications\\.0\\.frequencyHours').fill('c/8 h')
      await page.locator('#medications\\.0\\.durationDays').fill('7 días')
      await page.getByRole('button', { name: 'Guardar consulta' }).click()

      // The detail: the tag, the medication as information, and nothing to mark.
      await expect(page).toHaveURL(/\/consultations\/(?!new)/)
      await expect(page.getByText('Solo registro')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Amoxicilina' })).toBeVisible()
      await expect(page.getByText('Cada 8 horas · 7 días', { exact: true })).toBeVisible()
      await expect(page.getByRole('region', { name: 'Calendario del tratamiento' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /^Toma de / })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Finalizar tratamiento' })).toHaveCount(0)
      if (design.isWeb) await expect(page.getByText('Tratamiento activo')).toHaveCount(0)

      // The child's list: tagged, and its doses are not among today's (only the normal consultation's are).
      await page.goto(`/children/${childId}`)
      const recordCard = page.getByRole('link', { name: /Dra\. Anterior/ })
      await expect(recordCard).toContainText('Solo registro')
      await expect(page.getByRole('link', { name: /Dr\. Normal/ })).not.toContainText('Solo registro')

      // The normal consultation still has its doses and its calendar.
      await page.goto(`/consultations/${normal.id}`)
      await expect(page.getByRole('region', { name: 'Calendario del tratamiento' })).toBeVisible()
      await expect(page.getByRole('button', { name: /^Toma de / }).first()).toBeVisible()
    })

    test('desmarcarla devuelve «Primera toma» con lo que ya estaba escrito', async ({ page }) => {
      const { childId } = await seedChild(page, { withConsultation: false })
      await page.goto(`/children/${childId}/consultations/new`)
      await page.locator('#medications\\.0\\.startTime').fill('08:30')

      const recordOnly = page.getByRole('checkbox', { name: 'Consulta anterior: guardar solo como registro' })
      await recordOnly.check()
      await expect(page.locator('#medications\\.0\\.startTime')).toHaveCount(0)
      await recordOnly.uncheck()

      await expect(page.locator('#medications\\.0\\.startTime')).toHaveValue('08:30')
    })
  })
}
