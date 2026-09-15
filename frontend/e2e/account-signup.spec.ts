import { test, expect } from '@playwright/test'

// Covers quickstart.md Escenarios 1, 2 and 4. Requires the backend running
// locally (see quickstart.md prerequisites) — this suite is a separate CI
// gate from the unit-test coverage gate, per constitution Principio VI.

test.describe('Registro de cuenta de usuario', () => {
  test('Escenario 1 — crear cuenta sin hijos', async ({ page }) => {
    await page.goto('/signup')

    await page.getByLabel('Nombre').fill('Ana')
    await page.getByLabel('Apellido').fill('Gómez')
    await page.getByLabel('Correo electrónico').fill(`ana.e2e.${Date.now()}@example.com`)

    await page.getByRole('button', { name: 'Guardar' }).click()

    await expect(page.getByText('Cuenta creada exitosamente.')).toBeVisible()
  })

  test('Escenario 2 — crear cuenta con un hijo', async ({ page }) => {
    await page.goto('/signup')

    await page.getByLabel('Nombre').fill('Ana')
    await page.getByLabel('Apellido').fill('Gómez')
    await page.getByLabel('Correo electrónico').fill(`ana.e2e.${Date.now()}@example.com`)

    await page.getByRole('button', { name: 'Agregar hijo' }).click()
    await page.locator('#children\\.0\\.firstName').fill('Luis')
    await page.locator('#children\\.0\\.lastName').fill('Gómez')
    await page.locator('#children\\.0\\.birthDate').fill('2020-01-15')

    await page.getByRole('button', { name: 'Guardar' }).click()

    await expect(page.getByText('Cuenta creada exitosamente.')).toBeVisible()
  })

  test('Escenario 4 — pop-up freemium al intentar un segundo hijo, sin crear su formulario', async ({
    page,
  }) => {
    await page.goto('/signup')

    await page.getByLabel('Nombre').fill('Carla')
    await page.getByLabel('Apellido').fill('Ruiz')
    const email = `carla.e2e.${Date.now()}@example.com`
    await page.getByLabel('Correo electrónico').fill(email)

    await page.getByRole('button', { name: 'Agregar hijo' }).click()
    await page.locator('#children\\.0\\.firstName').fill('Hijo1')
    await page.locator('#children\\.0\\.lastName').fill('Ruiz')
    await page.locator('#children\\.0\\.birthDate').fill('2018-01-01')

    // Adding a 2nd child must show the pop-up modal immediately, and must
    // NOT create a second child fieldset (FR-007, revised behavior).
    await page.getByRole('button', { name: 'Agregar hijo' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText(/plan gratuito incluye solo un hijo/i)).toBeVisible()
    await expect(page.locator('#children\\.1\\.firstName')).toHaveCount(0)

    // The tutor and first-child data already entered must not be lost.
    await expect(page.locator('#firstName')).toHaveValue('Carla')
    await expect(page.locator('#children\\.0\\.firstName')).toHaveValue('Hijo1')

    // Closing via "Quedarme con el plan gratuito" dismisses the modal.
    await page.getByRole('button', { name: 'Quedarme con el plan gratuito' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    // Saving with just the one allowed child still works normally.
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText('Cuenta creada exitosamente.')).toBeVisible()
  })

  test('Escenario 4b — el botón "Ver planes" del pop-up freemium redirige', async ({ page }) => {
    await page.goto('/signup')

    await page.getByLabel('Nombre').fill('Diego')
    await page.getByLabel('Apellido').fill('Torres')
    await page.getByLabel('Correo electrónico').fill(`diego.e2e.${Date.now()}@example.com`)

    await page.getByRole('button', { name: 'Agregar hijo' }).click()
    await page.locator('#children\\.0\\.firstName').fill('Hijo1')
    await page.locator('#children\\.0\\.lastName').fill('Torres')
    await page.locator('#children\\.0\\.birthDate').fill('2019-01-01')
    await page.getByRole('button', { name: 'Agregar hijo' }).click()

    await page.getByRole('button', { name: 'Ver planes' }).click()

    await expect(page).toHaveURL(/\/planes/)
  })
})

test.describe('Validaciones del formulario (navegador real)', () => {
  test('campos obligatorios del tutor: muestra error y no envía la solicitud (FR-001)', async ({
    page,
  }) => {
    let postCalled = false
    await page.route('**/accounts', async (route) => {
      postCalled = true
      await route.continue()
    })

    await page.goto('/signup')
    await page.getByRole('button', { name: 'Guardar' }).click()

    await expect(page.getByText('El nombre es obligatorio')).toBeVisible()
    await expect(page.getByText('El apellido es obligatorio')).toBeVisible()
    await expect(page.getByText('El correo es obligatorio')).toBeVisible()
    expect(postCalled).toBe(false)
  })

  test('campos obligatorios de un hijo: nombre/apellido/fecha de nacimiento (FR-004)', async ({
    page,
  }) => {
    await page.goto('/signup')

    await page.getByLabel('Nombre').fill('Ana')
    await page.getByLabel('Apellido').fill('Gómez')
    await page.getByLabel('Correo electrónico').fill(`ana.e2e.${Date.now()}@example.com`)
    await page.getByRole('button', { name: 'Agregar hijo' }).click()

    await page.getByRole('button', { name: 'Guardar' }).click()

    await expect(page.getByText('El nombre del hijo es obligatorio')).toBeVisible()
    await expect(page.getByText('El apellido del hijo es obligatorio')).toBeVisible()
    await expect(page.getByText('La fecha de nacimiento es obligatoria')).toBeVisible()
  })

  test('fecha de nacimiento futura es rechazada por el servidor (FR-005)', async ({ page }) => {
    await page.goto('/signup')

    await page.getByLabel('Nombre').fill('Ana')
    await page.getByLabel('Apellido').fill('Gómez')
    await page.getByLabel('Correo electrónico').fill(`ana.e2e.${Date.now()}@example.com`)

    await page.getByRole('button', { name: 'Agregar hijo' }).click()
    await page.locator('#children\\.0\\.firstName').fill('Luis')
    await page.locator('#children\\.0\\.lastName').fill('Gómez')

    const futureDate = new Date()
    futureDate.setFullYear(futureDate.getFullYear() + 1)
    await page.locator('#children\\.0\\.birthDate').fill(futureDate.toISOString().slice(0, 10))

    await page.getByRole('button', { name: 'Guardar' }).click()

    // The browser's native <input type="date"> min/max isn't set, so this
    // reaches the server, which must reject it (no success message shown).
    await expect(page.getByText('Cuenta creada exitosamente.')).not.toBeVisible()
  })

  test('correo duplicado: el servidor responde 409 y el mensaje se muestra (FR-002)', async ({
    page,
  }) => {
    const email = `ana.dup.e2e.${Date.now()}@example.com`

    await page.goto('/signup')
    await page.getByLabel('Nombre').fill('Ana')
    await page.getByLabel('Apellido').fill('Gómez')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText('Cuenta creada exitosamente.')).toBeVisible()

    // Try to create a second account with the exact same email.
    await page.goto('/signup')
    await page.getByLabel('Nombre').fill('Otra')
    await page.getByLabel('Apellido').fill('Persona')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByRole('button', { name: 'Guardar' }).click()

    await expect(page.getByText('Este correo ya está en uso.')).toBeVisible()
  })
})
