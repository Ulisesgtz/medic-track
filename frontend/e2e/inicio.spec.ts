import { acceptViaApi, activityViaApi, allowClerkOn, designs, expect, inviteViaApi, routineViaApi, secondPerson, seedAccount, seedChild, test } from './helpers'

// specs/055 (rediseño del inicio): the home with the design of Claude Design, at 390 and 1280 px. The setup goes through the API;
// what the person sees and does is the real thing. Doses depend on the hour the test runs, so the assertions say only what is
// true at any hour (a dose of the 8-hourly medicine is always open: the last one of the day stays «por marcar» until midnight).

for (const design of designs) {
  test.describe(`Inicio, ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('each child shows its day — medicines, supplements, activities — and «Marcar» marks the next dose without leaving', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page)
      const request = page.context().request
      // The supplement at 23:55: the medicine's open dose is always earlier, so «Próxima» is the medicine's at any hour.
      await routineViaApi(request, owner.token, owner.childId, { times: ['23:55'] })
      await activityViaApi(request, owner.token, owner.childId)

      await page.goto('/home')
      const main = page.getByRole('main')
      const card = main.locator('article').filter({ has: page.getByRole('link', { name: 'Ver detalle de Mateo' }) })
      await expect(card.getByText('Medicamentos')).toBeVisible()
      await expect(card.getByText(/^3 tomas hoy · /)).toBeVisible()
      await expect(card.getByText('Suplementos')).toBeVisible()
      await expect(card.getByText(/^\d de 1$/)).toBeVisible()
      await expect(card.getByText('Actividades')).toBeVisible()
      await expect(card.getByText(/^\d+ de \d+ hechas$/)).toBeVisible()
      await expect(main.getByText(/consultas?$/)).toHaveCount(0)

      const mark = card.getByRole('button', { name: /^Marcar .* de Mateo$/ })
      const name = await mark.getAttribute('aria-label')
      await mark.click()
      await expect(card.getByRole('button', { name: name!, pressed: true })).toHaveText(/^✓ \d\d:\d\d$/)
      await expect(page).toHaveURL(/\/home$/)

      // The mark is the same as from the detail: it carries who made it.
      const detail = await request.get(`http://localhost:8080/consultations/${owner.consultationId}`, {
        headers: { Authorization: `Bearer ${owner.token}` },
      })
      const doses: { takenBy?: { name: string } | null }[] = (await detail.json()).medications[0].doses
      expect(doses.filter((d) => d.takenBy?.name === 'Ana')).toHaveLength(1)
    })

    test('a child with nothing today says so', async ({ page }) => {
      await allowClerkOn(page)
      await seedChild(page, { withConsultation: false })
      await page.goto('/home')
      await expect(page.getByRole('main').getByText('Hoy no hay tomas ni actividades')).toBeVisible()
    })

    test('a new account offers its first child as the only solid button', async ({ page }) => {
      await allowClerkOn(page)
      await seedAccount(page, [])
      await page.goto('/home')
      const main = page.getByRole('main')
      await expect(main.getByText('Aún no registras a tus hijos')).toBeVisible()
      await main.getByRole('button', { name: 'Agregar hijo', exact: true }).click()
      await expect(page.getByRole('dialog', { name: 'Agregar hijo' })).toBeVisible()
    })

    test('the free plan with its child: «+ Agregar hijo» says the plan includes one', async ({ page }) => {
      await allowClerkOn(page)
      await seedChild(page, { withConsultation: false, plan: 'free' })
      await page.goto('/home')
      await expect(page.getByRole('main').getByRole('button', { name: /Agregar hijo/ })).toContainText('Tu plan incluye un hijo')
    })

    test('a Caregiver sees «Hijos compartidos contigo», cannot add a child and marks like the owner', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page)
      const guest = await secondPerson(browser, design)
      const invitation = await inviteViaApi(page.context().request, owner.token, guest.email, 'caregiver')
      await acceptViaApi(guest.context.request, guest.token, invitation)

      await guest.page.goto('/home')
      const main = guest.page.getByRole('main')
      await expect(main.getByRole('heading', { name: 'Hijos compartidos contigo' })).toBeVisible()
      await expect(main.getByText('Familia de Ana · puedes ver y marcar')).toBeVisible()
      await expect(guest.page.getByRole('button', { name: /Agregar hijo/ })).toHaveCount(0)
      const mark = main.getByRole('button', { name: /^Marcar .* de Mateo$/ })
      const name = await mark.getAttribute('aria-label')
      await mark.click()
      await expect(main.getByRole('button', { name: name!, pressed: true })).toBeVisible()
      await guest.context.close()
    })
  })
}
