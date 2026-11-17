import { afterEach, describe, expect, it, vi } from 'vitest'
import { appVersion, browserFamily, isInstalled, osFamily } from './environment'

const UA = {
  safariIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  chromeIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1',
  firefoxIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/120.0 Mobile/15E148 Safari/605.1.15',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  samsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  edgeWin:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  opera: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 OPR/105.0',
}

describe('browserFamily', () => {
  it('reduces the agent to a family', () => {
    expect(browserFamily(UA.safariIos)).toBe('safari')
    expect(browserFamily(UA.safariMac)).toBe('safari')
    expect(browserFamily(UA.chromeIos)).toBe('chrome')
    expect(browserFamily(UA.chromeAndroid)).toBe('chrome')
    expect(browserFamily(UA.firefoxIos)).toBe('firefox')
    expect(browserFamily(UA.firefoxLinux)).toBe('firefox')
    expect(browserFamily(UA.samsung)).toBe('samsung')
    expect(browserFamily(UA.edgeWin)).toBe('edge')
    expect(browserFamily(UA.opera)).toBe('other')
    expect(browserFamily('curl/8')).toBe('other')
  })

  it('reads the real agent by default', () => {
    expect(['safari', 'chrome', 'firefox', 'edge', 'samsung', 'other']).toContain(browserFamily())
  })
})

describe('osFamily', () => {
  it('reduces the agent to a system', () => {
    expect(osFamily(UA.safariIos, 5)).toBe('ios')
    expect(osFamily(UA.chromeAndroid, 5)).toBe('android')
    expect(osFamily(UA.edgeWin, 0)).toBe('windows')
    expect(osFamily(UA.safariMac, 0)).toBe('macos')
    expect(osFamily(UA.firefoxLinux, 0)).toBe('linux')
    expect(osFamily('curl/8', 0)).toBe('other')
  })

  it('takes an iPad that says it is a Mac for iOS', () => {
    expect(osFamily(UA.safariMac, 5)).toBe('ios')
  })

  it('reads the real agent by default', () => {
    expect(['ios', 'android', 'windows', 'macos', 'linux', 'other']).toContain(osFamily())
  })
})

describe('appVersion and isInstalled', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('gives the build id in the shape the server accepts', () => {
    expect(appVersion()).toMatch(/^[A-Za-z0-9.-]{1,20}$/)
  })

  it('cleans and cuts a strange id, and falls back to dev', () => {
    vi.stubGlobal('__APP_VERSION__', 'abc_def!ghi' + 'x'.repeat(30))
    expect(appVersion()).toBe(('abcdefghi' + 'x'.repeat(30)).slice(0, 20))
    vi.stubGlobal('__APP_VERSION__', '!!!')
    expect(appVersion()).toBe('dev')
    vi.stubGlobal('__APP_VERSION__', undefined)
    expect(appVersion()).toBe('dev')
  })

  it('says whether the app runs installed', () => {
    expect(isInstalled()).toBe(false)
  })
})
