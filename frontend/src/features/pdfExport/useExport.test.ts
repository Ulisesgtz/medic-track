import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportApiError } from './api'
import { CASE_A, CASE_B } from './document/fixtures'
import type { ExportData, ExportRequest } from './types'
import { useExport } from './useExport'

vi.mock('@clerk/react', () => ({ useAuth: () => ({ getToken: () => Promise.resolve('tok') }) }))

const fetchExportData = vi.fn()
vi.mock('./api', async (original) => ({ ...(await original<typeof import('./api')>()), fetchExportData: (...args: unknown[]) => fetchExportData(...args) }))

const preparePhotos = vi.fn()
vi.mock('./photos', async (original) => ({
  ...(await original<typeof import('./photos')>()),
  preparePhotos: (...args: unknown[]) => preparePhotos(...args),
}))

const renderHistoryPdf = vi.fn()
vi.mock('./document/render', () => ({ renderHistoryPdf: (...args: unknown[]) => renderHistoryPdf(...args) }))

const request: ExportRequest = { period: { kind: 'all' }, sections: { consultations: true, vaccinations: true, photos: false } }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  preparePhotos.mockReset()
  fetchExportData.mockReset()
  renderHistoryPdf.mockReset()
})

describe('useExport', () => {
  it('starts on the options, or on the plan notice for a free account', () => {
    expect(renderHook(() => useExport({ childId: 'c1' })).result.current.state).toEqual({ status: 'options' })
    expect(renderHook(() => useExport({ childId: 'c1', free: true })).result.current.state).toEqual({ status: 'plan' })
  })

  it('asks for the data, lays the document out and hands over a named PDF', async () => {
    const data = deferred<ExportData>()
    fetchExportData.mockReturnValue(data.promise)
    renderHistoryPdf.mockResolvedValue({ blob: new Blob(['%PDF-1.7 hola'], { type: 'application/pdf' }), pages: 4 })
    const { result } = renderHook(() => useExport({ childId: 'c1', symptomNames: { fever: 'Fiebre' } }))

    await act(async () => void result.current.generate(request))
    expect(result.current.state).toEqual({ status: 'generating', stage: 'data' })
    expect(fetchExportData).toHaveBeenCalledWith('c1', request, 'tok', expect.any(AbortSignal))

    await act(async () => data.resolve(CASE_A.data))
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    const state = result.current.state
    if (state.status !== 'ready') throw new Error('not ready')
    expect(state.file.name).toMatch(/^Mateo-Morales-historial-\d+-[a-z]{3}-\d{4}\.pdf$/)
    expect(state.file.type).toBe('application/pdf')
    expect(state.pages).toBe(4)
    expect(state.size).toBe(13)
    expect(state.request).toBe(request)
    const input = renderHistoryPdf.mock.calls[0][0]
    expect(input).toMatchObject({ request, data: CASE_A.data, symptomNames: { fever: 'Fiebre' } })
    expect(input.icon).toMatch(/\/icon-192\.png$/)
  })

  it('with the photos asked, prepares them one by one, telling each, and puts them in the document', async () => {
    fetchExportData.mockResolvedValue(CASE_A.data)
    const prepared = { card: { p1: 'data:image/jpeg;base64,A', p2: null }, consultations: { c1: null } }
    const gate = deferred<typeof prepared>()
    preparePhotos.mockImplementation((_child, _photos, _token, _signal, onProgress: (n: number, total: number) => void) => {
      onProgress(2, 3)
      return gate.promise
    })
    renderHistoryPdf.mockResolvedValue({ blob: new Blob(['%PDF']), pages: 5 })
    const { result } = renderHook(() => useExport({ childId: 'c1' }))
    const withPhotos = { ...request, sections: { ...request.sections, photos: true } }
    await act(async () => void result.current.generate(withPhotos))
    expect(result.current.state).toEqual({ status: 'generating', stage: 'photos', photo: { done: 2, total: 3 } })
    expect(preparePhotos).toHaveBeenCalledWith('c1', CASE_A.data.photos, 'tok', expect.any(AbortSignal), expect.any(Function))
    await act(async () => gate.resolve(prepared))
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(renderHistoryPdf.mock.calls[0][0].photos).toBe(prepared)
  })

  it('a cancel while preparing the photos leaves no file; without photos asked none are fetched', async () => {
    fetchExportData.mockResolvedValue(CASE_A.data)
    const gate = deferred<unknown>()
    preparePhotos.mockReturnValue(gate.promise)
    const { result } = renderHook(() => useExport({ childId: 'c1' }))
    await act(async () => void result.current.generate({ ...request, sections: { ...request.sections, photos: true } }))
    const onProgress = preparePhotos.mock.calls[0][4] as (n: number, total: number) => void
    act(() => result.current.cancel())
    act(() => onProgress(1, 3))
    await act(async () => gate.resolve({ card: {}, consultations: {} }))
    expect(result.current.state).toEqual({ status: 'options' })
    expect(renderHistoryPdf).not.toHaveBeenCalled()

    preparePhotos.mockClear()
    renderHistoryPdf.mockResolvedValue({ blob: new Blob(['%PDF']), pages: 4 })
    await act(async () => void result.current.generate(request))
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(preparePhotos).not.toHaveBeenCalled()
  })

  it('says when the period has nothing registered, and «Cambiar periodo» goes back', async () => {
    fetchExportData.mockResolvedValue({ ...CASE_B.data, consultations: [], vaccinations: [] })
    const { result } = renderHook(() => useExport({ childId: 'c1' }))
    await act(() => result.current.generate(request))
    expect(result.current.state).toEqual({ status: 'empty', request })
    expect(renderHistoryPdf).not.toHaveBeenCalled()
    act(() => result.current.back())
    expect(result.current.state).toEqual({ status: 'options' })
  })

  it('the server’s 422 is the plan notice; any other failure is the error, and «Intentar de nuevo» asks again', async () => {
    fetchExportData.mockRejectedValueOnce(new ExportApiError('plan_required', 'plan'))
    const { result } = renderHook(() => useExport({ childId: 'c1' }))
    await act(() => result.current.generate(request))
    expect(result.current.state).toEqual({ status: 'plan' })

    fetchExportData.mockRejectedValueOnce(new Error('offline'))
    await act(() => result.current.generate(request))
    expect(result.current.state).toEqual({ status: 'error' })

    renderHistoryPdf.mockRejectedValueOnce(new Error('font'))
    fetchExportData.mockResolvedValueOnce(CASE_A.data)
    await act(async () => result.current.retry())
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error' }))
    expect(fetchExportData).toHaveBeenCalledTimes(3)
  })

  it('«Intentar de nuevo» before anything was asked goes to the options', () => {
    const { result } = renderHook(() => useExport({ childId: 'c1', free: true }))
    act(() => result.current.retry())
    expect(result.current.state).toEqual({ status: 'options' })
  })

  it('«Cancelar» stops the request and leaves no file, even if the answer arrives later', async () => {
    const data = deferred<ExportData>()
    fetchExportData.mockReturnValue(data.promise)
    const { result } = renderHook(() => useExport({ childId: 'c1' }))
    await act(async () => void result.current.generate(request))
    const signal = fetchExportData.mock.calls[0][3] as AbortSignal
    act(() => result.current.cancel())
    expect(signal.aborted).toBe(true)
    expect(result.current.state).toEqual({ status: 'options' })
    await act(async () => data.resolve(CASE_A.data))
    expect(result.current.state).toEqual({ status: 'options' })
    expect(renderHistoryPdf).not.toHaveBeenCalled()
  })

  it('a cancel while laying out drops the document, and a cancelled request’s failure says nothing', async () => {
    fetchExportData.mockResolvedValueOnce(CASE_A.data)
    const pdf = deferred<{ blob: Blob; pages: number }>()
    renderHistoryPdf.mockReturnValue(pdf.promise)
    const { result } = renderHook(() => useExport({ childId: 'c1' }))
    await act(async () => void result.current.generate(request))
    await waitFor(() => expect(result.current.state).toEqual({ status: 'generating', stage: 'document' }))
    act(() => result.current.cancel())
    await act(async () => pdf.resolve({ blob: new Blob(['x']), pages: 1 }))
    expect(result.current.state).toEqual({ status: 'options' })

    const failing = deferred<ExportData>()
    fetchExportData.mockReturnValueOnce(failing.promise)
    await act(async () => void result.current.generate(request))
    act(() => result.current.cancel())
    await act(async () => failing.reject(new DOMException('aborted', 'AbortError')))
    expect(result.current.state).toEqual({ status: 'options' })
  })

  it('closing the panel stops the request', async () => {
    fetchExportData.mockReturnValue(new Promise(() => {}))
    const { result, unmount } = renderHook(() => useExport({ childId: 'c1' }))
    await act(async () => void result.current.generate(request))
    const signal = fetchExportData.mock.calls[0][3] as AbortSignal
    unmount()
    expect(signal.aborted).toBe(true)
  })
})
