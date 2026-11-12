import type { Browser, BrowserContext, Page } from '@playwright/test'
import { test, expect, seedChild, apiPost, allowClerkOn } from './helpers'

// specs/067: the app installed on a phone opens without a signal and shows what it already saw — read only, with the hour of the
// data; a computer keeps nothing. Needs the BUILT app (the service worker precaches only there): CI runs `vite preview`; locally,
// `npm run build && npx vite preview --port 5173 --strictPort` before `npx playwright test e2e/sin-conexion.spec.ts`.

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const PHONE = { width: 390, height: 844 }
const COMPUTER = { width: 1280, height: 800 }

test.use({ serviceWorkers: 'allow' })
test.skip(({ browserName }) => browserName !== 'chromium', 'offline with a service worker is checked in Chromium')

// The dev server (`npm run dev`) has no precache: these tests need the built app, as CI serves it. Locally they say so and skip.
let built = false
test.beforeAll(async ({ request }) => {
  const sw = await request.get('/sw.js')
  built = sw.ok() && (await sw.text()).includes('"url":"index.html"')
})
test.beforeEach(() => {
  test.skip(!built, 'needs the built app: npm run build && npx vite preview --port 5173 --strictPort')
})

/** The page runs as the app installed on the home screen (there is no real «display-mode» to emulate). */
async function asInstalledApp(context: BrowserContext) {
  await context.addInitScript(() => {
    const original = window.matchMedia.bind(window)
    window.matchMedia = (query: string) =>
      query.includes('display-mode: standalone') ? ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList) : original(query)
  })
}

/** The service worker is active (its precache done) and controls the page. */
async function serviceWorkerReady(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
}

/** The answers the phone kept (keys only). */
async function keptKeys(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const req = indexedDB.open('peditrack-offline')
        req.onerror = () => resolve([])
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('queries')) return resolve([])
          const keys = db.transaction('queries').objectStore('queries').getAllKeys()
          keys.onsuccess = () => resolve((keys.result as string[]).filter((k) => k !== '__meta__'))
          keys.onerror = () => resolve([])
        }
      }),
  )
}

async function databaseExists(page: Page): Promise<boolean> {
  return page.evaluate(async () => ((await indexedDB.databases()) ?? []).some((db) => db.name === 'peditrack-offline'))
}

async function newPhone(browser: Browser) {
  const context = await browser.newContext({ viewport: PHONE, userAgent: IPHONE, serviceWorkers: 'allow' })
  await asInstalledApp(context)
  return { context, page: await context.newPage() }
}

