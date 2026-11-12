// Where the app may keep anybody's data to show it without a connection (specs/067, FR-012, research R2): ONLY the app installed on
// the home screen of a phone — the owner's decision of 2026-11-11. A computer (even with the app installed), a tablet and a tab of the
// phone's browser keep nothing and behave as before. The width never decides it: a phone turned sideways (web design) still counts.

interface NavigatorWithHints extends Navigator {
  standalone?: boolean
  userAgentData?: { mobile?: boolean }
}

const PHONE_AGENT = /iPhone|Android.+Mobile/

function isStandalone(): boolean {
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  } catch {
    // No matchMedia: decided by the navigator below.
  }
  return (navigator as NavigatorWithHints).standalone === true
}

function isPhone(): boolean {
  const nav = navigator as NavigatorWithHints
  if (nav.userAgentData?.mobile === true) return true
  return PHONE_AGENT.test(nav.userAgent ?? '')
}

/** The app installed on a phone's home screen: the only place where data are kept for offline (FR-012). */
export function isInstalledPhone(): boolean {
  try {
    return isStandalone() && isPhone()
  } catch {
    return false
  }
}
