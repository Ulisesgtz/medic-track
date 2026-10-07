import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { test, expect, designs, seedChild, apiPost, PNG_BASE64 } from './helpers'

// specs/030-reglas-plan-gratis: on the free plan one consultation with an active treatment at a time, and no
// "guardar solo como registro"; nothing already saved is ever hidden. Requires the backend running locally.

function writeTempImage(): string {
  const filePath = path.join(os.tmpdir(), `receta-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`)
  fs.writeFileSync(filePath, Buffer.from('fake-prescription-photo'))
  return filePath
}

const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

for (const design of designs) {
  test.describe(`Plan gratuito: consultas — diseño ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    // The entry to "Nueva consulta" in each design: the web header button, the phone's "+ Nueva".
    const entryName = design.isWeb ? 'Nueva consulta' : '+ Nueva'
    const main = (page: import('@playwright/test').Page) => page.getByRole('main')

    test('con un tratamiento activo «Nueva consulta» abre el aviso del plan, sin formulario; al finalizarlo se puede registrar la siguiente', async ({ page }) => {
      // 3 days: still running whatever time the suite runs.
      const { childId, consultationId, medicationId, token } = await seedChild(page, { durationDays: 3, plan: 'free' })
      await page.goto(`/children/${childId}`)

      await main(page).getByRole('button', { name: entryName }).click()

      const dialog = page.getByRole('dialog', { name: 'Ya hay un tratamiento activo' })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText('Plan completo', { exact: true })).toBeVisible()
      await expect(dialog.getByText(/al terminar o finalizar el actual registras el siguiente/)).toBeVisible()
      await expect(dialog.getByText('Lo que ya registraste se queda igual con cualquier plan.')).toBeVisible()
      await expect(page).toHaveURL(new RegExp(`/children/${childId}$`))
      // The consultation already registered stays in the list.
      await expect(main(page).getByText('Dra. Laura Cázares')).toBeVisible()

      await dialog.getByRole('button', { name: 'Ahora no' }).click()
      await expect(dialog).toBeHidden()

      // Ending the treatment (spec 016) frees the next consultation: the entry is a link to the form again.
      await apiPost(page.context().request, token, `/consultations/${consultationId}/medications/${medicationId}/end`, {})
      await page.reload()
      await main(page).getByRole('link', { name: entryName }).click()
      await expect(page).toHaveURL(/\/consultations\/new$/)
    })

    test('«Ver planes» del aviso abre la pantalla de planes', async ({ page }) => {
      const { childId } = await seedChild(page, { durationDays: 3, plan: 'free' })
      await page.goto(`/children/${childId}`)
      await main(page).getByRole('button', { name: entryName }).click()

      await page.getByRole('dialog', { name: 'Ya hay un tratamiento activo' }).getByRole('link', { name: 'Ver el plan completo' }).click()

      await expect(page).toHaveURL(/\/planes$/)
    })

    test('sin tratamiento activo se registra una consulta normal, y «solo registro» se ve pero no se puede marcar', async ({ page }) => {
      const { childId } = await seedChild(page, { withConsultation: false, plan: 'free' })
      await page.goto(`/children/${childId}/consultations/new`)
      await expect(page.getByRole('heading', { level: 1, name: 'Nueva consulta' })).toBeVisible()

      const recordOnly = page.getByRole('checkbox', { name: 'Consulta anterior: guardar solo como registro' })
      await expect(recordOnly).toBeDisabled()
      await expect(recordOnly).not.toBeChecked()
      await expect(page.getByText(/Disponible en el plan completo. Con el plan gratuito/)).toBeVisible()

      await page.getByLabel('Doctor').fill('Dra. Actual')
      await page.getByLabel('Fecha', { exact: true }).fill(localDate(new Date()))
      await page.getByLabel('Foto de la receta').setInputFiles(writeTempImage())
      await page.locator('#medications\\.0\\.name').fill('Amoxicilina')
      await page.locator('#medications\\.0\\.frequencyHours').fill('c/8 h')
      await page.locator('#medications\\.0\\.durationDays').fill('7 días')
      await page.locator('#medications\\.0\\.startTime').fill('08:00')
      await page.getByRole('button', { name: 'Guardar consulta' }).click()

      await expect(page).toHaveURL(/\/consultations\/(?!new)/)
      await expect(page.getByRole('heading', { name: 'Amoxicilina' })).toBeVisible()
    })

    test('si el servidor ya tiene otro tratamiento activo, el aviso sale al guardar y lo escrito se queda', async ({ page }) => {
      const { childId, token } = await seedChild(page, { withConsultation: false, plan: 'free' })
      await page.goto(`/children/${childId}/consultations/new`)
      await page.getByLabel('Doctor').fill('Dra. Segunda')
      await page.getByLabel('Fecha', { exact: true }).fill(localDate(new Date()))
      await page.getByLabel('Foto de la receta').setInputFiles(writeTempImage())
      await page.locator('#medications\\.0\\.name').fill('Ibuprofeno')
      await page.locator('#medications\\.0\\.frequencyHours').fill('c/8 h')
      await page.locator('#medications\\.0\\.durationDays').fill('3 días')
      await page.locator('#medications\\.0\\.startTime').fill('08:00')

      // Meanwhile (another device) a treatment was started for the same account.
      const now = new Date()
      await apiPost(page.context().request, token, `/children/${childId}/consultations`, {
        doctorName: 'Dr. Primero',
        consultDate: localDate(now),
        photoBase64: PNG_BASE64,
        notes: '',
        utcOffsetMinutes: -now.getTimezoneOffset() || 0,
        medications: [{ name: 'Paracetamol', frequencyHours: 8, durationDays: 3, startTime: '00:00' }],
      })

      await page.getByRole('button', { name: 'Guardar consulta' }).click()

      const dialog = page.getByRole('dialog', { name: 'Ya hay un tratamiento activo' })
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: 'Ahora no' }).click()
      await expect(dialog).toBeHidden()
      await expect(page).toHaveURL(/\/consultations\/new$/)
      await expect(page.getByLabel('Doctor')).toHaveValue('Dra. Segunda')
      await expect(page.locator('#medications\\.0\\.name')).toHaveValue('Ibuprofeno')
    })

    test('con el plan completo no hay aviso: «Nueva consulta» es un enlace y «solo registro» se puede marcar', async ({ page }) => {
      const { childId } = await seedChild(page, { durationDays: 3 }) // paid by default
      await page.goto(`/children/${childId}`)
      await expect(main(page).getByRole('link', { name: entryName })).toBeVisible()
      await expect(main(page).getByRole('button', { name: entryName })).toHaveCount(0)

      await page.goto(`/children/${childId}/consultations/new`)
      const recordOnly = page.getByRole('checkbox', { name: 'Consulta anterior: guardar solo como registro' })
      await expect(recordOnly).toBeEnabled()
      await recordOnly.check()
      await expect(recordOnly).toBeChecked()
    })
  })
}
