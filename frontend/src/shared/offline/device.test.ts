import { afterEach, describe, expect, it, vi } from 'vitest'
import { isInstalledPhone } from './device'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36'
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/604.1'
const ANDROID_TABLET = 'Mozilla/5.0 (Linux; Android 15; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'

function setDevice({ agent, standalone, iosStandalone, mobileHint }: { agent: string; standalone: boolean; iosStandalone?: boolean; mobileHint?: boolean }) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(agent)
  Object.defineProperty(navigator, 'standalone', { value: iosStandalone, configurable: true })
  Object.defineProperty(navigator, 'userAgentData', { value: mobileHint === undefined ? undefined : { mobile: mobileHint }, configurable: true })
  window.matchMedia = ((query: string) => ({ matches: standalone && query === '(display-mode: standalone)' }) as MediaQueryList)
}

const originalMatchMedia = window.matchMedia

afterEach(() => {
  window.matchMedia = originalMatchMedia
  vi.restoreAllMocks()
  Object.defineProperty(navigator, 'standalone', { value: undefined, configurable: true })
  Object.defineProperty(navigator, 'userAgentData', { value: undefined, configurable: true })
})

describe('isInstalledPhone', () => {
  it('is true for the app installed on an iPhone or an Android phone', () => {
    setDevice({ agent: IPHONE, standalone: true })
    expect(isInstalledPhone()).toBe(true)
    setDevice({ agent: ANDROID, standalone: true })
    expect(isInstalledPhone()).toBe(true)
  })

  it('takes iOS’s own flag and the browser’s mobile hint', () => {
    setDevice({ agent: IPHONE, standalone: false, iosStandalone: true })
    expect(isInstalledPhone()).toBe(true)
    setDevice({ agent: DESKTOP, standalone: true, mobileHint: true })
    expect(isInstalledPhone()).toBe(true)
  })

  it('is false in a tab of the phone’s browser', () => {
    setDevice({ agent: IPHONE, standalone: false })
    expect(isInstalledPhone()).toBe(false)
  })

  it('is false on a tablet and on a computer, even installed', () => {
    setDevice({ agent: IPAD, standalone: true })
    expect(isInstalledPhone()).toBe(false)
    setDevice({ agent: ANDROID_TABLET, standalone: true })
    expect(isInstalledPhone()).toBe(false)
    setDevice({ agent: DESKTOP, standalone: true, mobileHint: false })
    expect(isInstalledPhone()).toBe(false)
  })

  it('is false when matchMedia fails', () => {
    setDevice({ agent: IPHONE, standalone: false })
    window.matchMedia = (() => {
      throw new Error('no matchMedia')
    }) as typeof window.matchMedia
    expect(isInstalledPhone()).toBe(false)
  })
})
