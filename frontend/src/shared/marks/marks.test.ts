import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { applyPendingMarks } from './applyPendingMarks'
import { dismissAllMarkNotices, dismissMarkNotice, markNoticesSnapshot, pushMarkNotice, resetMarkNotices, subscribeMarkNotices } from './markNotices'
import * as text from './markText'
import { clearPendingMark, getPendingMark, pendingMarksSnapshot, resetPendingMarks, setDesired, setInFlight, subscribePendingMarks } from './pendingMarks'
import { failureOf, requestMark } from './requestMark'
import { writeDoseToCaches } from './writeDoseToCaches'
import { reportNetworkFailure, resetConnectivity } from '../offline/connectivity'
import { MARK_NEEDS_CONNECTION } from '../offline/offlineText'

const dose = (id: string, taken = false, extra: Record<string, unknown> = {}) => ({ id, scheduledAt: '2026-11-11T14:00:00Z', taken, status: taken ? 'taken' : 'due', takenBy: null, ...extra })

beforeEach(() => {
  resetPendingMarks()
  resetMarkNotices()
  resetConnectivity()
})

describe('pendingMarks', () => {
  it('keeps one entry per dose, tells its listeners and keeps the snapshot while nothing changes', () => {
    const listener = vi.fn()
    const off = subscribePendingMarks(listener)
    const empty = pendingMarksSnapshot()
    expect(pendingMarksSnapshot()).toBe(empty)

    setDesired('d1', true, 1000)
    setDesired('d1', false, 2000)
    expect(pendingMarksSnapshot().size).toBe(1)
    expect(getPendingMark('d1')).toEqual({ taken: false, since: 2000, inFlight: false })

    setInFlight('d1', true)
    setInFlight('d1', true)
    setInFlight('nobody', true)
    setDesired('d1', true, 3000)
    expect(getPendingMark('d1')?.inFlight).toBe(true)
    expect(listener).toHaveBeenCalledTimes(4)

    clearPendingMark('d1')
    clearPendingMark('d1')
    expect(getPendingMark('d1')).toBeUndefined()
    off()
    setDesired('d2', true)
    expect(listener).toHaveBeenCalledTimes(5)
  })
})

describe('applyPendingMarks', () => {
  it('returns the very same object when no mark travels', () => {
    const data = { doses: [dose('d1')] }
    expect(applyPendingMarks(data, new Map())).toBe(data)
  })

  it('shows a marked dose as taken by the session at the hour of the tap, in every shape of data', () => {
    setDesired('d1', true, Date.parse('2026-11-11T16:02:00Z'))
    const marks = pendingMarksSnapshot()
    const detail = { id: 'c1', photoBase64: 'x', medications: [{ id: 'm1', doses: [dose('d1'), dose('d2')] }] }
    const overview = { doses: [dose('d1', false, { medicationName: 'Amoxicilina' })], activeTreatment: null }
    const routines = { routines: [{ id: 'r1', doses: [dose('d1')], lastDone: null }] }

    const shownDetail = applyPendingMarks(detail, marks)
    expect(shownDetail.medications[0].doses[0]).toMatchObject({ taken: true, status: 'taken', takenBy: { name: '', at: '2026-11-11T16:02:00.000Z', mine: true } })
    expect(shownDetail.medications[0].doses[1]).toBe(detail.medications[0].doses[1])
    expect(detail.medications[0].doses[0].taken).toBe(false)
    expect(applyPendingMarks(overview, marks).doses[0]).toMatchObject({ taken: true, medicationName: 'Amoxicilina' })
    expect(applyPendingMarks(routines, marks).routines[0].doses[0].taken).toBe(true)
    expect(applyPendingMarks([dose('d1')], marks)[0].taken).toBe(true)
  })

  it('shows an unmarked dose with no label: its state is the server’s to say', () => {
    setDesired('d1', false, 1)
    const shown = applyPendingMarks({ doses: [dose('d1', true, { takenBy: { name: 'Ana', at: 'x', mine: true } })] }, pendingMarksSnapshot())
    expect(shown.doses[0]).toMatchObject({ taken: false, status: 'pending', takenBy: null })
  })

  it('leaves alone what is not a dose and data without the dose', () => {
    setDesired('d1', true, 1)
    const data = { id: 'd1', name: 'not a dose', list: [1, 'a', null], doses: [dose('other')] }
    expect(applyPendingMarks(data, pendingMarksSnapshot())).toBe(data)
    expect(applyPendingMarks(undefined, pendingMarksSnapshot())).toBeUndefined()
  })
})

