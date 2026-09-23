import { createClerkUser } from './clerkApi'
import { test, expect, allowClerkOn, designs, E2E_PASSWORD, seedAccount, seedChild, uniqueEmail } from './helpers'

// specs/008-autenticacion-cuenta: login and logout through the real forms, and the guarantee that a
// session only reaches its own account's data (T058/T059). Same requirements as the signup suite:
// backend running, Clerk's development instance, `+clerk_test` addresses.

const API = 'http://localhost:8080'
const INVALID_CREDENTIALS = 'El correo o la contraseña no son correctos'

for (const design of designs) {
  test.describe(`Autenticación — diseño ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test.beforeEach(async ({ page }) => {
      await allowClerkOn(page)
    })

    test('cerrar sesión y volver a entrar con correo y contraseña lleva al home', async ({ page }) => {
      const { email } = await seedAccount(page, [{ firstName: 'Luis', lastName: 'Gómez', birthDate: '2020-01-15' }])
      await page.goto('/home')
      await expect(page.getByRole('main').getByText('Luis Gómez')).toBeVisible()

      await page.getByRole('button', { name: 'Cerrar sesión' }).first().click()
      await expect(page).toHaveURL(/\/login/)

      // Signed out: the home is no longer reachable.
      await page.goto('/home')
      await expect(page).toHaveURL(/\/login/)

      await page.getByLabel('Correo').fill(email)
      await page.getByLabel('Contraseña', { exact: true }).fill(E2E_PASSWORD)
      await page.getByRole('button', { name: 'Iniciar sesión' }).click()

      await expect(page).toHaveURL(/\/home/, { timeout: 15_000 })
      await expect(page.getByRole('main').getByText('Luis Gómez')).toBeVisible()
    })

    test('contraseña incorrecta y correo sin cuenta muestran el mismo mensaje (FR-009)', async ({ page }) => {
      const email = uniqueEmail('login')
      await createClerkUser(email)

      await page.goto('/login')
      await page.getByLabel('Correo').fill(email)
      await page.getByLabel('Contraseña', { exact: true }).fill('OtraContraseña-9!')
      await page.getByRole('button', { name: 'Iniciar sesión' }).click()
      await expect(page.getByRole('alert')).toContainText(INVALID_CREDENTIALS)
      const wrongPassword = await page.getByRole('alert').innerText()

      await page.getByLabel('Correo').fill(uniqueEmail('nadie'))
      await page.getByRole('button', { name: 'Iniciar sesión' }).click()
      await expect(page.getByRole('alert')).toHaveText(wrongPassword)
      await expect(page).toHaveURL(/\/login/)
    })

    test('campos vacíos: pide correo y contraseña sin llamar a Clerk', async ({ page }) => {
      await page.goto('/login')
      await page.getByRole('button', { name: 'Iniciar sesión' }).click()

      await expect(page.getByText('Escribe un correo válido.')).toBeVisible()
      await expect(page.getByText('Escribe tu contraseña.')).toBeVisible()
    })

    test('una sesión no puede leer ni escribir en la cuenta de otra persona', async ({ page, browser }) => {
      const owner = await seedChild(page)

      // A second tutor, in their own browser: a different session, a different account.
      const otherContext = await browser.newContext({ viewport: design.viewport })
      const otherPage = await otherContext.newPage()
      await allowClerkOn(otherPage)
      const other = await seedAccount(otherPage, [{ firstName: 'Sofía', lastName: 'Ruiz', birthDate: '2022-05-05' }])

      const headers = { Authorization: `Bearer ${other.token}` }
      const request = otherContext.request
      const foreignRoutes = [
        `/accounts/${owner.accountId}`,
        `/children/${owner.childId}/consultations`,
        `/children/${owner.childId}/overview?from=2026-01-01T00:00:00Z&to=2026-12-31T00:00:00Z`,
        `/consultations/${owner.consultationId}`,
      ]
      for (const path of foreignRoutes) {
        const res = await request.get(`${API}${path}`, { headers })
        expect(res.status(), `GET ${path}`).toBe(403)
      }
      const add = await request.post(`${API}/accounts/${owner.accountId}/children`, {
        headers,
        data: { firstName: 'Intruso', lastName: 'Ruiz', birthDate: '2023-01-01' },
      })
      expect(add.status()).toBe(403)

      // No session at all: 401, not a peek at the data.
      const anonymous = await request.get(`${API}/accounts/${owner.accountId}`)
      expect(anonymous.status()).toBe(401)

      // In the app, the other tutor pointing the browser at the owner's child sees nothing of it.
      await otherPage.goto(`/children/${owner.childId}`)
      await expect(otherPage.getByText('Mateo Morales')).toHaveCount(0)
      await expect(otherPage.getByText('Fiebre y tos')).toHaveCount(0)

      // The owner's data is untouched and still theirs.
      const mine = await page.context().request.get(`${API}/accounts/${owner.accountId}`, {
        headers: { Authorization: `Bearer ${owner.token}` },
      })
      expect(mine.status()).toBe(200)
      expect((await mine.json()).children).toHaveLength(1)

      await otherContext.close()
    })

  })
}
