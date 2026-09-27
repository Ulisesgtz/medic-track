import { clerkSetup } from '@clerk/testing/playwright'
import { deleteE2EUsers, loadLocalEnv } from './clerkApi'

/**
 * Fetches Clerk's testing token once (it lets the suite skip the CAPTCHA of the signup, which is
 * meant to block automation) and removes, before and after the run, the test users left behind by
 * an interrupted run: the development instance has a user limit. Only users older than a few
 * minutes — every test deletes its own as it ends (`test` in helpers.ts) — so a sweep never pulls
 * the users out from under another run that shares the instance (CI also queues its E2E jobs).
 */
const STALE_AFTER_MS = 10 * 60_000

export default async function globalSetup() {
  loadLocalEnv()
  await clerkSetup()
  await deleteE2EUsers(STALE_AFTER_MS)
  return async () => {
    await deleteE2EUsers(STALE_AFTER_MS)
  }
}
