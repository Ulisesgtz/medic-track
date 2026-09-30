import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/** Finger travel (px) at which letting go refreshes. */
export const PULL_THRESHOLD = 140
/** The indicator follows the finger at half speed, up to this many px. */
export const PULL_MAX_DISTANCE = 72
export const PULL_FAILED_MS = 4000

export type PullPhase = 'idle' | 'pulling' | 'refreshing' | 'failed'

export interface PullState {
  phase: PullPhase
  /** How far the indicator is pulled down, in px. */
  distance: number
  /** True once letting go would refresh. */
  ready: boolean
}

const IDLE: PullState = { phase: 'idle', distance: 0, ready: false }

/** A scrolled box under the finger (the prescription viewer, a long dialog) owns the gesture. */
function hasScrolledAncestor(target: EventTarget | null) {
  let node = target instanceof Element ? target : null
  while (node && node !== document.body && node !== document.documentElement) {
    if (node.scrollTop > 0) return true
    node = node.parentElement
  }
  return false
}

const atTop = () => (document.scrollingElement?.scrollTop ?? 0) <= 0

/**
 * Pull down from the top to fetch the data again (specs/017). It only refetches what is on screen — the page is never
 * reloaded, so a form keeps what was typed. Own touch events, no library: the installed PWA has no browser bar and
 * loses the native gesture. Call it with `enabled` false on the web design.
 */
export function usePullToRefresh(enabled: boolean): PullState {
  const queryClient = useQueryClient()
  const [state, setState] = useState<PullState>(IDLE)
  const busy = useRef(false)
  const failedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Its own effect: turning the gesture off (the window crosses 900px) must not leave the notice's timer running.
  useEffect(() => () => clearTimeout(failedTimer.current), [])

  useEffect(() => {
    if (!enabled) return
    let startY: number | null = null

    const reset = () => {
      startY = null
      setState((current) => (current.phase === 'pulling' ? IDLE : current))
    }

    const refresh = async () => {
      busy.current = true
      // An earlier failure notice must not hide this refresh's indicator when its timer fires.
      clearTimeout(failedTimer.current)
      setState({ phase: 'refreshing', distance: PULL_MAX_DISTANCE, ready: true })
      try {
        await queryClient.refetchQueries({ type: 'active' }, { throwOnError: true })
        setState(IDLE)
      } catch {
        setState({ phase: 'failed', distance: 0, ready: false })
        failedTimer.current = setTimeout(() => setState(IDLE), PULL_FAILED_MS)
      } finally {
        busy.current = false
      }
    }

    const onStart = (event: TouchEvent) => {
      const blocked =
        busy.current ||
        event.touches.length !== 1 ||
        !atTop() ||
        document.querySelector('[aria-modal="true"]') !== null ||
        hasScrolledAncestor(event.target)
      startY = blocked ? null : event.touches[0].clientY
    }

    const onMove = (event: TouchEvent) => {
      if (startY === null) return
      const dy = event.touches[0].clientY - startY
      if (dy <= 0 || !atTop()) return reset()
      // iOS would bounce the page at the same time; the gesture is ours from here.
      if (event.cancelable) event.preventDefault()
      setState({ phase: 'pulling', distance: Math.min(dy * 0.5, PULL_MAX_DISTANCE), ready: dy >= PULL_THRESHOLD })
    }

    const onEnd = (event: TouchEvent) => {
      if (startY === null) return
      const dy = (event.changedTouches[0]?.clientY ?? startY) - startY
      startY = null
      if (event.type === 'touchend' && dy >= PULL_THRESHOLD) void refresh()
      else reset()
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('touchcancel', onEnd)
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [enabled, queryClient])

  return enabled ? state : IDLE
}
