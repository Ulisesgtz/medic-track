import type { Page } from '@playwright/test'
import { test, expect, designs, seedChild, apiPost, PNG_BASE64 } from './helpers'

// specs/019: the treatment calendar of the consultation detail. The consultation is created today with Amoxicilina for
// 7 days and Paracetamol for 3, both every 8 h from 00:00, so today is the first day whatever day the suite runs.

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const daysFromToday = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}
const longDay = (d: Date) => `${d.getDate()} de ${MONTHS[d.getMonth()]}`
const monthTitle = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

async function seedTwoMedications(page: Page) {
  const { childId, token } = await seedChild(page, { withConsultation: false })
  const now = new Date()
  const created = await apiPost(page.context().request, token, `/children/${childId}/consultations`, {
    doctorName: 'Dra. Laura Cázares',
    consultDate: localDate(now),
    photoBase64: PNG_BASE64,
    notes: '',
    utcOffsetMinutes: -now.getTimezoneOffset() || 0,
    medications: [
      { name: 'Amoxicilina', frequencyHours: 8, durationDays: 7, startTime: '00:00' },
      { name: 'Paracetamol', frequencyHours: 8, durationDays: 3, startTime: '00:00' },
    ],
  })
  return created.id as string
}

/** Shows the month of `date` in the calendar (the arrows only go between months with treatment). */
async function showMonthOf(page: Page, date: Date) {
  const title = page.getByText(monthTitle(date), { exact: true })
  if (!(await title.isVisible())) await page.getByRole('button', { name: 'Mes siguiente' }).click()
  await expect(title).toBeVisible()
}

const calendar = (page: Page) => page.getByRole('region', { name: 'Calendario del tratamiento' })

for (const design of designs) {
  test.describe(`Calendario del tratamiento — diseño ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('un solo calendario con leyenda; marca los días de cada medicamento y no los demás', async ({ page }) => {
      const id = await seedTwoMedications(page)
      await page.goto(`/consultations/${id}`)
      const cal = calendar(page)

      await expect(cal).toHaveCount(1)
      const legend = cal.getByRole('list', { name: 'Medicamentos del calendario' })
      await expect(legend.getByRole('listitem')).toHaveText(['1Amoxicilina', '2Paracetamol'])

      const today = daysFromToday(0)
      await expect(cal.getByRole('button', { name: `${longDay(today)} · inicio de 1 Amoxicilina (sin dar), inicio de 2 Paracetamol (sin dar)` })).toHaveAttribute('aria-current', 'date')

      // Day 4 of the treatment: only the longer one; day 7 is its last; day 8 has nothing.
      await showMonthOf(page, daysFromToday(3))
      await expect(cal.getByRole('button', { name: `${longDay(daysFromToday(3))} · 1 Amoxicilina` })).toBeVisible()
      await showMonthOf(page, daysFromToday(6))
      await expect(cal.getByRole('button', { name: `${longDay(daysFromToday(6))} · fin de 1 Amoxicilina` })).toBeVisible()
      const after = daysFromToday(7)
      if (after.getMonth() === daysFromToday(6).getMonth()) {
        await expect(cal.getByRole('button', { name: longDay(after), exact: true })).toBeVisible()
      }
    })

    test('tocar un día lista sus tomas de todos los medicamentos; marcar una actualiza el progreso', async ({ page }) => {
      const id = await seedTwoMedications(page)
      await page.goto(`/consultations/${id}`)
      const cal = calendar(page)
      const day = daysFromToday(2)
      await showMonthOf(page, day)

      await cal.getByRole('button', { name: new RegExp(`^${longDay(day)} · 1 Amoxicilina \\(sin dar\\), fin de 2 Paracetamol`) }).click()

      const list = cal.getByRole('list', { name: 'Tomas del día' })
      await expect(list.getByRole('button')).toHaveCount(6)
      await expect(cal.getByRole('heading', { name: `Tomas del ${longDay(day)}` })).toBeVisible()
      await expect(page.getByText('0 / 21 tomas')).toBeVisible()

      const dose = list.getByRole('button', { name: 'Amoxicilina, 08:00' })
      await dose.click()

      await expect(dose).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByText('1 / 21 tomas')).toBeVisible()
    })

    test('un día fuera del tratamiento dice que no hay tomas', async ({ page }) => {
      const id = await seedTwoMedications(page)
      await page.goto(`/consultations/${id}`)
      const cal = calendar(page)
      const today = new Date()
      // Inside this month but outside the seven days of the treatment.
      const outside = today.getDate() > 1 ? new Date(today.getFullYear(), today.getMonth(), 1) : new Date(today.getFullYear(), today.getMonth(), 28)

      await cal.getByRole('button', { name: longDay(outside), exact: true }).click()

      await expect(cal.getByText('Ese día no hay tomas.')).toBeVisible()
    })

    test('las flechas de mes solo llegan a los meses con tratamiento', async ({ page }) => {
      const id = await seedTwoMedications(page)
      await page.goto(`/consultations/${id}`)
      const cal = calendar(page)
      const crosses = daysFromToday(0).getMonth() !== daysFromToday(6).getMonth()

      await expect(cal.getByRole('button', { name: 'Mes anterior' })).toBeDisabled()
      if (crosses) {
        await cal.getByRole('button', { name: 'Mes siguiente' }).click()
        await expect(cal.getByText(monthTitle(daysFromToday(6)), { exact: true })).toBeVisible()
        await expect(cal.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled()
      } else {
        await expect(cal.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled()
      }
    })

    test('finalizar un medicamento hace que su marca termine ese día', async ({ page }) => {
      const id = await seedTwoMedications(page)
      await page.goto(`/consultations/${id}`)
      const cal = calendar(page)

      await page.getByRole('article').filter({ hasText: 'Amoxicilina' }).getByRole('button', { name: 'Finalizar tratamiento' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Finalizar tratamiento' }).click()
      await expect(page.getByRole('dialog')).toBeHidden()

      // The day it ended keeps its mark…
      await expect(cal.getByRole('button', { name: `${longDay(daysFromToday(0))} · inicio y fin de 1 Amoxicilina (sin dar), inicio de 2 Paracetamol (sin dar)` })).toBeVisible()
      // …and tomorrow still has Paracetamol, but no longer Amoxicilina.
      const tomorrow = daysFromToday(1)
      await showMonthOf(page, tomorrow)
      await expect(cal.getByRole('button', { name: `${longDay(tomorrow)} · 2 Paracetamol` })).toBeVisible()
    })

    if (!design.isWeb) {
      test('cabe sin desplazamiento horizontal', async ({ page }) => {
        const id = await seedTwoMedications(page)
        await page.goto(`/consultations/${id}`)
        await expect(calendar(page)).toBeVisible()

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        expect(overflow).toBeLessThanOrEqual(0)
      })
    }
  })
}
