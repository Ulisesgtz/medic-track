import type { Page } from '@playwright/test'
import { acceptViaApi, designs, expect, inviteViaApi, queryDb, secondPerson, seedChild, test } from './helpers'

// specs/073-ficha-del-hijo: the child's permanent record (allergies, blood type, conditions, pediatrician) written by the family and
// seen by whoever cares for the child, in both designs. Requires the backend running locally.

const API = 'http://localhost:8080'

/** The record form: «Empezar la ficha» (or «Editar ficha») opens it; fills what the test is about. */
async function fillRecord(page: Page) {
  await page.getByRole('button', { name: '+ Agregar alergia' }).click()
  await page.locator('#allergies-0-name').fill('Penicilina')
  await page.getByRole('group', { name: 'Alergia 1' }).getByText('Medicamento', { exact: true }).click()
  await page.locator('#allergies-0-note').fill('le salen ronchas')
  await page.getByRole('button', { name: '+ Agregar alergia' }).click()
  await page.locator('#allergies-1-name').fill('Cacahuate')
  await page.getByRole('group', { name: 'Alergia 2' }).getByText('Alimento', { exact: true }).click()
  await page.getByRole('region', { name: 'Tipo de sangre' }).getByText('O+', { exact: true }).click()
  await page.getByRole('button', { name: '+ Agregar padecimiento' }).click()
  await page.locator('#conditions-0-name').fill('Asma')
  await page.locator('#conditions-0-note').fill('usa inhalador en crisis')
  await page.locator('#ped-name').fill('Dra. Ruiz')
  await page.locator('#ped-phone').fill('+52 (33) 1234-5678')
  await page.locator('#ped-office').fill('Torre Médica, piso 4')
}

const save = (page: Page) => page.getByRole('button', { name: 'Guardar', exact: true }).click()

