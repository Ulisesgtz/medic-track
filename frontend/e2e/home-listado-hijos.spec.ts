import { test, expect } from '@playwright/test'

// Covers quickstart.md Escenarios 2-4 (specs/003-home-listado-hijos): the
// critical MVP flow from signup through the home page and the freemium
// limit. Requires the backend running locally.

// The home's children list is the phone layout: on desktop (sidebar visible)
// /home opens the child's detail instead — see the desktop test at the end.
test.use({ viewport: { width: 390, height: 844 } })

test('crear cuenta → home → ver hijo → recargar → agregar segundo hijo → pop-up freemium', async ({
  page,
}) => {
  await page.goto('/signup')

  await page.getByLabel('Nombre').fill('Ana')
  await page.getByLabel('Apellido').fill('Gómez')
  await page.getByLabel('Correo electrónico').fill(`ana.home.e2e.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`)

  await page.getByRole('main').getByRole('button', { name: 'Agregar hijo' }).click()
  await page.locator('#children\\.0\\.firstName').fill('Luis')
  await page.locator('#children\\.0\\.lastName').fill('Gómez')
  await page.locator('#children\\.0\\.birthDate').fill('2020-01-15')

  await page.getByRole('button', { name: 'Guardar' }).click()

  // FR-003: navigates straight to the home page after signup.
  await expect(page).toHaveURL(/\/home/)
  await expect(page.getByRole('main').getByText('Luis Gómez')).toBeVisible()

  // FR-003/SC-004: reloading keeps showing the same account, no re-signup.
  await page.reload()
  await expect(page.getByRole('main').getByText('Luis Gómez')).toBeVisible()

  // FR-004: adding a 2nd child on a free-plan account hits the freemium limit.
  await page.getByRole('main').getByRole('button', { name: 'Agregar hijo' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.locator('#children\\.0\\.firstName').fill('Hijo Dos')
  await page.locator('#children\\.0\\.lastName').fill('Gómez')
  await page.locator('#children\\.0\\.birthDate').fill('2021-01-01')
  await page.getByRole('button', { name: 'Guardar' }).click()

  await expect(page.getByText(/plan gratuito incluye solo un hijo/i)).toBeVisible()

  // Only the original child is still listed — no second child was created.
  await page.getByRole('button', { name: 'Quedarme con el plan gratuito' }).click()
  await expect(page.getByRole('main').getByText('Luis Gómez')).toBeVisible()
  await expect(page.getByRole('main').getByText('Hijo Dos Gómez')).not.toBeVisible()
})

test('sin cuenta guardada muestra la invitación a crear cuenta (FR-002)', async ({ page }) => {
  await page.goto('/home')

  await expect(page.getByText('Bienvenido a PediTrack')).toBeVisible()
  await page.getByRole('link', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL(/\/signup/)
})

test('click en el nombre de un hijo navega a su pantalla de detalle (FR-005)', async ({ page }) => {
  await page.goto('/signup')

  await page.getByLabel('Nombre').fill('Carla')
  await page.getByLabel('Apellido').fill('Ruiz')
  await page.getByLabel('Correo electrónico').fill(`carla.home.e2e.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`)

  await page.getByRole('main').getByRole('button', { name: 'Agregar hijo' }).click()
  await page.locator('#children\\.0\\.firstName').fill('Mateo')
  await page.locator('#children\\.0\\.lastName').fill('Ruiz')
  await page.locator('#children\\.0\\.birthDate').fill('2019-06-01')
  await page.getByRole('button', { name: 'Guardar' }).click()

  await expect(page).toHaveURL(/\/home/)
  await page.getByRole('main').getByText('Mateo Ruiz').click()

  await expect(page).toHaveURL(/\/children\//)
  // specs/004-detalle-consulta-hijo replaced the placeholder with the real
  // consultations listing for that child.
  // The header now names the child (name · birth date) and titles the screen
  // with their age, so assert on the stable parts.
  await expect(page.getByText('Mateo Ruiz · 01 jun 2019')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nueva consulta' })).toBeVisible()
})

test.describe('escritorio (barra lateral)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('/home abre directo el detalle del hijo (mock "Home con detalle")', async ({ page }) => {
    await page.goto('/signup')
    await page.getByLabel('Nombre').fill('Diana')
    await page.getByLabel('Apellido').fill('Soto')
    await page.getByLabel('Correo electrónico').fill(`diana.desktop.e2e.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`)
    await page.getByRole('main').getByRole('button', { name: 'Agregar hijo' }).click()
    await page.locator('#children\\.0\\.firstName').fill('Omar')
    await page.locator('#children\\.0\\.lastName').fill('Soto')
    await page.locator('#children\\.0\\.birthDate').fill('2021-03-14')
    await page.getByRole('button', { name: 'Guardar' }).click()

    await expect(page).toHaveURL(/\/children\//)
    await expect(page.getByText('Omar Soto · 14 mar 2021')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Nueva consulta' })).toBeVisible()
    // The sidebar lists the child, highlighted as the active one.
    await expect(page.locator('aside').getByRole('link', { name: /^Omar/ })).toHaveAttribute('aria-current', 'page')

    // The sidebar's logo goes "home", which lands on the same detail again.
    await page.locator('aside').getByRole('link', { name: /ir a mi home/ }).click()
    await expect(page).toHaveURL(/\/children\//)
  })
})
