import { test, expect } from '@playwright/test'
import { designs, fillSignup, signUp, uniqueEmail } from './helpers'

// Covers specs/003-home-listado-hijos in both designs: the phone home (mock 02
// list) and the web home (mock 15 "Hola, Ana / Tus hijos", with the sidebar).
// Requires the backend running locally.

for (const design of designs) {
  test.describe(`Home — diseño ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    const addChildButton = (page: import('@playwright/test').Page) =>
      page.getByRole('main').getByRole('button', { name: design.isWeb ? 'Agregar hijo' : '+ Agregar hijo' })

    test('crear cuenta → home → recargar conserva la sesión → "Agregar hijo" muestra el límite del plan gratuito', async ({
      page,
    }) => {
      await signUp(page)

      await expect(page.getByRole('main').getByText('Luis Gómez')).toBeVisible()
      if (design.isWeb) {
        await expect(page.getByText('Hola, Ana')).toBeVisible()
        await expect(page.getByRole('heading', { level: 1, name: 'Tus hijos' })).toBeVisible()
        await expect(page.getByText('Tu plan incluye un hijo')).toBeVisible()
        // The web card (mock 15) is plain: no status chips.
        await expect(page.getByText('0 consultas')).toHaveCount(0)
      } else {
        await expect(page.getByText('Hola, Ana')).toBeVisible()
        await expect(page.getByRole('heading', { level: 1, name: 'Tus hijos' })).toBeVisible()
        await expect(page.getByText('El plan gratuito incluye un hijo.')).toBeVisible()
        // Board screen 2: the child's card carries its status chips.
        await expect(page.getByText('0 consultas')).toBeVisible()
        await expect(page.getByText('Sin tomas pendientes')).toBeVisible()
      }

      // FR-003/SC-004: reloading keeps showing the same account, no re-signup.
      await page.reload()
      await expect(page.getByRole('main').getByText('Luis Gómez')).toBeVisible()

      // FR-004: on the free plan with a child already registered, the limit pop-up
      // appears right away (mocks 05/15) — no form to fill first.
      await addChildButton(page).click()
      const dialog = page.getByRole('dialog', { name: 'Llegaste a un hijo registrado' })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText('Plan gratuito')).toBeVisible()
      await expect(dialog.getByText(/Para dar de alta a otro hijo necesitas ampliar tu plan/)).toBeVisible()
      // Wide layouts name the existing child; the phone one doesn't (mocks 15 vs 05).
      await expect(dialog.getByText('Luis sigue disponible sin cambios')).toHaveCount(design.isWeb ? 1 : 0)
      // Focus starts on "Ver planes".
      await expect(dialog.getByRole('button', { name: 'Ver planes' })).toBeFocused()

      // "Entendido" closes it; only the original child is listed.
      await dialog.getByRole('button', { name: 'Entendido' }).click()
      await expect(dialog).toBeHidden()
      await expect(page.getByRole('main').getByText('Luis Gómez')).toBeVisible()
    })

    test('el pop-up del plan gratuito se cierra con Escape y "Ver planes" abre /planes', async ({ page }) => {
      await signUp(page)
      await addChildButton(page).click()
      const dialog = page.getByRole('dialog', { name: 'Llegaste a un hijo registrado' })
      await expect(dialog).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()

      await addChildButton(page).click()
      await page.getByRole('button', { name: 'Ver planes' }).click()
      await expect(page).toHaveURL(/\/planes/)
    })

    test('cuenta sin hijos: el modal "Agregar hijo" (mock 7) guarda al hijo y el siguiente ya topa con el límite', async ({
      page,
      request,
    }) => {
      const res = await request.post('http://localhost:8080/accounts', {
        data: { firstName: 'Ana', lastName: 'Gómez', email: uniqueEmail('vacia'), children: [] },
      })
      const account = await res.json()
      await page.addInitScript((id) => localStorage.setItem('peditrack.accountId', id), account.id)
      await page.goto('/home')
      await expect(page.getByText(/todavía no tienes hijos/i)).toBeVisible()

      await addChildButton(page).click()
      const dialog = page.getByRole('dialog', { name: 'Agregar hijo' })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText('Se guarda en tu cuenta, no se comparte.')).toBeVisible()
      await expect(dialog.getByLabel('Nombre')).toBeFocused()

      // Every way out works and leaves the home as it was.
      await dialog.getByRole('button', { name: 'Cancelar' }).click()
      await expect(dialog).toBeHidden()
      await addChildButton(page).click()
      await dialog.getByRole('button', { name: 'Cerrar' }).click()
      await expect(dialog).toBeHidden()
      await addChildButton(page).click()
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()

      // Saving with nothing typed shows the errors and keeps the modal open.
      await addChildButton(page).click()
      await dialog.getByRole('button', { name: 'Guardar' }).click()
      await expect(dialog.getByText('El nombre del hijo es obligatorio')).toBeVisible()
      await expect(dialog.getByText('La fecha de nacimiento es obligatoria')).toBeVisible()

      await dialog.getByLabel('Nombre').fill('Sofía')
      await dialog.getByLabel('Apellido').fill('Morales')
      await dialog.getByLabel('Fecha de nacimiento').fill('2025-07-01')
      await dialog.getByRole('button', { name: 'Guardar' }).click()
      await expect(dialog).toBeHidden()
      await expect(page.getByRole('main').getByText('Sofía Morales')).toBeVisible()

      // On the free plan the next one is refused with the plan pop-up.
      await addChildButton(page).click()
      await expect(page.getByRole('dialog', { name: 'Llegaste a un hijo registrado' })).toBeVisible()
    })

    test('sin cuenta guardada muestra la invitación a crear cuenta (FR-002)', async ({ page }) => {
      await page.goto('/home')

      await expect(page.getByText('Bienvenido a PediTrack')).toBeVisible()
      await page.getByRole('link', { name: 'Crear cuenta' }).click()
      await expect(page).toHaveURL(/\/signup/)
    })

    test('click en un hijo abre su pantalla de detalle (FR-005)', async ({ page }) => {
      await page.goto('/signup')
      await fillSignup(page, {
        firstName: 'Carla',
        lastName: 'Ruiz',
        email: uniqueEmail('carla'),
        child: { firstName: 'Mateo', lastName: 'Ruiz', birthDate: '2019-06-01' },
      })
      await page.getByRole('button', { name: 'Crear cuenta' }).click()
      await expect(page).toHaveURL(/\/home/)

      await page.getByRole('main').getByText('Mateo Ruiz').click()

      await expect(page).toHaveURL(/\/children\//)
      await expect(page.getByRole('link', { name: 'Nueva consulta' }).or(page.getByRole('link', { name: '+ Nueva' }))).toBeVisible()
      // Phone (mock 02): the child's name in the dark header. Web (board 6): "name · date" over the age.
      if (design.isWeb) {
        await expect(page.getByText('Mateo Ruiz · 01 jun 2019')).toBeVisible()
      } else {
        await expect(page.getByRole('heading', { level: 1, name: 'Mateo Ruiz' })).toBeVisible()
        await expect(page.getByRole('link', { name: '← Tus hijos' })).toBeVisible()
      }
    })
  })
}

test.describe('barra lateral (solo web)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('lista al hijo con su edad, lo marca activo en su detalle y el logo vuelve al home', async ({ page }) => {
    await signUp(page, { child: { firstName: 'Omar', lastName: 'Soto', birthDate: '2021-03-14' } })

    // On the home nothing is active; the sidebar lists first names.
    const sidebar = page.locator('aside')
    await expect(sidebar.getByRole('link', { name: /^Omar/ })).toBeVisible()
    await expect(sidebar.getByRole('button', { name: '+ Agregar hijo' })).toBeVisible()

    await sidebar.getByRole('link', { name: /^Omar/ }).click()
    await expect(page).toHaveURL(/\/children\//)
    await expect(page.locator('aside').getByRole('link', { name: /^Omar/ })).toHaveAttribute('aria-current', 'page')

    // The sidebar's logo goes "home" — the list of children (web mock 15), not the detail.
    await page.locator('aside').getByRole('link', { name: /ir a mi home/ }).click()
    await expect(page).toHaveURL(/\/home/)
    await expect(page.getByRole('heading', { level: 1, name: 'Tus hijos' })).toBeVisible()
  })
})

test.describe('móvil: sin barra lateral', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('no hay barra lateral en ninguna pantalla con sesión', async ({ page }) => {
    await signUp(page)
    await expect(page.locator('aside')).toHaveCount(0)

    await page.getByRole('main').getByText('Luis Gómez').click()
    await expect(page).toHaveURL(/\/children\//)
    await expect(page.locator('aside')).toHaveCount(0)
  })
})
