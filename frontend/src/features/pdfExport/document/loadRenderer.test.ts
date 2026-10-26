import { beforeEach, describe, expect, it, vi } from 'vitest'

const register = vi.fn()
const registerHyphenationCallback = vi.fn()
const renderer = { Font: { register, registerHyphenationCallback } }

describe('loadRenderer', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('@react-pdf/renderer')
    register.mockClear()
  })

  it('loads the library once and registers Figtree', async () => {
    vi.doMock('@react-pdf/renderer', () => renderer)
    const { loadRenderer } = await import('./loadRenderer')
    const first = await loadRenderer()
    const second = await loadRenderer()
    expect(second).toBe(first)
    expect(register).toHaveBeenCalledTimes(1)
    expect(register.mock.calls[0][0].family).toBe('Figtree')
  })

  it('tries again after a failed download', async () => {
    vi.doMock('@react-pdf/renderer', () => {
      throw new Error('offline')
    })
    const { loadRenderer } = await import('./loadRenderer')
    await expect(loadRenderer()).rejects.toThrow()

    vi.resetModules()
    vi.doMock('@react-pdf/renderer', () => renderer)
    await expect(loadRenderer()).resolves.toBeDefined()
    expect(register).toHaveBeenCalledTimes(1)
  })
})
