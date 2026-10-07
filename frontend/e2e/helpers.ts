import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright'
import { expect, test as base, type APIRequestContext, type Page } from '@playwright/test'
import { Client } from 'pg'
import { createClerkUser, deleteUsersByEmail, E2E_MARKER, E2E_PASSWORD, E2E_VERIFICATION_CODE, pruneOldE2EUsers, retryWhileRateLimited } from './clerkApi'

export { E2E_PASSWORD, expect }

// Every address `uniqueEmail` hands out in this worker (a worker runs one test at a time).
const madeInThisTest: string[] = []

/**
 * `test` of the E2E suite: Playwright's own plus an automatic step that deletes the Clerk users the
 * test made once it ends, pass or fail. Import it from here, not from `@playwright/test`.
 */
export const test = base.extend<{ deleteTestUsers: void }>({
  deleteTestUsers: [
    // Playwright needs the (empty) destructuring to know this fixture takes no others.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await use()
      await deleteUsersByEmail(madeInThisTest.splice(0))
    },
    { auto: true },
  ],
})

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

/** The plan of an account (specs/029). The seeds are `paid` unless a test is about what the free plan leaves out. */
export type Plan = 'free' | 'paid'

/**
 * Gives an account the plan straight in the database the backend uses (CI's `DATABASE_URL`; locally the dev database
 * of backend/CLAUDE.md): there is no endpoint to change a plan, payments are future work. Test accounts only.
 */
export async function setAccountPlan(accountId: string, plan: Plan) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? 'postgres://root:abcd1234@localhost:5432/pediTrack?sslmode=disable',
  })
  await client.connect()
  try {
    const result = await client.query('UPDATE accounts SET plan = $1 WHERE id = $2', [plan, accountId])
    expect(result.rowCount, `the account ${accountId} exists`).toBe(1)
  } finally {
    await client.end()
  }
}

/**
 * A fresh, recognisable test address: the marker lets the global teardown delete every user
 * the suite made, and `+clerk_test` makes Clerk accept the fixed verification code.
 */
export const uniqueEmail = (prefix: string) => {
  const email = `${prefix}.${E2E_MARKER}.${Date.now()}${Math.random().toString(36).slice(2, 7)}+clerk_test@example.com`
  madeInThisTest.push(email)
  return email
}

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
  await pruneOldE2EUsers()
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
 * minted with the secret key), then it is a normal signed-in browser. Retried while Clerk rate limits.
 */
