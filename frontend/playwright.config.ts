import { defineConfig, devices } from '@playwright/test'
import { loadLocalEnv } from './e2e/clerkApi'

// The workers and the dev server inherit these: the keys of the Clerk *development* instance.
loadLocalEnv()

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global.setup.ts',
  fullyParallel: true,
  // Every flow goes through Clerk's real servers, and CI's shared runners are slower than a laptop.
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
  // Room for the waits of retryWhileRateLimited (e2e/clerkApi.ts) when Clerk rate limits the instance.
  timeout: process.env.CI ? 60_000 : 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    // The app's service worker (spec 011) would control every page, and in WebKit Playwright's
    // page.route no longer sees the requests of a controlled page — so @clerk/testing's token never
    // reaches Clerk and signup/sign-in stall. e2e/recordatorios.spec.ts stubs the registration instead.
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
