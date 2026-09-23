import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

const CLERK_API = 'https://api.clerk.com/v1'

/**
 * E2E accounts are recognisable by this marker in their email, which is the only thing the
 * cleanup ever deletes by. `+clerk_test` makes Clerk treat the address as a test one: the
 * email verification code is always 424242 and no real email is sent.
 */
export const E2E_MARKER = 'peditrack-e2e'
export const E2E_VERIFICATION_CODE = '424242'
/** Long and random enough to pass Clerk's rules and its compromised-password check. */
export const E2E_PASSWORD = 'PruebaE2e-7kQ!xz2'

/**
 * Local runs read the same `.env.local` files the app already uses, so nobody has to export the
 * keys by hand; in CI they come from repository secrets and these files don't exist.
 */
export function loadLocalEnv() {
  const read = (file: string) => {
    const path = resolve(HERE, file)
    if (!existsSync(path)) return {} as Record<string, string>
    return Object.fromEntries(
      readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .filter((line) => /^[A-Z_]+=/.test(line))
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]),
    )
  }
  const frontend = read('../.env.local')
  const backend = read('../../backend/.env.local')
  process.env.CLERK_PUBLISHABLE_KEY ??= process.env.VITE_CLERK_PUBLISHABLE_KEY ?? frontend.VITE_CLERK_PUBLISHABLE_KEY
  process.env.VITE_CLERK_PUBLISHABLE_KEY ??= process.env.CLERK_PUBLISHABLE_KEY
  process.env.CLERK_SECRET_KEY ??= backend.CLERK_SECRET_KEY
}

function secretKey() {
  const key = process.env.CLERK_SECRET_KEY
  if (!key) throw new Error('CLERK_SECRET_KEY is not set: the E2E suite creates its test users in the Clerk development instance')
  // The suite creates and DELETES users: never let it near a production instance.
  if (!key.startsWith('sk_test_')) throw new Error('The E2E suite only runs against a Clerk development instance (sk_test_ key)')
  return key
}

async function clerkFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${CLERK_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secretKey()}`, 'Content-Type': 'application/json', ...init.headers },
  })
  if (!res.ok) throw new Error(`Clerk API ${init.method ?? 'GET'} ${path} -> ${res.status}: ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

/** Creates a verified Clerk user, so a test can sign in as them without going through the signup form. */
export async function createClerkUser(email: string) {
  return clerkFetch('/users', {
    method: 'POST',
    body: JSON.stringify({
      email_address: [email],
      password: E2E_PASSWORD,
      skip_password_checks: true,
      first_name: 'Ana',
      last_name: 'Prueba',
    }),
  }) as Promise<{ id: string }>
}

/** Deletes every user this suite created (now or in an earlier, interrupted run). */
export async function deleteE2EUsers() {
  let deleted = 0
  for (;;) {
    const users = (await clerkFetch(`/users?query=${E2E_MARKER}&limit=100`)) as { id: string; email_addresses: { email_address: string }[] }[]
    const mine = users.filter((u) => u.email_addresses.some((e) => e.email_address.includes(E2E_MARKER)))
    if (mine.length === 0) return deleted
    for (const user of mine) {
      await clerkFetch(`/users/${user.id}`, { method: 'DELETE' })
      deleted += 1
    }
  }
}
