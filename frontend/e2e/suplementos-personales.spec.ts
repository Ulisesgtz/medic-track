import type { Page } from '@playwright/test'
import {
  pickTime,
  acceptViaApi,
  allowClerkOn,
  designs,
  expect,
  inviteViaApi,
  localToday,
  personalRoutineViaApi,
  queryDb,
  secondPerson,
  seedChild,
  setAccountPlan,
  test,
} from './helpers'

// specs/033-recordatorios-suplementos-citas, parte 3 (suplementos personales; la spec 035 separa las actividades): quickstart with real people, at 390 and 1280 px. The
// accounts, the invitation and the access are the real thing (Clerk dev instance and the backend); only the setup shortcuts (the
// plan, a routine made in advance) go through the API or the database.

const API = 'http://localhost:8080'

/** Nothing sticks out sideways: a phone page must never scroll horizontally. */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0)
}

const windowQuery = () => {
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  const to = new Date(from.getTime() + 24 * 3600 * 1000)
  return `?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`
}

for (const design of designs) {
  test.describe(`Suplementos personales, ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('the person finds the section from the home, reads the notice once, adds a supplement, marks it, pauses and finishes it', async ({ page }) => {
      await allowClerkOn(page)
      await seedChild(page, { withConsultation: false })
      await page.goto('/home')
      const main = page.getByRole('main')

      // specs/055: «Tu día» comes first; with nothing created it is one line with the way in.
      const addOwn = main.getByRole('link', { name: 'Agrega tus propios suplementos o actividades' })
      await expect(addOwn).toBeVisible()
      if (design.isWeb) await expect(page.getByRole('navigation', { name: 'Personal' }).getByRole('link', { name: 'Mi día' })).toBeVisible()
      await expectNoHorizontalScroll(page)
      await addOwn.click()

      // specs/056: «Mi día». With nothing created «Hoy» has the first steps and «Cómo funcionan» is open; «Entendido» is kept
      // for the account, so a reload brings only the link back.
      await expect(page).toHaveURL(/\/mi-dia$/)
      await expect(page.getByRole('heading', { name: 'Mi día', level: 1 })).toBeVisible()
      await expect(page.getByText('Solo tú ves esto')).toBeVisible()
      const note = page.getByRole('note').filter({ hasText: 'Cómo funcionan' })
      await expect(note.getByText(/PediTrack no sugiere suplementos ni opina sobre ellos/)).toBeVisible()
      await expect(page.getByRole('region', { name: 'Hoy' }).getByText(/Aquí verás tus tomas y actividades del día/)).toBeVisible()
      await note.getByRole('button', { name: 'Entendido' }).click()
      await expect(note).toHaveCount(0)
      await page.reload()
      await expect(page.getByRole('heading', { name: 'Mi día', level: 1 })).toBeVisible()
      await expect(note).toHaveCount(0)
      await page.getByRole('button', { name: 'Cómo funcionan' }).click()
      await expect(note).toBeVisible()
      await note.getByRole('button', { name: 'Entendido' }).click()
      await expectNoHorizontalScroll(page)

      // The form: personal wording, no example in the fields.
      await page.getByRole('link', { name: 'Agregar mi primer suplemento' }).click()
      await expect(page.getByRole('heading', { name: 'Agregar suplemento', level: 1 })).toBeVisible()
      await expect(page.getByText('Es un suplemento personal: solo tú lo ves y solo a ti te llegan sus avisos.')).toBeVisible()
      await expect(page.getByText('Solo la ves tú.')).toBeVisible()
      await page.getByLabel('Nombre').fill('Omega 3')
      await pickTime(page, 'Hora', '08:00')
      await expectNoHorizontalScroll(page)
      await page.getByRole('button', { name: 'Guardar suplemento' }).click()

      // The detail: «Avisos», no family wording, and marking says only when.
      await expect(page.getByRole('heading', { name: 'Omega 3', level: 1 })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Tus avisos' })).toBeVisible()
      await expect(page.getByText('Se activan en cada dispositivo por separado.')).toBeVisible()
      await expect(page.getByText(/Cada persona de la familia/)).toHaveCount(0)
      await expect(page.getByText('Agregado por')).toHaveCount(0)
      await expectNoHorizontalScroll(page)
      const chip = page.getByRole('button', { name: 'Toma de 08:00', exact: true }).first()
      await chip.click()
      await expect(chip).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByText(/^a las \d\d:\d\d$/).first()).toBeVisible()
      await expect(page.getByText(/por Ana/)).toHaveCount(0)

      // The home now counts it in «Tu día».
      await page.goto('/home')
      const tuDia = page.getByRole('region', { name: 'Tu día' })
      await expect(tuDia.getByText(/^1 de \d+ hoy$/)).toBeVisible()
      await expectNoHorizontalScroll(page)

      // Pausing needs no confirmation; finishing asks first, in its own words, and is for good.
      await tuDia.getByRole('link', { name: 'Ver todo' }).click()
      await expect(page).toHaveURL(/\/mi-dia$/)
      await page.getByRole('region', { name: 'Mis suplementos' }).getByRole('link').filter({ hasText: 'Omega 3' }).click()
      await page.getByRole('button', { name: 'Pausar' }).click()
      await expect(page.getByText('Pausado', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Reanudar' }).click()
      await expect(page.getByText('Activo', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Finalizar suplemento' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Desde hoy no se crean más tomas ni avisos. Las de hoy que no estén marcadas dejan de aparecer.')).toBeVisible()
      await dialog.getByRole('button', { name: 'Finalizar suplemento' }).click()
      await expect(page.getByText(/Terminado el \d+ \w+ · 1 de \d+ tomas/).first()).toBeVisible()
    })

    test('nobody else in the family sees it, reaches it by its address or through the API, and each person has their own', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      const request = page.context().request
      const routine = await personalRoutineViaApi(request, owner.token, owner.accountId, { name: 'Omega privado' })
      const guest = await secondPerson(browser, design)
      await acceptViaApi(guest.context.request, guest.token, await inviteViaApi(request, owner.token, guest.email, 'caregiver'))

      // The owner sees it in «Mi día» (an old «Mis suplementos» address still lands there) and not in the child's.
      await page.goto('/mis-suplementos')
      await expect(page).toHaveURL(/\/mi-dia#suplementos$/)
      await expect(page.getByText('Omega privado').first()).toBeVisible()
      await page.goto(`/children/${owner.childId}`)
      await expect(page.getByRole('main').getByText('Omega privado')).toHaveCount(0)

      // A caregiver of the same family sees nothing of it: not in «Mi día», not by its address, not through the API.
      await guest.page.goto('/mi-dia')
      await expect(guest.page.getByRole('link', { name: 'Agregar mi primer suplemento' })).toBeVisible()
      await expect(guest.page.getByText('Omega privado')).toHaveCount(0)
      await guest.page.goto(`/suplementos/${routine.id}`)
      await expect(guest.page.getByText('No se encontró este suplemento.')).toBeVisible()
      await guest.page.goto('/home')
      await expect(guest.page.getByRole('main').getByText('Omega privado')).toHaveCount(0)

      const headers = { Authorization: `Bearer ${guest.token}` }
      for (const [method, path] of [
        ['GET', `/routines/${routine.id}${windowQuery()}`],
        ['PATCH', `/routines/${routine.id}/doses/${routine.doses[0].id}`],
        ['POST', `/routines/${routine.id}/pause`],
        ['PUT', `/routines/${routine.id}/my-reminders`],
        ['GET', `/accounts/${owner.accountId}/routines${windowQuery()}`],
        ['POST', `/accounts/${owner.accountId}/routines`],
      ] as const) {
        const res = await guest.context.request.fetch(`${API}${path}`, { method, headers, data: method === 'GET' ? undefined : {} })
        expect(res.status(), `${method} ${path}`).toBe(403)
      }

      // The caregiver, invited to a paid family, creates their own with that family's plan; the owner never sees it.
      await guest.page.goto('/mi-dia')
      await guest.page.getByRole('link', { name: 'Agregar mi primer suplemento' }).click()
      await guest.page.getByLabel('Nombre').fill('Magnesio de Luis')
      await pickTime(guest.page, 'Hora', '08:00')
      await guest.page.getByRole('button', { name: 'Guardar suplemento' }).click()
      await expect(guest.page.getByRole('heading', { name: 'Magnesio de Luis', level: 1 })).toBeVisible()
      await page.goto('/mi-dia')
      await expect(page.getByText('Omega privado').first()).toBeVisible()
      await expect(page.getByText('Magnesio de Luis')).toHaveCount(0)
      const rows = await queryDb<{ account_id: string; child_id: string | null }>('SELECT account_id, child_id FROM supplement_routines WHERE name = $1 AND account_id = $2', ['Magnesio de Luis', guest.accountId])
      expect(rows).toEqual([{ account_id: guest.accountId, child_id: null }])
      await guest.context.close()
    })

    test('on the free plan «Mi día» offers the plan; what was created while paid stays, is markable, and only finishing is left', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false, plan: 'free' })
      const request = page.context().request

      await page.goto('/mi-dia')
      await expect(page.getByRole('region', { name: 'Plan completo: Suplementos y actividades' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Agregar mi primer suplemento' })).toHaveCount(0)
      const { day, offset } = localToday()
      const refused = await request.post(`${API}/accounts/${owner.accountId}/routines`, {
        data: { name: 'x', period: 'daily', times: ['08:00'], firstDate: day, utcOffsetMinutes: offset },
        headers: { Authorization: `Bearer ${owner.token}` },
      })
      expect(refused.status()).toBe(422)
      expect((await refused.json()).reason).toBe('supplements')

      await setAccountPlan(owner.accountId, 'paid')
      const routine = await personalRoutineViaApi(request, owner.token, owner.accountId)
      await setAccountPlan(owner.accountId, 'free')
      await page.reload()
      const sups = page.getByRole('region', { name: 'Mis suplementos' })
      await expect(sups.getByRole('button', { name: /Agregar suplementos/ })).toContainText('Plan completo')
      await expect(page.getByRole('link', { name: '+ Agregar suplemento' })).toHaveCount(0)
      const chip = page.getByRole('region', { name: 'Hoy' }).getByRole('button', { name: 'Marcar Omega 3 de las 08:00' })
      await chip.click()
      await expect(chip).toHaveAttribute('aria-pressed', 'true')

      await page.goto(`/suplementos/${routine.id}`)
      await expect(page.getByText('Con el plan gratuito puedes ver y marcar las tomas. Para editar, pausar o reanudar se necesita el plan completo.')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Pausar' })).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Finalizar suplemento' })).toBeVisible()
      await expectNoHorizontalScroll(page)
    })

    test('with 10 active supplements the section explains the cap, which is the person\'s own, and pausing one makes room', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      const request = page.context().request
      const routines = []
      for (let i = 1; i <= 10; i++) routines.push(await personalRoutineViaApi(request, owner.token, owner.accountId, { name: `Suplemento ${i}` }))

      await page.goto('/mi-dia')
      await expect(page.getByText('Ya tienes 10 suplementos activos')).toBeVisible()
      await expect(page.getByRole('link', { name: '+ Agregar suplemento' })).toHaveCount(0)
      await expectNoHorizontalScroll(page)

      await page.goto(`/suplementos/${routines[0].id}`)
      await page.getByRole('button', { name: 'Pausar' }).click()
      await expect(page.getByText('Pausado', { exact: true })).toBeVisible()
      await page.goto('/mi-dia')
      await expect(page.getByRole('link', { name: '+ Agregar suplemento' })).toBeVisible()
    })
  })
}
