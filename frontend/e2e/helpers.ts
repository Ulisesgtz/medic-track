import { expect, type APIRequestContext, type Page } from '@playwright/test'

/**
 * The app has two separate designs (see frontend/CLAUDE.md, "Web y móvil"):
 * the phone mocks below 900px and the web mocks from 900px. Every E2E flow
 * that touches a screen runs once per design, so neither can silently break.
 */
export const designs = [
  { name: 'móvil', viewport: { width: 390, height: 844 }, isWeb: false },
  { name: 'web', viewport: { width: 1280, height: 800 }, isWeb: true },
] as const

export const uniqueEmail = (prefix: string) =>
  `${prefix}.e2e.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`

interface SignupData {
  firstName?: string
  lastName?: string
  email?: string
  child?: { firstName: string; lastName: string; birthDate: string }
}

/** Fills the signup form (the same fields in both designs) without submitting it. */
export async function fillSignup(page: Page, data: SignupData = {}) {
  await page.getByLabel('Tu nombre').fill(data.firstName ?? 'Ana')
  await page.getByLabel('Tu apellido').fill(data.lastName ?? 'Gómez')
  await page.getByLabel('Correo').fill(data.email ?? uniqueEmail('ana'))
  // Both designs ask for a password (mocks 01/11); it is validated but never stored.
  await page.getByLabel('Contraseña').fill('secreto123')
  const child = data.child ?? { firstName: 'Luis', lastName: 'Gómez', birthDate: '2020-01-15' }
  await page.locator('#children\\.0\\.firstName').fill(child.firstName)
  await page.locator('#children\\.0\\.lastName').fill(child.lastName)
  await page.locator('#children\\.0\\.birthDate').fill(child.birthDate)
}

/** Signs up an account with one child and waits for the home. */
export async function signUp(page: Page, data: SignupData = {}) {
  await page.goto('/signup')
  await fillSignup(page, data)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL(/\/home/)
}

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/**
 * Creates, straight through the API, an account with one child (Mateo, born 2021-03-14)
 * and, if asked, a consultation today with three doses of "Amoxicilina" (00:00, 08:00
 * and 16:00 in the browser's own time zone — the same one the app sends). Returns the
 * ids; the caller opens the app with `saveAccount`.
 */
export async function seedChild(
  request: APIRequestContext,
  { withConsultation = true, durationDays = 1 }: { withConsultation?: boolean; durationDays?: number } = {},
) {
  const res = await request.post('http://localhost:8080/accounts', {
    data: {
      firstName: 'Ana',
      lastName: 'Morales',
      email: uniqueEmail('seed'),
      children: [{ firstName: 'Mateo', lastName: 'Morales', birthDate: '2021-03-14' }],
    },
  })
  const account = await res.json()
  const childId: string = account.children[0].id
  let consultationId: string | undefined
  if (withConsultation) {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const created = await request.post(`http://localhost:8080/children/${childId}/consultations`, {
      data: {
        doctorName: 'Dra. Laura Cázares',
        consultDate: today,
        photoBase64: PNG_BASE64,
        symptoms: 'Fiebre y tos',
        utcOffsetMinutes: -now.getTimezoneOffset() || 0,
        medications: [{ name: 'Amoxicilina', frequencyHours: 8, durationDays, startTime: '00:00' }],
      },
    })
    consultationId = (await created.json()).id
  }
  return { accountId: account.id as string, childId, consultationId }
}

/** Opens the app as that account (the saved `account_id` is the only "session"). */
export async function saveAccount(page: Page, accountId: string) {
  await page.addInitScript((id) => localStorage.setItem('peditrack.accountId', id), accountId)
}
