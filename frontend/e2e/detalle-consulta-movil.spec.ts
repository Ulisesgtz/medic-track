import { test, expect, seedChild } from './helpers'

// Consultation detail, phone design (specs/056, «Detalle de la consulta PediTrack.dc.html»): the common header, the treatment first
// (a week of the calendar, «Tomas de hoy» and each medication with its doses), the next appointment and «Datos de la consulta»,
// folded. Requires the backend running locally.

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const todayShort = () => {
  const now = new Date()
  return `${String(now.getDate()).padStart(2, '0')} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`
}

test.describe('Detalle de consulta — diseño móvil (specs/056)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('el tratamiento va primero: el encabezado, la semana, las tomas de hoy y luego los datos plegados', async ({ page }) => {
    const { consultationId } = await seedChild(page)
    await page.goto(`/consultations/${consultationId}`)
    const main = page.getByRole('main')

    await expect(main.getByRole('link', { name: '← Mateo' })).toBeVisible()
    await expect(main.getByText(todayShort(), { exact: true })).toBeVisible()
    await expect(main.getByRole('heading', { level: 1, name: 'Dra. Laura Cázares' })).toBeVisible()
    await expect(main.getByRole('link', { name: 'Editar consulta' })).toBeVisible()

    const treatment = main.getByRole('region', { name: 'Tratamiento' })
    const calendar = main.getByRole('region', { name: 'Calendario del tratamiento' })
    await expect(calendar.getByRole('button', { name: 'Ver mes' })).toHaveAttribute('aria-expanded', 'false')
    await expect(main.getByRole('heading', { level: 3, name: 'Tomas de hoy' })).toBeVisible()
    await expect(main.getByRole('heading', { level: 3, name: 'Amoxicilina' })).toBeVisible()
    await expect(main.getByText('c/8 h · 1 día · primera toma 00:00')).toBeVisible()
    for (const time of ['00:00', '08:00', '16:00']) await expect(main.getByRole('button', { name: `Toma de ${time}` })).toBeVisible()

    // The data come after the treatment, folded, with their summary; opening them shows the notes.
    const data = main.getByRole('region', { name: 'Datos de la consulta' })
    const toggle = data.getByRole('button', { name: /Datos de la consulta/ })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle).toContainText('Foto · notas')
    expect((await treatment.boundingBox())!.y).toBeLessThan((await data.boundingBox())!.y)
    await toggle.click()
    await expect(data.getByText('Fiebre y tos', { exact: true })).toBeVisible()

    // Phone only: no sidebar and no solid «Nueva consulta» (the frequent action is marking).
    await expect(page.locator('aside')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Nueva consulta' })).toHaveCount(0)
  })

  test('las tomas van agrupadas en Mañana, Tarde y Noche (specs/015)', async ({ page }) => {
    const { consultationId } = await seedChild(page)
    await page.goto(`/consultations/${consultationId}`)

    await expect(page.getByRole('group', { name: 'Mañana' }).getByRole('button', { name: 'Toma de 08:00' })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Tarde' }).getByRole('button', { name: 'Toma de 16:00' })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Noche' }).getByRole('button', { name: 'Toma de 00:00' })).toBeVisible()
  })

  test('«Ver mes» abre el mes y «Ver semana» vuelve a la semana', async ({ page }) => {
    const { consultationId } = await seedChild(page)
    await page.goto(`/consultations/${consultationId}`)
    const calendar = page.getByRole('region', { name: 'Calendario del tratamiento' })

    await calendar.getByRole('button', { name: 'Ver mes' }).click()
    await expect(calendar.getByRole('button', { name: 'Ver semana' })).toHaveAttribute('aria-expanded', 'true')
    await calendar.getByRole('button', { name: 'Ver semana' }).click()
    await expect(calendar.getByRole('button', { name: 'Ver mes' })).toBeVisible()
  })

  test('la barra de progreso sube al marcar una toma, sin recargar (specs/014)', async ({ page }) => {
    const { consultationId } = await seedChild(page)
    await page.goto(`/consultations/${consultationId}`)
    const bar = page.getByRole('progressbar', { name: 'Progreso de las tomas' })
    await expect(page.getByText('0 de 3 tomas')).toBeVisible()
    await expect(bar).toHaveAttribute('aria-valuenow', '0')

    await page.getByRole('button', { name: 'Toma de 16:00' }).click()

    await expect(page.getByText('1 de 3 tomas')).toBeVisible()
    await expect(bar).toHaveAttribute('aria-valuenow', '1')
    await expect(bar).toHaveAttribute('aria-valuetext', /^1 de 3 tomas registradas/)
  })

  test('cada toma alterna entre marcada y sin marcar, dice quién la marcó y se conserva al recargar', async ({ page }) => {
    const { consultationId } = await seedChild(page)
    await page.goto(`/consultations/${consultationId}`)
    // 16:00: never "sin registrar" during its own day (its next dose is at midnight), whatever time the suite runs.
    const toggle = page.getByRole('button', { name: 'Toma de 16:00' })
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(toggle).toHaveText('Marcar')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(toggle).toHaveText(/^✓ \d\d:\d\d · por Ana$/) // who marked it (specs/032): the account that is signed in
    await expect(toggle).toHaveClass(/bg-confirmed-soft/)

    await page.reload()
    await expect(page.getByRole('button', { name: 'Toma de 16:00' })).toHaveAttribute('aria-pressed', 'true')

    // The session's own mark is taken back with the same button.
    await page.getByRole('button', { name: 'Toma de 16:00' }).click()
    await expect(page.getByRole('button', { name: 'Toma de 16:00' })).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('button', { name: 'Toma de 16:00' })).toHaveText('Marcar')
  })

  test('«Ver receta completa» y la miniatura abren la foto en un visor y se cierra con Cerrar o Escape', async ({ page }) => {
    const { consultationId } = await seedChild(page)
    await page.goto(`/consultations/${consultationId}`)
    await page.getByRole('button', { name: /Datos de la consulta/ }).click()
    const viewer = page.getByRole('dialog', { name: 'Foto de la receta en tamaño completo' })
    const openers = page.getByRole('button', { name: 'Ver receta completa' })

    await openers.nth(1).click()
    await expect(viewer).toBeVisible()
    await viewer.getByRole('button', { name: 'Cerrar' }).click()
    await expect(viewer).toBeHidden()

    await openers.nth(0).click()
    await expect(viewer).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(viewer).toBeHidden()
  })

  test('«← Mateo» vuelve al detalle del hijo', async ({ page }) => {
    const { childId, consultationId } = await seedChild(page)
    await page.goto(`/consultations/${consultationId}`)

    await page.getByRole('main').getByRole('link', { name: '← Mateo' }).click()

    await expect(page).toHaveURL(new RegExp(`/children/${childId}$`))
  })

  test('es una columna centrada de máximo 430 px, sin desborde horizontal', async ({ page }) => {
    const { consultationId } = await seedChild(page)
    await page.setViewportSize({ width: 700, height: 900 })
    await page.goto(`/consultations/${consultationId}`)

    await expect(page.getByRole('heading', { level: 1, name: 'Dra. Laura Cázares' })).toBeVisible()
    await expect(page.getByRole('main')).toHaveClass(/max-w-\[430px\]/)
    const box = await page.getByRole('main').boundingBox()
    expect(Math.round(box!.width)).toBe(430)
    expect(Math.round(box!.x)).toBe(135)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  })
})
