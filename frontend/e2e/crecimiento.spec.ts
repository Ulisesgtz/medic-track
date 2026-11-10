import { acceptViaApi, allowClerkOn, apiPost, designs, expect, inviteViaApi, secondPerson, seedChild, test } from './helpers'

// specs/063 + 065: a child's measurements and the growth chart rebuilt from Claude Design's mock, with real people (Clerk dev
// instance and the backend), at 390 and 1280 px. The child of seedChild was born on 2021-03-14. The WHO curves may be switched off
// in the API (WHO_GROWTH_REFERENCE_ENABLED): the checks never depend on them.

const API = 'http://localhost:8080'

for (const design of designs) {
  test.describe(`Crecimiento, ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('the owner writes measurements down, reads the chart with ‹ ›, corrects and removes one', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      await apiPost(page.context().request, owner.token, `/children/${owner.childId}/growth-measurements`, { measuredOn: '2022-03-14', weightKg: 9.6, heightCm: 75, note: '' })

      await page.goto(`/children/${owner.childId}`)
      const section = page.getByRole('main').getByRole('region', { name: 'Crecimiento' })
      await expect(section.getByText('Última: 9.6 kg · 75 cm, 14 mar 2022')).toBeVisible()
      await section.getByRole('link').click()
      await expect(page.getByRole('heading', { name: 'Crecimiento', level: 1 })).toBeVisible()
      await expect(page.getByRole('region', { name: 'Última medida' })).toContainText('9.6 kg · 75 cm')

      await page.getByRole('main').getByRole('link', { name: '+ Anotar medida' }).click()
      await page.getByLabel('Fecha').fill('2023-03-20')
      await page.getByLabel('Peso').fill('1.2.4')
      await page.getByLabel('Talla').fill('88,5')
      await page.getByRole('button', { name: 'Guardar medida' }).click()
      await expect(page.getByText('Escribe el peso en kilos, con punto decimal. Por ejemplo: 11.6')).toBeVisible()
      await page.getByLabel('Peso').fill('12,4')
      await page.getByRole('button', { name: 'Guardar medida' }).click()

      await expect(page.getByText('2 medidas')).toBeVisible()
      await expect(page.getByRole('region', { name: 'Última medida' })).toContainText('12.4 kg · 88.5 cm')

      // The chart: the WHO table is asked the first time; the reading starts at the newest and ‹ › walk the measurements.
      const chart = page.getByRole('region', { name: 'Gráfica de crecimiento' })
      await chart.getByRole('button', { name: 'Niño' }).click()
      await expect(chart.getByText('Elige la tabla de la OMS para ver las curvas de referencia.')).toHaveCount(0)
      await expect(chart.getByRole('img', { name: /Gráfica de peso de/ })).toBeVisible()
      await expect(chart.getByText(/20 mar 2023 · .*2 años/).first()).toBeVisible()
      await chart.getByRole('button', { name: 'Medida anterior' }).click()
      await expect(chart.getByText(/14 mar 2022 · .*1 año/).first()).toBeVisible()
      await chart.getByRole('tab', { name: 'Talla' }).click()
      await expect(chart.getByRole('img', { name: /Gráfica de talla de/ })).toBeVisible()
      await expect(chart.getByText('88.5 cm').first()).toBeVisible()

      await page.getByRole('link', { name: 'Corregir 20 mar 2023' }).click()
      await expect(page.getByRole('heading', { name: 'Corregir medida', level: 1 })).toBeVisible()
      await page.getByLabel('Peso').fill('12.6')
      await page.getByRole('button', { name: 'Guardar medida' }).click()
      await expect(page.getByRole('region', { name: 'Última medida' })).toContainText('12.6 kg · 88.5 cm')
      await expect(page.getByText(/Corregida el .* por /).first()).toBeVisible()

      await page.getByRole('button', { name: 'Quitar 14 mar 2022' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Quitar' }).click()
      await expect(page.getByText('1 medida', { exact: true })).toBeVisible()
    })

    test('on the free plan the measurements are written down and the chart opens the plan notice, with no data', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false, plan: 'free' })
      await apiPost(page.context().request, owner.token, `/children/${owner.childId}/growth-measurements`, { measuredOn: '2022-03-14', weightKg: 9.6, heightCm: null, note: '' })
      await page.goto(`/children/${owner.childId}/crecimiento`)
      await expect(page.getByText('1 medida', { exact: true })).toBeVisible()
      const locked = page.getByRole('region', { name: 'Gráfica de crecimiento' })
      await expect(locked.getByText('Plan completo', { exact: true })).toBeVisible()
      await locked.getByRole('button', { name: 'Ver la gráfica' }).click()
      await expect(page.getByRole('dialog').getByText('Gráfica de crecimiento').first()).toBeVisible()
      const chart = await page.context().request.get(`${API}/children/${owner.childId}/growth-chart`, { headers: { Authorization: `Bearer ${owner.token}` } })
      expect(chart.status()).toBe(422)
      expect(await chart.json()).toEqual(expect.objectContaining({ reason: 'growth_chart' }))
    })

    test('a Caregiver sees the record and can’t write, not even through the API', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      const request = page.context().request
      await apiPost(request, owner.token, `/children/${owner.childId}/growth-measurements`, { measuredOn: '2022-03-14', weightKg: 9.6, heightCm: 75, note: '' })
      const guest = await secondPerson(browser, design)
      await acceptViaApi(guest.context.request, guest.token, await inviteViaApi(request, owner.token, guest.email, 'caregiver'))

      await guest.page.goto(`/children/${owner.childId}/crecimiento`)
      await expect(guest.page.getByText('Vista de Cuidadora.')).toBeVisible()
      await expect(guest.page.getByRole('region', { name: 'Última medida' })).toContainText('9.6 kg · 75 cm')
      await expect(guest.page.getByRole('link', { name: '+ Anotar medida' })).toHaveCount(0)
      await expect(guest.page.getByRole('button', { name: /^Quitar/ })).toHaveCount(0)
      const refused = await guest.context.request.post(`${API}/children/${owner.childId}/growth-measurements`, {
        headers: { Authorization: `Bearer ${guest.token}` },
        data: { measuredOn: '2022-04-14', weightKg: 10 },
      })
      expect(refused.status()).toBe(403)
    })
  })
}
