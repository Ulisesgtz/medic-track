import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

// Lo que repiten las pruebas E2E de las páginas interiores (teléfono 390 y web 1440).

export const APP = 'https://app.pedi-track.com'

export const SIZES = [
  { name: 'teléfono', width: 390, height: 844 },
  { name: 'web', width: 1440, height: 900 },
] as const

export async function open(page: Page, path: string) {
  await page.goto(path)
  await page.evaluate(() => document.fonts.ready)
}

/**
 * Sin violaciones de accesibilidad (WCAG 2 A y AA, contraste incluido). Lo marcado `data-decorative` (el «404» enorme, que el H1
 * repite con texto) queda fuera: WCAG 1.4.3 exime el texto que es pura decoración.
 */
export async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).exclude('[data-decorative]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`)).toEqual([])
}

/** Nada se sale de la pantalla a los lados. */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

/** Un solo H1, el de la página. */
export async function expectOneH1(page: Page, text: string) {
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('h1')).toHaveText(text)
}

/** Ninguna petición fuera de localhost (sin terceros, FR-016). */
export function trackOutsideRequests(page: Page): string[] {
  const outside: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol.startsWith('http')) outside.push(request.url())
  })
  return outside
}
