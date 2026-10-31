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
})
