import { reportClientError } from './report'

let installed = false

function isForeign(filename: string): boolean {
  if (!filename) return false
  try {
    return new URL(filename, window.location.href).origin !== window.location.origin
  } catch {
    return false
  }
}

/** specs/072: listens, once, for the errors nobody caught and the promises nobody handled. Called from `main.tsx`. */
export function installClientErrors() {
  if (installed) return
  installed = true
  window.addEventListener('error', (event) => {
    // Extensions and translators run scripts of other origins; their errors are not the app's.
    if (isForeign(event.filename)) return
    reportClientError('error', event.error ?? event.message)
  })
  window.addEventListener('unhandledrejection', (event) => {
    reportClientError('rejection', event.reason)
  })
}
