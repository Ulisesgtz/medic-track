import { describe, expect, it, vi } from 'vitest'
import { CASE_B, NOW } from './fixtures'

const toBlob = vi.fn(async () => new Blob(['%PDF-1.7'], { type: 'application/pdf' }))
const pdf = vi.fn(() => ({ toBlob }))
vi.mock('./loadRenderer', () => ({ loadRenderer: async () => ({ pdf }) }))

describe('renderHistoryPdf', () => {
  it('loads the library and lays the document out twice: once to learn the pages, once to write them', async () => {
    const { renderHistoryPdf } = await import('./render')
    const { blob } = await renderHistoryPdf({ ...CASE_B, now: NOW, icon: '/icon-192.png' })
    expect(pdf).toHaveBeenCalledTimes(2)
    expect(blob.type).toBe('application/pdf')
  })

  it('the first layout goes without the photos (their boxes have a fixed size), the second one with them', async () => {
    pdf.mockClear()
    const { renderHistoryPdf } = await import('./render')
    const photos = { card: {}, consultations: { c1: 'data:image/jpeg;base64,AAA' } }
    await renderHistoryPdf({ ...CASE_B, now: NOW, icon: '/icon-192.png', photos })
    const inputs = (pdf.mock.calls as unknown as [{ props: { input: { photos?: unknown } } }][]).map(([doc]) => doc.props.input.photos)
    expect(inputs).toEqual([undefined, photos])
  })
})
