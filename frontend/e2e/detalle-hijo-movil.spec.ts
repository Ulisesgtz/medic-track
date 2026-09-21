import { test, expect } from '@playwright/test'
import { seedChild, useAccount } from './helpers'

// Child detail, phone design (mock 02): dark header with the child, the amber
// "Tomas de hoy" block, and the list of consultations. Requires the backend.

test.describe('Detalle del hijo — diseño móvil (mock 02)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('muestra el encabezado, el bloque de tomas de hoy y la lista de consultas', async ({ page, request }) => {
    const { accountId, childId } = await seedChild(request)
    await useAccount(page, accountId)
    await page.goto(`/children/${childId}`)

    await expect(page.getByRole('link', { name: '← Tus hijos' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Mateo Morales' })).toBeVisible()
    await expect(page.getByText(/· 14 mar 2021$/)).toBeVisible()

    const block = page.getByRole('region', { name: 'Tomas de hoy' })
    await expect(block).toContainText('3 sin marcar · Amoxicilina')
    await expect(block.getByRole('button', { name: 'Marcar tomas' })).toBeVisible()

    await expect(page.getByRole('heading', { level: 2, name: 'Consultas' })).toBeVisible()
    await expect(page.getByRole('link', { name: '+ Nueva' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Dra. Laura Cázares/ })).toContainText('Fiebre y tos · 1 medicamento')
    // No sidebar and no web-only pieces on the phone.
    await expect(page.locator('aside')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Nueva consulta' })).toHaveCount(0)
  })

  test('"Marcar tomas" marca todas las de hoy, el bloque pasa a verde y se conserva al recargar', async ({ page, request }) => {
    const { accountId, childId } = await seedChild(request)
    await useAccount(page, accountId)
    await page.goto(`/children/${childId}`)
    const block = page.getByRole('region', { name: 'Tomas de hoy' })

    await block.getByRole('button', { name: 'Marcar tomas' }).click()

    await expect(block).toContainText('0 sin marcar · Amoxicilina')
    await expect(block.getByRole('button', { name: 'Marcar tomas' })).toHaveCount(0)
    await expect(block.locator('div').first()).toHaveClass(/bg-confirmed-soft/)

    await page.reload()
    await expect(block).toContainText('0 sin marcar · Amoxicilina')
    await expect(block.getByRole('button', { name: 'Marcar tomas' })).toHaveCount(0)
  })

  test('los enlaces llevan a donde dice el mock: home, nueva consulta y el detalle de cada consulta', async ({ page, request }) => {
    const { accountId, childId, consultationId } = await seedChild(request)
    await useAccount(page, accountId)
    await page.goto(`/children/${childId}`)

    await page.getByRole('link', { name: '+ Nueva' }).click()
    await expect(page).toHaveURL(new RegExp(`/children/${childId}/consultations/new$`))

    await page.goBack()
    await page.getByRole('link', { name: /Dra. Laura Cázares/ }).click()
    await expect(page).toHaveURL(new RegExp(`/consultations/${consultationId}$`))

    await page.goto(`/children/${childId}`)
    await page.getByRole('link', { name: '← Tus hijos' }).click()
    await expect(page).toHaveURL(/\/home$/)
  })

  test('sin consultas: estado vacío y "Sin tomas hoy"', async ({ page, request }) => {
    const { accountId, childId } = await seedChild(request, { withConsultation: false })
    await useAccount(page, accountId)
    await page.goto(`/children/${childId}`)

    await expect(page.getByText('Todavía no hay consultas registradas.')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Tomas de hoy' })).toContainText('Sin tomas hoy')
    await expect(page.getByRole('button', { name: 'Marcar tomas' })).toHaveCount(0)
  })

  test('es una columna centrada de máximo 430 px, como el mock, sin desborde horizontal', async ({ page, request }) => {
    const { accountId, childId } = await seedChild(request)
    await page.setViewportSize({ width: 700, height: 900 })
    await useAccount(page, accountId)
    await page.goto(`/children/${childId}`)

    const box = await page.getByRole('main').boundingBox()
    expect(Math.round(box!.width)).toBe(430)
    expect(Math.round(box!.x)).toBe(135)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  })
})
