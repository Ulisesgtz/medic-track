import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'
import { loadLocalEnv } from './e2e/clerkApi'

// The workers and the dev server inherit these: the keys of the Clerk *development* instance.
loadLocalEnv()

// Chromium runs every spec; Firefox and WebKit run only the ones where the browser engine can make a difference — signing in and
// out, the account, the consultation forms and detail (dates, files, layout at 390 and 1280 px), the family's two-person flows and
// the reminders' service worker. The other ~20 specs test the app's own logic and layout rules, which behave the same in the
// three engines; running them three times took the suite from ~13 to ~22 minutes (816 tests). The whole matrix still runs on
// `master` (the release) and when asked: `E2E_ALL_BROWSERS=1 npx playwright test`.
const CROSS_BROWSER_SPECS = [
  'autenticacion',
  'account-signup',
  'familia',
  'nueva-consulta-movil',
  'nueva-consulta-web',
  'detalle-consulta-movil',
  'detalle-consulta-web',
  'recordatorios',
]
for (const name of CROSS_BROWSER_SPECS) {
  // A renamed spec must not silently drop out of the cross-browser run.
  if (!existsSync(fileURLToPath(new URL(`./e2e/${name}.spec.ts`, import.meta.url)))) throw new Error(`playwright.config.ts: e2e/${name}.spec.ts does not exist`)
}
const everyBrowserEverything =
  process.env.E2E_ALL_BROWSERS === '1' || process.env.GITHUB_BASE_REF === 'master' || process.env.GITHUB_REF_NAME === 'master'
const crossBrowserOnly = everyBrowserEverything ? undefined : new RegExp(`/(${CROSS_BROWSER_SPECS.join('|')})\\.spec\\.ts$`)

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global.setup.ts',
  fullyParallel: true,
  // CI used to run with Playwright's default (half the cores: one worker on a 2-core runner), so ~535 tests went one after
  // the other (~40 min). The tests mostly wait on Clerk and the pages, not on the CPU, so a few workers fit; the repository is
  // public, so the runner has 4 cores (3 workers then 4: one browser each, and the API and the preview server are light). Clerk's
  // own rate limit is absorbed by retryWhileRateLimited (e2e/clerkApi.ts). `E2E_WORKERS` overrides it.
  workers: process.env.CI ? Number(process.env.E2E_WORKERS) || 4 : undefined,
  // Every flow goes through Clerk's real servers, and CI's shared runners are slower than a laptop.
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
  // Room for the waits of retryWhileRateLimited (e2e/clerkApi.ts) when Clerk rate limits the instance.
  timeout: process.env.CI ? 60_000 : 30_000,
  retries: process.env.CI ? 1 : 0,
  // In CI the log also gets one line per test with its duration (the 'list' reporter) and the slowest files are named at the end, so
  // when the suite gets slower the log says where the time goes (the 'html' report alone is only uploaded when something fails).
  reporter: process.env.CI ? [['list'], ['html']] : 'html',
  reportSlowTests: { max: 15, threshold: 90_000 },
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
    // The «payment page» of the fake provider exists only in a build that says so (specs/045); the API is started with PAYMENTS_DRIVER=fake.
    env: { VITE_PAYMENTS_FAKE: 'true' },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testMatch: crossBrowserOnly },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testMatch: crossBrowserOnly },
  ],
})