describe('writeDoseToCaches', () => {
  it('writes what the server saved into every cached answer that has the dose, and nowhere else', () => {
    const queryClient = new QueryClient()
    const detail = { medications: [{ doses: [dose('d1'), dose('d2')] }] }
    queryClient.setQueryData(['consultation', 'c1'], detail)
    queryClient.setQueryData(['overview', 'k1', 'day'], { doses: [dose('d1', false, { medicationName: 'Amoxicilina' })] })
    queryClient.setQueryData(['child-device', 'overview'], { doses: [dose('d9')] })
    queryClient.setQueryData(['accounts', 'me'], { id: 'd1', taken: false, scheduledAt: 'x' })

    writeDoseToCaches(queryClient, { id: 'd1', taken: true, status: 'taken', takenBy: { name: 'Ana', at: 't', mine: true } })

    const written = queryClient.getQueryData<typeof detail>(['consultation', 'c1'])!
    expect(written.medications[0].doses[0]).toMatchObject({ taken: true, status: 'taken', takenBy: { name: 'Ana' }, scheduledAt: '2026-11-11T14:00:00Z' })
    expect(written.medications[0].doses[1]).toBe(detail.medications[0].doses[1])
    expect(queryClient.getQueryData<{ doses: { taken: boolean; medicationName: string }[] }>(['overview', 'k1', 'day'])!.doses[0]).toMatchObject({ taken: true, medicationName: 'Amoxicilina' })
    expect(queryClient.getQueryData<{ doses: { taken: boolean }[] }>(['child-device', 'overview'])!.doses[0].taken).toBe(false)
    expect(queryClient.getQueryData<{ taken: boolean }>(['accounts', 'me'])!.taken).toBe(false)
  })

  it('keeps the status it had when the answer brings none, and clears the author of an unmarked dose', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['routine', 'r1'], { doses: [dose('d1', true, { takenBy: { name: 'Ana' } })] })
    writeDoseToCaches(queryClient, { id: 'd1', taken: false })
    expect(queryClient.getQueryData<{ doses: unknown[] }>(['routine', 'r1'])!.doses[0]).toMatchObject({ taken: false, status: 'taken', takenBy: null })
  })
})

describe('markNotices', () => {
  it('keeps one notice per dose, the newest last', () => {
    const listener = vi.fn()
    const off = subscribeMarkNotices(listener)
    pushMarkNotice({ doseId: 'd1', kind: 'not_saved', name: 'A', time: '08:00' })
    pushMarkNotice({ doseId: 'd2', kind: 'gone', name: 'B', time: '09:00' })
    pushMarkNotice({ doseId: 'd1', kind: 'not_unmarked', name: 'A', time: '08:00' })
    expect(markNoticesSnapshot().map((n) => `${n.doseId}:${n.kind}`)).toEqual(['d2:gone', 'd1:not_unmarked'])
    dismissMarkNotice('d2')
    dismissMarkNotice('nobody')
    expect(markNoticesSnapshot()).toHaveLength(1)
    dismissAllMarkNotices()
    dismissAllMarkNotices()
    expect(markNoticesSnapshot()).toHaveLength(0)
    expect(listener).toHaveBeenCalledTimes(5)
    off()
  })
})

describe('markText', () => {
  it('says what happened to the mark, word for word', () => {
    expect(text.notSaved('Amoxicilina', '08:00')).toBe('No se guardó la marca de Amoxicilina de las 08:00. Revisa tu conexión e inténtalo de nuevo.')
    expect(text.notUnmarked('', '08:00')).toBe('No se quitó la marca de las 08:00. Revisa tu conexión e inténtalo de nuevo.')
    expect(text.noticeText({ kind: 'marked_by_other', name: 'Amoxicilina', time: '08:00', by: 'Ana' })).toBe('Ana ya había marcado Amoxicilina de las 08:00.')
    expect(text.noticeText({ kind: 'marked_by_other', name: 'Agua', time: '08:00' })).toBe('Otra persona ya había marcado Agua de las 08:00.')
    expect(text.noticeText({ kind: 'not_saved', name: 'A', time: '1' })).toContain('No se guardó')
    expect(text.noticeText({ kind: 'not_unmarked', name: 'A', time: '1' })).toContain('No se quitó')
    expect(text.noticeText({ kind: 'not_yours', name: 'A', time: '1' })).toBe(text.NOT_YOURS)
    expect(text.noticeText({ kind: 'gone', name: 'A', time: '1' })).toBe(text.GONE)
    expect(text.andMore(2)).toBe('y 2 más')
  })

  it('never judges, advises or alarms (Principio I)', () => {
    const all = [text.SAVING, text.CLOSE, text.NOTICE_LABEL, text.NOT_YOURS, text.GONE, text.notSaved('x', '1'), text.notUnmarked('x', '1'), text.markedByOther('Ana', 'x', '1'), text.andMore(1)].join(' ')
    expect(all).not.toMatch(/error|olvid|atras|debes|dosis|peligro|urgente|cuidado|riesgo/i)
  })
})

