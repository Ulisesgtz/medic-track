import { useState } from 'react'
import { formatDayMonth } from '../../shared/date'
import { invitationLink } from './api'
import { ROLE_LABEL } from './roles'
import type { CreatedInvitation } from './types'

/**
 * «Liga lista» (mock «Familia»): the link of an invitation just created or sent again — the only moment the server gives its
 * token (it keeps only a hash). It takes the place of the form until «Listo», so «Copiar liga» is the screen's one solid
 * button. Nothing is e-mailed: the tutor copies the link and sends it themself. The token lives in the `#` part of the link,
 * which a browser never sends to a server. After copying, the button says «Liga copiada ✓».
 */
export function InviteLink({ invitation, onDone, variant }: { invitation: CreatedInvitation; onDone: () => void; variant: 'phone' | 'desktop' }) {
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
    <section
      aria-label="Invitación creada"
      className={`flex flex-col gap-4 rounded-[22px] border-2 border-bright bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)] ${variant === 'desktop' ? 'p-6' : 'p-[22px]'}`}
    >
      <p className="text-xs font-extrabold tracking-[0.1em] text-action uppercase">Liga lista</p>
      <h2 className="-mt-2 text-xl font-black tracking-[-0.02em] text-ink">Envíale esta liga por mensaje</h2>
      <p className="text-[15px] leading-normal text-body [overflow-wrap:anywhere]">
        Para <strong className="text-ink">{invitation.email}</strong> · {ROLE_LABEL[invitation.role]} · vence el {formatDayMonth(invitation.expiresAt)}
      </p>
      <div className="flex flex-col gap-2">
        <label htmlFor="invitation-link" className="text-[13px] font-bold text-ink">
          Liga de invitación
        </label>
        <input
          id="invitation-link"
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="min-h-12 w-full min-w-0 rounded-[14px] border-[1.5px] border-hint-border bg-hint px-4 py-3 text-[15px] font-semibold text-ink focus:border-2 focus:border-ink focus:outline-none"
        />
      </div>
      <p className="text-sm leading-relaxed text-slate-600">Esta liga solo se muestra ahora. Si la pierdes, usa «Enviar de nuevo» para crear otra.</p>
      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() => void copy()}
          className={`min-h-12 flex-[1_1_150px] cursor-pointer rounded-2xl text-base font-extrabold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-confirmed focus-visible:ring-offset-2 ${
            copied === 'yes' ? 'bg-emerald-800' : 'bg-confirmed hover:bg-emerald-800'
          }`}
        >
          {copied === 'yes' ? 'Liga copiada ✓' : 'Copiar liga'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="min-h-12 flex-[1_1_110px] cursor-pointer rounded-2xl border-2 border-action text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
        >
          Listo
        </button>
      </div>
      <p role="status" aria-live="polite" className="-mt-1 text-sm font-bold text-confirmed">
        {copied === 'yes' ? 'Liga copiada. Pégala en tu chat.' : ''}
      </p>
      {copied === 'no' && (
        <p role="alert" className="-mt-1 text-sm font-semibold text-red-700">
          No pudimos copiarla: selecciónala y cópiala a mano.
        </p>
      )}
    </section>
  )
}
