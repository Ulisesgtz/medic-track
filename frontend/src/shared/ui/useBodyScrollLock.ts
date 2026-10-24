import { useEffect } from 'react'

// While an overlay (a modal or a sheet) is open the page behind it must not scroll: on a phone, dragging inside the sheet used to move the
// page underneath instead (scroll chaining), and the sheet could not be reached. Several overlays can be open at once, so the lock is
// counted and the page is released only when the last one closes.

let locks = 0
let previous: { html: string; body: string } | null = null

/** Keeps the page behind from scrolling for as long as the component that calls it is mounted. */
export function useBodyScrollLock() {
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    if (locks === 0) {
      previous = { html: html.style.overflow, body: body.style.overflow }
      html.style.overflow = 'hidden'
      body.style.overflow = 'hidden'
    }
    locks += 1
    return () => {
      locks -= 1
      if (locks === 0 && previous) {
        html.style.overflow = previous.html
        body.style.overflow = previous.body
        previous = null
      }
    }
  }, [])
}
