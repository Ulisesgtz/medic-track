import type { Page } from '@playwright/test'
import { test, expect, designs, seedChild } from './helpers'

// specs/017: pull down to refresh the data (phone design only) and the "new version" bar (both designs).

/** A finger going down from `from` to `to`, as synthetic touch events: Playwright has no touch drag. */
async function pull(page: Page, from: number, to: number) {
  await page.evaluate(
    ([a, b]) => {
      const touch = (y: number) => new Touch({ identifier: 1, target: document.body, clientX: 195, clientY: y })
      const fire = (type: string, y: number, list: 'touches' | 'changedTouches') =>
        document.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: list === 'touches' ? [touch(y)] : [],
            changedTouches: [touch(y)],
          }),
        )
      fire('touchstart', a, 'touches')
      fire('touchmove', b, 'touches')
      fire('touchend', b, 'changedTouches')
    },
    [from, to],
  )
}

test.describe('Jalar para actualizar — diseño móvil', () => {
  test.use({ viewport: designs[0].viewport })
  test.skip(({ browserName }) => browserName !== 'chromium', 'Playwright solo simula toques en Chromium; el resto se prueba en el iPhone real')

  test('jalar hacia abajo vuelve a pedir los datos sin recargar la página', async ({ page }) => {
    await seedChild(page, { withConsultation: false })
    await page.goto('/home')
    await expect(page.getByRole('main').getByText('Mateo Morales').first()).toBeVisible()
    await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1))

    const refetched = page.waitForRequest((request) => /\/accounts\/me$/.test(request.url()))
    await pull(page, 100, 260)
    await refetched

    await expect(page.getByText('Actualizando…')).toBeHidden()
    await expect(page).toHaveURL(/\/home$/)
    expect(await page.evaluate(() => (window as unknown as { marker: number }).marker)).toBe(1)
  })

  test('jalar poco no hace nada', async ({ page }) => {
    await seedChild(page, { withConsultation: false })
    await page.goto('/home')
    await expect(page.getByRole('main').getByText('Mateo Morales').first()).toBeVisible()
    let requests = 0
    page.on('request', (request) => {
      if (/\/accounts\/me$/.test(request.url())) requests++
    })

    await pull(page, 100, 180)
    await page.waitForTimeout(500)

    expect(requests).toBe(0)
  })

  test('en "Nueva consulta" lo escrito sigue ahí después de actualizar', async ({ page }) => {
    const { childId } = await seedChild(page, { withConsultation: false })
    await page.goto(`/children/${childId}/consultations/new`)
    await page.getByLabel('Doctor').fill('Dra. Laura Cázares')

    const refetched = page.waitForRequest((request) => /\/accounts\/me$/.test(request.url()))
    await pull(page, 100, 260)
    await refetched

    await expect(page.getByLabel('Doctor')).toHaveValue('Dra. Laura Cázares')
  })
})

test.describe('Jalar para actualizar — diseño web', () => {
  test.use({ viewport: designs[1].viewport })

  test('no existe el gesto', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Playwright solo simula toques en Chromium')
    await seedChild(page, { withConsultation: false })
    await page.goto('/home')
    await expect(page.getByRole('main').getByText('Mateo Morales').first()).toBeVisible()
    let requests = 0
    page.on('request', (request) => {
      if (/\/accounts\/me$/.test(request.url())) requests++
    })

    await pull(page, 100, 260)
    await page.waitForTimeout(500)

    expect(requests).toBe(0)
    await expect(page.getByText('Actualizando…')).toHaveCount(0)
  })
})

for (const design of designs) {
  test.describe(`Aviso de versión nueva — diseño ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    const publish = (page: Page, version: string) =>
      page.route('**/version.json*', (route) =>
        route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version }) }),
      )

    test('aparece cuando hay una versión nueva y "Actualizar" recarga la app', async ({ page }) => {
      await seedChild(page, { withConsultation: false })
      await publish(page, 'version-nueva')
      await page.goto('/home')

      const bar = page.getByRole('status').filter({ hasText: 'Hay una versión nueva' })
      await expect(bar).toBeVisible()
      await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1))

      await page.getByRole('button', { name: 'Actualizar' }).click()

      await expect
        .poll(() => page.evaluate(() => (window as unknown as { marker?: number }).marker))
        .toBeUndefined()
    })

    test('con algo escrito en "Nueva consulta" pide confirmación antes de recargar', async ({ page }) => {
      const { childId } = await seedChild(page, { withConsultation: false })
      await publish(page, 'version-nueva')
      await page.goto(`/children/${childId}/consultations/new`)
      await page.getByLabel('Doctor').fill('Dra. Laura Cázares')
      await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1))

      const dialogs: string[] = []
      page.once('dialog', async (dialog) => {
        dialogs.push(dialog.message())
        await dialog.dismiss()
      })
      await page.getByRole('button', { name: 'Actualizar' }).click()

      await expect.poll(() => dialogs.length).toBe(1)
      expect(dialogs[0]).toContain('Se perderá lo que capturaste')
      await expect(page.getByLabel('Doctor')).toHaveValue('Dra. Laura Cázares')
      expect(await page.evaluate(() => (window as unknown as { marker: number }).marker)).toBe(1)
    })

    test('sin versión nueva, o sin un version.json válido, no hay aviso', async ({ page }) => {
      await seedChild(page, { withConsultation: false })
      await page.route('**/version.json*', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }))
      await page.goto('/home')
      await expect(page.getByRole('main').getByText('Mateo Morales').first()).toBeVisible()

      await expect(page.getByText('Hay una versión nueva')).toHaveCount(0)
    })
  })
}
