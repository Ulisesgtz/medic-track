import { formatDayMonth } from '../../shared/date'
import { ROLE_LABEL } from './roles'
import type { FamilyInvitation } from './types'

interface InvitationsListProps {
  invitations: FamilyInvitation[]
  /** The invitation being resent or canceled right now (its buttons wait). */
  busyId: string | null
  onResend: (invitation: FamilyInvitation) => void
  onCancel: (invitation: FamilyInvitation) => void
}

const button =
  'min-h-11 cursor-pointer rounded-2xl border-2 border-action px-4 py-2 text-sm font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70'

/** The invitations still waiting, with their state: «Pendiente» until they expire, then «Vencida» (they can be sent again). */
export function InvitationsList({ invitations, busyId, onResend, onCancel }: InvitationsListProps) {
  if (invitations.length === 0) return null
  return (
    <section aria-labelledby="family-invitations-title" className="flex flex-col gap-3">
      <h2 id="family-invitations-title" className="text-xl font-black tracking-tight text-ink">
        Invitaciones
      </h2>
      <ul className="flex flex-col gap-3">
        {invitations.map((inv) => {
          const expired = inv.status === 'expired'
          return (
            <li key={inv.id} className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
              <div className="min-w-0">
                <p className="break-words text-base font-extrabold text-ink">{inv.email}</p>
                <p className="text-sm font-semibold text-ink-soft">
                  {ROLE_LABEL[inv.role]} ·{' '}
                  <span className={expired ? 'text-ink-soft' : 'text-pending-strong'}>{expired ? 'Vencida' : 'Pendiente'}</span> ·{' '}
                  {expired ? 'venció' : 'vence'} el {formatDayMonth(inv.expiresAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  aria-label={`Enviar de nuevo a ${inv.email}`}
                  disabled={busyId === inv.id}
                  onClick={() => onResend(inv)}
                  className={button}
                >
                  Enviar de nuevo
                </button>
                <button
                  type="button"
                  aria-label={`Cancelar la invitación de ${inv.email}`}
                  disabled={busyId === inv.id}
                  onClick={() => onCancel(inv)}
                  className={button}
                >
                  Cancelar
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
