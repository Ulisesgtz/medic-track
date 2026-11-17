import type { Page } from '@playwright/test'
import {
  childDeviceLinkViaApi,
  designs,
  expect,
  queryDb,
  redeemChildLinkViaApi,
  seedChild,
  test,
} from './helpers'

// specs/072-monitoreo-errores-frontend: a screen that breaks shows the error screen (A–F of the mock) and the phone reports the
// error, cleaned, to POST /client-errors (a row `client:<route>` in error_logs). The routes `/__prueba-error`, `/__prueba-error/pagina`
// and `/hijo/__prueba-error` exist only in the E2E build (VITE_TEST_ERROR_ROUTE). The server writes ONE row per equal error every
// 5 minutes, so every test passes a `?marca=` of its own (letters only) that goes into the message and finds its own row.

interface ClientRow {
  endpoint: string
  message: string
  account_id: string | null
  http_status: number | null
}

async function rowsFor(mark: string): Promise<ClientRow[]> {
  return queryDb<ClientRow>(
    `SELECT endpoint, message, account_id, http_status FROM error_logs WHERE endpoint LIKE 'client:%' AND message LIKE $1 ORDER BY created_at`,
    [`%${mark}%`],
  )
}

/** The report leaves ~3 s after the error (it is grouped), so the row is waited for. */
async function waitForRows(mark: string, count: number): Promise<ClientRow[]> {
  await expect.poll(async () => (await rowsFor(mark)).length, { timeout: 20_000 }).toBeGreaterThanOrEqual(count)
  return rowsFor(mark)
}

const TITLE = 'Algo no cargó bien'

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0)
}

