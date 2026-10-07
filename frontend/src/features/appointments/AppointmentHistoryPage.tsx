import type { ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { useSidebarSession } from '../home/useSidebarSession'
import { RoutinePageFrame } from '../supplements/RoutineFormPage'
import { shortDayText, timeText } from './appointmentText'
import { AppointmentCard } from './AppointmentCard'
import { useAppointmentAccess, useChildAppointments, useSetAppointmentStatus } from './hooks'
import type { Appointment } from './types'

const chip = {
  done: 'rounded-full border-[1.5px] border-hint-border bg-hint px-2.5 py-[3px] text-[13px] font-extrabold text-action',
  canceled: 'rounded-full bg-slate-100 px-2.5 py-1 text-[13px] font-extrabold text-slate-600',
  unmarked: 'rounded-full border-[1.5px] border-dashed border-slate-500 bg-surface px-2.5 py-[3px] text-[13px] font-extrabold text-slate-600',
}

/** «De la consulta del 1 sep · marcada por Ana», «· cancelada el 1 ago por Luis», «· nadie la marcó»: only a record. */
function metaOf(a: Appointment): string {
  const from = `De la consulta del ${shortDayText(new Date(`${a.consultDate}T00:00:00`))}`
  const at = a.statusAt ? shortDayText(new Date(a.statusAt)) : ''
  if (a.status === 'done') return `${from} · marcada por ${a.statusBy ?? 'alguien'}`
  if (a.status === 'canceled') return `${from} · cancelada el ${at} por ${a.statusBy ?? 'alguien'}`
  return `${from} · nadie la marcó`
}

function HistoryRow({ appointment, canMark }: { appointment: Appointment; canMark: boolean }) {
  const mark = useSetAppointmentStatus(appointment.id)
  const start = new Date(appointment.startsAt)
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5 border-t border-hint-edge py-4 first:border-t-0">
      <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-[3px]">
        <span className="text-base font-extrabold text-ink">
          {shortDayText(start)} {start.getFullYear()} · {timeText(start)}
        </span>
        <span className="text-[15px] text-body [overflow-wrap:anywhere]">{appointment.doctorName}</span>
        <span className="text-[13px] font-semibold text-slate-600">{metaOf(appointment)}</span>
      </div>
      <div className="flex shrink-0 flex-col items-start gap-2">
        {appointment.status === 'done' && <span className={chip.done}>Realizada</span>}
        {appointment.status === 'canceled' && <span className={chip.canceled}>Cancelada</span>}
        {appointment.status === 'unmarked' && <span className={chip.unmarked}>Pasó sin marcar</span>}
        {appointment.status === 'unmarked' && canMark && (
          <button
            type="button"
            disabled={mark.isPending}
            onClick={() => mark.mutate('done')}
            className="min-h-11 cursor-pointer rounded-2xl border-2 border-action px-3.5 text-sm font-extrabold text-action hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:opacity-60"
          >
            Marcar realizada
          </button>
        )}
        {appointment.status === 'done' && canMark && (
          <button
            type="button"
            disabled={mark.isPending}
            onClick={() => mark.mutate('scheduled')}
            className="min-h-11 cursor-pointer text-sm font-extrabold text-action underline hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
          >
            Deshacer
          </button>
        )}
      </div>
    </li>
  )
}

/**
 * `/children/:childId/citas` — «Historial de citas» (mock CitasHistorial): the next one on top, and below the ones that are
 * done, canceled or passed without being marked, with neutral chips (cyan, grey, dashed — never amber or red). A Tutor can mark
 * a passed one as done, or take a «done» back.
 */
export function AppointmentHistoryPage() {
  const { childId } = useParams<{ childId: string }>()
  const { isDesktop } = useSidebarSession()
  const accountQuery = useCurrentAccount()
  const query = useChildAppointments(childId)
  const child = accountQuery.data?.children.find((c) => c.id === childId)
  const data = query.data
  const access = useAppointmentAccess(accountQuery.data, childId, data?.paidPlan)
  const name = child?.firstName ?? 'tu hijo'

  const frame = (content: ReactNode) => (
    <RoutinePageFrame
      isDesktop={isDesktop}
      childId={childId}
      backLabel={`← ${child?.firstName ?? 'Volver'}`}
      backTo={`/children/${childId}`}
      eyebrow={child ? `${child.firstName} ${child.lastName}` : 'Citas'}
      title="Historial de citas"
    >
      {content}
    </RoutinePageFrame>
  )

  if (query.isPending) return frame(<p className="text-base font-semibold text-action">Cargando…</p>)
  if (query.isError || !data) return frame(<p className="text-base text-body">No se pudo cargar el historial de citas.</p>)

  return frame(
    <div className="flex flex-col gap-4">
      {data.next && <AppointmentCard key={data.next.id} appointment={data.next} access={access} consultationLink />}
      {data.history.length === 0 ? (
        <div className="flex flex-col gap-2 rounded-[22px] border-2 border-dashed border-hint-border px-[22px] py-6">
          <h2 className="text-lg font-black tracking-[-0.02em] text-ink">Aún no hay citas anotadas</h2>
          <p className="text-[15px] leading-relaxed text-body">
            Aquí quedan las citas que se anoten en las consultas de {name}: las realizadas, las canceladas y las que pasaron sin marcar.
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs font-extrabold tracking-[0.1em] text-action uppercase">Anteriores</p>
          <ul className="rounded-[22px] bg-surface px-5 py-1 shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
            {data.history.map((a) => (
              <HistoryRow key={a.id} appointment={a} canMark={access.canMark} />
            ))}
          </ul>
        </>
      )}
    </div>,
  )
}
