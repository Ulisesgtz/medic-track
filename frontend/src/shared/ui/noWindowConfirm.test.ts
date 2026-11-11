import { describe, it, expect } from 'vitest'

// specs/066: the app asks with its own dialog (`useDiscardGuard`, `ConfirmDialog`), never the browser's box, which in the
// installed app shows the domain and looks different on every phone.
const files = import.meta.glob('../../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const BROWSER_BOX = /window\.(confirm|alert)\(/g

describe('browser dialogs', () => {
  it('no screen of the app uses window.confirm or window.alert', () => {
    const offenders = Object.entries(files)
      .filter(([path]) => !/\.test\.|test-utils/.test(path))
      .flatMap(([path, source]) => (source.match(BROWSER_BOX) ?? []).map((call) => `${path}: ${call}`))

    expect(Object.keys(files).length).toBeGreaterThan(50)
    expect(offenders).toEqual([])
  })

  it('the guard sees a browser box when there is one', () => {
    expect('if (!window.confirm(x)) return'.match(BROWSER_BOX)).toEqual(['window.confirm('])
  })
})
