import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '../family/ConfirmDialog'
import { bigDateText, countdown, shortDayText, timeText, whenText } from './appointmentText'
import { useMyAppointmentReminders, useSetAppointmentStatus } from './hooks'
import type { Appointment } from './types'

const outline =
  'inline-flex min-h-12 flex-[1_1_110px] cursor-pointer items-center justify-center rounded-2xl border-2 border-action px-[18px] text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60'

interface AppointmentCardProps {
  appointment: Appointment
  /** The device's clock (injected by tests). */
  now?: Date
  /** «De la consulta del 28 sep →»: on the child's detail, where the card says which consultation it comes from. */
  consultationLink?: boolean
  /** «Historial de citas →»: on the child's detail. */
  historyLink?: string
  /** Tells the page the appointment was marked done, so it can say so (and offer to undo) once the card is gone. */
  onDone?: (appointment: Appointment) => void
  access: { canEdit: boolean; canMark: boolean }
}

/**
 * The «Próxima cita» card (mock CitaTarjeta): the date and time big, a neutral count-down, who with and from which
 * consultation, the note, the notices that are scheduled and — for each person — whether they get them. Editing is outline,
 * «Marcar realizada» is outline and needs no confirmation (it can be undone), «Cancelar cita» is text and asks first, in neutral
 * words. Never amber and never red, however near it is (Principio I).
 */
export function AppointmentCard({ appointment, now = new Date(), consultationLink, historyLink, onDone, access }: AppointmentCardProps) {
  const status = useSetAppointmentStatus(appointment.id)
  const reminders = useMyAppointmentReminders(appointment.id)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const start = new Date(appointment.startsAt)
  const unmarked = appointment.status === 'unmarked'
  const consultDay = new Date(`${appointment.consultDate}T00:00:00`)

  const mark = () => {
    setFailed(null)
    status.mutate('done', { onSuccess: (a) => onDone?.(a), onError: () => setFailed('No se pudo marcar la cita. Inténtalo de nuevo.') })
  }
  const cancel = () => {
    setFailed(null)
    status.mutate('canceled', { onSuccess: () => setCancelOpen(false), onError: () => setFailed('No se pudo cancelar la cita. Inténtalo de nuevo.') })
  }

  return (
    <article className="flex flex-col gap-4 rounded-[22px] bg-surface p-[22px] shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="text-xs font-extrabold tracking-[0.1em] text-action uppercase">Próxima cita</p>
        {unmarked ? (
          <span className="rounded-full border-[1.5px] border-dashed border-slate-500 bg-surface px-2.5 py-[3px] text-[13px] font-extrabold text-slate-600">
            Pasó sin marcar
          </span>
        ) : (
          <span className="rounded-full border-[1.5px] border-hint-border bg-hint px-2.5 py-[3px] text-[13px] font-extrabold text-action">
            {countdown(start, now)}
          </span>
        )}
      </div>
      <div className="-mt-1.5 flex flex-wrap items-baseline gap-x-3.5">
        <span className="text-[32px] leading-[1.1] font-black tracking-[-0.03em] text-ink">{bigDateText(start)}</span>
        <span className="text-[32px] leading-[1.1] font-black tracking-[-0.03em] text-action">{timeText(start)}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="text-[17px] font-extrabold text-ink [overflow-wrap:anywhere]">{appointment.doctorName}</p>
        {consultationLink && (
          <Link
            to={`/consultations/${appointment.consultationId}`}
            className="inline-flex min-h-11 items-center self-start text-sm font-bold text-action hover:underline"
          >
            De la consulta del {shortDayText(consultDay)} →
          </Link>
        )}
      </div>
      {appointment.note && (
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-bold text-ink">Nota</span>
          <span className="text-[15px] leading-normal text-body [overflow-wrap:anywhere]">{appointment.note}</span>
        </div>
      )}
      <div className="flex flex-col gap-2 border-t border-hint-edge pt-3">
        <span className="text-[13px] font-bold text-ink">Avisos programados</span>
        {appointment.notices.length === 0 && <span className="text-sm text-slate-600">Sin avisos.</span>}
        {appointment.notices.map((n) => (
          <div key={n.id} className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
            <span className="text-[15px] font-extrabold text-ink">{n.label}</span>
            <span className="text-sm font-semibold text-slate-600">{whenText(new Date(n.fireAt))}</span>
          </div>
        ))}
        {!unmarked && (
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="text-sm leading-snug text-body">Tus avisos de esta cita</span>
            <button
              type="button"
              role="switch"
              aria-checked={appointment.myReminders}
              aria-label="Tus avisos de esta cita"
              disabled={reminders.isPending}
              onClick={() => reminders.mutate(!appointment.myReminders)}
              className="flex min-h-11 w-[60px] shrink-0 cursor-pointer items-center justify-center focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 [&:focus-visible>span]:ring-2 [&:focus-visible>span]:ring-action [&:focus-visible>span]:ring-offset-2"
            >
              <span aria-hidden="true" className={`relative h-8 w-[52px] rounded-full transition-colors duration-200 ${appointment.myReminders ? 'bg-action' : 'bg-slate-300'}`}>
                <span className={`absolute top-1 h-6 w-6 rounded-full bg-surface transition-all duration-200 ${appointment.myReminders ? 'right-1' : 'left-1'}`} />
              </span>
            </button>
          </div>
        )}
      </div>

      {access.canMark ? (
        <div className="flex flex-wrap gap-2.5">
          {access.canEdit && (
            <Link to={`/citas/${appointment.id}/editar`} className={outline}>
              Editar
            </Link>
          )}
          <button type="button" disabled={status.isPending} onClick={mark} className={`${outline} flex-[1_1_160px]`}>
            Marcar realizada
          </button>
          <button
            ref={cancelRef}
            type="button"
            onClick={() => setCancelOpen(true)}
            className="min-h-11 flex-[1_1_100%] cursor-pointer rounded-2xl px-3.5 text-[15px] font-extrabold text-action underline hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
          >
            Cancelar cita
          </button>
        </div>
      ) : (
        <p className="text-sm leading-normal text-slate-600">Un Tutor puede editar, marcar o cancelar esta cita.</p>
      )}
      {failed && (
        <p role="alert" className="text-[13px] font-semibold text-red-700">
          {failed}
        </p>
      )}
      {historyLink && (
        <Link to={historyLink} className="inline-flex min-h-11 items-center self-start text-[15px] font-extrabold text-action hover:underline">
          Historial de citas →
        </Link>
      )}

      {cancelOpen && (
        <ConfirmDialog
          title={`¿Cancelar la cita del ${shortDayText(start)}?`}
          rows={[
            { k: 'Deja de pasar', v: 'Los avisos de esta cita ya no llegan a nadie de la familia.' },
            { k: 'Se conserva', v: 'La cita queda en el historial como «Cancelada», con la fecha y quién la canceló.' },
            { k: 'Después', v: 'Para otra fecha se puede anotar una cita nueva desde la consulta.' },
          ]}
          confirmLabel="Cancelar cita"
          cancelLabel="Volver"
          busyLabel="Cancelando…"
          tone="ink"
          busy={status.isPending}
          error={status.isError ? failed : null}
          onConfirm={cancel}
          onCancel={() => setCancelOpen(false)}
          opener={cancelRef}
        />
      )}
    </article>
  )
}
