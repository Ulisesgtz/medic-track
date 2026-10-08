import type { Page } from '@playwright/test'
import {
  pickTime,
  acceptViaApi,
  allowClerkOn,
  appointmentViaApi,
  designs,
  expect,
  inviteViaApi,
  localDayAfter,
  queryDb,
  secondPerson,
  seedChild,
  setAccountPlan,
  test,
} from './helpers'

// specs/033-recordatorios-suplementos-citas, parte 2 (próxima cita): quickstart with real people, at 390 and 1280 px. The accounts,
// the invitation and the access are the real thing (Clerk dev instance and the backend); only the setup shortcuts (the plan, an
// appointment made in advance) go through the API or the database.

const API = 'http://localhost:8080'

/** Nothing sticks out sideways: a phone page must never scroll horizontally. */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0)
}

for (const design of designs) {
  test.describe(`Próxima cita, ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('a Tutor adds the appointment to a saved consultation, edits its notices, marks it, undoes it and cancels it', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page)
      await page.goto(`/consultations/${owner.consultationId}`)
      const main = page.getByRole('main')

      // The consultation has none yet: the way to add it is right there.
      await main.getByRole('link', { name: 'Agregar próxima cita' }).click()
      await expect(page.getByRole('heading', { name: 'Agregar próxima cita', level: 1 })).toBeVisible()
      await expect(page.getByLabel('Nota', { exact: false })).toHaveAttribute('placeholder', /.+/)
      await expect(page.getByRole('button', { name: 'Cambiar aviso «1 día antes»' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Cambiar aviso «2 horas antes»' })).toBeVisible()
      await expectNoHorizontalScroll(page)

      // The date and the hour are asked together; a date before the consultation is refused in words.
      await page.getByLabel('Fecha de la cita').fill(localDayAfter(5))
      await page.getByRole('button', { name: 'Guardar cita' }).click()
      await expect(page.getByText('Escribe la hora de la cita.')).toBeVisible()
      await pickTime(page, 'Hora de la cita', '10:30')
      await page.getByLabel('Nota', { exact: false }).fill('Llevar la cartilla')
      await page.getByRole('button', { name: 'Guardar cita' }).click()

      // Back on the consultation: the card says what was typed, with the notices.
      await expect(page).toHaveURL(/\/consultations\//)
      const card = page.getByRole('region', { name: 'Próxima cita' })
      await expect(card.getByText('10:30', { exact: true })).toBeVisible()
      await expect(card.getByText('Llevar la cartilla')).toBeVisible()
      await expect(card.getByText('1 día antes')).toBeVisible()
      await expect(card.getByText('2 horas antes')).toBeVisible()
      await expect(card.getByRole('switch', { name: 'Tus avisos de esta cita' })).toHaveAttribute('aria-checked', 'true')
      await expectNoHorizontalScroll(page)

      // Editing: remove one notice; the family sees the change.
      await card.getByRole('link', { name: 'Editar' }).click()
      await expect(page.getByRole('heading', { name: 'Editar cita', level: 1 })).toBeVisible()
      await expect(page.getByText('Los cambios los ve toda la familia y los avisos se vuelven a programar.')).toBeVisible()
      await page.getByRole('button', { name: 'Quitar aviso «1 día antes»' }).click()
      await page.getByRole('button', { name: 'Guardar cambios' }).click()
      await expect(page).toHaveURL(new RegExp(`/children/${owner.childId}$`))
      const childCard = page.getByRole('region', { name: 'Próxima cita' })
      await expect(childCard.getByText('2 horas antes')).toBeVisible()
      await expect(childCard.getByText('1 día antes')).toHaveCount(0)
      const notices = await queryDb<{ n: string }>(
        'SELECT count(*)::text AS n FROM appointment_notices n JOIN consultation_appointments a ON a.id = n.appointment_id WHERE a.consultation_id = $1',
        [owner.consultationId],
      )
      expect(notices[0].n).toBe('1')

      // Marking it done is one tap and can be undone; it goes to the history and the card says there is none next.
      await childCard.getByRole('button', { name: 'Marcar realizada' }).click()
      await expect(page.getByText(/quedó como realizada/)).toBeVisible()
      await page.getByRole('button', { name: 'Deshacer' }).click()
      await expect(page.getByRole('region', { name: 'Próxima cita' }).getByRole('button', { name: 'Marcar realizada' })).toBeVisible()

      // Cancelling asks first, in neutral words; «Volver» keeps it.
      await page.getByRole('button', { name: 'Cancelar cita' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Los avisos de esta cita ya no llegan a nadie de la familia.')).toBeVisible()
      await dialog.getByRole('button', { name: 'Volver' }).click()
      await expect(dialog).toHaveCount(0)
      await page.getByRole('button', { name: 'Cancelar cita' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Cancelar cita' }).click()
      await expect(page.getByRole('region', { name: 'Próxima cita' }).getByRole('button', { name: 'Marcar realizada' })).toHaveCount(0)

      // The history keeps it as «Cancelada», with who did it, and nothing is deleted.
      await page.goto(`/children/${owner.childId}/citas`)
      await expect(page.getByRole('heading', { name: 'Historial de citas', level: 1 })).toBeVisible()
      await expect(page.getByText('Cancelada', { exact: true })).toBeVisible()
      await expect(page.getByText(/cancelada el .* por Ana/)).toBeVisible()
      await expectNoHorizontalScroll(page)
      const rows = await queryDb<{ status: string }>('SELECT status FROM consultation_appointments WHERE consultation_id = $1', [owner.consultationId])
      expect(rows.map((r) => r.status)).toEqual(['canceled'])
    })

    test('«Nueva consulta» saves the appointment with the consultation when the date and hour are typed', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      await page.goto(`/children/${owner.childId}/consultations/new`)
      await expect(page.getByRole('heading', { level: 1, name: 'Nueva consulta' })).toBeVisible()
      await expect(page.getByRole('heading', { name: /Próxima cita/ })).toContainText('(opcional)')

      await page.getByLabel('Doctor').fill('Dra. Laura Cázares')
      const d = new Date()
      await page.getByLabel('Fecha', { exact: true }).fill(localDayAfter(0, d))
      await page.getByLabel('Foto de la receta').setInputFiles({ name: 'receta.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake-prescription-photo') })
      await page.locator('#medications\\.0\\.name').fill('Amoxicilina')
      await page.locator('#medications\\.0\\.frequencyHours').fill('c/8 h')
      await page.locator('#medications\\.0\\.durationDays').fill('7 días')
      await page.locator('#medications\\.0\\.startTime').fill('08:00')
      await page.getByLabel('Fecha de la cita').fill(localDayAfter(14, d))
      await pickTime(page, 'Hora de la cita', '16:00')
      await page.getByRole('button', { name: 'Guardar consulta' }).click()

      await expect(page).toHaveURL(/\/consultations\/(?!new)/)
      const card = page.getByRole('region', { name: 'Próxima cita' })
      await expect(card.getByText('16:00', { exact: true })).toBeVisible()
      await expect(card.getByText('1 día antes')).toBeVisible()
      await expect(card.getByText('2 horas antes')).toBeVisible()
      const rows = await queryDb<{ n: string }>('SELECT count(*)::text AS n FROM consultation_appointments WHERE child_id = $1', [owner.childId])
      expect(rows[0].n).toBe('1')
    })

    test('a Caregiver sees the appointment and chooses their own reminders, and cannot edit, mark or cancel it', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page)
      const appointment = await appointmentViaApi(page.context().request, owner.token, owner.consultationId as string)
      const guest = await secondPerson(browser, design)
      await acceptViaApi(guest.context.request, guest.token, await inviteViaApi(page.context().request, owner.token, guest.email, 'caregiver'))

      await guest.page.goto(`/children/${owner.childId}`)
      const card = guest.page.getByRole('region', { name: 'Próxima cita' })
      await expect(card.getByText('Un Tutor puede editar, marcar o cancelar esta cita.')).toBeVisible()
      await expect(card.getByRole('link', { name: 'Editar' })).toHaveCount(0)
      await expect(card.getByRole('button', { name: 'Marcar realizada' })).toHaveCount(0)
      await expect(card.getByRole('button', { name: 'Cancelar cita' })).toHaveCount(0)
      await expectNoHorizontalScroll(guest.page)

      // Their own reminders are theirs alone.
      const toggle = card.getByRole('switch', { name: 'Tus avisos de esta cita' })
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-checked', 'false')
      const muted = await queryDb<{ account_id: string }>('SELECT account_id FROM appointment_muted WHERE appointment_id = $1', [appointment.id])
      expect(muted.map((r) => r.account_id)).toEqual([guest.accountId])
      await page.goto(`/children/${owner.childId}`)
      await expect(page.getByRole('region', { name: 'Próxima cita' }).getByRole('switch', { name: 'Tus avisos de esta cita' })).toHaveAttribute('aria-checked', 'true')

      // Even calling the API directly, the Caregiver cannot change it.
      const headers = { Authorization: `Bearer ${guest.token}` }
      const edit = await guest.context.request.patch(`${API}/appointments/${appointment.id}`, { headers, data: { note: 'otra' } })
      expect(edit.status()).toBe(403)
      const mark = await guest.context.request.post(`${API}/appointments/${appointment.id}/status`, { headers, data: { status: 'done' } })
      expect(mark.status()).toBe(403)
      await guest.context.close()
    })

    test('on the free plan the field says it is the full plan, and an appointment that already exists keeps showing and can be marked', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page)
      const appointment = await appointmentViaApi(page.context().request, owner.token, owner.consultationId as string)
      await setAccountPlan(owner.accountId, 'free')

      await page.goto(`/children/${owner.childId}`)
      const card = page.getByRole('region', { name: 'Próxima cita' })
      await expect(card.getByText('10:30', { exact: true })).toBeVisible()
      // Editing is the full plan's; marking is not.
      await expect(card.getByRole('link', { name: 'Editar' })).toHaveCount(0)
      await card.getByRole('button', { name: 'Marcar realizada' }).click()
      await expect(page.getByText(/quedó como realizada/)).toBeVisible()
      const rows = await queryDb<{ status: string }>('SELECT status FROM consultation_appointments WHERE id = $1', [appointment.id])
      expect(rows[0].status).toBe('done')

      // A new consultation shows the field disabled, with the link to the plan.
      await page.goto(`/children/${owner.childId}/consultations/new`)
      await expect(page.getByText('Disponible en el plan completo').first()).toBeVisible()
      await expect(page.getByLabel('Fecha de la cita')).toHaveCount(0)

      // The server decides the plan: creating one is refused whatever the screen shows.
      const created = await page.context().request.post(`${API}/consultations/${owner.consultationId}/appointments`, {
        headers: { Authorization: `Bearer ${owner.token}` },
        data: { startsAt: new Date(Date.now() + 10 * 86_400_000).toISOString(), utcOffsetMinutes: 0, note: '', notices: [] },
      })
      expect(created.status()).toBe(422)
      expect((await created.json()).reason).toBe('appointments')
    })
  })
}
