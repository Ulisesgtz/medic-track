import { afterEach, describe, expect, it, vi } from 'vitest'
import { goTo, reloadPage } from './navigate'

afterEach(() => vi.unstubAllGlobals())

describe('navigate', () => {
  it('reloads and goes to an address through window.location', () => {
    const reload = vi.fn()
    const assign = vi.fn()
    vi.stubGlobal('location', { reload, assign })
    reloadPage()
    goTo('/home')
    expect(reload).toHaveBeenCalledTimes(1)
    expect(assign).toHaveBeenCalledWith('/home')
  })
})