test.describe('Sin conexión — app instalada en el teléfono (390 px)', () => {
  test.use({ viewport: PHONE, userAgent: IPHONE })

  test('abre sin señal con lo que ya vio, no deja marcar ni guardar, y vuelve sola con la red', async ({ page, context }) => {
    await asInstalledApp(context)
    const { childId, consultationId } = await seedChild(page)
    await page.goto('/home')
    await serviceWorkerReady(page)

    // Seen with a connection: the home, the child and the consultation.
    await expect(page.getByText('Mateo').first()).toBeVisible()
    await page.goto(`/children/${childId}`)
    await expect(page.getByRole('heading', { name: 'Mateo' })).toBeVisible()
    await page.goto(`/consultations/${consultationId}`)
    await expect(page.getByRole('button', { name: 'Toma de 08:00' })).toBeVisible()
    await expect.poll(async () => (await keptKeys(page)).some((k) => k.includes('"consultation"'))).toBe(true)

    await context.setOffline(true)
    await page.reload()
    const banner = page.locator('[data-offline-banner]')
    await expect(banner).toHaveText(/^Sin conexión · datos de/)
    await expect(page.getByRole('button', { name: 'Toma de 08:00' })).toBeVisible()

    // The prescription was never kept.
    await page.getByRole('button', { name: /Datos de la consulta/ }).click()
    await expect(page.getByText('La foto necesita conexión.')).toBeVisible()

    // Marking doesn't paint nor send anything.
    const dose = page.getByRole('button', { name: 'Toma de 08:00' })
    const before = await dose.getAttribute('aria-pressed')
    await dose.click()
    await expect(page.getByText('Marcar necesita conexión. Tu marca no se guardó.')).toBeVisible()
    await expect(dose).toHaveAttribute('aria-pressed', before ?? 'false')

    // A screen never opened.
    await page.goto(`/consultations/00000000-0000-0000-0000-000000000000`)
    await expect(page.getByText('Esta pantalla necesita conexión.')).toBeVisible()

    // The child's page from the copy, and its history needs the network.
    await page.goto(`/children/${childId}`)
    await expect(page.getByRole('heading', { name: 'Mateo' })).toBeVisible()
    await page.goto(`/children/${childId}/historial`)
    await expect(page.getByText('Esta pantalla necesita conexión.')).toBeVisible()

    // The network comes back: the app loads again by itself and the banner goes.
    await page.goto(`/children/${childId}`)
    await context.setOffline(false)
    await expect(banner).toHaveText('', { timeout: 20_000 })
    await expect(page.getByRole('heading', { name: 'Mateo' })).toBeVisible()
  })

  test('cerrar sesión deja el teléfono sin nada; sin señal pide conexión', async ({ page, context }) => {
    await asInstalledApp(context)
    const { consultationId } = await seedChild(page)
    await page.goto(`/consultations/${consultationId}`)
    await serviceWorkerReady(page)
    await expect(page.getByRole('button', { name: 'Toma de 08:00' })).toBeVisible()
    await expect.poll(async () => (await keptKeys(page)).length).toBeGreaterThan(0)

    await page.goto('/home')
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(page).toHaveURL(/\/login/)
    expect(await keptKeys(page)).toEqual([])

    await context.setOffline(true)
    await page.goto('/home')
    await expect(page.getByRole('heading', { name: 'Necesitas conexión para abrir PediTrack' })).toBeVisible()
  })
})

test.describe('Sin conexión — computadora (1280 px)', () => {
  test.use({ viewport: COMPUTER })

  test('no guarda nada y sin señal pide conexión', async ({ page, context }) => {
    const { consultationId } = await seedChild(page)
    await page.goto(`/consultations/${consultationId}`)
    await serviceWorkerReady(page)
    await expect(page.getByRole('button', { name: 'Toma de 08:00' })).toBeVisible()
    expect(await databaseExists(page)).toBe(false)

    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Necesitas conexión para abrir PediTrack' })).toBeVisible({ timeout: 15_000 })
    expect(await databaseExists(page)).toBe(false)
  })
})

test.describe('Sin conexión — teléfono del hijo', () => {
  test('abre «Hoy» sin señal con sus tomas y no deja marcar', async ({ page, browser }) => {
    await allowClerkOn(page)
    const owner = await seedChild(page)
    const link = await apiPost(page.context().request, owner.token, `/children/${owner.childId}/device-links`, { name: 'Teléfono de Mateo' })

    const phone = await newPhone(browser)
    await phone.page.goto(`/hijo#${link.token}`)
    await expect(phone.page.getByRole('heading', { name: 'Hola, Mateo' })).toBeVisible()
    await serviceWorkerReady(phone.page)
    const dose = phone.page.getByRole('button', { name: 'Marcar Amoxicilina de las 08:00', exact: true })
    await expect(dose).toBeVisible()
    await expect.poll(async () => (await keptKeys(phone.page)).length).toBeGreaterThan(0)

    await phone.context.setOffline(true)
    await phone.page.reload()
    await expect(phone.page.getByRole('heading', { name: 'Hola, Mateo' })).toBeVisible()
    await expect(phone.page.locator('[data-offline-banner]')).toHaveText(/^Sin conexión · datos de/)
    await dose.click()
    await expect(phone.page.getByText('Marcar necesita conexión. Tu marca no se guardó.')).toBeVisible()
    await phone.context.close()
  })
})
