import { defineConfig, devices } from '@playwright/test'
import { loadLocalEnv } from './e2e/clerkApi'

// The workers and the dev server inherit these: the keys of the Clerk *development* instance.
loadLocalEnv()

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global.setup.ts',
  fullyParallel: true,
  // CI used to run with Playwright's default (half the cores: one worker on a 2-core runner), so ~535 tests went one after
  // the other (~40 min). The tests mostly wait on Clerk and the pages, not on the CPU, so a few workers fit; Clerk's own
  // rate limit is absorbed by retryWhileRateLimited (e2e/clerkApi.ts). `E2E_WORKERS` overrides it.
  workers: process.env.CI ? Number(process.env.E2E_WORKERS) || 3 : undefined,
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
    // CI serves the production build (faster to load and closer to what ships; the dev server transforms every module on
    // demand, which is what made WebKit and Firefox slow). Locally the dev server is still the one to use.
    command: process.env.CI ? 'npm run build && npx vite preview --port 5173 --strictPort' : 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 180_000 : 60_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
