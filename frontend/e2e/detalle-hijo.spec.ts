import { test, expect, seedChild, designs, secondPerson, inviteViaApi, acceptViaApi, allowClerkOn } from './helpers'

// Child detail since specs/056 (design «Detalle y Mi día PediTrack.dc.html», screen A): «Hoy» first with every dose of the day
// markable there, the index of sections, «Nueva consulta» as the one solid button and «Lo demás» at the end. Requires the backend.

for (const design of designs) {
  test.describe(`Detalle del hijo — ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('abre con «Hoy»: se marca una toma sin bajar la pantalla y se conserva al recargar', async ({ page }) => {
      // One daily dose at 00:00: «por marcar» all day, whatever time the suite runs (specs/013).
      const { childId } = await seedChild(page, { frequencyHours: 24 })
      await page.goto(`/children/${childId}`)
      const main = page.getByRole('main')

      await expect(main.getByRole('link', { name: '← Inicio' })).toBeVisible()
      await expect(main.getByRole('heading', { level: 1, name: 'Mateo' })).toBeVisible()
      await expect(main.getByText(/· nació el 14 mar 2021$/)).toBeVisible()

      const today = main.getByRole('region', { name: 'Hoy' })
      await expect(today.getByText('1 por marcar')).toBeVisible()
      const mark = today.getByRole('button', { name: 'Marcar Amoxicilina de las 00:00' })
      await expect(mark).toBeInViewport()
      await mark.click()
      await expect(mark).toHaveAttribute('aria-pressed', 'true')
      await expect(today.getByText('✓ Todo marcado hasta ahora')).toBeVisible()

      await page.reload()
      await expect(main.getByRole('region', { name: 'Hoy' }).getByRole('button', { name: 'Marcar Amoxicilina de las 00:00' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })

    test('el índice salta a la Cartilla; las consultas, la nueva consulta y el regreso llevan a donde dicen', async ({ page }) => {
      const { childId, consultationId } = await seedChild(page)
      await page.goto(`/children/${childId}`)
      const main = page.getByRole('main')

      const index = main.getByRole('navigation', { name: 'Secciones' })
      await expect(index.getByRole('link')).toHaveText(['Consultas', 'Suplementos', 'Actividades', 'Cartilla', 'Crecimiento'])
      await index.getByRole('link', { name: 'Cartilla' }).click()
      await expect(main.getByRole('region', { name: 'Cartilla de vacunación' })).toBeInViewport()

      await main.getByRole('link', { name: 'Nueva consulta' }).click()
      await expect(page).toHaveURL(new RegExp(`/children/${childId}/consultations/new$`))
      await page.goBack()

      await main.getByRole('region', { name: 'Consultas' }).getByRole('link', { name: /Dra\. Laura Cázares/ }).click()
      await expect(page).toHaveURL(new RegExp(`/consultations/${consultationId}$`))

      await page.goto(`/children/${childId}`)
      await main.getByRole('link', { name: '← Inicio' }).click()
      await expect(page).toHaveURL(/\/home$/)
    })

    test('sin consultas: el bloque que explica «Nueva consulta» y el día sin nada', async ({ page }) => {
      const { childId } = await seedChild(page, { withConsultation: false })
      await page.goto(`/children/${childId}`)
      const main = page.getByRole('main')

      await expect(main.getByText('Aún no hay consultas')).toBeVisible()
      await expect(main.getByText('Hoy no hay tomas ni actividades')).toBeVisible()
      await expect(main.getByText('Sin suplementos registrados')).toBeVisible()
      await expect(main.getByRole('link', { name: 'Nueva consulta' })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    })

    test('un Cuidador ve el día y marca, sin «Nueva consulta» ni «Acceso del hijo»', async ({ page, browser }) => {
      await allowClerkOn(page)
      const { childId, token } = await seedChild(page, { frequencyHours: 24 })
      const guest = await secondPerson(browser, design)
      const invitation = await inviteViaApi(page.context().request, token, guest.email, 'caregiver')
      await acceptViaApi(guest.context.request, guest.token, invitation)
      try {
        await guest.page.goto(`/children/${childId}`)
        const main = guest.page.getByRole('main')
        await expect(main.getByRole('region', { name: 'Hoy' }).getByRole('button', { name: 'Marcar Amoxicilina de las 00:00' })).toBeEnabled()
        await expect(main.getByRole('link', { name: 'Nueva consulta' })).toHaveCount(0)
        await expect(main.getByRole('button', { name: 'Nueva consulta' })).toHaveCount(0)
        await expect(main.getByRole('button', { name: /Acceso del hijo/ })).toHaveCount(0)
        await expect(main.getByRole('navigation', { name: 'Lo demás' }).getByRole('link', { name: /Familia que lo ve/ })).toBeVisible()
      } finally {
        await guest.context.close()
      }
    })
  })
}

test('en el teléfono es una columna centrada de máximo 430 px, sin desborde horizontal', async ({ page }) => {
  const { childId } = await seedChild(page)
  await page.setViewportSize({ width: 700, height: 900 })
  await page.goto(`/children/${childId}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Mateo' })).toBeVisible()

  const box = await page.getByRole('main').boundingBox()
  expect(Math.round(box!.width)).toBe(430)
  expect(Math.round(box!.x)).toBe(135)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
})
