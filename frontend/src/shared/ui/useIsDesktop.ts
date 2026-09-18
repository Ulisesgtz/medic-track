import { useSyncExternalStore } from 'react'

const DESKTOP_QUERY = '(min-width: 1024px)'

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {}
  const mql = window.matchMedia(DESKTOP_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function getSnapshot() {
  return typeof window.matchMedia === 'function' && window.matchMedia(DESKTOP_QUERY).matches
}

/**
 * True at the `lg` breakpoint (≥ 1024px) and above — where the app swaps
 * the single mobile column for the children sidebar (FR-012). Used to
 * render the sidebar conditionally instead of hiding it with CSS, so it
 * never exists twice in the DOM / accessibility tree.
 */
export function useIsDesktop() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
