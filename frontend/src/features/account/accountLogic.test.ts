import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { ACCOUNT, DELETE, FAMILY_NOTICE, PAUSED, longDate, namesList } from './accountText'
import {
  DeletionError,
  cancelDeletion,
  downloadFamilyChildren,
  downloadMyData,
  requestDeletion,
} from './api'
import { CANCELED_NOTICE_MS, markCanceled, useCanceledNotice } from './canceledNotice'
import { ACCOUNT_PAUSED_EVENT, noticeAccountPause } from '../../shared/accountPause'
import { callsOf, stubApi } from './account.test-utils'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  sessionStorage.clear()
})

describe('accountText', () => {
  it('writes the date in Spanish', () => {
    expect(longDate(new Date(2026, 11, 12, 10).toISOString())).toBe('12 de diciembre de 2026')
  })

  it('joins the children names', () => {
    expect(namesList([])).toBe('Sus hijos')
    expect(namesList(['Mateo'])).toBe('Mateo')
    expect(namesList(['Mateo', 'Sofía'])).toBe('Mateo y Sofía')
    expect(namesList(['Mateo', 'Sofía', 'Pablo'])).toBe('Mateo, Sofía y Pablo')
  })

  it('agrees the verb with one or more children', () => {
    expect(FAMILY_NOTICE.body('Ana', 'Mateo', '1 de enero')).toContain('Mateo dejará de aparecer')
    expect(FAMILY_NOTICE.body('Ana', 'Mateo y Sofía', '1 de enero')).toContain(
      'dejarán de aparecer',
    )
  })

  it('never frightens nor speaks about health', () => {
    const texts: string[] = []
    for (const group of [ACCOUNT, DELETE, PAUSED, FAMILY_NOTICE]) {
      for (const value of Object.values(group)) {
        if (typeof value === 'string') texts.push(value)
        else texts.push((value as (...a: string[]) => string)('X', 'Y', 'Z'))
      }
    }
    const all = texts.join(' ').toLowerCase()
    for (const word of [
      'peligro',
      'urgente',
      'última oportunidad',
      'perderás todo',
      'diagnóstico',
      'enfermedad',
      '!',
    ]) {
      expect(all).not.toContain(word)
    }
  })
})

describe('api', () => {
  it('asks for the deletion with the word in the body', async () => {
    const mock = stubApi({
      'POST /accounts/a1/deletion': { status: 201, body: { status: 'pending' } },
    })
    await expect(requestDeletion('a1', 't')).resolves.toEqual({ status: 'pending' })
    const init = mock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(init.body))).toEqual({ confirm: 'ELIMINAR' })
  })

  it('returns the reverification answer instead of throwing', async () => {
    const body = { clerk_error: { reason: 'reverification-error' } }
    stubApi({ 'POST /accounts/a1/deletion': { status: 403, body } })
    await expect(requestDeletion('a1', 't')).resolves.toEqual(body)
  })

  it.each([
    ['another 403', { error: 'forbidden' }],
    ['a 403 with no body', undefined],
    ['a 403 from Clerk for another reason', { clerk_error: { reason: 'other' } }],
  ])('throws on %s instead of passing it to the reverification', async (_name, body) => {
    stubApi({ 'POST /accounts/a1/deletion': { status: 403, body } })
    const error = await requestDeletion('a1', 't').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DeletionError)
    expect((error as DeletionError).kind).toBe('unknown')
  })

  it('sends the word the person wrote', async () => {
    const mock = stubApi({ 'POST /accounts/a1/deletion': { status: 400 } })
    await requestDeletion('a1', 't', 'ELIMINA').catch(() => undefined)
    expect(JSON.parse(String((mock.mock.calls[0][1] as RequestInit).body))).toEqual({ confirm: 'ELIMINA' })
  })

  it.each([
    [400, 'confirm'],
    [409, 'pending'],
    [502, 'subscription'],
    [500, 'unknown'],
  ])('maps %i to %s', async (status, kind) => {
    stubApi({ 'POST /accounts/a1/deletion': { status } })
    const error = await requestDeletion('a1', null).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DeletionError)
    expect((error as DeletionError).kind).toBe(kind)
  })

  it('cancels and fails on a bad answer', async () => {
    stubApi({ 'POST /accounts/a1/deletion/cancel': { status: 200, body: {} } })
    await expect(cancelDeletion('a1', null)).resolves.toBeUndefined()
    stubApi({ 'POST /accounts/a1/deletion/cancel': { status: 500 } })
    await expect(cancelDeletion('a1', null)).rejects.toBeInstanceOf(DeletionError)
  })

  it('downloads with the server file name or a default', async () => {
    const mock = stubApi({
      'POST /accounts/a1/data-export': { fileName: 'peditrack-ana.zip' },
      'POST /family/children-export': {},
    })
    await expect(downloadMyData('a1', 't')).resolves.toMatchObject({ name: 'peditrack-ana.zip' })
    await expect(downloadFamilyChildren('t')).resolves.toMatchObject({
      name: 'peditrack-datos.zip',
    })
    expect(callsOf(mock)).toEqual(['POST /accounts/a1/data-export', 'POST /family/children-export'])
  })

  it('fails a refused or cut download', async () => {
    stubApi({ 'POST /accounts/a1/data-export': { status: 409 } })
    await expect(downloadMyData('a1', null)).rejects.toThrow('409')
    stubApi({ 'POST /accounts/a1/data-export': { reject: true } })
    await expect(downloadMyData('a1', null)).rejects.toThrow('cut')
  })
})

