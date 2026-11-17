import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import type { Page } from '@playwright/test'
import { test, expect, allowClerkOn, designs, seedAccount, PNG_BASE64 } from './helpers'

// specs/071-primer-uso-guiado, the critical flow (research R12), at 390 and 1280 px: «Antes de empezar» as a window that only
// «Entendido» closes → the «Primeros pasos» guide → «Ahora no» → the notice and the row to open it again → it stays closed after
// a reload → the row brings it back → the first consultation → step 1 done → the reminders → the guide says goodbye and is gone.
//
// Playwright's browsers can't receive real pushes (see recordatorios.spec.ts), so the notification permission and the push
// subscription are stubbed in the page exactly as that spec does; what is checked is what the app shows and what reaches the API.

/** The permission prompt (granted when asked), the service worker registration and the push subscription of this page. */
async function stubBrowserPush(page: Page) {
  await page.addInitScript(() => {
    if (typeof PushManager === 'undefined' || typeof Notification === 'undefined') return
    const registration = { pushManager: PushManager.prototype } as unknown as ServiceWorkerRegistration
    const container = navigator.serviceWorker ?? ({} as ServiceWorkerContainer)
    Object.defineProperty(container, 'ready', { configurable: true, get: () => Promise.resolve(registration) })
    container.getRegistration = async () => registration
    if (!('serviceWorker' in navigator)) {
      Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container })
    }
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

function writeTempImage(): string {
  const filePath = path.join(os.tmpdir(), `receta-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`)
  fs.writeFileSync(filePath, Buffer.from(PNG_BASE64, 'base64'))
  return filePath
}

const mateo = [{ firstName: 'Mateo', lastName: 'Morales', birthDate: '2021-03-14' }]

for (const design of designs) {
  test.describe(`Primer uso guiado — diseño ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('la ventana, la guía, «Ahora no» y reabrirla, la primera consulta y los avisos', async ({ page }) => {
      await allowClerkOn(page)
      await stubBrowserPush(page)
      await seedAccount(page, mateo, { acknowledgeDisclaimer: false })
      await page.goto('/home')

      // A0: «Antes de empezar» is a window; Escape does not close it, «Entendido» does, and the guide waits behind it.
      const notice = page.getByRole('dialog', { name: 'Antes de empezar' })
      await expect(notice).toBeVisible()
      await expect(page.getByRole('region', { name: 'Primeros pasos' })).toHaveCount(0)
      await page.keyboard.press('Escape')
      await expect(notice).toBeVisible()
      await notice.getByRole('button', { name: 'Entendido' }).click()
      await expect(notice).toHaveCount(0)

      // A: the guide, with its steps pending and the first one's button as the only solid one.
      const guide = page.getByRole('region', { name: 'Primeros pasos' })
      await expect(guide).toBeVisible()
      await expect(guide.getByText('Registra tu primera consulta')).toBeVisible()
      await expect(guide.getByText('Activa los recordatorios')).toBeVisible()
      await expect(guide.getByRole('link', { name: 'Nueva consulta' })).toBeVisible()
      await expect(guide).not.toContainText(/plan|gratis|precio/i)

      // F: «Ahora no» closes it for the account, says where it is, and leaves the row of «Lo demás».
      await guide.getByRole('button', { name: 'Ahora no' }).click()
      await expect(page.getByRole('status').filter({ hasText: 'Cerraste la guía' })).toBeVisible()
      await expect(guide).toHaveCount(0)
      const more = page.getByRole('navigation', { name: 'Más opciones' })
      const row = more.getByRole('button', { name: /^Primeros pasos/ })
      await expect(row).toContainText('Ver guía')

      // It stays closed after a reload (it is the account's, kept by the server), the row is still there.
      await page.reload()
      await expect(more.getByRole('button', { name: /^Primeros pasos/ })).toBeVisible()
      await expect(page.getByRole('region', { name: 'Primeros pasos' })).toHaveCount(0)

      // The row brings it back.
      await more.getByRole('button', { name: /^Primeros pasos/ }).click()
      await expect(page.getByRole('region', { name: 'Primeros pasos' })).toBeVisible()
      await expect(more.getByRole('button', { name: /^Primeros pasos/ })).toHaveCount(0)

      // Step 1 goes to the form of the child's first consultation; after saving it, the step is done with its doctor.
      await page.getByRole('region', { name: 'Primeros pasos' }).getByRole('link', { name: 'Nueva consulta' }).click()
      await expect(page).toHaveURL(/\/children\/[^/]+\/consultations\/new/)
      await page.getByLabel('Doctor').fill('Dra. López')
      await page.getByLabel('Fecha', { exact: true }).fill('2026-01-15')
      await page.getByLabel('Foto de la receta').setInputFiles(writeTempImage())
      await page.locator('#medications\\.0\\.name').fill('Amoxicilina')
      await page.locator('#medications\\.0\\.frequencyHours').fill('c/8 h')
      await page.locator('#medications\\.0\\.durationDays').fill('3 días')
      await page.locator('#medications\\.0\\.startTime').fill('08:00')
      await page.getByRole('button', { name: 'Guardar consulta' }).click()
      await expect(page).toHaveURL(/\/consultations\/(?!new)/)

      await page.goto('/home')
      const open = page.getByRole('region', { name: 'Primeros pasos' })
      await expect(open.getByText('Registraste la consulta con Dra. López.')).toBeVisible()
      await expect(open.getByRole('link', { name: 'Ver consulta' })).toBeVisible()
      await expect(open.getByRole('img', { name: 'Hecho' })).toHaveCount(1)

      // Step 3: the first time the account chooses what the reminders show; then they are on and the guide says goodbye.
      await open.getByRole('button', { name: 'Activar recordatorios' }).click()
      await page.getByRole('dialog').getByRole('button', { name: /Mostrar detalle/ }).click()
      const goodbye = page.getByRole('status').filter({ hasText: 'Esta guía ya no se mostrará.' })
      await expect(goodbye).toBeVisible()
      await expect(page.getByRole('region', { name: 'Primeros pasos' })).toHaveCount(0)

      // From then on, on this device, nothing: not the guide, not the row.
      await page.reload()
      await expect(page.getByRole('navigation', { name: 'Más opciones' })).toBeVisible()
      await expect(page.getByRole('region', { name: 'Primeros pasos' })).toHaveCount(0)
      await expect(page.getByRole('status').filter({ hasText: 'Esta guía ya no se mostrará.' })).toHaveCount(0)
    })
  })
}
