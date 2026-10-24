import type { Browser, Page } from '@playwright/test'
import {
  acceptViaApi,
  allowClerkOn,
  childDeviceLinkViaApi,
  childLinkUrl,
  designs,
  expect,
  inviteViaApi,
  redeemChildLinkViaApi,
  secondPerson,
  seedChild,
  setAccountPlan,
  test,
} from './helpers'

// specs/047-dispositivo-del-hijo: the parent gives a child's phone its own access — no Clerk, no e-mail, no password. Two sessions: the
// Tutor (a real Clerk user) and the child's phone (a browser context with nothing but the link). Chromium only: the engine does not
// matter here (it is not in CROSS_BROWSER_SPECS on purpose).

const API = 'http://localhost:8080'

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0)
}

/** A browser of its own for the child's phone: no cookies, no Clerk session. */
async function childPhone(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport })
  return { context, page: await context.newPage() }
}

const device = (credential: string) => ({ Authorization: `Device ${credential}` })

for (const design of designs) {
  test.describe(`Dispositivo del hijo, ${design.name}`, () => {
    test.skip(({ browserName }) => browserName !== 'chromium', 'the child phone flow is checked in Chromium only')
    test.use({ viewport: design.viewport })

    test('the Tutor makes the link, the child opens it and lands on their doses; the same link never works twice', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page)
      await page.goto(`/children/${owner.childId}`)
      const main = page.getByRole('main')

      await main.getByLabel('Nombre del teléfono').fill('Teléfono de Mateo')
      await main.getByRole('button', { name: 'Crear liga' }).click()
      const link = await main.getByLabel('Liga de acceso').inputValue()
      expect(link).toContain('/hijo#')
      await expectNoHorizontalScroll(page)

      const phone = await childPhone(browser, design.viewport)
      await phone.page.goto(link)
      await expect(phone.page.getByRole('heading', { name: 'Hola, Mateo' })).toBeVisible()
      await expect(phone.page.getByRole('region', { name: 'Tus tomas de hoy' })).toBeVisible()
      await expect(phone.page.getByRole('button', { name: 'Toma de 08:00', exact: true })).toBeVisible()
      // The secret left the address bar at once.
      expect(phone.page.url()).not.toContain('#')
      await expectNoHorizontalScroll(phone.page)

      // The same link again, and an invented one, say the same one sentence.
      const again = await childPhone(browser, design.viewport)
      await again.page.goto(link)
      await expect(again.page.getByText('Esta liga ya no sirve')).toBeVisible()
      const invented = await childPhone(browser, design.viewport)
      await invented.page.goto('/hijo#inventada')
      await expect(invented.page.getByText('Esta liga ya no sirve')).toBeVisible()
      for (const p of [phone, again, invented]) await p.context.close()
    })

    test('the child marks a dose and the Tutor sees it «por Mateo»; a mark of the Tutor is not the child’s to take back', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page)
      const request = page.context().request
      const link = await childDeviceLinkViaApi(request, owner.token, owner.childId)
      const phone = await childPhone(browser, design.viewport)
      await phone.page.goto(childLinkUrl(link))

      const childChip = phone.page.getByRole('button', { name: 'Toma de 08:00', exact: true })
      await childChip.click()
      await expect(childChip).toHaveAttribute('aria-pressed', 'true')

      await page.goto(`/consultations/${owner.consultationId}`)
      const tutorChip = page.getByRole('button', { name: 'Toma de 08:00', exact: true })
      await expect(tutorChip).toHaveAttribute('aria-pressed', 'true')
      await expect(tutorChip).toContainText('por Mateo')

      // The Tutor marks the 16:00 dose; the child sees it marked and cannot undo it.
      await page.getByRole('button', { name: 'Toma de 16:00', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Toma de 16:00', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await phone.page.reload()
      const locked = phone.page.getByRole('button', { name: 'Toma de 16:00', exact: true })
      await expect(locked).toHaveAttribute('aria-pressed', 'true')
      await expect(locked).toBeDisabled()

      // Also by the API: the child's credential is refused when it tries to take the Tutor's mark back.
      const credential = await redeemChildLinkViaApi(request, (await childDeviceLinkViaApi(request, owner.token, owner.childId, 'Otro')).token)
      const now = Date.now()
      const overview = await request.get(
        `${API}/child-device/children/${owner.childId}/overview?from=${encodeURIComponent(new Date(now - 24 * 3600e3).toISOString())}&to=${encodeURIComponent(new Date(now + 24 * 3600e3).toISOString())}`,
        { headers: device(credential) },
      )
      expect(overview.ok()).toBeTruthy()
      const doses = (await overview.json()).doses as { id: string; consultationId: string; taken: boolean; takenBy?: { mine: boolean } | null }[]
      const tutors = doses.find((d) => d.taken && d.takenBy && !d.takenBy.mine)
      expect(tutors, 'the Tutor’s mark is in the list').toBeTruthy()
      const refused = await request.patch(`${API}/child-device/consultations/${tutors!.consultationId}/doses/${tutors!.id}`, {
        headers: device(credential),
        data: { taken: false },
      })
      expect(refused.status()).toBe(403)
      await phone.context.close()
    })

    test('the child’s credential opens nothing outside what is theirs', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page)
      const request = page.context().request
      const credential = await redeemChildLinkViaApi(request, (await childDeviceLinkViaApi(request, owner.token, owner.childId)).token)
      const otherChild = '00000000-0000-4000-8000-000000000001'
      for (const path of [
        '/accounts/me',
        '/family',
        `/consultations/${owner.consultationId}`,
        `/children/${owner.childId}/consultations`,
        `/children/${otherChild}/overview?from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z`,
        `/child-device/children/${otherChild}/overview?from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z`,
      ]) {
        const res = await request.get(`${API}${path}`, { headers: device(credential) })
        expect([401, 403], `${path} -> ${res.status()}`).toContain(res.status())
        expect(await res.text()).not.toContain('Morales')
      }
      // The parent's session is not the child's either.
      const asParent = await request.get(`${API}/child-device/me`, { headers: { Authorization: `Bearer ${owner.token}` } })
      expect(asParent.status()).toBe(401)
    })

    test('removing the phone cuts it at once and without data', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page)
      const link = await childDeviceLinkViaApi(page.context().request, owner.token, owner.childId)
      const phone = await childPhone(browser, design.viewport)
      await phone.page.goto(childLinkUrl(link))
      await expect(phone.page.getByRole('heading', { name: 'Hola, Mateo' })).toBeVisible()

      await page.goto(`/children/${owner.childId}`)
      await page.getByRole('button', { name: 'Quitar Teléfono de Mateo' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Quitar', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Quitar Teléfono de Mateo' })).toHaveCount(0)

      await phone.page.reload()
      await expect(phone.page.getByText('Este acceso ya no está activo')).toBeVisible()
      await expect(phone.page.getByRole('button', { name: /^Toma de/ })).toHaveCount(0)
      await phone.context.close()
    })

    test('a fourth device asks to remove one first', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page)
      const request = page.context().request
      for (const name of ['Uno', 'Dos', 'Tres']) await childDeviceLinkViaApi(request, owner.token, owner.childId, name)
      await page.goto(`/children/${owner.childId}`)
      const main = page.getByRole('main')
      await main.getByLabel('Nombre del teléfono').fill('Cuatro')
      await main.getByRole('button', { name: 'Crear liga' }).click()
      await expect(main.getByText('Ya hay 3 teléfonos o ligas sin usar para este hijo. Quita uno para crear otro.')).toBeVisible()
      await expectNoHorizontalScroll(page)
    })

    test('a Caregiver sees the list but can neither create nor remove', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page)
      const request = page.context().request
      await childDeviceLinkViaApi(request, owner.token, owner.childId, 'Teléfono de Mateo')
      const guest = await secondPerson(browser, design, { firstName: 'Luis' })
      await acceptViaApi(guest.context.request, guest.token, await inviteViaApi(request, owner.token, guest.email, 'caregiver'))

      await guest.page.goto(`/children/${owner.childId}`)
      const main = guest.page.getByRole('main')
      await expect(main.getByText('Teléfono de Mateo')).toBeVisible()
      await expect(main.getByRole('button', { name: 'Crear liga' })).toHaveCount(0)
      await expect(main.getByRole('button', { name: /^Quitar Teléfono/ })).toHaveCount(0)
      await expectNoHorizontalScroll(guest.page)
      await guest.context.close()
    })

    test('with the plan lapsed the child keeps marking and the Tutor sees the plan notice instead of «Crear liga»', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page)
      const link = await childDeviceLinkViaApi(page.context().request, owner.token, owner.childId)
      const phone = await childPhone(browser, design.viewport)
      await phone.page.goto(childLinkUrl(link))
      await expect(phone.page.getByRole('heading', { name: 'Hola, Mateo' })).toBeVisible()

      await setAccountPlan(owner.accountId, 'free')

      const chip = phone.page.getByRole('button', { name: 'Toma de 08:00', exact: true })
      await chip.click()
      await expect(chip).toHaveAttribute('aria-pressed', 'true')

      await page.goto(`/children/${owner.childId}`)
      const main = page.getByRole('main')
      await expect(main.getByText('Con el plan completo, cada hijo puede ver y marcar sus tomas')).toBeVisible()
      await expect(main.getByRole('button', { name: 'Crear liga' })).toHaveCount(0)
      await expect(main.getByRole('button', { name: 'Quitar Teléfono de Mateo' })).toBeVisible()
      await phone.context.close()
    })
  })
}
