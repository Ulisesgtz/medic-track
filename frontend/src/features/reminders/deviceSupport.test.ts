import { describe, it, expect, vi, afterEach } from 'vitest'
import { base64UrlToUint8Array, detectDeviceSupport } from './deviceSupport'
import { clearPushEnv, stubPushEnv } from './pushEnv.test-utils'

const originalUA = navigator.userAgent

function setUserAgent(ua: string, maxTouchPoints = 0) {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ua })
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: maxTouchPoints })
}

function setStandalone(value: boolean | undefined) {
  Object.defineProperty(navigator, 'standalone', { configurable: true, value })
}

describe('detectDeviceSupport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    clearPushEnv()
    setUserAgent(originalUA)
    setStandalone(undefined)
  })

  it('unsupported without service worker, push or notifications', () => {
    expect(detectDeviceSupport()).toBe('unsupported')
  })

  it('ready when it all exists and the permission is not denied', () => {
    stubPushEnv({ permission: 'default' })
    expect(detectDeviceSupport()).toBe('ready')
    vi.mocked(Notification).permission = 'granted'
    expect(detectDeviceSupport()).toBe('ready')
  })

  it('denied when the tutor blocked notifications', () => {
    stubPushEnv({ permission: 'denied' })
    expect(detectDeviceSupport()).toBe('denied')
  })

  it('an iPhone or iPad outside the installed app needs to install it', () => {
    stubPushEnv()
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')
    expect(detectDeviceSupport()).toBe('ios-needs-install')

    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5) // iPadOS reports itself as a Mac
    expect(detectDeviceSupport()).toBe('ios-needs-install')
  })

  it('an installed iPhone app goes on to the usual checks', () => {
    stubPushEnv()
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')
    setStandalone(true)
    expect(detectDeviceSupport()).toBe('ready')

    setStandalone(undefined)
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    expect(detectDeviceSupport()).toBe('ready')
  })

  it('a Mac without a touch screen is a Mac', () => {
    stubPushEnv()
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)
    expect(detectDeviceSupport()).toBe('ready')
  })
})

describe('base64UrlToUint8Array', () => {
  it('decodes a base64url key with or without padding', () => {
    expect(Array.from(base64UrlToUint8Array('AQID'))).toEqual([1, 2, 3])
    expect(Array.from(base64UrlToUint8Array('-_8'))).toEqual([251, 255])
  })
})
