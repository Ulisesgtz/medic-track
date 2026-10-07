import { test, expect, designs, seedChild, apiPost, sessionToken, PNG_BASE64 } from './helpers'
import type { Page } from '@playwright/test'

// specs/031-historial-busqueda-filtros: the paid plan's history of a child — search and filters over the consultations
// already registered — and what the free plan sees. Requires the backend running locally.

type Plan = 'free' | 'paid'

/** A child with past consultations (so none is an active treatment) that differ in doctor, medication, symptoms and date. */
async function seedHistory(page: Page, plan: Plan) {
  const { childId, token } = await seedChild(page, { withConsultation: false, plan })
  const request = page.context().request
  const create = (body: Record<string, unknown>) =>
    apiPost(request, token, `/children/${childId}/consultations`, { photoBase64: PNG_BASE64, utcOffsetMinutes: 0, notes: '', ...body })
  const medication = (name: string) => ({ name, frequencyHours: 8, durationDays: 3, startTime: '08:00' })

  await create({
    doctorName: 'Dra. López', consultDate: '2026-01-10', notes: 'Fiebre y tos del niño', symptomCodes: ['fever', 'cough'],
    medications: [medication('Amoxicilina 250 mg')],
  })
  await create({
    doctorName: 'Dr. Iván Robles', consultDate: '2026-03-05', notes: 'Control', symptomCodes: ['fever'],
    medications: [medication('Paracetamol')],
  })
  if (plan === 'paid') {
    await create({
      doctorName: 'Dra. López', consultDate: '2026-03-20', symptomCodes: ['cough'],
      medications: [medication('Ibuprofeno'), medication('Amoxicilina 500 mg')],
    })
    // Saved only as a record (a paid-plan feature): no schedule.
    await create({
      doctorName: 'Dr. Iván Robles', consultDate: '2026-06-01', notes: 'Revisión anual', recordOnly: true,
      medications: [{ name: 'Vitamina D', frequencyHours: 24, durationDays: 30 }],
    })
  }
  return { childId }
}

const card = (page: Page, doctor: string) => page.getByRole('link', { name: new RegExp(doctor) })
const count = (page: Page, text: string) => page.getByText(text, { exact: true })

