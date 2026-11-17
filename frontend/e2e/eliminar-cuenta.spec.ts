import { acceptViaApi, allowClerkOn, designs, expect, inviteViaApi, secondPerson, seedChild, test } from './helpers'

// specs/070-eliminar-cuenta-y-datos: download all the data, ask for the deletion (the app pauses), cancel it, and a family's
// Tutor who is told the owner asked to delete her account. Every flow at 390 and 1280 px; Chromium only.

const API = 'http://localhost:8080'

for (const design of designs) {
  test.describe(`Eliminar cuenta, ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('downloads all my data as a ZIP from «Mi cuenta»', async ({ page }) => {
      await allowClerkOn(page)
      await seedChild(page)
      await page.goto('/home')
      await expect(page.getByRole('link', { name: /Mi cuenta/ }).first()).toHaveAttribute('href', '/cuenta')
      await page.goto('/cuenta')
      await expect(page.getByRole('heading', { name: 'Mi cuenta', level: 1 })).toBeVisible()

      const download = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Descargar mis datos' }).click()
      const file = await download
      expect(file.suggestedFilename()).toMatch(/\.zip$/)
      const path = await file.path()
      const { readFile } = await import('node:fs/promises')
      const bytes = await readFile(path)
      expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK')
    })

    test('asks for the deletion, the app pauses, the API refuses the rest, and canceling brings everything back', async ({ page }) => {
      await allowClerkOn(page)
      const seed = await seedChild(page)
      await page.goto('/cuenta/eliminar')

      const submit = page.getByRole('button', { name: 'Eliminar mi cuenta' })
      await expect(submit).toBeDisabled()
      await page.getByLabel('Escribe ELIMINAR para confirmar').fill('ELIMINAR')
      await expect(submit).toBeEnabled()
      await submit.click()

      await expect(page.getByRole('heading', { level: 1, name: /Tu cuenta se borrará el \d{1,2} de \w+ de \d{4}/ })).toBeVisible({ timeout: 20_000 })
      await expect(page.getByRole('button', { name: 'Descargar mis datos' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()

      // Every other route of the API is refused while the deletion is pending.
      const refused = await page.context().request.get(`${API}/children/${seed.childId}/consultations`, {
        headers: { Authorization: `Bearer ${seed.token}` },
      })
      expect(refused.status()).toBe(409)
      expect((await refused.json()).error).toBe('account_deletion_pending')

      // Still on the paused screen after a reload, and the data can still be downloaded.
      await page.reload()
      await expect(page.getByRole('heading', { level: 1, name: /Tu cuenta se borrará el/ })).toBeVisible()
      const download = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Descargar mis datos' }).click()
      expect((await download).suggestedFilename()).toMatch(/\.zip$/)

      await page.getByRole('button', { name: 'Cancelar la eliminación' }).click()
      await expect(page).toHaveURL(/\/home$/, { timeout: 20_000 })
      await expect(page.getByText('Listo, tu cuenta sigue igual.')).toBeVisible({ timeout: 20_000 })
      await expect(page.getByRole('heading', { level: 1, name: /Tu cuenta se borrará el/ })).toHaveCount(0)
      await expect(page.getByRole('main').getByRole('link', { name: 'Ver detalle de Mateo' })).toBeVisible()

      const ok = await page.context().request.get(`${API}/children/${seed.childId}/consultations`, {
        headers: { Authorization: `Bearer ${seed.token}` },
      })
      expect(ok.status()).toBe(200)
    })

    test("a Tutor is told the owner asked to delete her account, can still mark and download the children's data", async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page)
      const guest = await secondPerson(browser, design, { firstName: 'Luis' })
      await acceptViaApi(guest.context.request, guest.token, await inviteViaApi(page.context().request, owner.token, guest.email))

      const asked = await page.context().request.post(`${API}/accounts/${owner.accountId}/deletion`, {
        data: { confirm: 'ELIMINAR' },
        headers: { Authorization: `Bearer ${owner.token}` },
      })
      expect(asked.ok(), `deletion -> ${asked.status()} ${await asked.text()}`).toBeTruthy()

      await guest.page.goto('/home')
      await expect(guest.page.getByText(/Ana pidió eliminar su cuenta\. Mateo dejará de aparecer el/)).toBeVisible({ timeout: 20_000 })

      // The Tutor still marks a dose.
      await guest.page.goto(`/consultations/${owner.consultationId}`)
      const chip = guest.page.getByRole('button', { name: 'Toma de 08:00', exact: true })
      await chip.click()
      await expect(chip).toHaveAttribute('aria-pressed', 'true')

      // And downloads the children's data.
      await guest.page.goto('/home')
      const download = guest.page.waitForEvent('download')
      await guest.page.getByRole('button', { name: 'Descargar sus datos' }).click()
      const file = await download
      const { readFile } = await import('node:fs/promises')
      const bytes = await readFile(await file.path())
      expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK')
      await guest.context.close()
    })
  })
}