for (const design of designs) {
  test.describe(`Ficha del hijo — diseño ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('la dueña llena la ficha, la ve tal cual, la edita y quita una alergia', async ({ page }) => {
      const { childId } = await seedChild(page, { withConsultation: false })
      await page.goto(`/children/${childId}`)
      const section = page.getByRole('region', { name: 'Ficha', exact: true })
      await expect(section.getByText('Aún no hay ficha')).toBeVisible()
      await section.getByRole('link', { name: 'Empezar la ficha' }).click()
      await expect(page).toHaveURL(new RegExp(`/children/${childId}/ficha/editar$`))
      await expect(page.getByRole('heading', { name: 'Editar ficha', level: 1 })).toBeVisible()

      await fillRecord(page)
      await save(page)
      await expect(page).toHaveURL(new RegExp(`/children/${childId}$`))

      const saved = page.getByRole('region', { name: 'Ficha', exact: true })
      await expect(saved.getByText('Penicilina')).toBeVisible()
      await expect(saved.getByText('le salen ronchas')).toBeVisible()
      await expect(saved.getByText('Cacahuate')).toBeVisible()
      await expect(saved.getByText('O+', { exact: true })).toBeVisible()
      await expect(saved.getByText('Asma')).toBeVisible()
      await expect(saved.getByText('usa inhalador en crisis')).toBeVisible()
      await expect(saved.getByText('Dra. Ruiz')).toBeVisible()
      await expect(saved.getByText('Torre Médica, piso 4')).toBeVisible()
      await expect(saved.getByText(/^Actualizada el \d{1,2} [a-z]{3} \d{4} por Ana$/)).toBeVisible()
      await expect(saved.getByText('Lo anotado es lo que la familia escribió y no sustituye la opinión de su médico.')).toBeVisible()
      // «Llamar»: only digits and a leading «+» go in the `tel:` address.
      await expect(saved.getByRole('link', { name: 'Llamar a Dra. Ruiz' })).toHaveAttribute('href', 'tel:+523312345678')

      // It is what was saved on the server too, not a copy in the page.
      await page.reload()
      await expect(page.getByRole('region', { name: 'Ficha', exact: true }).getByText('Cacahuate')).toBeVisible()

      // Edit: remove the second allergy.
      await page.getByRole('region', { name: 'Ficha', exact: true }).getByRole('link', { name: 'Editar ficha' }).click()
      await expect(page.locator('#allergies-1-name')).toHaveValue('Cacahuate')
      await page.getByRole('button', { name: 'Quitar alergia 2' }).click()
      await expect(page.locator('#allergies-1-name')).toHaveCount(0)
      await save(page)
      const edited = page.getByRole('region', { name: 'Ficha', exact: true })
      await expect(edited.getByText('Penicilina')).toBeVisible()
      await expect(edited.getByText('Cacahuate')).toHaveCount(0)
    })

    test('un Cuidador ve la ficha y llama al pediatra, sin «Editar ficha»', async ({ page, browser }) => {
      const owner = await seedChild(page, { withConsultation: false })
      const request = page.context().request
      const put = await request.put(`${API}/children/${owner.childId}/record`, {
        headers: { Authorization: `Bearer ${owner.token}` },
        data: {
          expectedVersion: 0,
          bloodType: 'A-',
          generalNote: null,
          pediatrician: { name: 'Dr. Soto', phone: '33 9876 5432', office: null },
          allergies: [{ name: 'Polen', kind: 'other', note: null }],
          conditions: [],
        },
      })
      expect(put.status()).toBe(200)
      const guest = await secondPerson(browser, design)
      await acceptViaApi(guest.context.request, guest.token, await inviteViaApi(request, owner.token, guest.email, 'caregiver'))

      await guest.page.goto(`/children/${owner.childId}`)
      const section = guest.page.getByRole('region', { name: 'Ficha', exact: true })
      await expect(section.getByText('Polen')).toBeVisible()
      await expect(section.getByText('Puedes ver la ficha y llamar al pediatra. Solo la familia puede editarla.')).toBeVisible()
      await expect(section.getByRole('link', { name: 'Editar ficha' })).toHaveCount(0)
      await expect(section.getByRole('link', { name: 'Llamar a Dr. Soto' })).toHaveAttribute('href', 'tel:339876543' + '2')

      // The form is not for them.
      await guest.page.goto(`/children/${owner.childId}/ficha/editar`)
      await expect(guest.page.getByText('Solo la familia puede editar la ficha.')).toBeVisible()
      const refused = await guest.context.request.put(`${API}/children/${owner.childId}/record`, {
        headers: { Authorization: `Bearer ${guest.token}` },
        data: { expectedVersion: 1, bloodType: null, generalNote: null, pediatrician: null, allergies: [], conditions: [] },
      })
      expect(refused.status()).toBe(403)
      await guest.context.close()
    })

    test('dos personas editan a la vez: la segunda ve el aviso de conflicto sin perder lo escrito', async ({ page, browser }) => {
      const owner = await seedChild(page, { withConsultation: false })
      const request = page.context().request
      const tutor = await secondPerson(browser, design)
      await acceptViaApi(tutor.context.request, tutor.token, await inviteViaApi(request, owner.token, tutor.email, 'tutor'))

      await page.goto(`/children/${owner.childId}/ficha/editar`)
      await tutor.page.goto(`/children/${owner.childId}/ficha/editar`)
      await page.getByRole('button', { name: '+ Agregar alergia' }).click()
      await page.locator('#allergies-0-name').fill('Mariscos')
      await tutor.page.getByRole('button', { name: '+ Agregar alergia' }).click()
      await tutor.page.locator('#allergies-0-name').fill('Penicilina')

      await save(tutor.page)
      await expect(tutor.page).toHaveURL(new RegExp(`/children/${owner.childId}$`))

      await save(page)
      // Still on the form, with what was typed and a notice that says who saved.
      await expect(page).toHaveURL(new RegExp(`/children/${owner.childId}/ficha/editar$`))
      await expect(page.getByText('Luis guardó cambios en la ficha')).toBeVisible()
      await expect(page.locator('#allergies-0-name')).toHaveValue('Mariscos')

      await page.getByRole('button', { name: 'Ver la versión nueva' }).click()
      const dialog = page.getByRole('dialog', { name: 'Ver la versión nueva' })
      await expect(dialog.getByText('Penicilina')).toBeVisible()
      await dialog.getByRole('button', { name: 'Cerrar' }).click()
      await expect(page.locator('#allergies-0-name')).toHaveValue('Mariscos')

      // Saving now is made on top of the new version and replaces it.
      await save(page)
      await expect(page).toHaveURL(new RegExp(`/children/${owner.childId}$`))
      const section = page.getByRole('region', { name: 'Ficha', exact: true })
      await expect(section.getByText('Mariscos')).toBeVisible()
      await expect(section.getByText('Penicilina')).toHaveCount(0)
      await tutor.context.close()
    })

    test('con 30 alergias la lista llega a su tope y el servidor no deja una más', async ({ page }) => {
      const owner = await seedChild(page, { withConsultation: false })
      const request = page.context().request
      const allergies = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Alergia ${i + 1}`, kind: null, note: null }))
      const body = (n: number) => ({ expectedVersion: 0, bloodType: null, generalNote: null, pediatrician: null, allergies: allergies(n), conditions: [] })
      const headers = { Authorization: `Bearer ${owner.token}` }

      const tooMany = await request.put(`${API}/children/${owner.childId}/record`, { headers, data: body(31) })
      expect(tooMany.status()).toBe(400)
      expect(await tooMany.text()).not.toContain('Alergia 31')
      expect((await request.put(`${API}/children/${owner.childId}/record`, { headers, data: body(30) })).status()).toBe(200)

      await page.goto(`/children/${owner.childId}/ficha/editar`)
      const list = page.getByRole('region', { name: 'Alergias', exact: true })
      await expect(list.getByText('30 de 30')).toBeVisible()
      await expect(list.getByText('Llegaste a 30 alergias, el máximo que guarda la ficha.', { exact: false })).toBeVisible()
      await expect(list.getByRole('button', { name: '+ Agregar alergia' })).toHaveCount(0)
      await expect(list.getByText('y 28 alergias más')).toBeVisible()
      await list.getByRole('button', { name: 'Ver las 30' }).click()
      await expect(page.locator('#allergies-29-name')).toHaveValue('Alergia 30')
    })

    test('el PDF incluye la ficha por omisión y nada de la ficha llega a error_logs', async ({ page }) => {
      const owner = await seedChild(page)
      const request = page.context().request
      const marker = `Zorbacilina${Date.now()}`
      const headers = { Authorization: `Bearer ${owner.token}` }
      const ok = await request.put(`${API}/children/${owner.childId}/record`, {
        headers,
        data: {
          expectedVersion: 0,
          bloodType: 'B+',
          generalNote: `Nota ${marker}`,
          pediatrician: { name: `Dr ${marker}`, phone: '5551234567', office: null },
          allergies: [{ name: marker, kind: 'medication', note: null }],
          conditions: [],
        },
      })
      expect(ok.status()).toBe(200)
      // Errors the server answers with the record's texts around: a conflict (409), a bad field (400) and a bad body (400).
      expect((await request.put(`${API}/children/${owner.childId}/record`, { headers, data: { expectedVersion: 0, allergies: [{ name: marker }], conditions: [] } })).status()).toBe(409)
      expect(
        (await request.put(`${API}/children/${owner.childId}/record`, {
          headers,
          data: { expectedVersion: 1, bloodType: 'XX', generalNote: marker, pediatrician: { name: marker, phone: `${marker}!`, office: null }, allergies: [], conditions: [] },
        })).status(),
      ).toBe(400)
      expect((await request.put(`${API}/children/${owner.childId}/record`, { headers: { ...headers, 'Content-Type': 'application/json' }, data: `{"allergies": "${marker}` })).status()).toBe(400)

      await page.goto(`/children/${owner.childId}/historial`)
      await page.getByRole('button', { name: 'Exportar a PDF' }).click()
      const dialog = page.getByRole('dialog', { name: 'Exportar a PDF' })
      await expect(dialog.getByRole('switch', { name: 'Incluir la ficha' })).toHaveAttribute('aria-checked', 'true')

      const asked = page.waitForRequest((r) => r.url().endsWith(`/children/${owner.childId}/export`) && r.method() === 'POST')
      const answered = page.waitForResponse((r) => r.url().endsWith(`/children/${owner.childId}/export`) && r.request().method() === 'POST')
      await dialog.getByRole('button', { name: 'Generar PDF' }).click()
      expect((await asked).postDataJSON().sections.record).toBe(true)
      const document = await (await answered).json()
      expect(document.record.allergies[0].name).toBe(marker)
      await expect(dialog.getByText('Tu PDF está listo')).toBeVisible({ timeout: 60_000 })

      // Without the switch the request says so and the document has no record.
      await dialog.getByRole('button', { name: 'Cerrar' }).first().click()
      await page.getByRole('button', { name: 'Exportar a PDF' }).click()
      await dialog.getByRole('switch', { name: 'Incluir la ficha' }).click()
      await expect(dialog.getByRole('switch', { name: 'Incluir la ficha' })).toHaveAttribute('aria-checked', 'false')
      const asked2 = page.waitForRequest((r) => r.url().endsWith(`/children/${owner.childId}/export`) && r.method() === 'POST')
      await dialog.getByRole('button', { name: 'Generar PDF' }).click()
      expect((await asked2).postDataJSON().sections.record).toBe(false)

      const rows = await queryDb<{ n: string }>('SELECT count(*) AS n FROM error_logs WHERE message ILIKE $1 OR endpoint ILIKE $1', [`%Zorbacilina%`])
      expect(Number(rows[0].n)).toBe(0)
    })
  })
}
