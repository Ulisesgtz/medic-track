import type { Page } from '@playwright/test'
import { acceptViaApi, allowClerkOn, designs, expect, inviteViaApi, secondPerson, seedChild, setAccountPlan, test } from './helpers'

// specs/034-planes-y-modales: the plans screen (/planes), its «Pronto» button, the plan each person is on and the compact notice
// the screens show, at 390 and 1280 px. The accounts, the invitation and the access are the real thing (Clerk dev instance and
// the backend); only the plan is given through the database, as it is by hand today.

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0)
}

for (const design of designs) {
  test.describe(`Planes, ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('a free account sees both plans, its own marked, the price and the «Pronto» button; what is kept and what is coming', async ({ page }) => {
      await allowClerkOn(page)
      await seedChild(page, { withConsultation: false, plan: 'free' })
      await page.goto('/planes')

      await expect(page.getByRole('heading', { name: 'Planes', level: 1 })).toBeVisible()
      await expect(page.getByText('Un plan gratuito y un plan completo anual. Una suscripción cubre a toda la familia.')).toBeVisible()
      const free = page.getByRole('article', { name: 'Gratis' })
      const full = page.getByRole('article', { name: 'Plan completo' })
      await expect(free.getByText('MX$0')).toBeVisible()
      await expect(free.getByText('Tu plan actual')).toBeVisible()
      await expect(free.getByText('1 hijo.')).toBeVisible()
      await expect(full.getByText('MX$499')).toBeVisible()
      await expect(full.getByText('al año')).toBeVisible()
      await expect(full.getByText('Todo lo de Gratis, más:')).toBeVisible()
      await expect(full.getByText('Hasta 10 hijos.')).toBeVisible()
      await expect(full.getByText('Tu plan actual')).toHaveCount(0)
      const pronto = full.getByRole('button', { name: /Contratar plan completo/ })
      await expect(pronto).toHaveAttribute('aria-disabled', 'true')
      await expect(pronto).toContainText('Pronto')
      await expect(full.getByText('El pago con tarjeta todavía no está disponible. Mientras tanto, tu plan sigue igual.')).toBeVisible()

      await expect(page.getByRole('heading', { name: 'Lo registrado se conserva' })).toBeVisible()
      await expect(page.getByText('Tus datos de salud no se venden ni se usan para anuncios.')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Próximamente' })).toBeVisible()
      await expect(page.getByText('Exportar el historial a PDF para el pediatra.')).toBeVisible()

      // The order of the two designs: the web has Gratis first (inside the sidebar), the phone has the full plan first.
      const order = await page.getByRole('article').evaluateAll((els) => els.map((e) => e.getAttribute('aria-labelledby')))
      expect(order).toEqual(design.isWeb ? ['plan-free', 'plan-full'] : ['plan-full', 'plan-free'])
      if (design.isWeb) await expect(page.getByRole('link', { name: 'Planes' })).toHaveAttribute('aria-current', 'page')
      await expectNoHorizontalScroll(page)
    })

    test('a paid account has the full plan as its own and nothing to buy', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false, plan: 'free' })
      await setAccountPlan(owner.accountId, 'paid')
      await page.goto('/planes')

      const full = page.getByRole('article', { name: 'Plan completo' })
      await expect(full.getByText('Tu plan actual')).toBeVisible()
      await expect(full.getByRole('button')).toHaveCount(0)
      await expect(page.getByRole('article', { name: 'Gratis' }).getByText('Tu plan actual')).toHaveCount(0)
      await expectNoHorizontalScroll(page)
    })

    test('a person invited to a paid family sees the plan as included by the family, with nothing to pay', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      const guest = await secondPerson(browser, design)
      await acceptViaApi(guest.context.request, guest.token, await inviteViaApi(page.context().request, owner.token, guest.email, 'caregiver'))

      await guest.page.goto('/planes')
      const full = guest.page.getByRole('article', { name: 'Plan completo' })
      await expect(full.getByText('Tu plan actual')).toBeVisible()
      await expect(full.getByText('Incluido por la familia de Ana. No pagas nada: lo cubre su suscripción.')).toBeVisible()
      await expect(full.getByRole('button')).toHaveCount(0)

      // The family stops paying: the guest is back on Gratis.
      await setAccountPlan(owner.accountId, 'free')
      await guest.page.reload()
      await expect(guest.page.getByRole('article', { name: 'Gratis' }).getByText('Tu plan actual')).toBeVisible()
      await guest.context.close()
    })

    test('the compact plan notice of Suplementos, Mis suplementos and Familia says what it is, the price and goes to the plans', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false, plan: 'free' })

      await page.goto(`/children/${owner.childId}`)
      const main = page.getByRole('main')
      await expect(main.getByRole('heading', { name: 'Suplementos', level: 3 })).toBeVisible()
      await expect(main.getByRole('heading', { name: 'Actividades', level: 3 })).toBeVisible()
      await expect(main.getByText(/MX\$499 al año/).first()).toBeVisible()
      await expect(main.getByRole('button', { name: 'Ver el plan completo' })).toHaveCount(0)

      await page.goto('/mis-suplementos')
      await expect(page.getByRole('heading', { name: 'Tus suplementos' })).toBeVisible()
      await page.goto('/mis-actividades')
      await expect(page.getByRole('heading', { name: 'Tus actividades' })).toBeVisible()
      await expect(page.getByText(/MX\$499 al año/).first()).toBeVisible()

      await page.goto('/familia')
      await expect(page.getByRole('heading', { name: 'Compartir con tu familia' })).toBeVisible()
      await page.getByRole('link', { name: 'Ver el plan completo →' }).click()
      await expect(page).toHaveURL(/\/planes$/)
      await expect(page.getByRole('heading', { name: 'Planes', level: 1 })).toBeVisible()
    })
  })
}
