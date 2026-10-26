import type { APIRequestContext } from '@playwright/test'
import {
  acceptViaApi,
  allowClerkOn,
  apiPost,
  designs,
  expect,
  inviteViaApi,
  PNG_BASE64,
  secondPerson,
  seedChild,
  setAccountPlan,
  test,
  uniqueEmail,
} from './helpers'

// specs/051-editar-consultas: editing a saved consultation, at 390 and 1280 px, with real accounts (Clerk dev instance and the
// backend). What the screen can't show (the doses kept and made) is checked through the API.

const API = 'http://localhost:8080'

interface Dose {
  id: string
  scheduledAt: string
  taken: boolean
}

async function detailOf(request: APIRequestContext, token: string, consultationId: string) {
  const res = await request.get(`${API}/consultations/${consultationId}`, { headers: { Authorization: `Bearer ${token}` } })
  expect(res.ok()).toBeTruthy()
  return res.json() as Promise<{ doctorName: string; medications: { id: string; name: string; frequencyHours: number; doses: Dose[] }[] }>
}

async function markFirstDose(request: APIRequestContext, token: string, consultationId: string) {
  const detail = await detailOf(request, token, consultationId)
  const dose = detail.medications[0].doses[0]
  const res = await request.patch(`${API}/consultations/${consultationId}/doses/${dose.id}`, {
    data: { taken: true },
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.ok()).toBeTruthy()
  return dose
}

for (const design of designs) {
  test.describe(`Editar consulta, ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('the data is corrected and every dose, with its mark, stays as it was', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { durationDays: 3 })
      const request = page.context().request
      const marked = await markFirstDose(request, owner.token, owner.consultationId!)
      const before = await detailOf(request, owner.token, owner.consultationId!)

      await page.goto(`/consultations/${owner.consultationId}`)
      await page.getByRole('link', { name: 'Editar consulta' }).click()
      await expect(page.getByRole('heading', { name: 'Editar consulta', level: 1 })).toBeVisible()
      await expect(page.getByText('Próxima cita')).toHaveCount(0)
      await page.getByLabel('Doctor').fill('Dra. Laura Cázares Ruiz')
      await page.getByLabel('Notas previas a la consulta').fill('Fiebre y tos desde el sábado')
      await page.locator('#medications\\.0\\.name').fill('Amoxicilina 500 mg')
      await page.getByRole('button', { name: 'Guardar cambios' }).click()

      // No schedule changed: no confirmation, straight back to the consultation.
      await expect(page).toHaveURL(new RegExp(`/consultations/${owner.consultationId}$`))
      await expect(page.getByRole('heading', { name: 'Dra. Laura Cázares Ruiz', level: 1 })).toBeVisible()
      await expect(page.getByText(/^Editada el .+ por Ana$/)).toBeVisible()

      const after = await detailOf(request, owner.token, owner.consultationId!)
      expect(after.medications[0].name).toBe('Amoxicilina 500 mg')
      expect(after.medications[0].doses.map((d) => d.id)).toEqual(before.medications[0].doses.map((d) => d.id))
      expect(after.medications[0].doses.find((d) => d.id === marked.id)?.taken).toBe(true)
    })

    test('a new frequency asks first and only moves the doses still ahead and unmarked', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { durationDays: 3 })
      const request = page.context().request
      const marked = await markFirstDose(request, owner.token, owner.consultationId!)

      await page.goto(`/consultations/${owner.consultationId}/editar`)
      await page.getByLabel('Frecuencia').fill('12')
      await page.getByRole('button', { name: 'Guardar cambios' }).click()
      const dialog = page.getByRole('dialog', { name: '¿Guardar el nuevo horario?' })
      await expect(dialog).toContainText('Las tomas que ya marcaste no cambian.')
      await dialog.getByRole('button', { name: 'Guardar cambios' }).click()
      await expect(page).toHaveURL(new RegExp(`/consultations/${owner.consultationId}$`))

      const now = Date.now()
      const doses = (await detailOf(request, owner.token, owner.consultationId!)).medications[0].doses
      expect(doses.find((d) => d.id === marked.id)?.taken, 'the marked dose stays').toBe(true)
      const times = doses.map((d) => Date.parse(d.scheduledAt))
      expect(new Set(times).size, 'no two doses at the same time').toBe(times.length)
      const start = Date.parse(doses[0].scheduledAt)
      for (const d of doses) {
        const t = Date.parse(d.scheduledAt)
        if (t > now && !d.taken) expect((t - start) % (12 * 3600_000), `${d.scheduledAt} follows every 12 h`).toBe(0)
      }
    })

    test('a medication is added, and one without marks is taken out; one with marks stays', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { durationDays: 3 })
      const request = page.context().request
      await markFirstDose(request, owner.token, owner.consultationId!)

      await page.goto(`/consultations/${owner.consultationId}/editar`)
      await page.getByRole('button', { name: '+ Otro medicamento' }).click()
      await page.locator('#medications\\.1\\.name').fill('Ambroxol jarabe')
      await page.locator('#medications\\.1\\.frequencyHours').fill('12')
      await page.locator('#medications\\.1\\.durationDays').fill('5')
      await page.locator('#medications\\.1\\.startTime').fill('09:00')
      await page.getByRole('button', { name: 'Guardar cambios' }).click()
      await expect(page).toHaveURL(new RegExp(`/consultations/${owner.consultationId}$`))
      await expect(page.getByRole('heading', { name: 'Ambroxol jarabe', level: 3 })).toBeVisible()

      await page.goto(`/consultations/${owner.consultationId}/editar`)
      await expect(page.getByTestId('medication-fieldset-0')).toContainText('Tiene tomas marcadas: no se puede quitar.')
      await expect(page.getByTestId('medication-fieldset-0').getByRole('button', { name: 'Quitar medicamento' })).toHaveCount(0)
      await page.getByTestId('medication-fieldset-1').getByRole('button', { name: 'Quitar medicamento' }).click()
      await page.getByRole('button', { name: 'Guardar cambios' }).click()
      await expect(page).toHaveURL(new RegExp(`/consultations/${owner.consultationId}$`))
      await expect(page.getByRole('heading', { name: 'Ambroxol jarabe', level: 3 })).toHaveCount(0)
      expect((await detailOf(request, owner.token, owner.consultationId!)).medications).toHaveLength(1)
    })

    test('the free plan with another treatment running sees the plan notice and keeps what was typed', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { durationDays: 5 })
      const request = page.context().request
      // An earlier consultation with nothing ahead, made while the account paid.
      const n = new Date()
      n.setDate(n.getDate() - 20)
      const day = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
      const old = await apiPost(request, owner.token, `/children/${owner.childId}/consultations`, {
        doctorName: 'Dr. Pérez', consultDate: day, photoBase64: PNG_BASE64, utcOffsetMinutes: -n.getTimezoneOffset() || 0,
        medications: [{ name: 'Paracetamol', frequencyHours: 8, durationDays: 1, startTime: '08:00' }],
      })
      await setAccountPlan(owner.accountId, 'free')

      await page.goto(`/consultations/${old.id}/editar`)
      await page.getByRole('button', { name: '+ Otro medicamento' }).click()
      await page.locator('#medications\\.1\\.name').fill('Jarabe')
      await page.locator('#medications\\.1\\.frequencyHours').fill('8')
      await page.locator('#medications\\.1\\.durationDays').fill('30')
      await page.locator('#medications\\.1\\.startTime').fill('09:00')
      // No schedule of a saved medication changes (no confirmation): the new medication is what adds doses ahead.
      await page.getByRole('button', { name: 'Guardar cambios' }).click()
      await expect(page.getByRole('dialog')).toContainText(/plan completo/i)
      await page.getByRole('button', { name: 'Ahora no' }).click()
      await expect(page.locator('#medications\\.1\\.name')).toHaveValue('Jarabe')
    })
  })
}

test.describe('Editar consulta: quién puede', () => {
  test.use({ viewport: designs[1].viewport })

  test('a Caregiver sees the consultation but no «Editar consulta», and the API refuses an edit', async ({ page, browser }) => {
    await allowClerkOn(page)
    const owner = await seedChild(page)
    const email = uniqueEmail('cuidador')
    const caregiver = await secondPerson(browser, designs[1], { email })
    const invitation = await inviteViaApi(page.context().request, owner.token, email, 'caregiver')
    await acceptViaApi(caregiver.context.request, caregiver.token, invitation)

    await caregiver.page.goto(`/consultations/${owner.consultationId}`)
    await expect(caregiver.page.getByRole('heading', { name: 'Dra. Laura Cázares', level: 1 })).toBeVisible()
    await expect(caregiver.page.getByRole('link', { name: 'Editar consulta' })).toHaveCount(0)

    const res = await caregiver.context.request.put(`${API}/consultations/${owner.consultationId}`, {
      data: { expectedVersion: new Date().toISOString(), doctorName: 'X', consultDate: '2026-01-01', medications: [] },
      headers: { Authorization: `Bearer ${caregiver.token}` },
    })
    expect(res.status()).toBe(403)
    await caregiver.context.close()
  })
})
