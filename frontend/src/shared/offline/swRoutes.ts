// What the service worker does with each request (specs/067, research R1), as pure functions so they are tested here and `sw.ts` stays
// only wiring. The app's own files are precached by Workbox; a page navigation goes to the network first (so «Actualizar», spec 017,
// always loads the published app) and only without a network falls back to the saved document; the font is the app's shell too.
// Nothing else is ever cached by the service worker: not the API (the data live in the app, R3), not /version.json (spec 017) and
// not Clerk (a third party, R4).

export const NAVIGATION_TIMEOUT_SECONDS = 3
export const FONTS_CACHE = 'google-fonts'
export const FONTS_MAX_ENTRIES = 10

const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com'])

/** The saved document a navigation falls back to: the child's phone has its own (it names the child's manifest, specs/047). */
export function fallbackDocument(pathname: string): string {
  return pathname === '/hijo' || pathname.startsWith('/hijo/') ? '/hijo/hoy.html' : '/index.html'
}

/** A request of the font's stylesheet or files (the app's shell, never anybody's data). */
export function isFontRequest(url: URL): boolean {
  return FONT_HOSTS.has(url.hostname)
}

/** A page navigation of this app that may fall back to the saved document — never /version.json or a file. */
export function isAppNavigation(request: { mode: string }, url: URL, origin: string): boolean {
  if (request.mode !== 'navigate' || url.origin !== origin) return false
  return !/\.[a-z0-9]+$/i.test(url.pathname)
}

/**
 * The page from the network, giving up after `ms` (a signal that is there but too weak behaves like none). Asked by its address, not
 * with the navigation request itself, whose `redirect: 'manual'` would hand the page an unusable redirect.
 */
export async function fetchWithin(url: string, ms: number, fetchFn: typeof fetch = fetch): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetchFn(url, { signal: controller.signal, credentials: 'same-origin' })
  } finally {
    clearTimeout(timer)
  }
}
