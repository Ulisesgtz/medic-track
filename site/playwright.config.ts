import { defineConfig, devices } from '@playwright/test'

// Las pruebas E2E corren contra `vite preview` de site/dist, es decir, contra lo que se publica (corre antes `npm run build`).
// Chromium y WebKit: el sitio es de teléfono y de computadora, y Safari de iPhone es WebKit.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    // La hora de quienes usan PediTrack: Ciudad de México.
    timezoneId: 'America/Mexico_City',
    locale: 'es-MX',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'npx vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // Un segundo sitio, compilado con artículos de muestra `ready: true` (e2e/fixtures/blog): los borradores del repositorio no
      // están listos y sin ellos no existe el blog. Solo para blog.spec.ts; el sitio publicado no lo incluye.
      command:
        'npx vite build --outDir dist-blog && npx tsx scripts/prerender.ts && npx tsx scripts/seo-files.ts && npx vite preview --outDir dist-blog --port 4175 --strictPort',
      env: { SITE_BLOG_DIR: 'e2e/fixtures/blog', SITE_DIST: 'dist-blog', SITE_ENV: 'production' },
      url: 'http://localhost:4175',
      reuseExistingServer: false, // siempre recompilado: un servidor viejo en el puerto serviría un sitio sin los artículos de muestra
      timeout: 120_000,
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
