import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright'
import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { createClerkUser, E2E_MARKER, E2E_PASSWORD, E2E_VERIFICATION_CODE } from './clerkApi'

export { E2E_PASSWORD }

/**
 * The app has two separate designs (see frontend/CLAUDE.md, "Web y móvil"):
 * the phone mocks below 900px and the web mocks from 900px. Every E2E flow
 * that touches a screen runs once per design, so neither can silently break.
 */
export const designs = [
  { name: 'móvil', viewport: { width: 390, height: 844 }, isWeb: false },
  { name: 'web', viewport: { width: 1280, height: 800 }, isWeb: true },
] as const

const API = 'http://localhost:8080'

/**
 * A fresh, recognisable test address: the marker lets the global teardown delete every user
 * the suite made, and `+clerk_test` makes Clerk accept the fixed verification code.
 */
export const uniqueEmail = (prefix: string) =>
  `${prefix}.${E2E_MARKER}.${Date.now()}${Math.random().toString(36).slice(2, 7)}+clerk_test@example.com`

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
  await page.getByLabel('Contraseña', { exact: true }).fill(E2E_PASSWORD)
  const child = data.child ?? { firstName: 'Luis', lastName: 'Gómez', birthDate: '2020-01-15' }
  await page.locator('#children\\.0\\.firstName').fill(child.firstName)
  await page.locator('#children\\.0\\.lastName').fill(child.lastName)
  await page.locator('#children\\.0\\.birthDate').fill(child.birthDate)
}

/**
 * Lets the page through Clerk's bot protection (the signup's CAPTCHA is meant to block
 * automation). Every test that submits a Clerk form on the page needs it.
 */
export async function allowClerkOn(page: Page) {
  await setupClerkTestingToken({ page })
}

/**
 * After "Crear cuenta": Clerk may ask for the emailed code first (its email verification setting);
 * a `+clerk_test` address always accepts 424242. Waits until either the code step or /home shows up.
 */
export async function finishEmailVerificationIfAsked(page: Page) {
  const code = page.getByLabel('Código de verificación')
  // Whatever comes first: the code step, the home, or an error the form shows itself.
  await expect(code.or(page.getByRole('heading', { level: 1, name: 'Tus hijos', exact: true })).or(page.getByRole('alert').filter({ hasText: /\S/ }))).toBeVisible({
    timeout: 15_000,
  })
  if (await code.isVisible()) {
    await code.fill(E2E_VERIFICATION_CODE)
    await page.getByRole('button', { name: 'Verificar código' }).click()
  }
}

/** Signs up an account with one child through the real form and waits for the home. */
export async function signUp(page: Page, data: SignupData = {}) {
  await allowClerkOn(page)
  await page.goto('/signup')
  await fillSignup(page, data)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await finishEmailVerificationIfAsked(page)
  await expect(page).toHaveURL(/\/home/, { timeout: 15_000 })
}

/**
 * Signs the page in as an existing Clerk user without going through the login form (a ticket
 * minted with the secret key), then it is a normal signed-in browser.
 */
export async function signInAs(page: Page, emailAddress: string) {
  await page.goto('/login')
  await clerk.signIn({ page, emailAddress })
}

/** The signed-in page's session token, the same Bearer token the app sends to the backend. */
export async function sessionToken(page: Page): Promise<string> {
  const token = await page.evaluate(async () => {
    const w = window as unknown as { Clerk: { session: { getToken(): Promise<string | null> } } }
    return w.Clerk.session.getToken()
  })
  if (!token) throw new Error('The page has no Clerk session token')
  return token
}

const authed = (token: string) => ({ Authorization: `Bearer ${token}` })

/** POST to the backend as the signed-in tutor whose token this is. */
export async function apiPost(request: APIRequestContext, token: string, path: string, data: unknown) {
  const res = await request.post(`${API}${path}`, { data, headers: authed(token) })
  expect(res.ok(), `POST ${path} -> ${res.status()} ${await res.text()}`).toBeTruthy()
  return res.json()
}

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/**
 * Creates a real Clerk user, signs the page in as them and creates their PediTrack account (with
 * the given children) straight through the API. Returns the session token so a test can keep
 * calling the API as that tutor.
 */
export async function seedAccount(
  page: Page,
  children: { firstName: string; lastName: string; birthDate: string }[],
) {
  const email = uniqueEmail('seed')
  await createClerkUser(email)
  await signInAs(page, email)
  const token = await sessionToken(page)
  const account = await apiPost(page.context().request, token, '/accounts', { firstName: 'Ana', lastName: 'Morales', children })
  return { account, token, email }
}

/**
 * Like `seedAccount` with one child (Mateo, born 2021-03-14) and, if asked, a consultation today with
 * three doses of "Amoxicilina" (00:00, 08:00 and 16:00 in the browser's own time zone — the same
 * one the app sends). The page ends up signed in; returns the ids and the session token so a test
 * can keep calling the API as that tutor.
 */
export async function seedChild(
  page: Page,
  { withConsultation = true, durationDays = 1 }: { withConsultation?: boolean; durationDays?: number } = {},
) {
  const { account, token, email } = await seedAccount(page, [{ firstName: 'Mateo', lastName: 'Morales', birthDate: '2021-03-14' }])
  const request = page.context().request
  const childId: string = account.children[0].id
  let consultationId: string | undefined
  if (withConsultation) {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const created = await apiPost(request, token, `/children/${childId}/consultations`, {
      doctorName: 'Dra. Laura Cázares',
      consultDate: today,
      photoBase64: PNG_BASE64,
      symptoms: 'Fiebre y tos',
      utcOffsetMinutes: -now.getTimezoneOffset() || 0,
      medications: [{ name: 'Amoxicilina', frequencyHours: 8, durationDays, startTime: '00:00' }],
    })
    consultationId = created.id
  }
  return { accountId: account.id as string, childId, consultationId, token, email }
}
