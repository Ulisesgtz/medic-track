import type { Page } from '@playwright/test'
import { test, expect, allowClerkOn, designs, seedAccount, sessionToken, signInAs } from './helpers'

// specs/011-recordatorios-push: turning dose reminders on and off from the home, at 390 and 1280 px.
// Playwright's browsers can't receive real pushes (research.md R12), so the browser's notification
// permission and push subscription are stubbed in the page; what's checked is what reaches the
// backend. Sending the reminder itself is covered by the backend's integration test.

const API = 'http://localhost:8080'

/** Stubs the permission prompt (always granted) and the push subscription of this page. */
async function stubBrowserPush(page: Page) {
  await page.addInitScript(() => {
    if (typeof PushManager === 'undefined' || typeof Notification === 'undefined') return
    let permission: NotificationPermission = 'default'
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => permission })
    Notification.requestPermission = async () => {
      permission = 'granted'
      return permission
    }
    const endpoint = `https://fcm.googleapis.com/fcm/send/e2e-${Math.random().toString(36).slice(2)}`
    let current: PushSubscription | null = null
    const make = () =>
      ({
        endpoint,
        expirationTime: null,
        toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: 'e2e-p256dh', auth: 'e2e-auth' } }),
        unsubscribe: async () => {
          current = null
          return true
        },
      }) as unknown as PushSubscription
    PushManager.prototype.subscribe = async function () {
      current = make()
      return current
    }
    PushManager.prototype.getSubscription = async function () {
      return current
    }
  })
}

async function reminderDetailOf(page: Page) {
  const token = await sessionToken(page)
  const res = await page.context().request.get(`${API}/accounts/me`, { headers: { Authorization: `Bearer ${token}` } })
  return (await res.json()).reminderDetail as string | null
}

const child = [{ firstName: 'Mateo', lastName: 'Morales', birthDate: '2021-03-14' }]

for (const design of designs) {
  test.describe(`Recordatorios — diseño ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test.beforeEach(async ({ page }) => {
      await allowClerkOn(page)
      await stubBrowserPush(page)
    })

    test('la primera activación pide elegir el texto, registra el dispositivo y se puede desactivar', async ({ page }) => {
      await seedAccount(page, child)
      await page.goto('/home')
      const card = page.getByRole('region', { name: 'Recordatorios de tomas' })
      await expect(card).toContainText('no una alarma garantizada')

      await card.getByRole('button', { name: 'Activar recordatorios' }).click()
      const dialog = page.getByRole('dialog', { name: '¿Qué muestran los avisos?' })
      await expect(dialog).toContainText('Amoxicilina · 8:00 · Mateo')

      const registered = page.waitForResponse((r) => r.url().endsWith('/reminder-devices') && r.request().method() === 'POST')
      await dialog.getByRole('button', { name: /Texto genérico/ }).click()
      expect((await registered).status()).toBe(201)

      await expect(card).toContainText('Activos en este dispositivo.')
      await expect(card).toContainText('un texto genérico')
      await expect.poll(() => reminderDetailOf(page)).toBe('generic')

      const removed = page.waitForResponse((r) => r.url().endsWith('/reminder-devices/remove'))
      await card.getByRole('button', { name: 'Desactivar recordatorios' }).click()
      expect((await removed).status()).toBe(204)
      await expect(card.getByRole('button', { name: 'Activar recordatorios' })).toBeVisible()
    })

    test('en otro dispositivo de la misma cuenta ya no pregunta; cerrar sesión lo desactiva', async ({ page, browser }) => {
      const { email } = await seedAccount(page, child)
      await page.goto('/home')
      await page.getByRole('button', { name: 'Activar recordatorios' }).click()
      await page.getByRole('dialog').getByRole('button', { name: /Mostrar detalle/ }).click()
      await expect(page.getByRole('region', { name: 'Recordatorios de tomas' })).toContainText('el detalle de la toma')

      const other = await browser.newContext({ viewport: design.viewport })
      const second = await other.newPage()
      await allowClerkOn(second)
      await stubBrowserPush(second)
      await signInAs(second, email)
      await second.goto('/home')
      const card = second.getByRole('region', { name: 'Recordatorios de tomas' })

      const registered = second.waitForResponse((r) => r.url().endsWith('/reminder-devices') && r.request().method() === 'POST')
      await card.getByRole('button', { name: 'Activar recordatorios' }).click()
      expect((await registered).status()).toBe(201)
      await expect(second.getByRole('dialog')).toHaveCount(0)
      await expect(card).toContainText('Activos en este dispositivo.')

      const removed = second.waitForResponse((r) => r.url().endsWith('/reminder-devices/remove'))
      await second.getByRole('button', { name: 'Cerrar sesión' }).first().click()
      expect((await removed).status()).toBe(204)
      await expect(second).toHaveURL(/\/login/)
      await other.close()
    })
  })
}

test('un navegador sin notificaciones push dice que no puede recibir recordatorios, sin botón', async ({ page }) => {
  await allowClerkOn(page)
  // What a browser without the Push API looks like (research.md R11).
  await page.addInitScript(() => {
    delete (window as unknown as { PushManager?: unknown }).PushManager
  })
  await seedAccount(page, child)
  await page.goto('/home')

  const card = page.getByRole('region', { name: 'Recordatorios de tomas' })
  await expect(card).toContainText('Este navegador no puede recibir recordatorios.')
  await expect(card.getByRole('button', { name: 'Activar recordatorios' })).toHaveCount(0)
  await expect(card).toContainText('no una alarma garantizada')
})
