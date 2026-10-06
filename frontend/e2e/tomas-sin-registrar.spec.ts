import type { Page } from '@playwright/test'
import { test, expect, designs, seedAccount, apiPost, PNG_BASE64 } from './helpers'

// specs/013: a dose turns "sin registrar" when the next dose of its medication comes and nobody marked it.
// To be independent of the time the suite runs, the browser runs in a time zone where it is always about noon: a
// medication every 8 h from 00:00 then has today 00:00 "sin registrar" (08:00 came), 08:00 "por marcar" and 16:00
// still to come. The consultation is registered for that same local day and offset.

const LOCAL_HOUR = 12
const utcHour = new Date().getUTCHours()
const offsetHours = LOCAL_HOUR - utcHour // always within -11..+12, a real UTC offset
// IANA "Etc/GMT" zones use the inverted sign: Etc/GMT-5 is UTC+5.
const timezoneId = offsetHours === 0 ? 'Etc/UTC' : `Etc/GMT${offsetHours > 0 ? '-' : '+'}${Math.abs(offsetHours)}`
const localToday = new Date(Date.now() + offsetHours * 3_600_000).toISOString().slice(0, 10)

async function seedNoonConsultation(page: Page) {
  const { account, token } = await seedAccount(page, [{ firstName: 'Mateo', lastName: 'Morales', birthDate: '2021-03-14' }])
  const childId: string = account.children[0].id
  const created = await apiPost(page.context().request, token, `/children/${childId}/consultations`, {
    doctorName: 'Dra. Laura Cázares',
    consultDate: localToday,
    photoBase64: PNG_BASE64,
    utcOffsetMinutes: offsetHours * 60,
    medications: [{ name: 'Amoxicilina', frequencyHours: 8, durationDays: 1, startTime: '00:00' }],
  })
  return { childId, consultationId: created.id as string }
}

for (const design of designs) {
  test.describe(`Tomas sin registrar — diseño ${design.name}`, () => {
    test.use({ viewport: design.viewport, timezoneId })

    test('el detalle muestra la toma sin registrar aparte, y se puede marcar y desmarcar', async ({ page }) => {
      const { consultationId } = await seedNoonConsultation(page)
      await page.goto(`/consultations/${consultationId}`)

      const old = page.getByRole('button', { name: 'Toma de 00:00' })
      await expect(old).toHaveAccessibleDescription('Sin registrar')
      await expect(old).toContainText('sin registrar')
      await expect(old).toHaveClass(/border-dashed/)
      await expect(page.getByRole('button', { name: 'Toma de 08:00' })).toHaveClass(/bg-pending-soft/)
      await expect(page.getByRole('button', { name: 'Toma de 16:00' })).toHaveClass(/bg-slate-100/)

      // specs/014: the dose "sin registrar" is told apart in the progress and does not count.
      await expect(page.getByText('0 / 3 tomas · 1 sin registrar')).toBeVisible()
      await expect(page.getByRole('progressbar', { name: 'Progreso de las tomas' })).toHaveAttribute('aria-valuenow', '0')

      await old.click()
      await expect(page.getByText('1 / 3 tomas', { exact: true })).toBeVisible()
      await expect(old).toHaveAttribute('aria-pressed', 'true')
      await expect(old).toContainText('00:00 ✓')

      await old.click()
      await expect(old).toHaveAttribute('aria-pressed', 'false')
      await expect(old).toHaveAccessibleDescription('Sin registrar')
    })

    test('el resumen del día cuenta las sin registrar aparte', async ({ page }) => {
      const { childId } = await seedNoonConsultation(page)
      await page.goto(`/children/${childId}`)

      if (design.isWeb) {
        await expect(page.getByRole('main')).toContainText('sin marcar · 1 sin registrar')
        const panel = page.getByRole('region', { name: 'Tomas de hoy' })
        await expect(panel.getByRole('button', { name: /Toma de 00:00/ })).toHaveAccessibleDescription('Sin registrar')
        return
      }
      const block = page.getByRole('region', { name: 'Tomas de hoy' })
      await expect(block).toContainText('2 sin marcar · 1 sin registrar · Amoxicilina')

      // "Marcar tomas" marks 08:00 and 16:00, never the dose that stayed "sin registrar".
      await block.getByRole('button', { name: 'Marcar tomas' }).click()
      await expect(block).toContainText('Sin tomas pendientes')
      await expect(block).toContainText('1 sin registrar')
      await expect(block.getByRole('button', { name: 'Marcar tomas' })).toHaveCount(0)
    })
  })
}
