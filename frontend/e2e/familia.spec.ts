import type { Page } from '@playwright/test'
import {
  acceptViaApi,
  allowClerkOn,
  designs,
  expect,
  inviteViaApi,
  invitationUrl,
  secondPerson,
  seedChild,
  setAccountPlan,
  test,
  uniqueEmail,
} from './helpers'

// specs/032-compartir-con-familia, Entrega 1 (Tutores): quickstart §1–§5 with two real people, each in their own browser,
// at 390 and 1280 px. The invited person's account, the invitation and the access are the real thing (Clerk dev instance and
// the backend); only the shortcuts of the setup go through the API.

const API = 'http://localhost:8080'

/** Nothing sticks out sideways: a phone page must never scroll horizontally. */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0)
}

for (const design of designs) {
  test.describe(`Familia, ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('invites a Tutor, who opens the link, gives their name, accepts and sees the child with everything a Tutor can do', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page)
      const guest = await secondPerson(browser, design, { account: false })

      // The owner invites from «Familia» and copies the one-time link.
      await page.goto('/familia')
      const main = page.getByRole('main')
      await expect(main.getByText('1 de 4 personas')).toBeVisible()
      await main.getByLabel('Correo de la persona').fill(guest.email)
      await main.getByRole('button', { name: 'Crear invitación' }).click()
      const link = await main.getByLabel('Liga de la invitación').inputValue()
      expect(link).toContain('/familia/invitacion#')
      await expect(main.getByText('2 de 4 personas (contando invitaciones pendientes)')).toBeVisible()
      await expect(main.getByText('Pendiente', { exact: true })).toBeVisible()
      await expectNoHorizontalScroll(page)

      // The guest has no PediTrack account yet: the invitation asks only for their name.
      await guest.page.goto(link)
      await guest.page.getByLabel('Nombre').fill('Luis')
      await guest.page.getByLabel('Apellido').fill('Pérez')
      await guest.page.getByRole('button', { name: 'Continuar' }).click()
      await expect(guest.page.getByRole('heading', { name: 'Ana te invita a su familia' })).toBeVisible()
      await expect(guest.page.getByText(/datos médicos de los hijos de Ana/)).toBeVisible()
      await expectNoHorizontalScroll(guest.page)
      await guest.page.getByRole('button', { name: 'Aceptar' }).click()

      // Back home with the shared child, and the Tutor can add a consultation.
      await expect(guest.page).toHaveURL(/\/home/)
      await expect(guest.page.getByRole('main').getByText('Mateo Morales')).toBeVisible()
      await guest.page.goto(`/children/${owner.childId}`)
      await expect(guest.page.getByText('Dra. Laura Cázares')).toBeVisible()
      await expect(guest.page.getByRole('link', { name: design.isWeb ? 'Nueva consulta' : '+ Nueva' })).toBeVisible()

      // The owner's list now has the person and no way to remove a Tutor.
      await page.reload()
      await expect(page.getByRole('main').getByText('Tutor · desde el')).toBeVisible()
      await expect(page.getByRole('main').getByRole('button', { name: /Quitar a/ })).toHaveCount(0)
      await guest.context.close()
    })

    test('an invitation is for one e-mail only: another account is told so and cannot accept it', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page)
      const invitation = await inviteViaApi(page.context().request, owner.token, uniqueEmail('invitada'))
      const stranger = await secondPerson(browser, design)

      await stranger.page.goto(invitationUrl(invitation))
      await expect(stranger.page.getByText(/Entraste con otro correo/)).toBeVisible()
      await expect(stranger.page.getByRole('button', { name: 'Aceptar' })).toHaveCount(0)
      await expectNoHorizontalScroll(stranger.page)

      // Even calling the API directly: the verified e-mail is not the invited one.
      const res = await stranger.context.request.post(`${API}/family/invitations/accept`, {
        data: { token: invitation.token },
        headers: { Authorization: `Bearer ${stranger.token}` },
      })
      expect(res.status()).toBe(403)
      expect((await res.json()).error).toBe('email_mismatch')
      await stranger.context.close()
    })

    test('a link that was used no longer works', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page)
      const guest = await secondPerson(browser, design)
      const invitation = await inviteViaApi(page.context().request, owner.token, guest.email)
      await acceptViaApi(guest.context.request, guest.token, invitation)

      await guest.page.goto(invitationUrl(invitation))
      await expect(guest.page.getByRole('heading', { name: 'Esta liga ya no sirve' })).toBeVisible()
      await guest.context.close()
    })

    test('a dose marked by one is seen «por …» by the other, and a Tutor takes the mark back', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page)
      const guest = await secondPerson(browser, design, { firstName: 'Luis' })
      await acceptViaApi(guest.context.request, guest.token, await inviteViaApi(page.context().request, owner.token, guest.email))

      // The invited Tutor marks the 08:00 dose.
      await guest.page.goto(`/consultations/${owner.consultationId}`)
      const guestChip = guest.page.getByRole('button', { name: 'Toma de 08:00', exact: true })
      await guestChip.click()
      await expect(guestChip).toHaveAttribute('aria-pressed', 'true')
      await expect(guestChip).toContainText(/por Luis, \d{2}:\d{2}/)

      // The owner sees it marked, and by whom.
      await page.goto(`/consultations/${owner.consultationId}`)
      const ownerChip = page.getByRole('button', { name: 'Toma de 08:00', exact: true })
      await expect(ownerChip).toHaveAttribute('aria-pressed', 'true')
      await expect(ownerChip).toContainText('por Luis')

      // Who can do everything takes the mark back: it is simply unmarked again.
      await ownerChip.click()
      await expect(ownerChip).toHaveAttribute('aria-pressed', 'false')
      await expect(ownerChip).not.toContainText('por Luis')
      await guest.context.close()
    })

    test('the invited person leaves and loses everything at once; the family has its place free again', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page)
      const guest = await secondPerson(browser, design)
      await acceptViaApi(guest.context.request, guest.token, await inviteViaApi(page.context().request, owner.token, guest.email))

      await guest.page.goto('/familia')
      const main = guest.page.getByRole('main')
      await expect(main.getByText('Tu lugar en esta familia')).toBeVisible()
      await main.getByRole('button', { name: 'Salir de esta familia' }).click()
      const dialog = guest.page.getByRole('dialog', { name: '¿Salir de esta familia?' })
      await expect(dialog).toContainText('No te llevas una copia')
      await dialog.getByRole('button', { name: 'Salir de la familia' }).click()

      await expect(guest.page).toHaveURL(/\/home/)
      await expect(guest.page.getByText(/todavía no tienes hijos/i)).toBeVisible()
      const gone = await guest.context.request.get(`${API}/children/${owner.childId}/consultations`, { headers: { Authorization: `Bearer ${guest.token}` } })
      expect(gone.status()).toBe(403)

      // The owner's family has nobody else, and nobody can bring the person back without inviting them again.
      await page.goto('/familia')
      await expect(page.getByRole('main').getByText('1 de 4 personas')).toBeVisible()
      await guest.context.close()
    })

    test('the family has at most four people, counting the invitations waiting', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page)
      for (const name of ['uno', 'dos', 'tres']) await inviteViaApi(page.context().request, owner.token, uniqueEmail(name), 'caregiver')

      await page.goto('/familia')
      const main = page.getByRole('main')
      await expect(main.getByText('4 de 4 personas (contando invitaciones pendientes)')).toBeVisible()
      await expect(main.getByRole('button', { name: 'Crear invitación' })).toBeDisabled()
      await expect(main.getByText(/máximo de personas/)).toBeVisible()
      await expectNoHorizontalScroll(page)
    })

    test('the free plan sees the plan notice in «Familia» instead of the invitation form', async ({ page }) => {
      await allowClerkOn(page)
      await seedChild(page, { plan: 'free', withConsultation: false })

      await page.goto('/familia')
      const main = page.getByRole('main')
      await expect(main.getByRole('heading', { name: 'Comparte con tu familia' })).toBeVisible()
      await expect(main.getByLabel('Correo de la persona')).toHaveCount(0)
      await main.getByRole('button', { name: 'Ver el plan completo' }).click()
      await expect(page.getByRole('dialog', { name: 'Compartir con tu familia' })).toBeVisible()
      await expectNoHorizontalScroll(page)
    })

    test('when the owner stops paying the invited Tutor still sees and marks, adds nothing, and gets the role back when the plan returns', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page)
      const guest = await secondPerson(browser, design)
      await acceptViaApi(guest.context.request, guest.token, await inviteViaApi(page.context().request, owner.token, guest.email))
      const newConsultation = guest.page.getByRole('link', { name: design.isWeb ? 'Nueva consulta' : '+ Nueva' })

      await guest.page.goto(`/children/${owner.childId}`)
      await expect(newConsultation).toBeVisible()

      await setAccountPlan(owner.accountId, 'free')
      await guest.page.reload()
      await expect(guest.page.getByText('Dra. Laura Cázares')).toBeVisible()
      await expect(newConsultation).toHaveCount(0)
      await guest.page.goto('/familia')
      await expect(guest.page.getByText(/ya no es de pago/)).toBeVisible()

      // Marking is for safety: it keeps working.
      await guest.page.goto(`/consultations/${owner.consultationId}`)
      const chip = guest.page.getByRole('button', { name: 'Toma de 08:00', exact: true })
      await chip.click()
      await expect(chip).toHaveAttribute('aria-pressed', 'true')

      await setAccountPlan(owner.accountId, 'paid')
      await guest.page.goto(`/children/${owner.childId}`)
      await expect(newConsultation).toBeVisible()
      await guest.context.close()
    })
  })
}
