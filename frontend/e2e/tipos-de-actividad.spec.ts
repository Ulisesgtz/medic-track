import type { Page } from '@playwright/test'
import {
  activityViaApi,
  allowClerkOn,
  designs,
  expect,
  personalActivityViaApi,
  pickActivityType,
  pickTime,
  seedChild,
  setAccountPlan,
  test,
} from './helpers'

/** Nothing sticks out sideways: a phone page must never scroll horizontally. */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0)
}

// specs/075-tipos-de-actividad: every activity has a type the parent picks; «Actividades» is one card per type in the catalog's
// order; the type can be changed from the detail with no plan. At 390 and 1280 px, with the real accounts and the real backend.

for (const design of designs) {
  test.describe(`Tipos de actividad, ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('creating without a type does not save and says so next to the field; with one it saves and the section shows its card', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      await page.goto(`/children/${owner.childId}/actividades/nueva`)

      await page.getByLabel('Nombre').fill('Práctica de fut')
      await pickTime(page, 'Desde las', '08:00')
      await pickTime(page, 'Hasta las', '09:00')
      await page.getByLabel('Cantidad').fill('1')
      const group = page.getByRole('group', { name: /Tipo de actividad/ })
      await expect(group.getByRole('radio')).toHaveCount(6)
      for (const radio of await group.getByRole('radio').all()) await expect(radio).not.toBeChecked()

      const save = page.getByRole('button', { name: 'Guardar actividad' })
      await expect(save).toBeEnabled()
      await save.click()
      await expect(group.getByText('Elige el tipo de actividad.')).toBeVisible()
      await expect(page.getByLabel('Nombre')).toHaveValue('Práctica de fut')
      await expect(page).toHaveURL(/\/actividades\/nueva$/)
      await expectNoHorizontalScroll(page)

      await pickActivityType(page, 'Deportiva')
      await expect(group.getByRole('radio', { name: 'Deportiva' })).toBeChecked()
      await save.click()
      await expect(page.getByRole('heading', { name: 'Práctica de fut', level: 1 })).toBeVisible()
      await expect(page.getByText('Deportiva', { exact: true })).toBeVisible()

      await page.goto(`/children/${owner.childId}`)
      const card = page.getByRole('main').getByRole('region', { name: 'Deportiva' })
      await expect(card.getByRole('heading', { name: 'Deportiva', level: 3 })).toBeVisible()
      await expect(card.getByText('1 actividad', { exact: true })).toBeVisible()
      await expect(card.getByRole('link', { name: /Práctica de fut/ })).toBeVisible()
      await expectNoHorizontalScroll(page)
    })

    test('three types make three cards in the order of the catalog, with no empty one, and «Hoy» has no segments', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      const request = page.context().request
      await activityViaApi(request, owner.token, owner.childId, { name: 'Lavarse los dientes', activityType: 'habits' })
      await activityViaApi(request, owner.token, owner.childId, { name: 'Tarea de inglés', activityType: 'school' })
      await activityViaApi(request, owner.token, owner.childId, { name: 'Práctica de fut', activityType: 'sports' })
      await activityViaApi(request, owner.token, owner.childId, { name: 'Tomar agua', activityType: 'habits' })
      await page.goto(`/children/${owner.childId}`)

      const main = page.getByRole('main')
      const titles = main.locator('section[aria-labelledby] h3')
      await expect(titles).toHaveText(['Escolar', 'Deportiva', 'Hábitos y cuidado diario'])
      await expect(main.getByRole('region', { name: 'Hábitos y cuidado diario' }).getByText('2 actividades', { exact: true })).toBeVisible()
      await expect(main.getByRole('region', { name: 'Terapia y seguimiento' })).toHaveCount(0)
      await expect(main.getByRole('link', { name: '+ Agregar actividad' })).toBeVisible()
      await expectNoHorizontalScroll(page)

      // «Hoy» keeps its own rows: no segment titles in it.
      const today = main.getByRole('region', { name: 'Hoy' })
      await expect(today.getByRole('heading', { level: 3, name: /Escolar|Deportiva|Hábitos/ })).toHaveCount(0)
    })

    test('with the plan lapsed the type is changed from the detail and the activity moves to the other card', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      const request = page.context().request
      const activity = await activityViaApi(request, owner.token, owner.childId, { name: 'Práctica de fut', activityType: 'habits' })
      await setAccountPlan(owner.accountId, 'free')

      await page.goto(`/actividades/${activity.id}`)
      await expect(page.getByText(/^Tu plan completo venció\./)).toBeVisible()
      await expect(page.getByRole('link', { name: 'Ver el plan completo →' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Pausar' })).toHaveCount(0)
      await expect(page.getByRole('term').first()).toHaveText('Tipo')

      await page.getByRole('button', { name: 'Cambiar el tipo de actividad, ahora Hábitos y cuidado diario' }).click()
      const dialog = page.getByRole('dialog', { name: 'Tipo de actividad' })
      await expect(dialog.getByText('Elige un tipo · Actual: Hábitos y cuidado diario')).toBeVisible()
      await expect(dialog.getByText('Solo organiza la lista. No cambia los horarios ni los avisos.')).toBeVisible()
      await expect(dialog.getByRole('radio', { name: 'Hábitos y cuidado diario' })).toBeChecked()
      await dialog.locator('label', { hasText: /^Deportiva$/ }).click()
      await dialog.getByRole('button', { name: 'Guardar' }).click()
      await expect(dialog).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Cambiar el tipo de actividad, ahora Deportiva' })).toBeVisible()

      await page.goto(`/children/${owner.childId}`)
      const main = page.getByRole('main')
      await expect(main.locator('section[aria-labelledby] h3')).toHaveText(['Deportiva'])
      await expect(main.getByRole('region', { name: 'Deportiva' }).getByRole('link', { name: /Práctica de fut/ })).toBeVisible()
    })

    test('the person’s own page groups their activities by type too', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      const request = page.context().request
      await personalActivityViaApi(request, owner.token, owner.accountId, { name: 'Salir a correr', activityType: 'sports' })
      await personalActivityViaApi(request, owner.token, owner.accountId, { name: 'Leer', activityType: 'habits' })
      await page.goto('/yo')

      const main = page.getByRole('main')
      await expect(main.locator('section[aria-labelledby] h3')).toHaveText(['Deportiva', 'Hábitos y cuidado diario'])
      await expect(main.getByRole('region', { name: 'Deportiva' }).getByRole('link', { name: /Salir a correr/ })).toBeVisible()
      await expectNoHorizontalScroll(page)
    })

    test('without activities the section shows the dashed empty box and no segments', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      await page.goto(`/children/${owner.childId}`)
      const main = page.getByRole('main')
      await expect(main.getByText('Aún no hay actividades')).toBeVisible()
      await expect(main.getByText('Agrega rutinas, deportes, terapias o hábitos de Mateo para llevar su registro.')).toBeVisible()
      await expect(main.locator('section[aria-labelledby] h3')).toHaveCount(0)
    })
  })
}
