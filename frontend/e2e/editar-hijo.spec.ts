import { acceptViaApi, allowClerkOn, apiPost, designs, expect, inviteViaApi, secondPerson, seedChild, test } from './helpers'

// specs/064-editar-datos-hijo: correcting a child's own data, with real people (Clerk dev instance and the backend), at 390 and
// 1280 px. The child of seedChild is Mateo Morales, born on 2021-03-14, without height nor weight; the owner is Ana.

const API = 'http://localhost:8080'

for (const design of designs) {
  test.describe(`Editar datos del hijo, ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('the owner corrects the weight with the box and sees it in the child and in Crecimiento', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false, plan: 'free' })

      await page.goto(`/children/${owner.childId}`)
      await page.getByRole('navigation', { name: 'Lo demás' }).getByRole('link', { name: /Editar datos/ }).click()
      await expect(page.getByRole('heading', { name: 'Editar datos', level: 1 })).toBeVisible()
      await expect(page.getByLabel('Nombre')).toBeDisabled()

      await page.getByLabel(/Peso \(kg\)/).fill('18,4')
      await page.getByLabel(/Talla \(cm\)/).fill('110')
      await page.getByLabel('Anotarlo también como medida de hoy').check()
      await page.getByRole('button', { name: 'Guardar cambios' }).click()

      const more = page.getByRole('navigation', { name: 'Lo demás' })
      await expect(more.getByText(/Corregido el .* por Ana/)).toBeVisible()
      await page.goto(`/children/${owner.childId}/crecimiento`)
      await expect(page.getByText('18.4 kg · 110 cm').first()).toBeVisible()
    })

    test('the paid owner corrects the name and the birth date; a date after a measurement is refused with its date', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      await apiPost(page.context().request, owner.token, `/children/${owner.childId}/growth-measurements`, { measuredOn: '2021-06-01', weightKg: 6.2, heightCm: null, note: '' })

      await page.goto(`/children/${owner.childId}/editar`)
      await page.getByLabel('Nombre').fill('Mateo José')
      await page.getByLabel('Fecha de nacimiento').fill('2021-07-01')
      await page.getByRole('button', { name: 'Guardar cambios' }).click()
      await expect(page.getByText(/Hay 1 medida \(.+2021\) anotada antes de esa fecha/)).toBeVisible()

      await page.getByLabel('Fecha de nacimiento').fill('2021-03-10')
      await page.getByRole('button', { name: 'Guardar cambios' }).click()
      await expect(page.getByRole('heading', { name: /Mateo José/ }).first()).toBeVisible()
    })

    test('on the free plan the identity is locked, the plan notice opens, and the API refuses it', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false, plan: 'free' })
      await page.goto(`/children/${owner.childId}/editar`)
      await expect(page.getByLabel('Fecha de nacimiento')).toBeDisabled()
      await page.getByRole('button', { name: /Plan completo/ }).click()
      await expect(page.getByRole('dialog').getByText('Corregir el nombre y la fecha de nacimiento').first()).toBeVisible()

      const refused = await page.context().request.put(`${API}/children/${owner.childId}`, {
        headers: { Authorization: `Bearer ${owner.token}` },
        data: { firstName: 'Otro', lastName: 'Morales', birthDate: '2021-03-14', height: null, weight: null },
      })
      expect(refused.status()).toBe(422)
      expect(await refused.json()).toEqual(expect.objectContaining({ reason: 'child_identity' }))
    })

    test('a Caregiver has no «Editar datos» and the API refuses her', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      const guest = await secondPerson(browser, design)
      await acceptViaApi(guest.context.request, guest.token, await inviteViaApi(page.context().request, owner.token, guest.email, 'caregiver'))

      await guest.page.goto(`/children/${owner.childId}`)
      await expect(guest.page.getByRole('navigation', { name: 'Lo demás' })).toBeVisible()
      await expect(guest.page.getByRole('link', { name: /Editar datos/ })).toHaveCount(0)
      const refused = await guest.context.request.put(`${API}/children/${owner.childId}`, {
        headers: { Authorization: `Bearer ${guest.token}` },
        data: { firstName: 'Mateo', lastName: 'Morales', birthDate: '2021-03-14', height: 100, weight: null },
      })
      expect(refused.status()).toBe(403)
    })
  })
}
