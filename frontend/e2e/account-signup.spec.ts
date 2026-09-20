import { test, expect } from '@playwright/test'
import { designs, fillSignup, uniqueEmail } from './helpers'

// Covers specs/001-registro-cuenta-usuario in both designs: the phone mock
// (01) and the web mock (11). The first child is part of the form (as in the
// mocks); there is no password field yet. Requires the backend running
// locally — this suite is a separate CI gate from the unit-test coverage gate
// (constitution, Principio VI).

for (const design of designs) {
  test.describe(`Registro de cuenta — diseño ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('muestra el diseño de su mock y nunca el del otro', async ({ page }) => {
      await page.goto('/signup')

      await expect(page.getByRole('heading', { level: 1 })).toHaveText('La bitácora médica de tus hijos, en un solo lugar.')
      await expect(page.getByRole('button', { name: 'Crear cuenta' })).toBeVisible()
      // Web mock 11 only: checklist + form title. Phone mock 01 only: its own subtitle.
      const webOnly = page.getByText('El OCR de la receta corre en tu dispositivo.')
      const phoneOnly = page.getByText('Registra, nunca interpreta. Tu pediatra sigue siendo la única autoridad médica.')
      await expect(webOnly).toHaveCount(design.isWeb ? 1 : 0)
      await expect(phoneOnly).toHaveCount(design.isWeb ? 0 : 1)
      await expect(page.getByRole('heading', { level: 2, name: 'Crear cuenta' })).toHaveCount(design.isWeb ? 1 : 0)
      // No password (deliberate deviation until real authentication exists).
      await expect(page.getByLabel(/contraseña/i)).toHaveCount(0)
    })

    test('crear cuenta con su primer hijo lleva al home', async ({ page }) => {
      await page.goto('/signup')
      await fillSignup(page)

      await page.getByRole('button', { name: 'Crear cuenta' }).click()

      // FR-003: a successful signup navigates straight to the home page.
      await expect(page).toHaveURL(/\/home/)
      await expect(page.getByRole('main').getByText('Luis Gómez')).toBeVisible()
    })

    test('no hay forma de agregar un segundo hijo desde el registro (límite del plan gratuito)', async ({ page }) => {
      await page.goto('/signup')

      await expect(page.locator('#children\\.1\\.firstName')).toHaveCount(0)
      await expect(page.getByRole('button', { name: /agregar hijo/i })).toHaveCount(0)
    })

    test('campos obligatorios: muestra todos los errores y no envía la solicitud (FR-001, FR-004)', async ({ page }) => {
      let postCalled = false
      await page.route('**/accounts', async (route) => {
        postCalled = true
        await route.continue()
      })

      await page.goto('/signup')
      await page.getByRole('button', { name: 'Crear cuenta' }).click()

      await expect(page.getByText('El nombre es obligatorio')).toBeVisible()
      await expect(page.getByText('El apellido es obligatorio')).toBeVisible()
      await expect(page.getByText('Escribe un correo válido.')).toBeVisible()
      await expect(page.getByText('El nombre del hijo es obligatorio')).toBeVisible()
      await expect(page.getByText('El apellido del hijo es obligatorio')).toBeVisible()
      await expect(page.getByText('Elige la fecha de nacimiento.')).toBeVisible()
      expect(postCalled).toBe(false)
    })

    test('la fecha de nacimiento futura es rechazada por el servidor (FR-005)', async ({ page }) => {
      await page.goto('/signup')
      const future = new Date()
      future.setFullYear(future.getFullYear() + 1)
      await fillSignup(page, { child: { firstName: 'Luis', lastName: 'Gómez', birthDate: future.toISOString().slice(0, 10) } })

      await page.getByRole('button', { name: 'Crear cuenta' }).click()

      // The date input has no min/max, so this reaches the server, which must
      // reject it: no navigation to /home and the server's message is shown.
      await expect(page.getByRole('alert')).toBeVisible()
      await expect(page).toHaveURL(/\/signup/)
    })

    test('nombre con caracteres no alfabéticos: muestra error y no envía la solicitud', async ({ page }) => {
      let postCalled = false
      await page.route('**/accounts', async (route) => {
        postCalled = true
        await route.continue()
      })

      await page.goto('/signup')
      await fillSignup(page, { firstName: 'Ana123' })
      await page.getByRole('button', { name: 'Crear cuenta' }).click()

      await expect(page.getByText('El nombre solo puede contener letras, espacios, guiones y apóstrofes')).toBeVisible()
      expect(postCalled).toBe(false)
    })

    test('nombre que excede el máximo de 100 caracteres: muestra error y no envía la solicitud', async ({ page }) => {
      let postCalled = false
      await page.route('**/accounts', async (route) => {
        postCalled = true
        await route.continue()
      })

      await page.goto('/signup')
      await fillSignup(page, { firstName: 'a'.repeat(101) })
      await page.getByRole('button', { name: 'Crear cuenta' }).click()

      await expect(page.getByText('El nombre debe tener máximo 100 caracteres')).toBeVisible()
      expect(postCalled).toBe(false)
    })

    test('correo duplicado: el servidor responde 409 y el mensaje se muestra (FR-002)', async ({ page }) => {
      const email = uniqueEmail('dup')

      await page.goto('/signup')
      await fillSignup(page, { email })
      await page.getByRole('button', { name: 'Crear cuenta' }).click()
      await expect(page).toHaveURL(/\/home/)

      // A second account with the exact same email.
      await page.goto('/signup')
      await fillSignup(page, { firstName: 'Otra', lastName: 'Persona', email })
      await page.getByRole('button', { name: 'Crear cuenta' }).click()

      await expect(page.getByText('Este correo ya está en uso.')).toBeVisible()
      await expect(page).toHaveURL(/\/signup/)
    })

    test('elegir un país con estados muestra el selector de estado', async ({ page }) => {
      await page.goto('/signup')

      await expect(page.getByLabel(/Estado/)).toHaveCount(0)
      await page.getByLabel(/País/).selectOption({ label: 'México' })

      await expect(page.getByLabel(/Estado/)).toBeVisible()
    })
  })
}
