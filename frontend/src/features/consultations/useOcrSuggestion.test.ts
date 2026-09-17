import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useOcrSuggestion } from './useOcrSuggestion'

vi.mock('tesseract.js', () => ({
  default: {
    recognize: vi.fn(),
  },
}))

describe('useOcrSuggestion', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('exposes the extracted text as a suggestion (FR-006)', async () => {
    const tesseract = await import('tesseract.js')
    vi.mocked(tesseract.default.recognize).mockResolvedValue({
      data: { text: 'Tratamiento por 5 días' },
    } as never)

    const { result } = renderHook(() => useOcrSuggestion())
    await act(async () => {
      await result.current.runOcr(new File(['x'], 'receta.jpg'))
    })

    await waitFor(() => expect(result.current.suggestion).toBe('Tratamiento por 5 días'))
  })

  it('does not block the form when OCR finds no text (FR-007)', async () => {
    const tesseract = await import('tesseract.js')
    vi.mocked(tesseract.default.recognize).mockResolvedValue({
      data: { text: '   ' },
    } as never)

    const { result } = renderHook(() => useOcrSuggestion())
    await act(async () => {
      await result.current.runOcr(new File(['x'], 'receta.jpg'))
    })

    await waitFor(() => expect(result.current.suggestion).toBeNull())
  })

  it('does not block the form when OCR fails (FR-007)', async () => {
    const tesseract = await import('tesseract.js')
    vi.mocked(tesseract.default.recognize).mockRejectedValue(new Error('OCR engine crashed'))

    const { result } = renderHook(() => useOcrSuggestion())
    await act(async () => {
      await result.current.runOcr(new File(['x'], 'receta.jpg'))
    })

    await waitFor(() => expect(result.current.suggestion).toBeNull())
    expect(result.current.isRunning).toBe(false)
  })
})