describe('requestMark', () => {
  const target = { id: 'd1', name: 'Amoxicilina', time: '08:00' }
  const deferred = <T,>() => {
    let resolve!: (value: T) => void
    let reject!: (reason: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }

  it('without a connection paints nothing, sends nothing and says marking needs one (specs/067)', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['overview', 'k'], { doses: [dose('d1')] })
    const send = vi.fn()
    const invalidate = vi.fn()
    reportNetworkFailure()
    await requestMark({ queryClient, dose: target, taken: true, send, invalidate })
    expect(send).not.toHaveBeenCalled()
    expect(getPendingMark('d1')).toBeUndefined()
    expect(markNoticesSnapshot().map(text.noticeText)).toEqual([MARK_NEEDS_CONNECTION])
  })

  it('shows the mark at once, writes what the server saved and asks the data again', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['overview', 'k'], { doses: [dose('d1')] })
    const answer = deferred<unknown>()
    const send = vi.fn(() => answer.promise)
    const invalidate = vi.fn()
    const onSaved = vi.fn()

    const done = requestMark({ queryClient, dose: target, taken: true, send, invalidate, onSaved })
    expect(getPendingMark('d1')).toMatchObject({ taken: true, inFlight: true })
    expect(send).toHaveBeenCalledWith(true)

    answer.resolve({ id: 'd1', taken: true, status: 'taken', takenBy: { name: 'Ana', at: 't', mine: true } })
    await done
    expect(getPendingMark('d1')).toBeUndefined()
    expect(queryClient.getQueryData<{ doses: { takenBy: { name: string } }[] }>(['overview', 'k'])!.doses[0].takenBy.name).toBe('Ana')
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(markNoticesSnapshot()).toHaveLength(0)
  })

  it('sends one request at a time per dose and ends in the state of the last tap', async () => {
    const queryClient = new QueryClient()
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    const send = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const invalidate = vi.fn()

    const done = requestMark({ queryClient, dose: target, taken: true, send, invalidate })
    await requestMark({ queryClient, dose: target, taken: false, send, invalidate })
    await requestMark({ queryClient, dose: target, taken: true, send, invalidate })
    await requestMark({ queryClient, dose: target, taken: false, send, invalidate })
    expect(send).toHaveBeenCalledTimes(1)

    first.resolve({ id: 'd1', taken: true })
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2))
    expect(send).toHaveBeenLastCalledWith(false)
    expect(getPendingMark('d1')).toMatchObject({ taken: false })
    second.resolve({ id: 'd1', taken: false })
    await done
    expect(getPendingMark('d1')).toBeUndefined()
    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  it('sends nothing more when the last tap is what the server already has', async () => {
    const queryClient = new QueryClient()
    const first = deferred<unknown>()
    const send = vi.fn().mockReturnValueOnce(first.promise)
    const done = requestMark({ queryClient, dose: target, taken: true, send, invalidate: vi.fn() })
    await requestMark({ queryClient, dose: target, taken: false, send, invalidate: vi.fn() })
    await requestMark({ queryClient, dose: target, taken: true, send, invalidate: vi.fn() })
    first.resolve(undefined)
    await done
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('marks two different doses in parallel', async () => {
    const queryClient = new QueryClient()
    const send = vi.fn(() => new Promise(() => undefined))
    void requestMark({ queryClient, dose: target, taken: true, send, invalidate: vi.fn() })
    void requestMark({ queryClient, dose: { ...target, id: 'd2' }, taken: true, send, invalidate: vi.fn() })
    expect(send).toHaveBeenCalledTimes(2)
  })

  it.each([
    [new Error('network'), true, 'not_saved'],
    [new Error('network'), false, 'not_unmarked'],
    [{ kind: 'forbidden' }, false, 'not_yours'],
    [{ kind: 'dose_not_found' }, true, 'gone'],
    [{ kind: 'no_access' }, true, 'gone'],
  ])('a failure takes the screen back and says so (%#)', async (error, taken, kind) => {
    const invalidate = vi.fn()
    const onSaved = vi.fn()
    await requestMark({ queryClient: new QueryClient(), dose: target, taken, send: () => Promise.reject(error), invalidate, onSaved })
    expect(getPendingMark('d1')).toBeUndefined()
    expect(markNoticesSnapshot()).toEqual([{ doseId: 'd1', kind, name: 'Amoxicilina', time: '08:00' }])
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('«nothing to mark» goes back without a notice', async () => {
    await requestMark({ queryClient: new QueryClient(), dose: target, taken: true, send: () => Promise.reject({ kind: 'nothing_to_mark' }), invalidate: vi.fn() })
    expect(getPendingMark('d1')).toBeUndefined()
    expect(markNoticesSnapshot()).toHaveLength(0)
    expect(failureOf(null)).toBe('failed')
  })

  it('says who had marked it when the first mark was somebody else’s, and the next save takes the notice away', async () => {
    const queryClient = new QueryClient()
    await requestMark({ queryClient, dose: target, taken: true, send: async () => ({ id: 'd1', taken: true, takenBy: { name: 'Ana', at: 't', mine: false } }), invalidate: vi.fn() })
    expect(markNoticesSnapshot()).toEqual([{ doseId: 'd1', kind: 'marked_by_other', name: 'Amoxicilina', time: '08:00', by: 'Ana' }])

    await requestMark({ queryClient, dose: target, taken: true, send: async () => ({ id: 'd1', taken: true, takenBy: { name: 'Luis', at: 't', mine: true } }), invalidate: vi.fn() })
    expect(markNoticesSnapshot()).toHaveLength(0)
  })
})
