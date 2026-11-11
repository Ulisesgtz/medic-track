import type { Page } from '@playwright/test'
import { test, expect, designs, seedChild } from './helpers'

// specs/066: a dose shows marked the moment it is tapped, says «guardando…» after two seconds, ends with what the server saved, and
// goes back — saying so — when the server didn't save it. The server's answer is held back (or cut) with `page.route`.

const DOSE_PATCH = '**/consultations/*/doses/*'

/** Every PATCH of a dose answers `ms` later. */
async function slowDoses(page: Page, ms: number) {
  await page.route(DOSE_PATCH, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue()
    await new Promise((resolve) => setTimeout(resolve, ms))
    await route.continue()
  })
}

/** Every PATCH of a dose fails as with no connection. */
async function offlineDoses(page: Page) {
  await page.route(DOSE_PATCH, (route) => (route.request().method() === 'PATCH' ? route.abort('internetdisconnected') : route.continue()))
}

for (const design of designs) {
  test.describe(`Marcado inmediato — diseño ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('en el detalle de la consulta la toma cambia al tocarla, dice «guardando…» y termina con quien la marcó', async ({ page }) => {
      const { consultationId } = await seedChild(page)
      await page.goto(`/consultations/${consultationId}`)
      const dose = page.getByRole('button', { name: 'Toma de 08:00' })
      await expect(dose).toHaveAttribute('aria-pressed', 'false')

      await slowDoses(page, 3000)
      await dose.click()
      // Well before the server answers.
      await expect(dose).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 })
      await expect(dose).toHaveText(/^✓ \d\d:\d\d$/)
      await expect(page.getByText('guardando…')).toBeVisible({ timeout: 2500 })

      await expect(dose).toHaveText(/^✓ \d\d:\d\d · por Ana$/, { timeout: 6000 })
      await expect(page.getByText('guardando…')).toHaveCount(0)
    })

    test('sin conexión la toma vuelve atrás y lo dice; con conexión se guarda y el aviso se va', async ({ page }) => {
      const { consultationId } = await seedChild(page)
      await page.goto(`/consultations/${consultationId}`)
      const dose = page.getByRole('button', { name: 'Toma de 08:00' })
      await expect(dose).toHaveAttribute('aria-pressed', 'false')

      await offlineDoses(page)
      await dose.click()
      const notice = page.getByText('No se guardó la marca de Amoxicilina de las 08:00. Revisa tu conexión e inténtalo de nuevo.')
      await expect(notice).toBeVisible()
      await expect(dose).toHaveAttribute('aria-pressed', 'false')
      await expect(dose).toHaveText('Marcar')

      await page.unroute(DOSE_PATCH)
      await dose.click()
      await expect(dose).toHaveText(/por Ana$/)
      await expect(notice).toHaveCount(0)
      await page.reload()
      await expect(page.getByRole('button', { name: 'Toma de 08:00' })).toHaveAttribute('aria-pressed', 'true')
    })

    test('con una conexión lenta se marcan cinco tomas seguidas sin esperar y las cinco quedan guardadas', async ({ page }) => {
      const { consultationId } = await seedChild(page, { frequencyHours: 4 })
      await page.goto(`/consultations/${consultationId}`)
      const times = ['00:00', '04:00', '08:00', '12:00', '16:00']
      await expect(page.getByRole('button', { name: 'Toma de 00:00' })).toBeVisible()

      await slowDoses(page, 3000)
      for (const time of times) await page.getByRole('button', { name: `Toma de ${time}` }).click()
      for (const time of times) await expect(page.getByRole('button', { name: `Toma de ${time}` })).toHaveAttribute('aria-pressed', 'true')

      await page.unroute(DOSE_PATCH)
      for (const time of times) await expect(page.getByRole('button', { name: `Toma de ${time}` })).toHaveText(/por Ana$/, { timeout: 10_000 })
      await page.reload()
      for (const time of times) await expect(page.getByRole('button', { name: `Toma de ${time}` })).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByRole('button', { name: 'Toma de 20:00' })).toHaveAttribute('aria-pressed', 'false')
    })

    test('en «Hoy» del hijo la toma cambia al tocarla y vuelve atrás si no se guardó', async ({ page }) => {
      const { childId } = await seedChild(page)
      await page.goto(`/children/${childId}`)
      const dose = page.getByRole('button', { name: 'Marcar Amoxicilina de las 08:00' })
      await expect(dose).toHaveAttribute('aria-pressed', 'false')

      await slowDoses(page, 3000)
      const saved = page.waitForResponse((r) => r.request().method() === 'PATCH' && /\/doses\//.test(r.url()))
      await dose.click()
      await expect(dose).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 })
      // An own mark in «Hoy» reads «✓ 15:43» (no name, specs/056); after the answer it is still marked.
      expect((await saved).ok()).toBe(true)
      await expect(dose).toHaveText(/^✓ \d{2}:\d{2}$/)
      await expect(dose).toHaveAttribute('aria-pressed', 'true')

      await page.unroute(DOSE_PATCH)
      await offlineDoses(page)
      await dose.click()
      await expect(page.getByText('No se quitó la marca de Amoxicilina de las 08:00. Revisa tu conexión e inténtalo de nuevo.')).toBeVisible()
      await expect(dose).toHaveAttribute('aria-pressed', 'true')
    })
  })
}
