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

  test('Escenario 4 — banner freemium al agregar un segundo hijo, sin perder datos', async ({
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

    // Adding the 2nd child must show the banner immediately, before saving.
    await page.getByRole('button', { name: 'Agregar hijo' }).click()
    await expect(page.getByText(/plan gratuito incluye solo un hijo/i)).toBeVisible()

    await page.locator('#children\\.1\\.firstName').fill('Hijo2')
    await page.locator('#children\\.1\\.lastName').fill('Ruiz')
    await page.locator('#children\\.1\\.birthDate').fill('2021-01-01')

    await page.getByRole('button', { name: 'Guardar' }).click()

    // The server rejects the save (422), and the banner stays visible while
    // no data is lost from the form (FR-007).
    await expect(page.getByText(/plan gratuito incluye solo un hijo/i)).toBeVisible()
    await expect(page.locator('#firstName')).toHaveValue('Carla')
    await expect(page.locator('#children\\.0\\.firstName')).toHaveValue('Hijo1')
    await expect(page.locator('#children\\.1\\.firstName')).toHaveValue('Hijo2')
  })
})
