import { isRunningInstalled } from '../install'

// specs/072, research R7: only families of browser and system travel, never the full user-agent string.
export type BrowserFamily = 'safari' | 'chrome' | 'firefox' | 'edge' | 'samsung' | 'other'
export type OsFamily = 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'other'

export function browserFamily(ua: string = navigator.userAgent): BrowserFamily {
  if (/Edg(e|A|iOS)?\//.test(ua)) return 'edge'
  if (/SamsungBrowser/.test(ua)) return 'samsung'
  if (/OPR\/|OPT\/|Opera/.test(ua)) return 'other'
  if (/Firefox|FxiOS/.test(ua)) return 'firefox'
  if (/Chrome|CriOS|Chromium/.test(ua)) return 'chrome'
  if (/Safari/.test(ua)) return 'safari'
  return 'other'
}

export function osFamily(
  ua: string = navigator.userAgent,
  touchPoints: number = navigator.maxTouchPoints,
): OsFamily {
  // iPadOS 13+ reports itself as a Mac: tell it apart by its touch screen.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  if (/Windows/.test(ua)) return 'windows'
  if (/Macintosh|Mac OS X/.test(ua)) return 'macos'
  if (/Linux|X11|CrOS/.test(ua)) return 'linux'
  return 'other'
}

/** The id of this build as the server accepts it (`[A-Za-z0-9.-]{1,20}`). */
export function appVersion(): string {
  const raw = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''
  return raw.replace(/[^A-Za-z0-9.-]/g, '').slice(0, 20) || 'dev'
}

export function isInstalled(): boolean {
  return isRunningInstalled()
}
