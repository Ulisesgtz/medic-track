import { allowClerkOn, designs, expect, seedChild, test } from './helpers'

// specs/045-cobro-mercado-pago: the subscription from the plans screen, at 390 and 1280 px, against the API started with
// PAYMENTS_DRIVER=fake and a frontend built with VITE_PAYMENTS_FAKE=true (playwright.config.ts): the «payment page» is the
// fake provider's, which moves the same state Mercado Pago's notices would. Chromium only (it is not in CROSS_BROWSER_SPECS).

for (const design of designs) {
  test.describe(`Cobro del plan completo, ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('a free account pays on the provider\'s page, comes back to an active plan and can cancel the renewal', async ({ page }) => {
      await allowClerkOn(page)
      await seedChild(page, { withConsultation: false, plan: 'free' })
      await page.goto('/planes')

      const full = page.getByRole('article', { name: 'Plan completo' })
      await expect(full.getByText(/PediTrack no guarda tu tarjeta/)).toBeVisible()
      await expect(full.getByText('Pronto')).toHaveCount(0)
      await full.getByRole('button', { name: 'Contratar plan completo' }).click()

      // The provider's page (the fake's): the card would be typed here, never in PediTrack.
      await expect(page).toHaveURL(/\/planes\/pago-de-prueba\?sub=/)
      await page.getByRole('button', { name: 'Aprobar el pago' }).click()

      await expect(page).toHaveURL(/\/planes\/regreso$/)
      await expect(page.getByRole('heading', { name: 'Tu plan completo está activo' })).toBeVisible()
      await expect(page.getByText(/^Vigente hasta /).first()).toBeVisible()
      await page.getByRole('link', { name: 'Ir a Planes' }).click()

      await expect(page).toHaveURL(/\/planes$/)
      const plan = page.getByRole('article', { name: 'Plan completo' })
      await expect(plan.getByText('Tu plan actual')).toBeVisible()
      await expect(plan.getByText(/^Vigente hasta /)).toBeVisible()
      await expect(plan.getByRole('button', { name: 'Contratar plan completo' })).toHaveCount(0)

      // Canceling the renewal asks first, keeps the plan and says until when.
      await plan.getByRole('button', { name: 'Cancelar renovación' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('¿Cancelar la renovación?')).toBeVisible()
      await dialog.getByRole('button', { name: 'Cancelar renovación' }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(plan.getByText(/No se renovará; tu plan sigue hasta/)).toBeVisible()
      await expect(plan.getByText('Tu plan actual')).toBeVisible()
    })

    test('leaving the provider\'s page without paying charges nothing and changes nothing', async ({ page }) => {
      await allowClerkOn(page)
      await seedChild(page, { withConsultation: false, plan: 'free' })
      await page.goto('/planes')
      await page.getByRole('article', { name: 'Plan completo' }).getByRole('button', { name: 'Contratar plan completo' }).click()
      await expect(page).toHaveURL(/\/planes\/pago-de-prueba\?sub=/)
      await page.getByRole('button', { name: 'Cancelar' }).click()

      await expect(page).toHaveURL(/\/planes\/regreso$/)
      await expect(page.getByRole('heading', { name: 'No se realizó ningún cobro' })).toBeVisible()
      await page.getByRole('link', { name: 'Ir a Planes' }).click()
      const gratis = page.getByRole('article', { name: 'Gratis' })
      await expect(gratis.getByText('Tu plan actual')).toBeVisible()
      await expect(page.getByRole('article', { name: 'Plan completo' }).getByRole('button', { name: 'Contratar plan completo' })).toBeVisible()
    })
  })
}
