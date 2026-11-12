import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onlineManager } from '@tanstack/react-query'
import { markNoticesSnapshot, resetMarkNotices } from '../marks/markNotices'
import { noticeText } from '../marks/markText'
import { OfflineError, reportNetworkFailure, resetConnectivity } from './connectivity'
import * as device from './device'
import { createQueryClient, isConnectionFailure, notifyNeedsConnection } from './offlineGuard'
import { ACTION_NEEDS_CONNECTION, MARK_NEEDS_CONNECTION } from './offlineText'

beforeEach(() => {
  resetConnectivity()
  resetMarkNotices()
})
afterEach(() => {
  resetConnectivity()
  vi.restoreAllMocks()
  onlineManager.setOnline(true)
})

describe('offline guard', () => {
  it('says once that an action needs a connection', () => {
    notifyNeedsConnection('action')
    notifyNeedsConnection('action')
    notifyNeedsConnection('mark')
    expect(markNoticesSnapshot().map(noticeText)).toEqual([ACTION_NEEDS_CONNECTION, MARK_NEEDS_CONNECTION])
  })

  it('knows a failure caused by the connection', () => {
    expect(isConnectionFailure(new OfflineError())).toBe(true)
    expect(isConnectionFailure(new TypeError('Failed to fetch'))).toBe(false)
    reportNetworkFailure()
    expect(isConnectionFailure(new TypeError('Failed to fetch'))).toBe(true)
    expect(isConnectionFailure(new Error('validation'))).toBe(false)
  })

  it('refuses a mutation without a connection: nothing is sent, nothing waits to be sent', async () => {
    const client = createQueryClient()
    const send = vi.fn(async () => 'saved')
    reportNetworkFailure()
    onlineManager.setOnline(false)
    const observer = client.getMutationCache().build(client, { mutationFn: send })
    await expect(observer.execute(undefined)).rejects.toBeInstanceOf(OfflineError)
    expect(send).not.toHaveBeenCalled()
    expect(markNoticesSnapshot().map(noticeText)).toEqual([ACTION_NEEDS_CONNECTION])

    // The network comes back: nothing paused is sent on its own.
    resetConnectivity()
    onlineManager.setOnline(true)
    await client.resumePausedMutations()
    expect(send).not.toHaveBeenCalled()
  })

  it('runs a mutation with a connection as before', async () => {
    const client = createQueryClient()
    const send = vi.fn(async () => 'saved')
    const observer = client.getMutationCache().build(client, { mutationFn: send })
    await expect(observer.execute(undefined)).resolves.toBe('saved')
    expect(markNoticesSnapshot()).toEqual([])
  })

  it('keeps answers a day on the installed phone, the default elsewhere', () => {
    vi.spyOn(device, 'isInstalledPhone').mockReturnValue(true)
    expect(createQueryClient().getDefaultOptions().queries?.gcTime).toBe(24 * 60 * 60 * 1000)
    vi.spyOn(device, 'isInstalledPhone').mockReturnValue(false)
    expect(createQueryClient().getDefaultOptions().queries?.gcTime).toBeUndefined()
  })
})