for (const design of designs) {
  const word = design.isWeb ? 'web' : 'movil'

  test.describe(`pantalla de error (${design.name})`, () => {
    test.use({ viewport: design.viewport })

    test('A: una pantalla con sesión que truena muestra el error con el marco de la app, se reporta limpio y «Ir al inicio» vuelve', async ({
      page,
    }) => {
      const mark = `casoa${word}`
      await seedChild(page, { withConsultation: false })
      await page.goto(`/__prueba-error?marca=${mark}`)

      await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeFocused()
      await expect(page.getByText('Lo que ya guardaste sigue en tu cuenta. Vuelve a cargar la pantalla para seguir.')).toBeVisible()
      await expect(page.getByText('El aviso del problema se envía solo.')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Volver a cargar' })).toBeVisible()
      // The sidebar of the web design stays around the error (the frame is the app's own).
      if (design.isWeb) await expect(page.locator('aside')).toBeVisible()
      await expectNoHorizontalScroll(page)

      const [row] = await waitForRows(mark, 1)
      expect(row.endpoint).toBe('client:/__prueba-error')
      expect(row.message).toMatch(/^render · Prueba de pantalla de error /)
      expect(row.account_id, 'a client report never carries the account').toBeNull()
      expect(row.http_status).toBeNull()
      expect(row.message).not.toMatch(/@/)

      await page.getByRole('button', { name: 'Ir al inicio' }).click()
      await expect(page).toHaveURL(/\/home$/)
    })

    test('E: si vuelve a tronar justo después de «Volver a cargar», dice que sigue sin cargar y la salida pasa a ser lo sólido', async ({
      page,
    }) => {
      await seedChild(page, { withConsultation: false })
      await page.goto(`/__prueba-error?marca=casoe${word}`)
      await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible()

      await page.getByRole('button', { name: 'Volver a cargar' }).click()

      await expect(page.getByText('Sigue sin cargar. Intenta más tarde o regresa al inicio.')).toBeVisible()
      await expect(page.getByText('Lo que ya guardaste sigue en tu cuenta.')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Ir al inicio' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Volver a cargar' })).toBeVisible()
    })

    test('B: si truena el armazón (sin la barra) muestra la página completa con el logo', async ({ page }) => {
      await seedChild(page, { withConsultation: false })
      await page.goto(`/__prueba-error/pagina?marca=casob${word}`)

      await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Ir al inicio' })).toBeVisible()
      await expect(page.locator('aside')).toHaveCount(0)
      await expectNoHorizontalScroll(page)
    })

    test('D: sin sesión el aviso lleva a iniciar sesión', async ({ page }) => {
      await page.goto(`/__prueba-error?marca=casod${word}`)

      await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible()
      await expect(
        page.getByText('Si ya tenías una cuenta, tus registros siguen ahí. Vuelve a cargar la pantalla para seguir.'),
      ).toBeVisible()
      await page.getByRole('button', { name: 'Ir a iniciar sesión' }).click()
      await expect(page).toHaveURL(/\/login$/)
    })

    test('C: el teléfono del hijo ve su propio aviso, sin la nota del envío, y «Ir a Hoy» lo lleva a su pantalla', async ({
      page,
      browser,
    }) => {
      const mark = `casoc${word}`
      const owner = await seedChild(page, { withConsultation: false })
      const link = await childDeviceLinkViaApi(page.context().request, owner.token, owner.childId)
      const credential = await redeemChildLinkViaApi(page.context().request, link.token)

      const phone = await browser.newContext({
        viewport: design.viewport,
        storageState: {
          cookies: [],
          origins: [
            { origin: 'http://localhost:5173', localStorage: [{ name: 'hijo-credencial', value: credential }] },
          ],
        },
      })
      try {
        const childPage = await phone.newPage()
        await childPage.goto(`/hijo/__prueba-error?marca=${mark}`)

        await expect(childPage.getByRole('heading', { level: 1, name: TITLE })).toBeVisible()
        await expect(
          childPage.getByText('Lo que ya marcaste sigue guardado. Vuelve a cargar la pantalla para seguir.'),
        ).toBeVisible()
        await expect(childPage.getByText('El aviso del problema se envía solo.')).toHaveCount(0)
        await expectNoHorizontalScroll(childPage)

        const [row] = await waitForRows(mark, 1)
        expect(row.endpoint).toBe('client:/hijo/__prueba-error')
        expect(row.account_id).toBeNull()

        await childPage.getByRole('button', { name: 'Ir a Hoy' }).click()
        await expect(childPage).toHaveURL(/\/hijo\/hoy$/)
      } finally {
        await phone.close()
      }
    })

    test('F: sin conexión dice que no hay conexión y no se manda ningún reporte', async ({ page, context }) => {
      const mark = `casof${word}`
      const reports: string[] = []
      page.on('request', (request) => {
        if (request.url().includes('/client-errors')) reports.push(request.url())
      })
      await seedChild(page, { withConsultation: false })
      await page.goto(`/__prueba-error?marca=${mark}`)
      await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible()

      // Before the report leaves (it waits ~3 s). Some engines don't tell the page the network is gone until a request fails.
      await context.setOffline(true)
      await page.evaluate(() => fetch('http://localhost:8080/catalog/countries').catch(() => undefined))

      await expect(page.getByRole('heading', { level: 1, name: 'Parece que no hay conexión' })).toBeVisible()
      await expect(page.getByText('Cuando vuelva la señal, vuelve a cargar la pantalla.')).toBeVisible()
      await expect(page.getByText('El aviso del problema se envía solo.')).toHaveCount(0)

      // Past the 3 s of grouping, with room to spare.
      await page.waitForTimeout(5_000)
      expect(reports, 'nothing is sent without a connection').toEqual([])
      expect(await rowsFor(mark)).toEqual([])
    })

    test('un error y una promesa rechazada que nadie atrapó se reportan como `error` y `rejection`', async ({ page }) => {
      const mark = `casoq${word}`
      await seedChild(page, { withConsultation: false })
      await page.goto(`/__prueba-error?tipo=asincrono&marca=${mark}`)

      await expect(page.getByText('Prueba de errores en segundo plano.')).toBeVisible()
      const rows = await waitForRows(mark, 2)
      const messages = rows.map((row) => row.message)
      expect(messages.some((m) => m.startsWith('error · Prueba de error asincrono'))).toBe(true)
      expect(messages.some((m) => m.startsWith('rejection · Prueba de promesa rechazada'))).toBe(true)
      for (const row of rows) {
        expect(row.endpoint).toBe('client:/__prueba-error')
        expect(row.account_id).toBeNull()
      }
    })
  })
}
