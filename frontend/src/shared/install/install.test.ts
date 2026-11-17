import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { isIOS, isRunningInstalled, platform } from './platform'
import {
  INSTALL_OFFER_MARGIN_MS,
  canInstall,
  installOfferWaitMs,
  promptInstall,
  resetInstallPromptForTests,
  startInstallPrompt,
  supportsInstallPrompt,
  useInstallPrompt,
} from './installPrompt'

const originalUA = navigator.userAgent

function setNavigator(ua: string, maxTouchPoints = 0, standalone?: boolean) {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ua })
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: maxTouchPoints })
  Object.defineProperty(navigator, 'standalone', { configurable: true, value: standalone })
}

afterEach(() => {
  vi.unstubAllGlobals()
  setNavigator(originalUA)
})

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'

describe('platform', () => {
  it('iPhone Safari', () => {
    setNavigator(IPHONE_SAFARI)
    expect(isIOS()).toBe(true)
    expect(platform()).toBe('ios-safari')
  })

  it.each(['CriOS/120.0', 'FxiOS/120.0', 'EdgiOS/120.0', 'OPiOS/16.0'])('iPhone with %s is another browser', (token) => {
    setNavigator(`${IPHONE_SAFARI} ${token}`)
    expect(platform()).toBe('ios-other')
  })

  it('iPadOS reports itself as a Mac: the touch screen tells it apart', () => {
    setNavigator(MAC, 5)
    expect(platform()).toBe('ios-safari')
    setNavigator(MAC, 0)
    expect(platform()).toBe('desktop')
  })

  it('Android and a computer', () => {
    setNavigator('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36')
    expect(platform()).toBe('android')
    setNavigator('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36')
    expect(platform()).toBe('desktop')
  })
})

describe('isRunningInstalled', () => {
  it('is true for the iOS home-screen app', () => {
    setNavigator(IPHONE_SAFARI, 5, true)
    expect(isRunningInstalled()).toBe(true)
  })

  it('is true for a standalone display mode', () => {
    setNavigator(originalUA, 0, undefined)
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    expect(isRunningInstalled()).toBe(true)
  })

  it('is false in a browser tab and when matchMedia is missing or throws', () => {
    setNavigator(originalUA, 0, undefined)
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
    expect(isRunningInstalled()).toBe(false)
    vi.stubGlobal('matchMedia', undefined)
    expect(isRunningInstalled()).toBe(false)
    vi.stubGlobal('matchMedia', () => {
      throw new Error('no')
    })
    expect(isRunningInstalled()).toBe(false)
  })
})

describe('installPrompt', () => {
  beforeEach(() => {
    resetInstallPromptForTests()
  })

  type Offer = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

  function offer(outcome: 'accepted' | 'dismissed' = 'accepted') {
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Offer
    event.prompt = vi.fn().mockResolvedValue(undefined)
    event.userChoice = Promise.resolve({ outcome })
    act(() => {
      window.dispatchEvent(event)
    })
    return event
  }

  it('keeps the offer (and stops the browser banner) until it is used', async () => {
    startInstallPrompt()
    startInstallPrompt() // a second call listens no more
    expect(canInstall()).toBe(false)
    expect(await promptInstall()).toBe('unavailable')

    const event = offer('dismissed')
    expect(event.defaultPrevented).toBe(true)
    expect(canInstall()).toBe(true)

    expect(await promptInstall()).toBe('dismissed')
    expect(event.prompt).toHaveBeenCalledTimes(1)
    expect(canInstall()).toBe(false)
  })

  it('answers accepted when the person installs', async () => {
    startInstallPrompt()
    offer('accepted')
    expect(await promptInstall()).toBe('accepted')
  })

  it('a failing prompt counts as dismissed', async () => {
    startInstallPrompt()
    const event = offer()
    event.prompt = vi.fn().mockRejectedValue(new Error('no'))
    expect(await promptInstall()).toBe('dismissed')
  })

  it('the hook follows the offer and appinstalled spends it', () => {
    startInstallPrompt()
    const { result } = renderHook(() => useInstallPrompt())
    expect(result.current.canInstall).toBe(false)
    offer()
    expect(result.current.canInstall).toBe(true)
    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })
    expect(result.current.canInstall).toBe(false)
  })
})

describe('the margin for the install offer (specs/071)', () => {
  beforeEach(() => {
    resetInstallPromptForTests()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    delete (window as unknown as Record<string, unknown>).onbeforeinstallprompt
  })

  it('a browser without the event has nothing to wait for', () => {
    startInstallPrompt()
    expect(supportsInstallPrompt()).toBe(false)
    expect(installOfferWaitMs()).toBe(0)
    expect(renderHook(() => useInstallPrompt()).result.current.waiting).toBe(false)
  })

  it('one that has it waits INSTALL_OFFER_MARGIN_MS from the start, then gives up waiting', () => {
    ;(window as unknown as Record<string, unknown>).onbeforeinstallprompt = null
    startInstallPrompt()
    expect(supportsInstallPrompt()).toBe(true)
    const { result } = renderHook(() => useInstallPrompt())
    expect(result.current.waiting).toBe(true)
    expect(installOfferWaitMs()).toBe(INSTALL_OFFER_MARGIN_MS)

    act(() => {
      vi.advanceTimersByTime(INSTALL_OFFER_MARGIN_MS - 1)
    })
    expect(result.current.waiting).toBe(true)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.waiting).toBe(false)
    expect(installOfferWaitMs()).toBe(0)
  })

  it('the offer arriving ends the wait at once', () => {
    ;(window as unknown as Record<string, unknown>).onbeforeinstallprompt = null
    startInstallPrompt()
    const { result } = renderHook(() => useInstallPrompt())
    const event = new Event('beforeinstallprompt', { cancelable: true })
    act(() => {
      window.dispatchEvent(event)
    })
    expect(result.current.canInstall).toBe(true)
    expect(result.current.waiting).toBe(false)
    expect(installOfferWaitMs()).toBe(0)
  })

  it('a screen mounted after the margin does not wait', () => {
    ;(window as unknown as Record<string, unknown>).onbeforeinstallprompt = null
    startInstallPrompt()
    vi.advanceTimersByTime(INSTALL_OFFER_MARGIN_MS + 1)
    expect(renderHook(() => useInstallPrompt()).result.current.waiting).toBe(false)
  })
})
