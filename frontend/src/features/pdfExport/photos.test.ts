import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ANNEX_PHOTO_SIDE, photoCount, preparePhotos, toAnnexJpeg } from './photos'

const fetchCardPhoto = vi.fn()
const fetchConsultationPhoto = vi.fn()
vi.mock('./api', () => ({
  fetchCardPhoto: (...args: unknown[]) => fetchCardPhoto(...args),
  fetchConsultationPhoto: (...args: unknown[]) => fetchConsultationPhoto(...args),
}))

const drawImage = vi.fn()
const fillRect = vi.fn()
let context: object | null
let dataUrl: string
let size: { width: number; height: number }

beforeEach(() => {
  fetchCardPhoto.mockReset()
  fetchConsultationPhoto.mockReset()
  drawImage.mockReset()
  context = { drawImage, fillRect, fillStyle: '' }
  dataUrl = 'data:image/jpeg;base64,AAA'
  size = { width: 4000, height: 3000 }
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn().mockImplementation(async (blob: Blob) => {
      if ((await blob.text()) === 'heic') throw new DOMException('cannot decode', 'InvalidStateError')
      return { ...size, close: vi.fn() }
    }),
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => context as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => dataUrl)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const b64 = (text: string) => btoa(text)

describe('toAnnexJpeg', () => {
  it('redraws the photo at 1600 px on the long side, on white', async () => {
    await expect(toAnnexJpeg(b64('jpeg'))).resolves.toBe('data:image/jpeg;base64,AAA')
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, ANNEX_PHOTO_SIDE, 1200)
    expect(fillRect).toHaveBeenCalledWith(0, 0, ANNEX_PHOTO_SIDE, 1200)
  })

  it('never enlarges a small photo', async () => {
    size = { width: 800, height: 1000 }
    await toAnnexJpeg(b64('jpeg'))
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 800, 1000)
  })

  it('is null for no photo, one the browser can’t decode, no canvas, or no JPEG out', async () => {
    await expect(toAnnexJpeg('')).resolves.toBeNull()
    await expect(toAnnexJpeg(b64('heic'))).resolves.toBeNull()
    context = null
    await expect(toAnnexJpeg(b64('jpeg'))).resolves.toBeNull()
    context = { drawImage, fillRect }
    dataUrl = 'data:,'
    await expect(toAnnexJpeg(b64('jpeg'))).resolves.toBeNull()
  })
})

describe('preparePhotos', () => {
  const photos = {
    card: [
      { id: 'p1', createdAt: '2026-10-03T18:00:00Z' },
      { id: 'p2', createdAt: '2026-10-03T18:02:00Z' },
    ],
    consultations: [{ consultationId: 'k1', consultDate: '2026-10-18', doctorName: 'Dra. Laura Cázares' }],
  }

  it('asks one by one, the card first, telling each step; a photo that fails is only left out', async () => {
    fetchCardPhoto.mockResolvedValueOnce(b64('jpeg')).mockResolvedValueOnce(b64('heic'))
    fetchConsultationPhoto.mockRejectedValueOnce(new Error('500'))
    const progress: string[] = []
    const signal = new AbortController().signal
    const token = vi.fn().mockResolvedValue('tok')
    const prepared = await preparePhotos('c1', photos, token, signal, (n, total) => progress.push(`${n}/${total}`))
    expect(progress).toEqual(['1/3', '2/3', '3/3'])
    expect(prepared).toEqual({ card: { p1: 'data:image/jpeg;base64,AAA', p2: null }, consultations: { k1: null } })
    expect(fetchCardPhoto).toHaveBeenCalledWith('c1', 'p1', 'tok', signal)
    expect(fetchConsultationPhoto).toHaveBeenCalledWith('k1', 'tok', signal)
    expect(token).toHaveBeenCalledTimes(3)
  })

  it('«Cancelar» stops it', async () => {
    const controller = new AbortController()
    fetchCardPhoto.mockImplementation(async () => {
      controller.abort()
      throw new DOMException('aborted', 'AbortError')
    })
    await expect(preparePhotos('c1', photos, async () => null, controller.signal, () => {})).rejects.toThrow('aborted')
    expect(fetchConsultationPhoto).not.toHaveBeenCalled()
  })

  it('photoCount', () => {
    expect(photoCount(null)).toBe(0)
    expect(photoCount(photos)).toBe(3)
  })
})