for (const design of designs) {
  test.describe(`Historial de consultas — diseño ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    // On the phone the filters are behind a "Filtros" button; on the web they are always there.
    async function openFilters(page: Page) {
      if (!design.isWeb) {
        const toggle = page.getByRole('button', { name: /^Filtros/ })
        if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
      }
    }

    test('lista todas las consultas con su conteo y la búsqueda las acota sin distinguir acentos ni mayúsculas', async ({ page }) => {
      const { childId } = await seedHistory(page, 'paid')
      await page.goto(`/children/${childId}/historial`)

      await expect(page.getByRole('heading', { level: 1, name: 'Historial' })).toBeVisible()
      await expect(count(page, '4 consultas')).toBeVisible()

      await page.getByLabel('Buscar').fill('LOPEZ')
      await expect(count(page, '2 consultas')).toBeVisible()
      await expect(card(page, 'Dr. Iván Robles')).toHaveCount(0)

      await page.getByLabel('Buscar').fill('nino') // the note says «niño»
      await expect(count(page, '1 consulta')).toBeVisible()

      await page.getByLabel('Buscar').fill('amox') // part of a medication, in two consultations
      await expect(count(page, '2 consultas')).toBeVisible()

      await page.getByLabel('Buscar').fill('zzz')
      await expect(page.getByText('Ninguna consulta coincide con tu búsqueda.')).toBeVisible()
      await page.getByRole('button', { name: 'Limpiar filtros' }).click()
      await expect(count(page, '4 consultas')).toBeVisible()
    })

    test('los filtros (doctor, medicamento, fechas, síntomas y tipo) se suman y se quitan de uno en uno', async ({ page }) => {
      const { childId } = await seedHistory(page, 'paid')
      await page.goto(`/children/${childId}/historial`)
      await expect(count(page, '4 consultas')).toBeVisible()
      await openFilters(page)

      await page.getByLabel('Doctor').selectOption('Dra. López')
      await expect(count(page, '2 consultas')).toBeVisible()

      await page.getByLabel('Medicamento').selectOption('Amoxicilina 500 mg')
      await expect(count(page, '1 consulta')).toBeVisible()
      await page.getByLabel('Medicamento').selectOption('')
      await expect(count(page, '2 consultas')).toBeVisible()

      await page.getByLabel('Desde', { exact: true }).fill('2026-03-01')
      await expect(count(page, '1 consulta')).toBeVisible()
      await page.getByLabel('Desde', { exact: true }).fill('')

      // Symptoms add up: with both, only the consultation that had both.
      await page.getByRole('button', { name: 'Fiebre', exact: true }).click()
      await expect(count(page, '1 consulta')).toBeVisible()
      await page.getByRole('button', { name: 'Tos', exact: true }).click()
      await expect(count(page, '1 consulta')).toBeVisible()
      await page.getByRole('button', { name: 'Fiebre', exact: true }).click() // only «Tos» now, with Dra. López
      await expect(count(page, '2 consultas')).toBeVisible()

      // The pills show what narrows the list and each one comes off by itself.
      const pills = page.getByRole('group', { name: 'Criterios activos' })
      await expect(pills.getByText('Dra. López')).toBeVisible()
      await pills.getByRole('button', { name: 'Quitar Dra. López' }).click()
      await expect(count(page, '2 consultas')).toBeVisible() // «Tos»: two consultations, two doctors' worth

      await page.locator('label', { hasText: 'Solo registro' }).click() // the radio itself is visually hidden
      await expect(page.getByText('Ninguna consulta coincide con tu búsqueda.')).toBeVisible()
      await pills.getByRole('button', { name: 'Limpiar todo' }).click()
      await expect(count(page, '4 consultas')).toBeVisible()
      await page.locator('label', { hasText: 'Solo registro' }).click() // the radio itself is visually hidden
      await expect(count(page, '1 consulta')).toBeVisible()
      await expect(card(page, 'Dr. Iván Robles')).toBeVisible()
    })

    test('una fecha final anterior a la inicial se avisa en el campo', async ({ page }) => {
      const { childId } = await seedHistory(page, 'paid')
      await page.goto(`/children/${childId}/historial`)
      await expect(count(page, '4 consultas')).toBeVisible()
      await openFilters(page)

      await page.getByLabel('Desde', { exact: true }).fill('2026-07-01')
      await page.getByLabel('Hasta', { exact: true }).fill('2026-06-01')

      await expect(page.getByText('La fecha final no puede ser anterior a la inicial.')).toBeVisible()
    })

    test('al abrir una consulta y volver (atrás y recargar) la búsqueda sigue igual', async ({ page }) => {
      const { childId } = await seedHistory(page, 'paid')
      await page.goto(`/children/${childId}/historial`)
      await page.getByLabel('Buscar').fill('amox')
      await expect(count(page, '2 consultas')).toBeVisible()

      await page.getByRole('link', { name: /Dra. López/ }).first().click()
      await expect(page).toHaveURL(/\/consultations\//)
      await page.goBack()

      await expect(page.getByLabel('Buscar')).toHaveValue('amox')
      await expect(count(page, '2 consultas')).toBeVisible()

      await page.reload()
      await expect(page.getByLabel('Buscar')).toHaveValue('amox')
      await expect(count(page, '2 consultas')).toBeVisible()
      // What was typed never goes into the address.
      expect(page.url()).not.toContain('amox')
    })

    test('desde la lista del hijo, «Buscar en el historial» abre el Historial; sin desplazamiento horizontal', async ({ page }) => {
      const { childId } = await seedHistory(page, 'paid')
      await page.goto(`/children/${childId}`)

      await page.getByRole('link', { name: 'Buscar en el historial' }).click()

      await expect(page).toHaveURL(new RegExp(`/children/${childId}/historial$`))
      await expect(count(page, '4 consultas')).toBeVisible()
      await openFilters(page)
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
      // The way back to the child's list.
      await page.getByRole('link', { name: /^← Consultas/ }).click()
      await expect(page).toHaveURL(new RegExp(`/children/${childId}$`))
    })

    test('el plan gratuito sigue viendo toda su lista; «Buscar en el historial» abre el aviso del plan', async ({ page }) => {
      const { childId } = await seedHistory(page, 'free')
      await page.goto(`/children/${childId}`)
      // Nothing registered is hidden.
      await expect(page.getByRole('link', { name: /Dra. López/ })).toBeVisible()
      await expect(page.getByRole('link', { name: /Dr. Iván Robles/ })).toBeVisible()

      const entry = page.getByRole('button', { name: /Buscar en el historial/ })
      await expect(entry.getByText('Plan completo')).toBeVisible()
      await entry.click()

      const dialog = page.getByRole('dialog', { name: 'Búsqueda en el historial' })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText(/la búsqueda y los filtros son del plan completo/)).toBeVisible()
      await expect(page).toHaveURL(new RegExp(`/children/${childId}$`))
      await dialog.getByRole('button', { name: 'Ahora no' }).click()
      await expect(dialog).toBeHidden()

      await entry.click()
      await page.getByRole('dialog').getByRole('link', { name: 'Ver el plan completo' }).click()
      await expect(page).toHaveURL(/\/planes$/)
    })

    test('el plan gratuito que entra a la dirección del Historial ve el aviso y vuelve a su lista', async ({ page }) => {
      const { childId } = await seedHistory(page, 'free')
      await page.goto(`/children/${childId}/historial`)

      const dialog = page.getByRole('dialog', { name: 'Búsqueda en el historial' })
      await expect(dialog).toBeVisible()
      await expect(page.getByLabel('Buscar')).toHaveCount(0)

      await dialog.getByRole('button', { name: 'Ahora no' }).click()
      await expect(page).toHaveURL(new RegExp(`/children/${childId}$`))
      await expect(page.getByRole('link', { name: /Dra. López/ })).toBeVisible()
    })

    test('el servidor rechaza la búsqueda del plan gratuito, sin consultas', async ({ page }) => {
      const { childId } = await seedHistory(page, 'free')
      await page.goto(`/children/${childId}`)
      await expect(page.getByRole('link', { name: /Dra. López/ })).toBeVisible() // the session is loaded
      const token = await sessionToken(page)

      const res = await page.context().request.post(`http://localhost:8080/children/${childId}/consultations/search`, {
        data: { q: 'lopez' },
        headers: { Authorization: `Bearer ${token}` },
      })

      expect(res.status()).toBe(422)
      const body = await res.json()
      expect(body.reason).toBe('history_search')
      expect(body.consultations).toBeUndefined()
    })
  })
}
