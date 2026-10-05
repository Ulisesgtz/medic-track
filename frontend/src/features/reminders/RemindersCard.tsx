import { useCallback, useRef, useState } from 'react'
import type { Account } from '../home/types'
import { Notice } from '../../shared/ui/Notice'
import type { ReminderDetail } from './api'
import { ReminderDetailDialog } from './ReminderDetailDialog'
import { useReminders, type ReminderState } from './useReminders'

const outlineButton =
  'min-h-11 cursor-pointer self-start rounded-2xl border-2 border-action px-5 py-2.5 text-[15px] font-extrabold text-action transition-colors hover:bg-white disabled:cursor-wait disabled:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2'

const MESSAGES: Record<Exclude<ReminderState, 'on' | 'off' | 'loading'>, string> = {
  'ios-needs-install':
    'En iPhone y iPad los recordatorios llegan solo con la app instalada: toca Compartir, luego «Agregar a inicio», y ábrela desde ese ícono.',
  denied:
    'Bloqueaste las notificaciones de PediTrack en este navegador. Para recibir recordatorios, permítelas en la configuración del navegador (el candado junto a la dirección) y vuelve a esta página.',
  unsupported: 'Este navegador no puede recibir recordatorios.',
  unavailable: 'Los recordatorios no están disponibles por ahora.',
}

/**
 * The reminders option on the home (specs/011): turn them on or off on this device, what they show,
 * and — always — that they are a help, not a guaranteed alarm (FR-014). No mock exists for it; built
 * with the design tokens: hint surface and an outline button (the screen's solid one stays its own).
 */
export function RemindersCard({ account }: { account: Account | undefined }) {
  const { state, busy, error, activate, deactivate, changeDetail } = useReminders(account)
  const [dialog, setDialog] = useState<'activate' | 'change' | null>(null)
  const activateButton = useRef<HTMLButtonElement>(null)
  const changeButton = useRef<HTMLButtonElement>(null)
  // Stable: the dialog re-runs its focus setup when this changes identity.
  const closeDialog = useCallback(() => setDialog(null), [])

  if (!account) return null

  const detail = account.reminderDetail
  const childName = account.children[0]?.firstName ?? 'tu hijo'

  function onActivate() {
    // The first time for the account the tutor chooses what reminders show before anything else.
    if (detail === null) setDialog('activate')
    else void activate()
  }

  function onChoose(choice: ReminderDetail) {
    const mode = dialog
    setDialog(null)
    if (mode === 'activate') void activate(choice)
    else void changeDetail(choice)
  }

  return (
    <section
      aria-labelledby="reminders-title"
      className="flex flex-col gap-3 rounded-2xl border border-hint-border bg-hint p-5 text-sm leading-relaxed text-ink"
    >
      <h2 id="reminders-title" className="text-base font-extrabold tracking-tight">
        Recordatorios de tomas
      </h2>

      {state === 'off' && (
        <>
          <p>Te avisamos en este dispositivo a la hora de cada toma que registraste, aunque la app esté cerrada.</p>
          <button ref={activateButton} type="button" onClick={onActivate} disabled={busy} className={outlineButton}>
            {busy ? 'Activando…' : 'Activar recordatorios'}
          </button>
        </>
      )}

      {state === 'on' && (
        <>
          <p className="font-bold">Activos en este dispositivo.</p>
          <p>
            Los avisos muestran: <strong>{detail === 'detailed' ? 'el detalle de la toma' : 'un texto genérico'}</strong>.{' '}
            <button
              ref={changeButton}
              type="button"
              onClick={() => setDialog('change')}
              disabled={busy}
              className="-my-3 inline-flex min-h-11 cursor-pointer items-center font-extrabold text-action underline underline-offset-2"
            >
              Cambiar
            </button>
          </p>
          <button type="button" onClick={() => void deactivate()} disabled={busy} className={outlineButton}>
            {busy ? 'Desactivando…' : 'Desactivar recordatorios'}
          </button>
        </>
      )}

      {state !== 'on' && state !== 'off' && state !== 'loading' && <p>{MESSAGES[state]}</p>}

      {error && <Notice tone="error">{error}</Notice>}

      <p className="text-[13px] text-slate-600">
        Los recordatorios son una ayuda, no una alarma garantizada: pueden llegar tarde o no llegar si el dispositivo está
        apagado, sin conexión o con el navegador cerrado. Sigue siempre las indicaciones de tu médico.
      </p>

      {dialog && (
        <ReminderDetailDialog
          childName={childName}
          current={detail}
          onChoose={onChoose}
          onCancel={closeDialog}
          opener={dialog === 'activate' ? activateButton : changeButton}
        />
      )}
    </section>
  )
}
