import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Account } from '../home/types'
import { fetchReminderConfig, registerDevice, updateReminderDetail, type ReminderDetail } from './api'
import { detectDeviceSupport } from './deviceSupport'
import { currentSubscription, subscribe, unsubscribeThisDevice } from './pushDevice'

export type ReminderState = 'loading' | 'unsupported' | 'ios-needs-install' | 'denied' | 'unavailable' | 'off' | 'on'

/**
 * Reminders on this device (specs/011): what the card shows and the two actions. `activate` asks
 * for the notification permission — only here, when the tutor taps the button (FR-002) — then
 * subscribes the browser and registers it; the first time for the account it also saves what the
 * reminders show (FR-008).
 */
export function useReminders(account: Account | undefined) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const [support, setSupport] = useState(detectDeviceSupport)
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const config = useQuery({
    queryKey: ['reminders', 'config'],
    queryFn: async () => fetchReminderConfig(await getToken()),
    enabled: support === 'ready',
    staleTime: Infinity,
  })

  const accountId = account?.id
  useEffect(() => {
    if (support !== 'ready' || !accountId) return
    let cancelled = false
    async function sync() {
      const subscription = await currentSubscription()
      if (!subscription || Notification.permission !== 'granted') return false
      // A subscription already in this browser may have been registered by another tutor (whose session
      // ended without our logout). Registering it again moves it to this account (the backend's upsert),
      // so this browser never shows "on" while delivering someone else's reminders.
      await registerDevice(accountId as string, subscription.toJSON(), await getToken())
      return true
    }
    sync()
      .then((on) => !cancelled && setSubscribed(on))
      .catch(() => !cancelled && setSubscribed(false))
    return () => {
      cancelled = true
    }
    // getToken is left out on purpose: its identity isn't stable, and this must run once per account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [support, accountId])

  let state: ReminderState
  if (support !== 'ready') state = support
  else if (config.isError || (config.data && !config.data.available)) state = 'unavailable'
  else if (!config.data || subscribed === null) state = 'loading'
  else state = subscribed ? 'on' : 'off'

  async function saveDetail(detail: ReminderDetail) {
    if (!account) return
    const updated = await updateReminderDetail(account.id, detail, await getToken())
    queryClient.setQueryData(['accounts', 'me'], updated)
  }

  /** Turns reminders on here; `detail` is required the first time for the account. */
  async function activate(detail?: ReminderDetail) {
    if (!account || !config.data?.vapidPublicKey) return
    setBusy(true)
    setError(null)
    let subscription: PushSubscription | null = null
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        if (permission === 'denied') setSupport('denied')
        return
      }
      subscription = await subscribe(config.data.vapidPublicKey)
      // The choice first: once the device is registered, its reminders say what the tutor chose.
      if (detail && detail !== account.reminderDetail) await saveDetail(detail)
      await registerDevice(account.id, subscription.toJSON(), await getToken())
      setSubscribed(true)
    } catch {
      // Never leave a subscription the backend doesn't have: the next visit would register it silently.
      await subscription?.unsubscribe().catch(() => false)
      setError('No pudimos activar los recordatorios. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  async function deactivate() {
    if (!account) return
    setBusy(true)
    setError(null)
    try {
      await unsubscribeThisDevice(account.id, await getToken())
      setSubscribed(false)
    } catch {
      setError('No pudimos desactivar los recordatorios. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  async function changeDetail(detail: ReminderDetail) {
    setBusy(true)
    setError(null)
    try {
      await saveDetail(detail)
    } catch {
      setError('No pudimos guardar el cambio. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  return { state, busy, error, activate, deactivate, changeDetail }
}
