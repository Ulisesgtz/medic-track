import {
  test,
  expect,
  designs,
  seedChild,
  allowClerkOn,
  apiPost,
  PNG_BASE64,
  secondPerson,
  inviteViaApi,
  acceptViaApi,
  setAccountPlan,
  queryDb,
} from './helpers'

// specs/058-consultas-del-titular: the person's own consultations in their profile (/yo), private until they share them with the
// Tutors of their family; a Caregiver never sees them. Requires the backend (with migration 0032) and the frontend.

const API = process.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

function today() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** A consultation of the person themself, through the API, with one medication whose first dose is at midnight today. */
async function ownConsultationViaApi(request: import('@playwright/test').APIRequestContext, token: string, accountId: string) {
  return apiPost(request, token, `/accounts/${accountId}/consultations`, {
    doctorName: 'Dr. Propio Paz',
    consultDate: today(),
    photoBase64: PNG_BASE64,
    notes: 'Dolor de garganta',
    utcOffsetMinutes: -new Date().getTimezoneOffset() || 0,
    medications: [{ name: 'Losartán propio', frequencyHours: 8, durationDays: 2, startTime: '00:00' }],
  })
}

for (const design of designs) {
  test.describe(`Consultas del titular — ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('«Mi día» es ahora el perfil: la consulta propia se ve y se marca ahí, y nunca en el hijo', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      const own = await ownConsultationViaApi(page.context().request, owner.token, owner.accountId)

      await page.goto('/mi-dia')
      await expect(page).toHaveURL(/\/yo$/)
      const main = page.getByRole('main')
      await expect(main.getByRole('heading', { level: 1, name: 'Ana' })).toBeVisible()
      await expect(main.getByRole('navigation', { name: 'Secciones' }).getByRole('link')).toHaveText(['Consultas', 'Suplementos', 'Actividades'])

      const consultations = main.getByRole('region', { name: 'Consultas' })
      await expect(consultations.getByRole('link', { name: /Dr. Propio Paz/ })).toBeVisible()
      const today = main.getByRole('region', { name: 'Hoy' })
      const dose = today.getByRole('button', { name: /Marcar Losartán propio de las 00:00/ })
      await dose.click()
      await expect(dose).toHaveAttribute('aria-pressed', 'true')

      // The child's detail and its history never show it.
      await page.goto(`/children/${owner.childId}`)
      await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Mateo' })).toBeVisible()
      await expect(page.getByText('Dr. Propio Paz')).toHaveCount(0)

      // Its detail goes back to the profile and can be edited by the person.
      await page.goto(`/consultations/${own.id}`)
      await expect(page.getByRole('link', { name: '← Mi perfil' })).toHaveAttribute('href', '/yo')
      await expect(page.getByRole('link', { name: 'Editar consulta' })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    })

    test('compartir con un Tutor: la ve y marca, no la cambia; un Cuidador nunca; al apagar, deja de verla', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      const request = page.context().request
      const own = await ownConsultationViaApi(request, owner.token, owner.accountId)

      const tutor = await secondPerson(browser, design, { firstName: 'Luis' })
      await acceptViaApi(tutor.context.request, tutor.token, await inviteViaApi(request, owner.token, tutor.email, 'tutor'))
      const caregiver = await secondPerson(browser, design, { firstName: 'Rosa' })
      await acceptViaApi(caregiver.context.request, caregiver.token, await inviteViaApi(request, owner.token, caregiver.email, 'caregiver'))

      // Not shared yet: the Tutor gets the same answer as for something that doesn't exist.
      const asTutor = { Authorization: `Bearer ${tutor.token}` }
      expect((await tutor.context.request.get(`${API}/consultations/${own.id}`, { headers: asTutor })).status()).toBe(403)

      // The owner turns it on from the profile.
      await page.goto('/yo')
      const toggle = page.getByRole('switch', { name: 'Compartir mis consultas con los Tutores de mi familia' })
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-checked', 'true')

      // The Tutor finds «Consultas de Ana» on the home and marks a dose there, «por Luis»; nothing to edit.
      await tutor.page.goto('/home')
      await tutor.page.getByRole('link', { name: /Consultas de Ana/ }).first().click()
      await expect(tutor.page).toHaveURL(new RegExp(`/personas/${owner.accountId}$`))
      const dose = tutor.page.getByRole('region', { name: 'Hoy' }).getByRole('button', { name: /Marcar Losartán propio de las 00:00/ })
      await dose.click()
      await expect(dose).toHaveAttribute('aria-pressed', 'true')
      await tutor.page.goto(`/consultations/${own.id}`)
      await expect(tutor.page.getByRole('heading', { level: 1, name: 'Dr. Propio Paz' })).toBeVisible()
      await expect(tutor.page.getByRole('link', { name: 'Editar consulta' })).toHaveCount(0)
      await expect(tutor.page.getByRole('switch', { name: 'Tus avisos de esta consulta' })).toHaveAttribute('aria-checked', 'false')
      const marked = await queryDb<{ taken_by_account_id: string }>(
        `SELECT d.taken_by_account_id FROM doses d JOIN medications m ON m.id = d.medication_id WHERE m.consultation_id = $1 AND d.taken`,
        [own.id],
      )
      expect(marked.map((r) => r.taken_by_account_id)).toContain(tutor.accountId)

      // A Caregiver of the same family never sees it.
      const asCaregiver = { Authorization: `Bearer ${caregiver.token}` }
      expect((await caregiver.context.request.get(`${API}/consultations/${own.id}`, { headers: asCaregiver })).status()).toBe(403)
      await caregiver.page.goto('/home')
      await expect(caregiver.page.getByRole('link', { name: /Consultas de Ana/ })).toHaveCount(0)

      // Turned off: the Tutor's next request is refused and their mark stays.
      await page.goto('/yo')
      await page.getByRole('switch', { name: 'Compartir mis consultas con los Tutores de mi familia' }).click()
      await expect(page.getByRole('switch', { name: 'Compartir mis consultas con los Tutores de mi familia' })).toHaveAttribute('aria-checked', 'false')
      expect((await tutor.context.request.get(`${API}/consultations/${own.id}`, { headers: asTutor })).status()).toBe(403)
      await tutor.page.goto(`/personas/${owner.accountId}`)
      await expect(tutor.page.getByRole('alert')).toContainText('Ya no puedes ver estas consultas.')

      await tutor.context.close()
      await caregiver.context.close()
    })

    test('en el plan gratuito «Nueva consulta» abre el aviso del plan y el servidor no guarda nada', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false, plan: 'free' })
      await setAccountPlan(owner.accountId, 'free')

      await page.goto('/yo')
      await page.getByRole('main').getByRole('button', { name: 'Nueva consulta' }).click()
      await expect(page.getByRole('dialog')).toContainText('Tus propias consultas')

      const res = await page.context().request.post(`${API}/accounts/${owner.accountId}/consultations`, {
        headers: { Authorization: `Bearer ${owner.token}` },
        data: { doctorName: 'Dr. X', consultDate: today(), photoBase64: PNG_BASE64, medications: [{ name: 'Y', frequencyHours: 8, durationDays: 1, startTime: '08:00' }] },
      })
      expect(res.status()).toBe(422)
      expect((await res.json()).reason).toBe('own_consultations')
    })
  })
}