export async function signInAs(page: Page, emailAddress: string) {
  await page.goto('/login')
  await retryWhileRateLimited(() => clerk.signIn({ page, emailAddress }))
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

export const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/**
 * Creates a real Clerk user, signs the page in as them and creates their PediTrack account (with
 * the given children) straight through the API, having already acknowledged the "Antes de empezar"
 * notice unless told otherwise. Returns the session token so a test can keep
 * calling the API as that tutor. The account is `paid` by default, so the free plan's rules (one child, one active
 * treatment at a time, no "solo registro") don't get in the way of tests about something else; pass `plan: 'free'`
 * for the ones about those rules.
 */
export async function seedAccount(
  page: Page,
  children: { firstName: string; lastName: string; birthDate: string }[],
  { acknowledgeDisclaimer = true, plan = 'paid' }: { acknowledgeDisclaimer?: boolean; plan?: Plan } = {},
) {
  const email = uniqueEmail('seed')
  await createClerkUser(email)
  await signInAs(page, email)
  const token = await sessionToken(page)
  const account = await apiPost(page.context().request, token, '/accounts', { firstName: 'Ana', lastName: 'Morales', children })
  // A new account is always free; `seedAccount` changes it before anything else reads it.
  if (plan !== 'free') await setAccountPlan(account.id, plan)
  if (acknowledgeDisclaimer) {
    // So the "Antes de empezar" notice doesn't sit on top of every screen a test is about.
    await apiPost(page.context().request, token, `/accounts/${account.id}/disclaimer-acceptance`, {
      version: account.disclaimerVersion,
    })
  }
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
  {
    withConsultation = true,
    durationDays = 1,
    frequencyHours = 8,
    plan = 'paid',
  }: { withConsultation?: boolean; durationDays?: number; frequencyHours?: number; plan?: Plan } = {},
) {
  const { account, token, email } = await seedAccount(page, [{ firstName: 'Mateo', lastName: 'Morales', birthDate: '2021-03-14' }], { plan })
  const request = page.context().request
  const childId: string = account.children[0].id
  let consultationId: string | undefined
  let medicationId: string | undefined
  if (withConsultation) {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const created = await apiPost(request, token, `/children/${childId}/consultations`, {
      doctorName: 'Dra. Laura Cázares',
      consultDate: today,
      photoBase64: PNG_BASE64,
      notes: 'Fiebre y tos',
      utcOffsetMinutes: -now.getTimezoneOffset() || 0,
      medications: [{ name: 'Amoxicilina', frequencyHours, durationDays, startTime: '00:00' }],
    })
    consultationId = created.id
    medicationId = created.medications[0].id
  }
  return { accountId: account.id as string, childId, consultationId, medicationId, token, email }
}

// ---- specs/032-compartir-con-familia: two people, each in their own browser.

/** The invitation the API gave back (the token is only returned here). */
export interface Invitation {
  id: string
  email: string
  token: string
}

/** The link a person opens to accept: the token in the `#`, as the app builds it. */
export const invitationUrl = (invitation: Invitation) => `/familia/invitacion#${invitation.token}`

/** Invites an e-mail to the family of the tutor whose token this is, through the API. */
export async function inviteViaApi(request: APIRequestContext, token: string, email: string, role: 'tutor' | 'caregiver' = 'tutor'): Promise<Invitation> {
  return apiPost(request, token, '/family/invitations', { email, role })
}

/**
 * A second person: a real Clerk user in a browser context of their own, signed in, with (unless told otherwise) their own
 * PediTrack account and no children. `account: false` leaves them without one, as somebody who arrives from an invitation.
 */
export async function secondPerson(
  browser: import('@playwright/test').Browser,
  design: { viewport: { width: number; height: number } },
  { email = uniqueEmail('familia'), firstName = 'Luis', account = true }: { email?: string; firstName?: string; account?: boolean } = {},
) {
  const context = await browser.newContext({ viewport: design.viewport })
  const page = await context.newPage()
  await allowClerkOn(page)
  await createClerkUser(email)
  await signInAs(page, email)
  const token = await sessionToken(page)
  let accountId: string | undefined
  if (account) {
    const created = await apiPost(context.request, token, '/accounts', { firstName, lastName: 'Pérez', children: [] })
    accountId = created.id
    // So the "Antes de empezar" notice doesn't sit on top of the screens a test is about.
    await apiPost(context.request, token, `/accounts/${created.id}/disclaimer-acceptance`, { version: created.disclaimerVersion })
  }
  return { context, page, token, email, accountId }
}

/** Accepts an invitation through the API as the person whose token this is. */
export async function acceptViaApi(request: APIRequestContext, token: string, invitation: Invitation) {
  return apiPost(request, token, '/family/invitations/accept', { token: invitation.token })
}

/** Runs a query on the backend's database (test accounts only): what the API doesn't show, like who was reminded of a dose. */
export async function queryDb<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? 'postgres://root:abcd1234@localhost:5432/pediTrack?sslmode=disable',
  })
  await client.connect()
  try {
    return (await client.query(sql, params)).rows as T[]
  } finally {
    await client.end()
  }
}

// ---- specs/033-recordatorios-suplementos-citas: supplement routines.

/** Today as the browser's own time zone reads it, "YYYY-MM-DD", and its UTC offset: what the app sends the server. */
export function localToday(now: Date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return { day: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, offset: -now.getTimezoneOffset() }
}

/**
 * Creates a supplement routine of a child through the API as the tutor whose token this is (the child's owner must be on the
 * paid plan). By default a daily 08:00 routine that started today; `overrides` replace any field of the request.
 */
export async function routineViaApi(
  request: APIRequestContext,
  token: string,
  childId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; name: string; doses: { id: string; scheduledAt: string; taken: boolean }[] }> {
  const { day, offset } = localToday()
  return apiPost(request, token, `/children/${childId}/routines`, {
    name: 'Vitamina D',
    note: '',
    period: 'daily',
    times: ['08:00'],
    weekdays: [],
    intervalHours: null,
    firstDate: day,
    firstTime: null,
    endDate: null,
    utcOffsetMinutes: offset,
    ...overrides,
  })
}

// ---- specs/033-recordatorios-suplementos-citas, parte 2: next appointment.

/** A date `days` from today in the browser's own zone, "YYYY-MM-DD". */
export function localDayAfter(days: number, now: Date = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
  return localToday(d).day
}

/**
 * Creates the next appointment of a consultation through the API as the tutor whose token this is (the owner must be on the paid
 * plan). By default `days` from today at 10:30 with the two default notices; `overrides` replace any field of the request.
 */
export async function appointmentViaApi(
  request: APIRequestContext,
  token: string,
  consultationId: string,
  { days = 5, time = '10:30', ...overrides }: { days?: number; time?: string } & Record<string, unknown> = {},
): Promise<{ id: string }> {
  const [h, m] = time.split(':').map(Number)
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, h, m)
  return apiPost(request, token, `/consultations/${consultationId}/appointments`, {
    startsAt: start.toISOString(),
    utcOffsetMinutes: -start.getTimezoneOffset(),
    note: 'Revisión de oído',
    ...overrides,
  })
}
