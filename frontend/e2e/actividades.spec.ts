import type { Page } from '@playwright/test'
import {
  pickTime,
  acceptViaApi,
  activityViaApi,
  allowClerkOn,
  designs,
  expect,
  inviteViaApi,
  localToday,
  personalActivityViaApi,
  queryDb,
  routineViaApi,
  secondPerson,
  seedChild,
  setAccountPlan,
  test,
} from './helpers'

// specs/035-actividades-y-suplementos: an activity is done «desde una hora hasta otra, cada cuánto», marked with «Realizado», with
// no chips, hours or calendar. Quickstart with real people, at 390 and 1280 px. The accounts, the invitation and the access are the
// real thing (Clerk dev instance and the backend); only the setup shortcuts (the plan, an activity made in advance) go through the
// API or the database. The activities made in advance go off every hour of the day, so a dose is always there whatever the hour.

const API = 'http://localhost:8080'

/** Nothing sticks out sideways: a phone page must never scroll horizontally. */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0)
}

/** The body «Realizado» sends: the person's local day. */
function dayBody() {
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  const to = new Date(from.getTime() + 24 * 3600 * 1000)
  return { from: from.toISOString(), to: to.toISOString() }
}

for (const design of designs) {
  test.describe(`Actividades, ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('a Tutor adds an activity with the form, marks «Realizado», takes the last mark back, edits, pauses, resumes and finishes it', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      await page.goto(`/children/${owner.childId}`)
      const main = page.getByRole('main')

      // Two sections, one under the other: Suplementos first, then Actividades, each with its own invitation.
      await expect(main.getByRole('heading', { name: 'Suplementos', level: 2 })).toBeVisible()
      await expect(main.getByRole('heading', { name: 'Actividades', level: 2 })).toBeVisible()
      await expect(main.getByText('Sin actividades registradas')).toBeVisible()
      await expectNoHorizontalScroll(page)
      await main.getByRole('link', { name: '+ Agregar actividad' }).click()

      // The form: «Horario del día» and «Cada [n] minutos u horas», empty, and the reminders counted without listing them.
      await expect(page.getByRole('heading', { name: 'Agregar actividad', level: 1 })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Desde las', exact: true })).toContainText('Elegir hora')
      await expect(page.getByRole('button', { name: 'Hasta las', exact: true })).toContainText('Elegir hora')
      await page.getByLabel('Nombre').fill('Tomar agua')
      await pickTime(page, 'Desde las', '00:00')
      await pickTime(page, 'Hasta las', '23:00')
      await page.getByLabel('Cantidad').fill('1')
      await expect(page.getByText('Con esto, cada día hay 24 avisos: el primero a las 00:00 y el último a las 23:00.')).toBeVisible()
      await expectNoHorizontalScroll(page)
      await page.getByRole('button', { name: 'Guardar actividad' }).click()

      // The detail: a count and a bar, never 24 chips; «Realizado» is the main action.
      await expect(page.getByRole('heading', { name: 'Tomar agua', level: 1 })).toBeVisible()
      await expect(page).toHaveURL(/\/actividades\//)
      await expect(page.getByText('Activa', { exact: true })).toBeVisible()
      await expect(page.getByText('0 de 24')).toBeVisible()
      await expect(page.getByText('hechas hoy')).toBeVisible()
      await expect(page.getByRole('progressbar', { name: '0 de 24 hechas hoy' })).toBeVisible()
      await expect(page.getByRole('button', { name: /^Toma de/ })).toHaveCount(0)
      await expect(page.getByText('Cada hora, de 00:00 a 23:00').first()).toBeVisible()
      await expect(page.getByText('Avisos al día')).toBeVisible()
      await expectNoHorizontalScroll(page)

      const done = page.getByRole('button', { name: 'Realizado: Tomar agua' })
      await done.click()
      await expect(page.getByText('1 de 24')).toBeVisible()
      await done.click()
      await expect(page.getByText('2 de 24')).toBeVisible()
      await expect(page.getByText('por Ana', { exact: true })).toBeVisible()
      await expect(page.getByRole('progressbar', { name: '2 de 24 hechas hoy' })).toBeVisible()

      // A tap by mistake is taken back, one at a time.
      await page.getByRole('button', { name: 'Quitar la última marca' }).click()
      await expect(page.getByText('1 de 24')).toBeVisible()

      // specs/056: on the child's detail it is a compact row of «Actividades» (the rule, never 24 chips) and «Hoy» counts it in
      // one row with «Realizado».
      await page.goto(`/children/${owner.childId}`)
      const row = main.getByRole('region', { name: 'Actividades' }).getByRole('link').filter({ hasText: 'Tomar agua' })
      await expect(row).toContainText('Cada hora, de 00:00 a 23:00')
      await expect(row).toContainText('Activa')
      const today = main.getByRole('region', { name: 'Hoy' })
      await expect(today.getByText('1 de 24 hechas')).toBeVisible()
      await expect(main.getByRole('button', { name: /^Toma de/ })).toHaveCount(0)
      await expectNoHorizontalScroll(page)
      await today.getByRole('button', { name: 'Realizado: Tomar agua' }).click()
      await expect(today.getByText('2 de 24 hechas')).toBeVisible()

      // Editing counts from the next reminder: what was marked stays.
      await row.click()
      await page.getByRole('link', { name: 'Editar' }).click()
      await expect(page.getByRole('heading', { name: 'Editar actividad' })).toBeVisible()
      await expect(page.getByText('Los cambios cuentan desde el siguiente aviso. Lo ya marcado no cambia.')).toBeVisible()
      await page.getByLabel('Cantidad').fill('2')
      await page.getByRole('button', { name: 'Guardar cambios' }).click()
      await expect(page.getByText('Cada 2 horas, de 00:00 a 23:00').first()).toBeVisible()

      // Pausing needs no confirmation and takes «Realizado» away; resuming brings it back.
      await page.getByRole('button', { name: 'Pausar' }).click()
      await expect(page.getByText('Pausada', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: /Realizado/ })).toHaveCount(0)
      await expect(page.getByRole('switch')).toHaveCount(0)
      await page.getByRole('button', { name: 'Reanudar' }).click()
      await expect(page.getByText('Activa', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Realizado: Tomar agua' })).toBeVisible()

      // Finishing asks first, in its own neutral words, and is for good.
      await page.getByRole('button', { name: 'Finalizar actividad' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Desde hoy no llegan más avisos de esta actividad a nadie de la familia.')).toBeVisible()
      await expect(dialog.getByText('Cada «Realizado», con quién lo marcó y a qué hora.')).toBeVisible()
      await dialog.getByRole('button', { name: 'Cancelar' }).click()
      await expect(dialog).toHaveCount(0)
      await page.getByRole('button', { name: 'Finalizar actividad' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Finalizar actividad' }).click()
      await expect(page.getByText(/Terminada el \d+ \w+\./).first()).toBeVisible()
      await expect(page.getByRole('button', { name: 'Reanudar' })).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /Realizado/ })).toHaveCount(0)
    })

    test('an activity at a fixed hour on certain days: «práctica de fut», picked on the grid and marked with «Realizado»', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      await page.goto(`/children/${owner.childId}`)
      await page.getByRole('main').getByRole('link', { name: '+ Agregar actividad' }).click()

      await page.getByLabel('Nombre').fill('Práctica de fut')
      await page.locator('label', { hasText: 'A una hora fija' }).click()
      await expect(page.getByLabel('Desde las')).toHaveCount(0)
      // The hour is picked on the grid: the field never shows the browser's own time popup, and it fits its card.
      await pickTime(page, 'Hora', '17:00')
      await expect(page.getByRole('button', { name: 'Hora', exact: true })).toContainText('17:00')
      await page.getByRole('radio', { name: 'Ciertos días de la semana' }).click()
      for (const day of ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']) await page.getByRole('button', { name: day, exact: true }).click()
      // The form repeats what was chosen (spec 042).
      await expect(page.getByText('Todos los días a las 17:00.')).toBeVisible()
      await expectNoHorizontalScroll(page)
      await page.getByRole('button', { name: 'Guardar actividad' }).click()

      // Every day was chosen, so there is a dose today at 17:00: one «Realizado» marks it.
      await expect(page.getByRole('heading', { name: 'Práctica de fut', level: 1 })).toBeVisible()
      await expect(page.locator('dd').filter({ hasText: 'Todos los días' })).toBeVisible()
      await expect(page.locator('dd').filter({ hasText: '17:00' })).toBeVisible()
      // At fixed hours the detail has no count and no bar (spec 042): «Próxima» and «Última marcada».
      await expect(page.getByText('Próxima', { exact: true })).toBeVisible()
      await expect(page.getByRole('progressbar')).toHaveCount(0)
      await page.getByRole('button', { name: 'Realizado: Práctica de fut' }).click()
      await expect(page.getByText('No quedan avisos hoy.')).toBeVisible()
      await expect(page.getByText('Última marcada', { exact: true }).locator('..')).toContainText('hoy')
    })

    test('a Caregiver taps «Realizado» too, two people at once mark two different ones, and nobody else manages it', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      const request = page.context().request
      const activity = await activityViaApi(request, owner.token, owner.childId)
      const guest = await secondPerson(browser, design)
      await acceptViaApi(guest.context.request, guest.token, await inviteViaApi(request, owner.token, guest.email, 'caregiver'))

      // The Tutor marks one; the Caregiver sees it with the Tutor's name and has no way to take it back.
      await page.goto(`/actividades/${activity.id}`)
      await page.getByRole('button', { name: 'Realizado: Tomar agua' }).click()
      await expect(page.getByText('1 de 24')).toBeVisible()
      await guest.page.goto(`/children/${owner.childId}`)
      const main = guest.page.getByRole('main')
      await expect(main.getByRole('link', { name: '+ Agregar actividad' })).toHaveCount(0)
      await expect(main.getByRole('region', { name: 'Hoy' }).getByText('1 de 24 hechas')).toBeVisible()
      await expect(main.getByRole('region', { name: 'Hoy' }).getByRole('button', { name: 'Realizado: Tomar agua' })).toBeVisible()
      await expectNoHorizontalScroll(guest.page)

      await guest.page.goto(`/actividades/${activity.id}`)
      await expect(guest.page.getByText('Un Tutor puede pausar, editar o finalizar esta actividad.')).toBeVisible()
      await expect(guest.page.getByRole('button', { name: 'Pausar' })).toHaveCount(0)
      await expect(guest.page.getByRole('link', { name: 'Editar' })).toHaveCount(0)
      await expect(guest.page.getByRole('button', { name: 'Finalizar actividad' })).toHaveCount(0)
      await expect(guest.page.getByRole('button', { name: 'Quitar la última marca' })).toHaveCount(0)

      // Their own tap is theirs to take back; the Tutor then sees who marked it.
      await guest.page.getByRole('button', { name: 'Realizado: Tomar agua' }).click()
      await expect(guest.page.getByText('2 de 24')).toBeVisible()
      await expect(guest.page.getByText('por Luis', { exact: true })).toBeVisible()
      await page.reload()
      await expect(page.getByText('2 de 24')).toBeVisible()
      await expect(page.getByText('por Luis', { exact: true })).toBeVisible()
      await guest.page.getByRole('button', { name: 'Quitar la última marca' }).click()
      await expect(guest.page.getByText('1 de 24')).toBeVisible()

      // Two taps at the same time mark two different doses, never the same one twice.
      const body = dayBody()
      const [a, b] = await Promise.all([
        request.post(`${API}/routines/${activity.id}/done`, { data: body, headers: { Authorization: `Bearer ${owner.token}` } }),
        guest.context.request.post(`${API}/routines/${activity.id}/done`, { data: body, headers: { Authorization: `Bearer ${guest.token}` } }),
      ])
      expect(a.status()).toBe(200)
      expect(b.status()).toBe(200)
      expect((await a.json()).id).not.toBe((await b.json()).id)
      const marked = await queryDb<{ n: string }>('SELECT count(*) AS n FROM supplement_doses WHERE routine_id = $1 AND taken', [activity.id])
      expect(Number(marked[0].n)).toBe(3)

      // «Tus avisos» is theirs alone.
      const toggle = guest.page.getByRole('switch', { name: 'Tus avisos de esta actividad' })
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-checked', 'false')
      const muted = await queryDb<{ account_id: string }>('SELECT account_id FROM supplement_muted WHERE routine_id = $1', [activity.id])
      expect(muted.map((r) => r.account_id)).toEqual([guest.accountId])

      // Even calling the API directly, the Caregiver cannot manage it.
      for (const path of ['pause', 'finish']) {
        const res = await guest.context.request.post(`${API}/routines/${activity.id}/${path}`, { headers: { Authorization: `Bearer ${guest.token}` } })
        expect(res.status(), path).toBe(403)
      }
      await guest.context.close()
    })

    test('supplements and activities are listed, counted and capped apart; with 10 activities another can be added only as a supplement', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      const request = page.context().request
      const activities = []
      for (let i = 1; i <= 10; i++) activities.push(await activityViaApi(request, owner.token, owner.childId, { name: `Actividad ${i}`, windowStart: '08:00', windowEnd: '09:00' }))

      await page.goto(`/children/${owner.childId}`)
      const main = page.getByRole('main')
      await expect(main.getByText('Ya tienes 10 actividades activas')).toBeVisible()
      await expect(main.getByRole('link', { name: '+ Agregar actividad' })).toHaveCount(0)
      // Supplements are another count: their section still invites.
      await expect(main.getByText('Sin suplementos registrados')).toBeVisible()
      await expect(main.getByRole('link', { name: '+ Agregar suplemento' })).toBeVisible()
      await expectNoHorizontalScroll(page)

      // The API lists each kind apart.
      const list = async (kind: string) => {
        const { from, to } = dayBody()
        const res = await request.get(`${API}/children/${owner.childId}/routines?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&kind=${kind}`, {
          headers: { Authorization: `Bearer ${owner.token}` },
        })
        return (await res.json()).routines as { kind: string }[]
      }
      expect((await list('activity')).length).toBe(10)
      expect((await list('supplement')).length).toBe(0)
      await routineViaApi(request, owner.token, owner.childId, { name: 'Zinc' })
      expect((await list('supplement')).map((r) => r.kind)).toEqual(['supplement'])

      await page.goto(`/actividades/${activities[0].id}`)
      await page.getByRole('button', { name: 'Pausar' }).click()
      await expect(page.getByText('Pausada', { exact: true })).toBeVisible()
      await page.goto(`/children/${owner.childId}`)
      await expect(page.getByRole('main').getByRole('link', { name: '+ Agregar actividad' })).toBeVisible()
    })

    test('on the free plan the section offers the plan; what was created while paid stays and «Realizado» still works', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false, plan: 'free' })
      const request = page.context().request

      await page.goto(`/children/${owner.childId}`)
      const main = page.getByRole('main')
      await expect(main.getByRole('heading', { name: 'Actividades', level: 2 })).toBeVisible()
      await expect(main.getByRole('button', { name: /Agregar actividades/ })).toContainText('Plan completo')
      await expect(main.getByRole('link', { name: '+ Agregar actividad' })).toHaveCount(0)
      const { day, offset } = localToday()
      const refused = await request.post(`${API}/children/${owner.childId}/routines`, {
        data: { kind: 'activity', name: 'x', period: 'window', windowStart: '08:00', windowEnd: '10:00', intervalMinutes: 60, firstDate: day, utcOffsetMinutes: offset },
        headers: { Authorization: `Bearer ${owner.token}` },
      })
      expect(refused.status()).toBe(422)
      expect((await refused.json()).reason).toBe('supplements')

      await setAccountPlan(owner.accountId, 'paid')
      const activity = await activityViaApi(request, owner.token, owner.childId)
      await setAccountPlan(owner.accountId, 'free')
      await page.goto(`/actividades/${activity.id}`)
      await page.getByRole('button', { name: 'Realizado: Tomar agua' }).click()
      await expect(page.getByText('1 de 24')).toBeVisible()
      await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0)
      await page.getByRole('button', { name: 'Pausar' }).click()
      await expect(page.getByText('Pausada', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Reanudar' }).click()
      await expect(page.getByRole('dialog').getByRole('heading', { name: 'Suplementos y actividades' })).toBeVisible()
    })
  })

  test.describe(`Actividades personales, ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('the person finds «Mi día» from the home, adds an activity, marks «Realizado» from the home and nobody else in the family sees it', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      const request = page.context().request
      await page.goto('/home')
      const main = page.getByRole('main')

      // specs/056: «Tu día» leads to «Mi día» (the web sidebar too); with nothing created, «Hoy» offers the activity with outline.
      await expect(main.getByRole('link', { name: 'Agrega tus propios suplementos o actividades' })).toBeVisible()
      if (design.isWeb) await page.getByRole('navigation', { name: 'Personal' }).getByRole('link', { name: 'Mi perfil' }).click()
      else await main.getByRole('link', { name: 'Agrega tus propios suplementos o actividades' }).click()

      await expect(page).toHaveURL(/\/yo$/)
      await expect(page.getByRole('heading', { name: 'Ana', level: 1 })).toBeVisible()
      await expect(page.getByText('Solo tú ves esto')).toBeVisible()
      await page.getByRole('note').getByRole('button', { name: 'Entendido' }).click()
      await page.getByRole('link', { name: 'Agregar una actividad' }).click()

      await expect(page.getByText('Es una actividad personal: solo tú la ves y solo a ti te llegan sus avisos.')).toBeVisible()
      await expect(page.getByText('Solo la ves tú.')).toBeVisible()
      await page.getByLabel('Nombre').fill('Pararse a estirar')
      await pickTime(page, 'Desde las', '00:00')
      await pickTime(page, 'Hasta las', '23:00')
      await page.getByLabel('Cantidad').fill('1')
      await page.getByRole('button', { name: 'Guardar actividad' }).click()

      // Its detail: no family wording, «Tus avisos», and the last mark says only the hour.
      await expect(page.getByRole('heading', { name: 'Pararse a estirar', level: 1 })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Tus avisos' })).toBeVisible()
      await expect(page.getByText('Se activan en cada dispositivo por separado.')).toBeVisible()
      await expect(page.getByText('Agregada por')).toHaveCount(0)
      await page.getByRole('button', { name: 'Realizado: Pararse a estirar' }).click()
      await expect(page.getByText('1 de 24')).toBeVisible()
      await expect(page.getByText(/^por /)).toHaveCount(0)
      await expectNoHorizontalScroll(page)

      // «Tu día» on the home counts it and marks in place.
      await page.goto('/home')
      const tuDia = page.getByRole('region', { name: 'Tu día' })
      await expect(tuDia.getByText('1 de 24 hechas')).toBeVisible()
      await tuDia.getByRole('button', { name: 'Realizado: Pararse a estirar' }).click()
      await expect(tuDia.getByText('2 de 24 hechas')).toBeVisible()
      await expectNoHorizontalScroll(page)

      // A caregiver of the same family sees nothing of it, not by its address nor through the API.
      const mine = await queryDb<{ id: string }>('SELECT id FROM supplement_routines WHERE account_id = $1 AND kind = $2', [owner.accountId, 'activity'])
      const guest = await secondPerson(browser, design)
      await acceptViaApi(guest.context.request, guest.token, await inviteViaApi(request, owner.token, guest.email, 'caregiver'))
      await guest.page.goto(`/actividades/${mine[0].id}`)
      await expect(guest.page.getByText('No se encontró esta actividad.')).toBeVisible()
      const res = await guest.context.request.post(`${API}/routines/${mine[0].id}/done`, { data: dayBody(), headers: { Authorization: `Bearer ${guest.token}` } })
      expect(res.status()).toBe(403)
      await guest.context.close()
    })

    test('with the plan lapsed the person keeps their activity and «Realizado», and only finishing is left', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      const request = page.context().request
      const activity = await personalActivityViaApi(request, owner.token, owner.accountId)
      await setAccountPlan(owner.accountId, 'free')

      await page.goto('/mis-actividades')
      await expect(page).toHaveURL(/\/yo#actividades$/)
      const acts = page.getByRole('region', { name: 'Mis actividades' })
      await expect(acts.getByRole('link').filter({ hasText: 'Pararse a estirar' })).toBeVisible()
      await expect(acts.getByRole('button', { name: /Agregar actividades/ })).toContainText('Plan completo')
      await expect(page.getByRole('link', { name: '+ Agregar actividad' })).toHaveCount(0)
      await page.goto(`/actividades/${activity.id}`)
      await expect(page.getByText(/Con el plan gratuito puedes ver la actividad y marcar «Realizado»/)).toBeVisible()
      await page.getByRole('button', { name: 'Realizado: Pararse a estirar' }).click()
      await expect(page.getByText('1 de 24')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Pausar' })).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Finalizar actividad' })).toBeVisible()
      await expectNoHorizontalScroll(page)
    })
  })
}
