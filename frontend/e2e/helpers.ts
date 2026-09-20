import { expect, type Page } from '@playwright/test'

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
