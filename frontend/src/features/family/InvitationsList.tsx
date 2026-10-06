import { formatDayMonth } from '../../shared/date'
import { RoleChip } from './RoleChip'
import type { FamilyInvitation } from './types'

interface InvitationsListProps {
  invitations: FamilyInvitation[]
  variant: 'phone' | 'desktop'
  /** The invitation being resent or canceled right now (its buttons wait). */
  busyId: string | null
  onResend: (invitation: FamilyInvitation) => void
  onCancel: (invitation: FamilyInvitation) => void
}

const outline =
  'min-h-11 cursor-pointer rounded-2xl border-2 border-action px-[18px] text-[15px] font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70'
const textButton =
  'min-h-11 cursor-pointer rounded-2xl px-3.5 text-[15px] font-extrabold text-action underline transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70'

/**
 * «Invitaciones pendientes» with their state. «Pendiente» is not amber (amber only means «sin marcar»): a `hint` chip with a
 * dashed `action` outline, the same «place held» as the counter; «Vencida» is a quiet slate chip. «Cancelar» weighs less than
 * «Enviar de nuevo» (underlined text).
 */
export function InvitationsList({ invitations, variant, busyId, onResend, onCancel }: InvitationsListProps) {
  if (invitations.length === 0) return null
  const desktop = variant === 'desktop'
  return (
    <section aria-labelledby="family-invitations-title" className="flex flex-col gap-3.5">
      <h2 id="family-invitations-title" className="text-xl font-black tracking-[-0.02em] text-ink">
        Invitaciones pendientes
      </h2>
      <ul className="flex flex-col gap-3.5">
        {invitations.map((inv) => {
          const expired = inv.status === 'expired'
          const date = `${expired ? 'Venció' : 'Vence'} el ${formatDayMonth(inv.expiresAt)}`
          return (
            <li
              key={inv.id}
              className={`rounded-[22px] bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)] ${
                desktop ? 'flex flex-wrap items-center justify-between gap-4 p-[22px]' : 'flex flex-col gap-2.5 p-5'
              }`}
            >
              <div className={`flex min-w-0 flex-col ${desktop ? 'flex-[1_1_260px] gap-2' : 'gap-2.5'}`}>
                <p className="text-base font-extrabold text-ink [overflow-wrap:anywhere]">{inv.email}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <RoleChip role={inv.role} />
                  {expired ? (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[13px] font-extrabold text-slate-600">Vencida</span>
                  ) : (
                    <span className="rounded-full border-[1.5px] border-dashed border-action bg-hint px-2.5 py-[3px] text-[13px] font-extrabold text-action">
                      Pendiente
                    </span>
                  )}
                  <span className="text-[13px] font-semibold text-slate-600">{date}</span>
                </div>
              </div>
              <div className={`flex flex-wrap ${desktop ? 'shrink-0 gap-2' : 'mt-1 gap-2.5'}`}>
                <button type="button" aria-label={`Enviar de nuevo a ${inv.email}`} disabled={busyId === inv.id} onClick={() => onResend(inv)} className={outline}>
                  Enviar de nuevo
                </button>
                <button type="button" aria-label={`Cancelar la invitación de ${inv.email}`} disabled={busyId === inv.id} onClick={() => onCancel(inv)} className={textButton}>
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