describe('noticeAccountPause', () => {
  const response = (status: number, json: () => Promise<unknown>) =>
    ({ status, json }) as unknown as Response

  it('fires the event only for the pause', async () => {
    const seen = vi.fn()
    window.addEventListener(ACCOUNT_PAUSED_EVENT, seen)
    await noticeAccountPause(response(200, async () => ({ error: 'account_deletion_pending' })))
    await noticeAccountPause(response(409, async () => ({ error: 'edit_conflict' })))
    await noticeAccountPause(response(409, async () => Promise.reject(new Error('x'))))
    expect(seen).not.toHaveBeenCalled()
    await noticeAccountPause(response(409, async () => ({ error: 'account_deletion_pending' })))
    expect(seen).toHaveBeenCalledTimes(1)
    window.removeEventListener(ACCOUNT_PAUSED_EVENT, seen)
  })
})

describe('canceledNotice', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows once after canceling and forgets the key at once', () => {
    markCanceled()
    // Reading it already forgot it: a reload (a new read) does not bring it back.
    expect(renderHook(() => useCanceledNotice()).result.current[0]).toBe(true)
    expect(sessionStorage.getItem('eliminacion-cancelada')).toBeNull()
    expect(renderHook(() => useCanceledNotice()).result.current[0]).toBe(false)
  })

  it('forgets the key when it is marked while the gate is mounted', () => {
    const { result } = renderHook(() => useCanceledNotice())
    expect(result.current[0]).toBe(false)
    act(() => markCanceled())
    expect(result.current[0]).toBe(true)
    expect(sessionStorage.getItem('eliminacion-cancelada')).toBeNull()
  })

  it('closes with the person and by itself after a few seconds', () => {
    markCanceled()
    const { result } = renderHook(() => useCanceledNotice())
    act(() => result.current[1]())
    expect(result.current[0]).toBe(false)

    vi.useFakeTimers()
    const again = renderHook(() => useCanceledNotice())
    act(() => markCanceled())
    expect(again.result.current[0]).toBe(true)
    act(() => {
      vi.advanceTimersByTime(CANCELED_NOTICE_MS)
    })
    expect(again.result.current[0]).toBe(false)
  })

  it('survives a browser without storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => markCanceled()).not.toThrow()
    expect(renderHook(() => useCanceledNotice()).result.current[0]).toBe(false)
  })
})
