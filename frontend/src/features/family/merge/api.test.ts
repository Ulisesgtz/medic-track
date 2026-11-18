import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMergeOptions, MergeApiError, mergeChildren, previewMerge, setHiddenChildren } from './api'

const answer = (status: number, body: unknown = {}) =>
  vi.mocked(fetch).mockResolvedValueOnce({ ok: status >= 200 && status < 300, status, json: async () => body } as Response)

beforeEach(() => void vi.stubGlobal('fetch', vi.fn()))
afterEach(() => void vi.unstubAllGlobals())

const call = () => {
  const [url, init] = vi.mocked(fetch).mock.calls[0]
  return { url: String(url), init: init as RequestInit }
}

describe('merge api', () => {
  it('reads the options with the token', async () => {
    answer(200, { canMerge: true })
    expect(await getMergeOptions('tok')).toEqual({ canMerge: true })
    expect(call().url).toMatch(/\/family\/merge-options$/)
    expect(call().init.headers).toMatchObject({ Authorization: 'Bearer tok' })
  })

  it('previews and merges with the pairs in the body only', async () => {
    answer(200, { pairs: [{ ownChildId: 'o' }] })
    expect(await previewMerge([{ ownChildId: 'o', familyChildId: 'f' }], 't')).toEqual([{ ownChildId: 'o' }])
    expect(call().url).toMatch(/\/family\/merges\/preview$/)
    expect(JSON.parse(call().init.body as string)).toEqual({ pairs: [{ ownChildId: 'o', familyChildId: 'f' }] })

    vi.mocked(fetch).mockClear()
    answer(200, { results: [{ status: 'merged' }] })
    expect(await mergeChildren([{ ownChildId: 'o', familyChildId: 'f', choices: { weight: 'own' } }], 't')).toEqual([{ status: 'merged' }])
    expect(call().url).toMatch(/\/family\/merges$/)
    expect(call().init.method).toBe('POST')
  })

  it('replaces the hidden children', async () => {
    answer(200, { id: 'a1' })
    await setHiddenChildren('a1', ['c1'], 't')
    expect(call().url).toMatch(/\/accounts\/a1\/hidden-children$/)
    expect(call().init.method).toBe('PUT')
    expect(JSON.parse(call().init.body as string)).toEqual({ childIds: ['c1'] })
  })

  it('types the errors', async () => {
    answer(404, { error: 'no_family', message: 'm' })
    await expect(getMergeOptions('t')).rejects.toMatchObject({ kind: 'no_family' })
    answer(400, { error: 'pairs' })
    await expect(previewMerge([], 't')).rejects.toBeInstanceOf(MergeApiError)
    answer(500, {})
    await expect(getMergeOptions('t')).rejects.toMatchObject({ kind: 'unknown' })
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('x')
      },
    } as unknown as Response)
    await expect(getMergeOptions('t')).rejects.toMatchObject({ kind: 'unknown' })
  })
})
