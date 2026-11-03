import { useState } from 'react'
import type { SubjectRef } from '../../shared/subject'
import { Link } from 'react-router-dom'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { shortDayText } from './appointmentText'
import { AppointmentCard } from './AppointmentCard'
import { useAppointmentAccess, useConsultationAppointment, useSetAppointmentStatus } from './hooks'
import type { Appointment } from './types'

/** «La cita del vie 9 oct quedó como realizada.» with a way back: marking needs no confirmation because it can be undone. */
function DoneBanner({ appointment, onUndone }: { appointment: Appointment; onUndone: () => void }) {
  const undo = useSetAppointmentStatus(appointment.id)
  return (
    <p role="status" className="flex flex-wrap items-center justify-between gap-x-3 rounded-[14px] border-[1.5px] border-hint-border bg-hint px-4 py-3 text-[15px] leading-normal text-body">
      <span>La cita del {shortDayText(new Date(appointment.startsAt))} quedó como realizada.</span>
      <button
        type="button"
        disabled={undo.isPending}
        onClick={() => undo.mutate('scheduled', { onSuccess: onUndone })}
        className="inline-flex min-h-11 cursor-pointer items-center text-[15px] font-extrabold text-action underline focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
      >
        Deshacer
      </button>
    </p>
  )
}

/**
 * The appointment of one consultation's detail: its card, or — if it has none — the invitation to add it without changing
 * anything else of the consultation (the paid plan's; a Caregiver sees nothing to add).
 */
export function ConsultationAppointmentSection({ consultationId, subject }: { consultationId: string; subject: SubjectRef | undefined }) {
  const query = useConsultationAppointment(consultationId)
  const account = useCurrentAccount()
  const data = query.data
  const access = useAppointmentAccess(account.data, subject, data?.paidPlan)
  const [done, setDone] = useState<Appointment | null>(null)

  if (!data) return null
  if (!data.appointment && !done && !access.canEdit && !access.showPlan) return null

  return (
    <section aria-label="Próxima cita" className="flex flex-col gap-4">
      {done && <DoneBanner appointment={done} onUndone={() => setDone(null)} />}
      {data.appointment ? (
        <AppointmentCard key={data.appointment.id} appointment={data.appointment} onDone={setDone} access={access} />
      ) : (
        <div className="flex flex-col items-start gap-2.5 rounded-[22px] border-2 border-dashed border-hint-border px-[22px] py-5">
          <h3 className="text-lg font-black tracking-[-0.02em] text-ink">Próxima cita</h3>
          <p className="text-[15px] leading-relaxed text-body">
            Si el pediatra dio una fecha para volver, se puede anotar sin cambiar nada más de la consulta.
          </p>
          {access.canEdit ? (
            <Link
              to={`/consultations/${consultationId}/cita/nueva`}
              className="inline-flex min-h-12 items-center rounded-2xl border-2 border-action px-5 text-base font-extrabold text-action hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
            >
              Agregar próxima cita
            </Link>
          ) : (
            <Link to="/planes" className="inline-flex min-h-11 items-center text-[15px] font-extrabold text-action hover:underline">
              Disponible en el plan completo · Ver el plan completo →
            </Link>
          )}
        </div>
      )}
    </section>
  )
}
