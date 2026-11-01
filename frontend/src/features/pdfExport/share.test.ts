import { afterEach, describe, expect, it, vi } from 'vitest'
import { canShareFile, downloadFile, shareFile } from './share'

const file = new File(['%PDF'], 'Mateo-Morales-historial-24-oct-2026.pdf', { type: 'application/pdf' })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('canShareFile', () => {
  it('is false without the share sheet', () => {
    vi.stubGlobal('navigator', {})
    expect(canShareFile(file)).toBe(false)
  })

  it('asks the browser whether it takes this file', () => {
    const canShare = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { share: vi.fn(), canShare })
    expect(canShareFile(file)).toBe(true)
    expect(canShare).toHaveBeenCalledWith({ files: [file] })
    canShare.mockReturnValue(false)
    expect(canShareFile(file)).toBe(false)
    canShare.mockImplementation(() => {
      throw new TypeError('no')
    })
    expect(canShareFile(file)).toBe(false)
  })
})

describe('shareFile', () => {
  it('shares the file with its title', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share })
    await expect(shareFile(file, 'Historial de Mateo Morales')).resolves.toBe(true)
    expect(share).toHaveBeenCalledWith({ files: [file], title: 'Historial de Mateo Morales' })
  })

  it('closing the sheet is not a failure; anything else is', async () => {
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(new DOMException('closed', 'AbortError')) })
    await expect(shareFile(file, 't')).resolves.toBe(false)
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(new DOMException('no', 'NotAllowedError')) })
    await expect(shareFile(file, 't')).rejects.toThrow('no')
  })
})

describe('downloadFile', () => {
  it('clicks a temporary link with the name and frees its address', () => {
    vi.useFakeTimers()
    const create = vi.fn().mockReturnValue('blob:x')
    const revoke = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe(file.name)
      expect(this.getAttribute('href')).toBe('blob:x')
    })
    downloadFile(file, file.name)
    expect(click).toHaveBeenCalledOnce()
    expect(document.querySelector('a[download]')).toBeNull()
    expect(revoke).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledWith('blob:x')
  })
})
