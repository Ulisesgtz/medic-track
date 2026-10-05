import { useSyncExternalStore } from 'react'

const DESKTOP_QUERY = '(min-width: 900px)'
// The web mockups (13, 14, 15) show the children sidebar from Tailwind's `lg` (1024px).
const SIDEBAR_QUERY = '(min-width: 1024px)'

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  )
}

/**
 * True from 900px up (a laptop window snapped or resized narrow still gets the
 * web design): the one rule that picks the web mockups over the phone ones on
 * every screen. Read it, don't hide one design with CSS, so the other never
 * exists in the DOM / accessibility tree.
 */
export function useIsDesktop() {
  return useMediaQuery(DESKTOP_QUERY)
}

/** True from 1024px (`lg`): wide enough for the children sidebar, as in the web mockups. */
export function useIsWide() {
  return useMediaQuery(SIDEBAR_QUERY)
}
