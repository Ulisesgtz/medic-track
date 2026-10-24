import { useEffect, useState } from 'react'
import { base64UrlToUint8Array, detectDeviceSupport, type DeviceSupport } from '../../reminders/deviceSupport'
import { deviceRequest } from './api'

// The reminders of the child's own phone (specs/047): the same browser pieces a parent's device uses (permission, service worker, push
// subscription) but registered with the phone's credential at /child-device/reminder-devices. The permission is only asked when the
// child taps «Activar avisos» — never on load.

export type ChildReminderState = 'loading' | DeviceSupport | 'unavailable' | 'off' | 'on'

interface Config {
  available: boolean
  vapidPublicKey: string | null
}

async function readySubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration()
  return (await registration?.pushManager.getSubscription()) ?? null
}

export function useChildReminders(credential: string) {
  const [support, setSupport] = useState<DeviceSupport>(() => detectDeviceSupport())
  const [config, setConfig] = useState<Config | 'error' | null>(null)
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (support !== 'ready') return
    let cancelled = false
    deviceRequest<Config>(credential, '/child-device/reminders/config')
      .then((c) => !cancelled && setConfig(c))
      .catch(() => !cancelled && setConfig('error'))
    // A subscription already in this browser is registered again for this phone (the server moves it if it was another's).
    readySubscription()
      .then(async (subscription) => {
        if (!subscription || Notification.permission !== 'granted') return false
        await deviceRequest<unknown>(credential, '/child-device/reminder-devices', 'POST', { endpoint: subscription.endpoint, keys: subscription.toJSON().keys })
        return true
      })
      .then((on) => !cancelled && setSubscribed(on))
      .catch(() => !cancelled && setSubscribed(false))
    return () => {
      cancelled = true
    }
  }, [support, credential])

  let state: ChildReminderState
  if (support !== 'ready') state = support
  else if (config === 'error' || (config && !config.available)) state = 'unavailable'
  else if (!config || subscribed === null) state = 'loading'
  else state = subscribed ? 'on' : 'off'

  async function activate() {
    if (!config || config === 'error' || !config.vapidPublicKey) return
    setBusy(true)
    setError(null)
    let subscription: PushSubscription | null = null
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        if (permission === 'denied') setSupport('denied')
        return
      }
      const registration = await navigator.serviceWorker.ready
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(config.vapidPublicKey) })
      await deviceRequest<unknown>(credential, '/child-device/reminder-devices', 'POST', { endpoint: subscription.endpoint, keys: subscription.toJSON().keys })
      setSubscribed(true)
    } catch {
      // Never leave a subscription the server doesn't have.
      await subscription?.unsubscribe().catch(() => false)
      setError('activate')
    } finally {
      setBusy(false)
    }
  }

  async function deactivate() {
    setBusy(true)
    setError(null)
    try {
      const subscription = await readySubscription()
      if (subscription) {
        const { endpoint } = subscription
        await subscription.unsubscribe()
        await deviceRequest<unknown>(credential, '/child-device/reminder-devices/remove', 'POST', { endpoint })
      }
      setSubscribed(false)
    } catch {
      setError('deactivate')
    } finally {
      setBusy(false)
    }
  }

  return { state, busy, error, activate, deactivate }
}
