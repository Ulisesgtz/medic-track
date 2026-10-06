import { useState } from 'react'
import { formatDayMonth } from '../../shared/date'
import { invitationLink } from './api'
import type { CreatedInvitation } from './types'

/**
 * The link of an invitation that was just created or sent again — the only moment the server gives its token (it keeps
 * only a hash). Nothing is e-mailed in this delivery: the tutor copies the link and sends it themself. The token lives in
 * the `#` part of the link, which a browser never sends to a server.
 */
export function InviteLink({ invitation, onDone }: { invitation: CreatedInvitation; onDone: () => void }) {
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null)
  const link = invitationLink(window.location.origin, invitation.token)

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied('yes')
    } catch {
      setCopied('no')
    }
  }

  return (
    <section aria-label="Invitación creada" className="flex flex-col gap-3 rounded-3xl border border-hint-border bg-hint p-5">
      <h3 className="text-base font-extrabold tracking-tight break-words text-ink">Liga lista para {invitation.email}</h3>
      <p className="text-sm leading-relaxed text-body">
        Envíasela tú (por mensaje, por ejemplo). Solo sirve para esa persona, entrando con ese correo, y vence el{' '}
        {formatDayMonth(invitation.expiresAt)}. Esta liga solo se muestra ahora: si la pierdes, vuelve a enviarla.
      </p>
      <label htmlFor="invitation-link" className="sr-only">
        Liga de la invitación
      </label>
      <input
        id="invitation-link"
        readOnly
        value={link}
        onFocus={(e) => e.currentTarget.select()}
        className="min-h-11 w-full min-w-0 rounded-xl border-[1.5px] border-hint-edge bg-surface px-4 py-3 text-sm font-medium text-ink focus:border-2 focus:border-ink focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void copy()}
          className="min-h-11 cursor-pointer rounded-2xl bg-ink px-5 py-2.5 text-[15px] font-extrabold text-white transition-opacity duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
        >
          Copiar liga
        </button>
        <button
          type="button"
          onClick={onDone}
          className="min-h-11 cursor-pointer rounded-2xl border-2 border-action px-5 py-2.5 text-[15px] font-extrabold text-action transition-colors duration-200 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
        >
          Listo
        </button>
        <span role="status" aria-live="polite" className="text-sm font-bold text-confirmed-strong">
          {copied === 'yes' ? 'Liga copiada' : ''}
        </span>
        {copied === 'no' && (
          <span role="alert" className="text-sm font-semibold text-red-700">
            No pudimos copiarla: selecciónala y cópiala a mano.
          </span>
        )}
      </div>
    </section>
  )
}
