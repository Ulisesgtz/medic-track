import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_PHOTO_SIDE, shrinkPhoto } from './shrinkPhoto'

const original = new File([new Uint8Array(5000)], 'receta.jpg', { type: 'image/jpeg' })

function stubBrowser({ width, height, blob, context = true }: { width: number; height: number; blob: Blob | null; context?: boolean }) {
  const drawImage = vi.fn()
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width, height, close: vi.fn() }))
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => (context ? { drawImage } : null),
    toBlob: (cb: (b: Blob | null) => void) => cb(blob),
  }
  vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement)
  return { canvas, drawImage }
}

describe('shrinkPhoto', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('scales a big photo so its longest side is the maximum and returns the smaller JPEG', async () => {
    const small = new Blob([new Uint8Array(100)], { type: 'image/jpeg' })
    const { canvas, drawImage } = stubBrowser({ width: 4000, height: 3000, blob: small })

    expect(await shrinkPhoto(original)).toBe(small)
    expect(canvas.width).toBe(MAX_PHOTO_SIDE)
    expect(canvas.height).toBe(1500)
    expect(drawImage).toHaveBeenCalled()
  })

  it('never enlarges a photo that is already small', async () => {
    const small = new Blob([new Uint8Array(100)])
    const { canvas } = stubBrowser({ width: 800, height: 600, blob: small })

    await shrinkPhoto(original)

    expect(canvas.width).toBe(800)
    expect(canvas.height).toBe(600)
  })

  it('keeps the original when the result is not smaller', async () => {
    stubBrowser({ width: 800, height: 600, blob: new Blob([new Uint8Array(9000)]) })

    expect(await shrinkPhoto(original)).toBe(original)
  })

  it('keeps the original when the canvas gives nothing or has no context', async () => {
    stubBrowser({ width: 800, height: 600, blob: null })
    expect(await shrinkPhoto(original)).toBe(original)
    stubBrowser({ width: 800, height: 600, blob: new Blob([]), context: false })
    expect(await shrinkPhoto(original)).toBe(original)
  })

  it('keeps the original when the browser cannot decode the file (a HEIC, no createImageBitmap)', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('cannot decode')))
    expect(await shrinkPhoto(original)).toBe(original)
  })
})
