import { acceptViaApi, allowClerkOn, apiPost, designs, expect, inviteViaApi, secondPerson, seedChild, test } from './helpers'

// specs/062-botiquin: the family's medicine cabinet, with real people (Clerk dev instance and the backend), at 390 and 1280 px.

const API = 'http://localhost:8080'

const box = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  strength: '',
  quantity: 1,
  unit: 'box',
  expires: { year: 2027, month: 6, day: null },
  note: '',
  ...extra,
})

for (const design of designs) {
  test.describe(`Botiquín, ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('the owner adds a medicine by hand from the home, finds it, edits it and removes it', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      await apiPost(page.context().request, owner.token, `/accounts/${owner.accountId}/medicine-cabinet`, box('Suero oral', { quantity: 4 }))

      await page.goto('/home')
      await page.getByRole('main').getByRole('link', { name: /Checa tus medicamentos/ }).click()
      await expect(page.getByRole('heading', { name: 'Botiquín', level: 1 })).toBeVisible()
      await page.getByRole('main').getByRole('link', { name: '+ Agregar al botiquín' }).click()

      await page.getByLabel('Nombre', { exact: true }).fill('Paracetamol infantil')
      await page.getByLabel(/Concentración/).fill('160 mg/5 ml')
      await page.getByLabel('Cantidad').fill('2')
      await page.getByRole('button', { name: 'frascos' }).click()
      await page.getByLabel('Mes').selectOption('3')
      await page.getByLabel('Año').selectOption('2027')
      await page.getByRole('button', { name: 'Guardar en el botiquín' }).click()

      await expect(page.getByRole('heading', { name: 'Paracetamol infantil', level: 1 })).toBeVisible()
      await expect(page.getByText('2 frascos')).toBeVisible()
      await expect(page.getByText('mar 2027')).toBeVisible()

      await page.getByRole('link', { name: '← Botiquín' }).click()
      await expect(page.getByText('2 medicamentos')).toBeVisible()
      await page.getByRole('searchbox', { name: 'Buscar por nombre' }).fill('paracet')
      await expect(page.getByText('1 de 2 medicamentos')).toBeVisible()
      await page.getByRole('main').getByRole('link', { name: /Paracetamol infantil/ }).click()

      await page.getByRole('link', { name: 'Editar' }).click()
      await page.getByLabel('Cantidad').fill('1')
      await page.getByRole('button', { name: 'Guardar cambios' }).click()
      await expect(page.getByText('1 frasco', { exact: true })).toBeVisible()

      await page.getByRole('button', { name: 'Quitar del botiquín' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Quitar del botiquín' }).click()
      await expect(page.getByText('1 medicamento', { exact: true })).toBeVisible()
      await expect(page.getByRole('main').getByText('Paracetamol infantil')).toHaveCount(0)
    })

    test('«Agregar al botiquín» from a consultation brings the prescription’s name', async ({ page }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page)
      await page.goto(`/consultations/${owner.consultationId}`)
      await page.getByRole('link', { name: 'Agregar Amoxicilina al botiquín' }).click()
      await expect(page.getByText('Desde la consulta del')).toBeVisible()
      await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Amoxicilina')
      await page.getByLabel('Cantidad').fill('1')
      await page.getByRole('button', { name: 'tabletas' }).click()
      await page.getByLabel('Mes').selectOption('1')
      await page.getByLabel('Año').selectOption('2028')
      await page.getByRole('button', { name: 'Guardar en el botiquín' }).click()
      await expect(page.getByRole('heading', { name: 'Amoxicilina', level: 1 })).toBeVisible()
    })

    test('a Caregiver of the family sees the cabinet and can’t change it, not even through the API', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page, { withConsultation: false })
      const request = page.context().request
      await apiPost(request, owner.token, `/accounts/${owner.accountId}/medicine-cabinet`, box('Loratadina'))
      const guest = await secondPerson(browser, design)
      await acceptViaApi(guest.context.request, guest.token, await inviteViaApi(request, owner.token, guest.email, 'caregiver'))

      await guest.page.goto('/botiquin')
      await expect(guest.page.getByText('Vista de Cuidadora.')).toBeVisible()
      await expect(guest.page.getByRole('main').getByText('Loratadina')).toBeVisible()
      await expect(guest.page.getByText('+ Agregar al botiquín')).toHaveCount(0)
      const refused = await guest.context.request.post(`${API}/accounts/${owner.accountId}/medicine-cabinet`, {
        headers: { Authorization: `Bearer ${guest.token}` },
        data: box('Zinc'),
      })
      expect(refused.status()).toBe(403)
    })

    test('on the free plan the home’s entry opens the plan notice', async ({ page }) => {
      await allowClerkOn(page)
      await seedChild(page, { withConsultation: false, plan: 'free' })
      await page.goto('/home')
      await page.getByRole('main').getByRole('button', { name: /Checa tus medicamentos/ }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByRole('dialog').getByText('Botiquín de la casa').first()).toBeVisible()
    })
  })
}
