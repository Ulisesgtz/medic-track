// specs/071 (research R-install): what kind of device this is and whether PediTrack runs installed. The one copy the
// reminders, the child's phone and the first-use guide share.

export type Platform = 'android' | 'ios-safari' | 'ios-other' | 'desktop'

export function isIOS(): boolean {
  const ua = navigator.userAgent
  // iPadOS 13+ reports itself as a Mac: tell it apart by its touch screen.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

/** `ios-other` is any iPhone/iPad browser that is not Safari (Chrome, Firefox, Edge, Opera): only Safari installs on iOS. */
export function platform(): Platform {
  if (isIOS()) return /CriOS|FxiOS|EdgiOS|OPiOS|OPT\//.test(navigator.userAgent) ? 'ios-other' : 'ios-safari'
  if (/Android/.test(navigator.userAgent)) return 'android'
  return 'desktop'
}

/** True when the page runs as the installed app (a standalone window or the iOS home-screen app). Read at open, never stored. */
export function isRunningInstalled(): boolean {
  try {
    const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
    return standalone || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
  } catch {
    return false
  }
}
