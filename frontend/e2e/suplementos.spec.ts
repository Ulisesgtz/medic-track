import type { Page } from '@playwright/test'
import {
  acceptViaApi,
  allowClerkOn,
  designs,
  expect,
  inviteViaApi,
  queryDb,
  routineViaApi,
  secondPerson,
  seedChild,
  setAccountPlan,
  test,
} from './helpers'

// specs/033-recordatorios-suplementos-citas, parte 1 (rutinas de suplementos): quickstart §1, §3 y §4 with real people, at 390 and
// 1280 px. The accounts, the invitation and the access are the real thing (Clerk dev instance and the backend); only the setup
// shortcuts (the plan, a routine made in advance) go through the API or the database.

const API = 'http://localhost:8080'
const LONG_NAME = 'Omega 3 con vitaminas A, C y E en jarabe sabor naranja y miel de abeja de campo'

/** Nothing sticks out sideways: a phone page must never scroll horizontally. */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0)
}

for (const design of designs) {
  test.describe(`Suplementos, ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('a Tutor creates a routine with the form, marks its dose, edits it, pauses, resumes and finishes it', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page)
      await page.goto(`/children/${owner.childId}`)
      const main = page.getByRole('main')

      // The section invites to create the first routine.
      await expect(main.getByRole('heading', { name: 'Suplementos' })).toBeVisible()
      await expect(main.getByRole('heading', { name: 'Aún no hay rutinas' })).toBeVisible()
      await expectNoHorizontalScroll(page)
      await main.getByRole('link', { name: 'Crear la primera rutina' }).click()

      // The form, as a page: a name that is long, written as is.
      await expect(page.getByRole('heading', { name: 'Nueva rutina', level: 1 })).toBeVisible()
      await expect(page.getByLabel('Nombre')).toHaveAttribute('placeholder', 'Como lo llaman en casa')
      await page.getByLabel('Nombre').fill(LONG_NAME)
      await expectNoHorizontalScroll(page)
      await page.getByRole('button', { name: 'Guardar rutina' }).click()

      // Its detail: today's dose is markable and says who marked it.
      await expect(page.getByRole('heading', { name: LONG_NAME, level: 1 })).toBeVisible()
      await expect(page.getByText('Activa', { exact: true })).toBeVisible()
      await expectNoHorizontalScroll(page)
      const chip = page.getByRole('button', { name: 'Toma de 08:00', exact: true })
      await chip.click()
      await expect(chip).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByText(/por Ana, \d\d:\d\d/).first()).toBeVisible()

      // It shows in the child's section and in «Tomas de hoy» with the «Suplemento» label.
      await page.goto(`/children/${owner.childId}`)
      // The web's «Tomas de hoy» panel lists it with the label; the phone's amber block only counts it (its mock has no list).
      if (design.isWeb) await expect(page.getByRole('main').getByText('Suplemento', { exact: true }).first()).toBeVisible()
      else await expect(page.getByRole('main').getByText(/0 sin marcar/)).toBeVisible()
      await expect(page.getByRole('main').getByText('1 activa')).toBeVisible()
      await expectNoHorizontalScroll(page)

      // Editing counts from the next dose: what was marked stays marked.
      await page.getByRole('main').getByRole('link', { name: `Ver rutina ${LONG_NAME}` }).click()
      await page.getByRole('link', { name: 'Editar' }).click()
      await expect(page.getByRole('heading', { name: 'Editar rutina' })).toBeVisible()
      await expect(page.getByText('Los cambios cuentan desde la siguiente toma. Las tomas ya marcadas no cambian.')).toBeVisible()
      await page.getByLabel('Hora', { exact: true }).fill('21:00')
      await page.getByRole('button', { name: 'Guardar cambios' }).click()
      await expect(page.getByText('Todos los días · 21:00')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Toma de 08:00', exact: true })).toHaveAttribute('aria-pressed', 'true')

      // Pausing needs no confirmation; resuming brings it back.
      await page.getByRole('button', { name: 'Pausar' }).click()
      await expect(page.getByText('Pausada', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Reanudar' })).toBeVisible()
      await expect(page.getByRole('switch')).toHaveCount(0)
      await page.getByRole('button', { name: 'Reanudar' }).click()
      await expect(page.getByText('Activa', { exact: true })).toBeVisible()

      // Finishing asks first, in neutral words, and is for good.
      await page.getByRole('button', { name: 'Finalizar rutina' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Se conserva')).toBeVisible()
      await dialog.getByRole('button', { name: 'Cancelar' }).click()
      await expect(dialog).toHaveCount(0)
      await page.getByRole('button', { name: 'Finalizar rutina' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Finalizar rutina' }).click()
      await expect(page.getByText(/Terminada el \d+ \w+ · 1 de \d+ tomas/).first()).toBeVisible()
      await expect(page.getByRole('button', { name: 'Reanudar' })).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0)
    })

    test('a Caregiver sees the routine and marks its doses, chooses their own reminders and cannot manage it', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      const routine = await routineViaApi(page.context().request, owner.token, owner.childId, { name: 'Vitamina D', times: ['08:00', '20:00'] })
      const guest = await secondPerson(browser, design)
      await acceptViaApi(guest.context.request, guest.token, await inviteViaApi(page.context().request, owner.token, guest.email, 'caregiver'))

      await guest.page.goto(`/children/${owner.childId}`)
      const main = guest.page.getByRole('main')
      await expect(main.getByText('Las rutinas las crea y edita un Tutor. Tú puedes marcar tomas y elegir tus avisos.')).toBeVisible()
      await expect(main.getByRole('link', { name: '+ Nueva rutina' })).toHaveCount(0)
      await expectNoHorizontalScroll(guest.page)

      // They mark a dose and the Tutor sees who did.
      await main.getByRole('button', { name: 'Toma de 08:00', exact: true }).click()
      await expect(main.getByText(/por Luis, \d\d:\d\d/).first()).toBeVisible()
      await page.goto(`/suplementos/${routine.id}`)
      await expect(page.getByText(/por Luis, \d\d:\d\d/).first()).toBeVisible()

      // In the detail the Caregiver has no actions, only their own reminders: turning them off is theirs alone.
      await guest.page.goto(`/suplementos/${routine.id}`)
      await expect(guest.page.getByText('Un Tutor puede pausar, editar o finalizar esta rutina.')).toBeVisible()
      await expect(guest.page.getByRole('button', { name: 'Pausar' })).toHaveCount(0)
      await expect(guest.page.getByRole('link', { name: 'Editar' })).toHaveCount(0)
      const toggle = guest.page.getByRole('switch', { name: 'Avisos de esta rutina para ti' })
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-checked', 'false')
      const muted = await queryDb<{ account_id: string }>('SELECT account_id FROM supplement_muted WHERE routine_id = $1', [routine.id])
      expect(muted.map((r) => r.account_id)).toEqual([guest.accountId])
      await page.reload()
      await expect(page.getByRole('switch', { name: 'Avisos de esta rutina para ti' })).toHaveAttribute('aria-checked', 'true')

      // Even calling the API directly, the Caregiver cannot manage it.
      for (const path of ['pause', 'finish']) {
        const res = await guest.context.request.post(`${API}/routines/${routine.id}/${path}`, { headers: { Authorization: `Bearer ${guest.token}` } })
        expect(res.status(), path).toBe(403)
      }
      await guest.context.close()
    })

    test('on the free plan a Tutor is told it is the full plan; what was created stays and stops nothing, and the cap is explained', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false, plan: 'free' })
      const request = page.context().request

      await page.goto(`/children/${owner.childId}`)
      const main = page.getByRole('main')
      await expect(main.getByText('Rutinas de suplemento')).toBeVisible()
      await expect(main.getByRole('button', { name: 'Ver el plan completo' })).toBeVisible()
      await expect(main.getByRole('link', { name: 'Crear la primera rutina' })).toHaveCount(0)
      const refused = await request.post(`${API}/children/${owner.childId}/routines`, {
        data: { name: 'x', period: 'daily', times: ['08:00'], firstDate: '2026-10-06', utcOffsetMinutes: 0 },
        headers: { Authorization: `Bearer ${owner.token}` },
      })
      expect(refused.status()).toBe(422)
      expect((await refused.json()).reason).toBe('supplements')

      // Routines made while the plan was paid keep showing, marking and stopping after it lapses.
      await setAccountPlan(owner.accountId, 'paid')
      const routine = await routineViaApi(request, owner.token, owner.childId)
      await setAccountPlan(owner.accountId, 'free')
      await page.reload()
      await expect(main.getByText('Plan completo').first()).toBeVisible()
      const chip = main.getByRole('button', { name: 'Toma de 08:00', exact: true })
      await chip.click()
      await expect(chip).toHaveAttribute('aria-pressed', 'true')
      await page.goto(`/suplementos/${routine.id}`)
      await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0)
      await page.getByRole('button', { name: 'Pausar' }).click()
      await expect(page.getByText('Pausada', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Reanudar' }).click()
      await expect(page.getByRole('dialog').getByText('Suplementos con recordatorio')).toBeVisible()
    })

    test('with 10 active routines the section explains the cap, and pausing one makes room for another', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      const request = page.context().request
      const routines = []
      for (let i = 1; i <= 10; i++) routines.push(await routineViaApi(request, owner.token, owner.childId, { name: `Rutina ${i}` }))

      await page.goto(`/children/${owner.childId}`)
      const main = page.getByRole('main')
      await expect(main.getByRole('status').getByText('Ya tienes 10 rutinas activas')).toBeVisible()
      await expect(main.getByRole('link', { name: '+ Nueva rutina' })).toHaveCount(0)
      await expect(main.getByText('10 activas')).toBeVisible()
      await expectNoHorizontalScroll(page)

      await page.goto(`/suplementos/${routines[0].id}`)
      await page.getByRole('button', { name: 'Pausar' }).click()
      await expect(page.getByText('Pausada', { exact: true })).toBeVisible()
      await page.goto(`/children/${owner.childId}`)
      await expect(page.getByRole('main').getByRole('link', { name: '+ Nueva rutina' })).toBeVisible()
      await expect(page.getByRole('main').getByText('9 activas')).toBeVisible()
    })
  })
}
