import type { Page } from '@playwright/test'
import {
  PNG_BASE64,
  acceptViaApi,
  allowClerkOn,
  designs,
  expect,
  inviteViaApi,
  secondPerson,
  seedChild,
  test,
  vaccinationViaApi,
  vaccinePhotoViaApi,
} from './helpers'

// specs/046-cartilla-vacunacion: the child's vaccination card with real people, at 390 and 1280 px. The accounts, the invitation
// and the access are the real thing (Clerk dev instance and the backend); only the shortcuts (a dose or a photo made in advance)
// go through the API. Chromium only: nothing here depends on the engine.

const API = 'http://localhost:8080'

/** Nothing sticks out sideways: a phone page must never scroll horizontally. */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0)
}

const authed = (token: string) => ({ Authorization: `Bearer ${token}` })

async function dosesOf(page: Page, token: string, childId: string): Promise<{ id: string; name: string }[]> {
  const res = await page.context().request.get(`${API}/children/${childId}/vaccinations`, { headers: authed(token) })
  expect(res.ok()).toBeTruthy()
  return (await res.json()).vaccinations
}

for (const design of designs) {
  test.describe(`Cartilla de vacunación, ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('a Tutor records, corrects and deletes doses; dates are checked; a repeated dose asks first', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })

      // The child's page has the card that leads to the vaccination card.
      await page.goto(`/children/${owner.childId}`)
      const entry = page.getByRole('main').getByRole('region', { name: 'Cartilla de vacunación' })
      await expect(entry.getByText('Sin vacunas registradas')).toBeVisible()
      await expectNoHorizontalScroll(page)
      await entry.getByRole('link', { name: 'Abrir la cartilla →' }).click()
      await expect(page).toHaveURL(new RegExp(`/children/${owner.childId}/cartilla$`))

      const main = page.getByRole('main')
      await expect(main.getByRole('heading', { name: 'Cartilla de vacunación', level: 1 })).toBeVisible()
      await expect(main.getByText('Lo registrado es lo que tú capturaste. No sustituye la cartilla ni el criterio de tu médico.')).toBeVisible()
      await expect(main.getByText('Aún no hay vacunas registradas')).toBeVisible()
      await expectNoHorizontalScroll(page)

      // A vaccine of the list.
      await main.getByRole('button', { name: '+ Agregar vacuna' }).click()
      const dialog = page.getByRole('dialog', { name: 'Agregar vacuna' })
      await expect(dialog.getByRole('option', { name: 'BCG' })).toBeAttached()
      await expectNoHorizontalScroll(page)
      await dialog.getByLabel('Vacuna', { exact: true }).selectOption({ label: 'BCG' })
      await dialog.getByLabel('Fecha de aplicación').fill('2024-03-14')
      await dialog.getByRole('button', { name: 'Guardar', exact: true }).click()
      await expect(dialog).toHaveCount(0)
      await expect(main.getByRole('heading', { name: 'BCG' })).toBeVisible()

      // One that is not in the list, written by the parent.
      await main.getByRole('button', { name: '+ Agregar vacuna' }).click()
      await dialog.getByLabel('Vacuna', { exact: true }).selectOption({ label: 'Otra…' })
      await dialog.getByLabel('Nombre de la vacuna').fill('Rabia')
      await dialog.getByLabel('Fecha de aplicación').fill('2024-05-02')
      await dialog.getByLabel('Dosis (opcional)').fill('1')
      await dialog.getByRole('button', { name: 'Guardar', exact: true }).click()
      await expect(main.getByRole('heading', { name: 'Rabia' })).toBeVisible()
      await expect(main.getByText(/Dosis 1 · 02 may 2024/)).toBeVisible()

      // The dates are checked and nothing is sent when they don't fit.
      await main.getByRole('button', { name: '+ Agregar vacuna' }).click()
      await dialog.getByLabel('Vacuna', { exact: true }).selectOption({ label: 'BCG' })
      await dialog.getByLabel('Fecha de aplicación').fill('2999-01-01')
      await dialog.getByRole('button', { name: 'Guardar', exact: true }).click()
      await expect(dialog.getByText('La fecha de aplicación no puede ser futura.')).toBeVisible()
      await dialog.getByLabel('Fecha de aplicación').fill('2020-01-01')
      await dialog.getByRole('button', { name: 'Guardar', exact: true }).click()
      await expect(dialog.getByText('La fecha de aplicación no puede ser anterior al nacimiento.')).toBeVisible()
      expect(await dosesOf(page, owner.token, owner.childId)).toHaveLength(2)

      // The same vaccine, dose and date asks first and then saves.
      await dialog.getByLabel('Fecha de aplicación').fill('2024-03-14')
      await dialog.getByRole('button', { name: 'Guardar', exact: true }).click()
      await expect(dialog.getByText('Ya tienes esta vacuna con esta dosis y fecha.')).toBeVisible()
      expect(await dosesOf(page, owner.token, owner.childId)).toHaveLength(2)
      await dialog.getByRole('button', { name: 'Guardar de todos modos' }).click()
      await expect(dialog).toHaveCount(0)
      await expect.poll(async () => (await dosesOf(page, owner.token, owner.childId)).length).toBe(3)

      // Correcting leaves its mark: who and when, the first name only.
      await main.getByRole('button', { name: 'Corregir Rabia del 02 may 2024' }).click()
      const edit = page.getByRole('dialog', { name: 'Corregir vacuna' })
      await edit.getByLabel('Lugar o médico (opcional)').fill('Centro de salud')
      await edit.getByRole('button', { name: 'Guardar', exact: true }).click()
      await expect(main.getByText(/Corregida el \d\d \w{3} \d{4} por Ana/)).toBeVisible()
      await expect(main.getByText(/Centro de salud/)).toBeVisible()
      await expectNoHorizontalScroll(page)

      // Deleting asks first and says it cannot be undone; at the end the card is empty again.
      for (const name of ['Rabia del 02 may 2024', 'BCG del 14 mar 2024', 'BCG del 14 mar 2024']) {
        await main.getByRole('button', { name: `Borrar ${name}` }).first().click()
        const confirm = page.getByRole('dialog', { name: '¿Borrar esta vacuna?' })
        await expect(confirm.getByText('No se puede deshacer')).toBeVisible()
        await confirm.getByRole('button', { name: 'Borrar', exact: true }).click()
        await expect(confirm).toHaveCount(0)
      }
      await expect.poll(async () => (await dosesOf(page, owner.token, owner.childId)).length).toBe(0)
      await expect(main.getByText('Aún no hay vacunas registradas')).toBeVisible()
    })

    test('a Tutor saves, opens and deletes a photo of the card; the reading of a blank image blocks nothing; the eleventh photo is explained', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      await page.goto(`/children/${owner.childId}/cartilla`)
      const main = page.getByRole('main')

      // The picker has no `capture`: the phone offers its library, its camera and its files.
      const input = main.locator('input[type="file"]')
      await expect(input).toHaveAttribute('accept', 'image/*')
      await expect(input).not.toHaveAttribute('capture', /.*/)
      await expect(main.getByText('Aún no hay fotos de la cartilla.')).toBeVisible()
      await input.setInputFiles({ name: 'cartilla.png', mimeType: 'image/png', buffer: Buffer.from(PNG_BASE64, 'base64') })

      // The blank image has no text to read: it says so and the dose can be typed by hand.
      await expect(main.getByText('No encontramos vacunas en la foto. Puedes capturarlas a mano.')).toBeVisible({ timeout: 60_000 })
      await main.getByRole('button', { name: 'Cerrar' }).click()
      await expect(main.getByText(/Guardada por Ana el \d\d \w{3} \d{4}/)).toBeVisible()
      await expect(main.getByRole('button', { name: '+ Agregar vacuna' })).toBeVisible()
      await expectNoHorizontalScroll(page)

      // Open it in full size and close it.
      await main.getByRole('button', { name: /^Abrir/ }).click()
      const viewer = page.getByRole('dialog', { name: 'Foto de la cartilla en tamaño completo' })
      await expect(viewer.getByRole('img')).toBeVisible()
      await viewer.getByRole('button', { name: 'Cerrar' }).click()
      await expect(viewer).toHaveCount(0)

      // Delete it, after the confirmation.
      await main.getByRole('button', { name: /^Borrar · Guardada/ }).click()
      const confirm = page.getByRole('dialog', { name: '¿Borrar esta foto?' })
      await expect(confirm.getByText('No se puede deshacer')).toBeVisible()
      await confirm.getByRole('button', { name: 'Borrar', exact: true }).click()
      await expect(main.getByText('Aún no hay fotos de la cartilla.')).toBeVisible()

      // With the ten photos the card keeps, an eleventh is explained, and the server says the same.
      const request = page.context().request
      for (let i = 0; i < 10; i++) await vaccinePhotoViaApi(request, owner.token, owner.childId)
      await page.reload()
      await expect(page.getByRole('main').getByText('Ya guardaste 10 fotos de esta cartilla. Borra una para guardar otra.')).toBeVisible()
      await expect(page.getByRole('main').getByRole('button', { name: 'Guardar foto de la cartilla' })).toBeDisabled()
      const refused = await request.post(`${API}/children/${owner.childId}/vaccine-card-photos`, { data: { photoBase64: PNG_BASE64 }, headers: authed(owner.token) })
      expect(refused.status()).toBe(422)
    })

    test('a Caregiver sees the card and its photos with no way to write, and the API refuses their writes', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      const request = page.context().request
      const dose = await vaccinationViaApi(request, owner.token, owner.childId)
      const photo = await vaccinePhotoViaApi(request, owner.token, owner.childId)
      const guest = await secondPerson(browser, design)
      await acceptViaApi(guest.context.request, guest.token, await inviteViaApi(request, owner.token, guest.email, 'caregiver'))

      await guest.page.goto(`/children/${owner.childId}/cartilla`)
      const main = guest.page.getByRole('main')
      await expect(main.getByRole('heading', { name: 'BCG' })).toBeVisible()
      await expect(main.getByRole('button', { name: /^Abrir/ })).toBeVisible()
      await expect(main.getByRole('button', { name: '+ Agregar vacuna' })).toHaveCount(0)
      await expect(main.getByRole('button', { name: /^Corregir/ })).toHaveCount(0)
      await expect(main.getByRole('button', { name: /^Borrar/ })).toHaveCount(0)
      await expect(main.getByRole('button', { name: 'Guardar foto de la cartilla' })).toHaveCount(0)
      await expectNoHorizontalScroll(guest.page)

      // Calling the API directly changes nothing: reading is allowed, every write is a 403.
      const headers = authed(guest.token)
      const base = `${API}/children/${owner.childId}`
      expect((await guest.context.request.get(`${base}/vaccinations`, { headers })).status()).toBe(200)
      expect((await guest.context.request.get(`${base}/vaccine-card-photos/${photo.id}`, { headers })).status()).toBe(200)
      const body = { vaccineCode: 'bcg', customName: '', appliedOn: '2024-03-14' }
      expect((await guest.context.request.post(`${base}/vaccinations`, { data: body, headers })).status()).toBe(403)
      expect((await guest.context.request.patch(`${base}/vaccinations/${dose.id}`, { data: body, headers })).status()).toBe(403)
      expect((await guest.context.request.delete(`${base}/vaccinations/${dose.id}`, { headers })).status()).toBe(403)
      expect((await guest.context.request.post(`${base}/vaccine-card-photos`, { data: { photoBase64: PNG_BASE64 }, headers })).status()).toBe(403)
      expect((await guest.context.request.delete(`${base}/vaccine-card-photos/${photo.id}`, { headers })).status()).toBe(403)
      expect(await dosesOf(page, owner.token, owner.childId)).toHaveLength(1)
      await guest.context.close()
    })

    test('someone from another family gets 403 on the card, by the API and by the address', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      const request = page.context().request
      const dose = await vaccinationViaApi(request, owner.token, owner.childId)
      const photo = await vaccinePhotoViaApi(request, owner.token, owner.childId)
      const stranger = await secondPerson(browser, design, { firstName: 'Ajena' })

      const headers = authed(stranger.token)
      const base = `${API}/children/${owner.childId}`
      const body = { vaccineCode: 'bcg', customName: '', appliedOn: '2024-03-14' }
      expect((await stranger.context.request.get(`${base}/vaccinations`, { headers })).status()).toBe(403)
      expect((await stranger.context.request.post(`${base}/vaccinations`, { data: body, headers })).status()).toBe(403)
      expect((await stranger.context.request.delete(`${base}/vaccinations/${dose.id}`, { headers })).status()).toBe(403)
      expect((await stranger.context.request.get(`${base}/vaccine-card-photos`, { headers })).status()).toBe(403)
      expect((await stranger.context.request.get(`${base}/vaccine-card-photos/${photo.id}`, { headers })).status()).toBe(403)

      // The screen shows nothing of it: no doses, no photos.
      await stranger.page.goto(`/children/${owner.childId}/cartilla`)
      await expect(stranger.page.getByRole('heading', { name: 'BCG' })).toHaveCount(0)
      await expect(stranger.page.getByRole('button', { name: /^Abrir/ })).toHaveCount(0)
      await stranger.context.close()
    })
  })
}
