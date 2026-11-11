import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConfirmDialog } from './ConfirmDialog'

interface GuardOptions {
  /** Whether there is work a «yes» would lose, asked at the moment of the tap. */
  isDirty: () => boolean
  /** The question («¿Descartar la consulta?») and what is lost («Se perderá lo que capturaste.»): the words each form already had. */
  title: string
  body: string
  /** The button that goes ahead; «Descartar» unless the action is another («Actualizar»). */
  confirmLabel?: string
}

type Tap = { preventDefault: () => void; currentTarget?: EventTarget | null }

export interface ConfirmGuard {
  /** Runs `run` now, or after the person confirms when there is work to lose. */
  guardAction: (run: () => void, event?: Tap) => void
  /** True while the question is on the screen. */
  open: boolean
  /** The dialog to render (null while closed). */
  dialog: ReactNode
}

/**
 * The app's own question before losing what was typed (specs/066, US3), instead of the browser's `window.confirm`: the family's
 * `ConfirmDialog` — a sheet on the phone, centered on the web, focus on «Seguir editando» (the choice that keeps the work),
 * Escape and the backdrop cancel, Tab stays inside and the focus goes back to what was tapped. Never two at once.
 */
export function useConfirmGuard({ isDirty, title, body, confirmLabel = 'Descartar' }: GuardOptions): ConfirmGuard {
  const [pending, setPending] = useState<(() => void) | null>(null)
  const pendingRef = useRef<(() => void) | null>(null)
  const opener = useRef<HTMLElement | null>(null)

  const hold = (run: (() => void) | null) => {
    pendingRef.current = run
    setPending(() => run)
  }

  const guardAction = (run: () => void, event?: Tap) => {
    if (!isDirty()) {
      run()
      return
    }
    event?.preventDefault()
    // The question is already there: a second tap doesn't open another.
    if (pendingRef.current) return
    opener.current = (event?.currentTarget as HTMLElement | null | undefined) ?? (document.activeElement as HTMLElement | null)
    hold(run)
  }

  const cancel = useCallback(() => {
    pendingRef.current = null
    setPending(null)
  }, [])

  const confirm = () => {
    const run = pendingRef.current
    hold(null)
    run?.()
  }

  const dialog = pending ? (
    <ConfirmDialog
      title={title}
      body={body}
      confirmLabel={confirmLabel}
      cancelLabel="Seguir editando"
      busyLabel={confirmLabel}
      tone="ink"
      busy={false}
      error={null}
      onConfirm={confirm}
      onCancel={cancel}
      opener={opener}
    />
  ) : null

  return { guardAction, open: pending !== null, dialog }
}

export interface DiscardGuard extends ConfirmGuard {
  /**
   * For a link or a button that leaves to `to`: with nothing to lose it does nothing (the link goes on, the button's own
   * `navigate` runs); otherwise it cancels the tap, asks, and «Descartar» goes to `to`.
   */
  guardLink: (event: Tap, to: string) => void
}

/** The same guard for a form inside the router: leaving to another screen. */
export function useDiscardGuard(options: GuardOptions): DiscardGuard {
  const navigate = useNavigate()
  const guard = useConfirmGuard(options)
  const guardLink = (event: Tap, to: string) => {
    if (!options.isDirty()) return
    guard.guardAction(() => navigate(to), event)
  }
  return { ...guard, guardLink }
}
