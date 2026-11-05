import { activityViaApi, allowClerkOn, designs, expect, personalActivityViaApi, queryDb, routineViaApi, seedChild, test } from './helpers'

// specs/060: a supplement or an activity captured by mistake is deleted from its detail while none of its doses is marked; with a
// mark there is no button and the server refuses. Real people (Clerk dev instance and the backend), at 390 and 1280 px.

const API = 'http://localhost:8080'

for (const design of designs) {
  test.describe(`Eliminar suplementos y actividades, ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('a Tutor deletes a supplement with no marks and it is gone from the child', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      const routine = await routineViaApi(page.context().request, owner.token, owner.childId, { name: 'Zinc por error' })

      await page.goto(`/suplementos/${routine.id}`)
      await expect(page.getByRole('heading', { name: 'Zinc por error', level: 1 })).toBeVisible()
      await page.getByRole('button', { name: 'Eliminar suplemento' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByRole('heading', { name: '¿Eliminar Zinc por error?' })).toBeVisible()
      await expect(dialog.getByText(/No se puede deshacer/)).toBeVisible()
      await dialog.getByRole('button', { name: 'Eliminar', exact: true }).click()

      await expect(page).toHaveURL(new RegExp(`/children/${owner.childId}$`))
      await expect(page.getByRole('main').getByText('Zinc por error')).toHaveCount(0)
      expect(await queryDb('SELECT id FROM supplement_routines WHERE id = $1', [routine.id])).toEqual([])
    })

    test('with a marked dose there is no button and the server refuses', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      const request = page.context().request
      const activity = await activityViaApi(request, owner.token, owner.childId, { name: 'Tomar agua' })
      const headers = { Authorization: `Bearer ${owner.token}` }
      const marked = await request.patch(`${API}/routines/${activity.id}/doses/${activity.doses[0].id}`, { headers, data: { taken: true } })
      expect(marked.ok()).toBeTruthy()

      await page.goto(`/actividades/${activity.id}`)
      await expect(page.getByRole('heading', { name: 'Tomar agua', level: 1 })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Finalizar actividad' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Eliminar actividad' })).toHaveCount(0)

      const refused = await request.delete(`${API}/routines/${activity.id}`, { headers })
      expect(refused.status()).toBe(409)
      expect((await refused.json()).error).toBe('routine_has_marks')
    })

    test('the person deletes their own activity and goes back to their profile', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      const activity = await personalActivityViaApi(page.context().request, owner.token, owner.accountId, { name: 'Estirar por error' })

      await page.goto(`/actividades/${activity.id}`)
      await page.getByRole('button', { name: 'Eliminar actividad' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('La actividad, todos sus horarios y sus avisos.')).toBeVisible()
      await dialog.getByRole('button', { name: 'Eliminar', exact: true }).click()

      await expect(page).toHaveURL(/\/yo#actividades$/)
      await expect(page.getByRole('main').getByText('Estirar por error')).toHaveCount(0)
    })
  })
}
