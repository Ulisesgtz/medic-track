import { clerkSetup } from '@clerk/testing/playwright'
import { deleteE2EUsers, loadLocalEnv } from './clerkApi'

/**
 * Fetches Clerk's testing token once (it lets the suite skip the CAPTCHA of the signup, which is
 * meant to block automation) and removes, before and after the run, every user the suite
 * created: the development instance has a user limit and a failed run must not leave them behind.
 */
export default async function globalSetup() {
  loadLocalEnv()
  await clerkSetup()
  await deleteE2EUsers()
  return async () => {
    await deleteE2EUsers()
  }
}
