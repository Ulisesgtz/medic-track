import { test, expect, seedChild, designs, allowClerkOn, personalRoutineViaApi, personalActivityViaApi } from './helpers'

// specs/056 (design «Detalle y Mi día PediTrack.dc.html», screen B): «Mi día», the person's own page — «Hoy» first, then the
// index Suplementos · Actividades and both lists. The old addresses land on their section. Requires the backend.

for (const design of designs) {
  test.describe(`Mi día — ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('«Ver todo» lleva a «Mi día»: se marca desde «Hoy» y el índice salta a cada lista', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      const request = page.context().request
      await personalRoutineViaApi(request, owner.token, owner.accountId)
      await personalActivityViaApi(request, owner.token, owner.accountId)

      await page.goto('/home')
      await page.getByRole('region', { name: 'Tu día' }).getByRole('link', { name: 'Ver todo' }).click()
      await expect(page).toHaveURL(/\/mi-dia$/)
      const main = page.getByRole('main')
      await expect(main.getByRole('heading', { level: 1, name: 'Mi día' })).toBeVisible()

      const today = main.getByRole('region', { name: 'Hoy' })
      const dose = today.getByRole('button', { name: 'Marcar Omega 3 de las 08:00' })
      await dose.click()
      await expect(dose).toHaveAttribute('aria-pressed', 'true')
      await expect(today.getByRole('button', { name: 'Realizado: Pararse a estirar' })).toBeVisible()

      const index = main.getByRole('navigation', { name: 'Secciones' })
      await expect(index.getByRole('link')).toHaveText(['Suplementos', 'Actividades'])
      await index.getByRole('link', { name: 'Actividades' }).click()
      await expect(main.getByRole('region', { name: 'Mis actividades' })).toBeInViewport()
      await expect(main.getByRole('region', { name: 'Mis actividades' }).getByRole('link').filter({ hasText: 'Pararse a estirar' })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    })

    test('las direcciones viejas llevan a su lista dentro de «Mi día»', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      await personalActivityViaApi(page.context().request, owner.token, owner.accountId)

      await page.goto('/mis-actividades')
      await expect(page).toHaveURL(/\/mi-dia#actividades$/)
      await expect(page.getByRole('main').getByRole('region', { name: 'Mis actividades' })).toBeInViewport()
    })

    if (design.isWeb)
      test('en la web, «Resumen del día» va a la derecha y la barra lateral tiene una sola entrada personal', async ({ page }) => {
        await allowClerkOn(page)
        const owner = await seedChild(page, { withConsultation: false })
        await personalRoutineViaApi(page.context().request, owner.token, owner.accountId)

        await page.goto('/mi-dia')
        await expect(page.getByRole('region', { name: 'Resumen del día' })).toBeVisible()
        const personal = page.getByRole('navigation', { name: 'Personal' })
        await expect(personal.getByRole('link')).toHaveText(['Mi día'])
        await expect(personal.getByRole('link', { name: 'Mi día' })).toHaveAttribute('aria-current', 'page')
      })
  })
}
