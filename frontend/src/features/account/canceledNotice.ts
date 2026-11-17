import { useEffect, useState } from 'react'

// specs/070: «Listo, tu cuenta sigue igual.» once, right after canceling the deletion (the app reloads its data in between).
const CANCELED_KEY = 'eliminacion-cancelada'
const CANCELED_EVENT = 'peditrack:deletion-canceled'

/** Remembers, for this tab, that the deletion was just canceled. */
export function markCanceled(): void {
  try {
    sessionStorage.setItem(CANCELED_KEY, '1')
  } catch {
    // Without storage the notice is simply not shown.
  }
  // The gate that shows the notice stays mounted while the paused screen gives way to the app: tell it now.
  window.dispatchEvent(new Event(CANCELED_EVENT))
}

function forget(): void {
  try {
    sessionStorage.removeItem(CANCELED_KEY)
  } catch {
    // Nothing to forget without storage.
  }
}

/** How long the notice stays when the person does not close it. */
export const CANCELED_NOTICE_MS = 8000

/**
 * Whether the deletion was just canceled, and how to close the notice. It is read once (the key is forgotten as soon as it is
 * seen, so a reload does not bring it back), closes with the person's tap and goes away by itself after a few seconds.
 */
export function useCanceledNotice(): [boolean, () => void] {
  const [show, setShow] = useState(() => {
    try {
      return sessionStorage.getItem(CANCELED_KEY) === '1'
    } catch {
      return false
    } finally {
      forget()
    }
  })
  useEffect(() => {
    const onCanceled = () => {
      forget()
      setShow(true)
    }
    window.addEventListener(CANCELED_EVENT, onCanceled)
    return () => window.removeEventListener(CANCELED_EVENT, onCanceled)
  }, [])
  useEffect(() => {
    if (!show) return
    const timer = setTimeout(() => setShow(false), CANCELED_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [show])
  return [show, () => setShow(false)]
}
