import { isIOS, isRunningInstalled } from '../../shared/install/platform'

/**
 * Whether this browser can receive reminders, before showing any button (specs/011, FR-015):
 * - `unsupported`: no service worker, push or notifications at all;
 * - `ios-needs-install`: an iPhone/iPad outside the installed app — iOS only delivers web push to
 *   a PWA added to the home screen;
 * - `denied`: the tutor blocked notifications for this site (the app can't ask again);
 * - `ready`: it can be turned on.
 */
export type DeviceSupport = 'unsupported' | 'ios-needs-install' | 'denied' | 'ready'

export function detectDeviceSupport(): DeviceSupport {
  if (isIOS() && !isRunningInstalled()) return 'ios-needs-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return 'ready'
}

/** The VAPID public key (base64url) as the bytes `pushManager.subscribe` takes. */
export function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
