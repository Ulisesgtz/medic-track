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
  // The calendar draws after the detail loads: deciding before that would take a month that is not on screen yet
  // (on a slow runner the arrow was still disabled and the click waited until the timeout).
  await expect(page.getByRole('region', { name: 'Calendario del tratamiento' })).toBeVisible()
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

    test('tocar un día cambia las tarjetas de cada medicamento; marcar una toma actualiza el progreso (spec 023)', async ({ page }) => {
      const id = await seedTwoMedications(page)
      await page.goto(`/consultations/${id}`)
      const cal = calendar(page)
      const amoxicilina = page.getByRole('article').filter({ hasText: 'Amoxicilina' })
      const paracetamol = page.getByRole('article').filter({ hasText: 'Paracetamol' })

      // Opens on today, with no list of its own under the calendar.
      await expect(amoxicilina.getByText('Tomas de hoy')).toBeVisible()
      await expect(cal.getByRole('list', { name: 'Tomas del día' })).toHaveCount(0)

      const day = daysFromToday(2)
      await showMonthOf(page, day)
      await cal.getByRole('button', { name: new RegExp(`^${longDay(day)} · 1 Amoxicilina \\(sin dar\\), fin de 2 Paracetamol`) }).click()

      await expect(amoxicilina.getByText(`Tomas del ${longDay(day)}`)).toBeVisible()
      await expect(amoxicilina.getByRole('button', { name: /^Toma de/ })).toHaveCount(3)
      await expect(paracetamol.getByRole('button', { name: /^Toma de/ })).toHaveCount(3)
      await expect(page.getByText('0 / 21 tomas')).toBeVisible()

      const dose = amoxicilina.getByRole('button', { name: 'Toma de 08:00' })
      await dose.click()

      await expect(dose).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByText('1 / 21 tomas')).toBeVisible()
      await expect(amoxicilina.getByText(`Tomas del ${longDay(day)}`)).toBeVisible()
    })

    test('un medicamento sin tomas el día elegido lo dice', async ({ page }) => {
      const id = await seedTwoMedications(page)
      await page.goto(`/consultations/${id}`)
      const cal = calendar(page)
      const day = daysFromToday(4)
      await showMonthOf(page, day)

      await cal.getByRole('button', { name: new RegExp(`^${longDay(day)} · 1 Amoxicilina`) }).click()

      await expect(page.getByRole('article').filter({ hasText: 'Paracetamol' }).getByText('Este día no tiene tomas.')).toBeVisible()
      await expect(page.getByRole('article').filter({ hasText: 'Amoxicilina' }).getByRole('button', { name: /^Toma de/ })).toHaveCount(3)
    })

    test('un día fuera del tratamiento dice que no hay tomas', async ({ page }) => {
      const id = await seedTwoMedications(page)
      await page.goto(`/consultations/${id}`)
      const cal = calendar(page)
      const today = new Date()
      // Inside this month but outside the seven days of the treatment.
      const outside = today.getDate() > 1 ? new Date(today.getFullYear(), today.getMonth(), 1) : new Date(today.getFullYear(), today.getMonth(), 28)

      await cal.getByRole('button', { name: longDay(outside), exact: true }).click()

      // Both cards say it, since the calendar chooses the day of every medication (spec 023).
      await expect(page.getByText('Este día no tiene tomas.')).toHaveCount(2)
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

      // The canceled doses after the end are reached by tapping their day (spec 023).
      await cal.getByRole('button', { name: `${longDay(tomorrow)} · 2 Paracetamol` }).click()
      await expect(page.getByRole('article').filter({ hasText: 'Amoxicilina' }).getByText('cancelada').first()).toBeVisible()
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
