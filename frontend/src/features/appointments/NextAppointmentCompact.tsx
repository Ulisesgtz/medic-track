import { useCallback, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatTime, formatWeekdayLong } from '../../shared/date'
import { FreemiumLimitModal } from '../account-signup/FreemiumLimitModal'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { placeLink } from './appointmentText'
import { useAppointmentAccess, useChildAppointments } from './hooks'

type Variant = 'phone' | 'desktop'

const card = 'rounded-[22px] bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)]'
const outline =
  'inline-flex min-h-11 items-center self-start rounded-[14px] border-2 border-action px-4 text-[15px] font-extrabold text-action hover:bg-hint'

/** A calendar page: the design's icon tile. */
function CalendarIcon() {
  return (
    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-hint">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="stroke-action" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" />
        <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
      </svg>
    </span>
  )
}

/**
 * The next appointment of a child's detail since specs/056 (design A, deviation 4 closed): a compact card — when, the doctor and the
 * place, «Abrir en Maps» — whose text opens the child's appointments (`/children/:id/citas`), where it is edited, marked done or
 * canceled and its reminders chosen. Without one, «+ Agregar cita» for who may add it, or on the free plan the row with the «Plan
 * completo» mark that opens the plan notice. A Caregiver with none sees nothing.
 */
export function NextAppointmentCompact({ childId, variant }: { childId: string; variant: Variant }) {
  const query = useChildAppointments(childId)
  const account = useCurrentAccount()
  const data = query.data
  const access = useAppointmentAccess(account.data, childId, data?.paidPlan)
  const navigate = useNavigate()
  const [planOpen, setPlanOpen] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  const closePlan = useCallback(() => setPlanOpen(false), [])
  const desktop = variant === 'desktop'
  const listPath = `/children/${childId}/citas`

  if (!data) return null
  const next = data.next
  if (next) {
    const start = new Date(next.startsAt)
    const when = `${formatWeekdayLong(start)} · ${formatTime(next.startsAt)}`
    const where = [next.doctorName, next.location].filter((t) => t.trim() !== '')
    const maps = placeLink(next)
    const text = (
      <>
        <span className="text-[13px] font-bold text-muted">Próxima cita</span>
        <span className={`font-extrabold text-ink ${desktop ? 'text-[17px]' : 'text-[16px]'}`}>{when}</span>
        {where.map((line) => (
          <span key={line} className={`leading-[1.45] text-body ${desktop ? 'text-[15px]' : 'text-[14px]'}`}>
            {line}
          </span>
        ))}
      </>
    )
    const mapsLink = maps && (
      <a href={maps} target="_blank" rel="noopener noreferrer" className={`${outline} ${desktop ? 'mt-2.5' : 'ml-12'}`}>
        Abrir en Maps
      </a>
    )
    return (
      <section aria-label="Próxima cita" className={`${card} flex flex-col ${desktop ? 'gap-1 p-[18px]' : 'gap-3 p-4'}`}>
        {desktop ? (
          <Link to={listPath} className="flex flex-col gap-1">
            {text}
          </Link>
        ) : (
          <Link to={listPath} className="flex items-start gap-3">
            <CalendarIcon />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">{text}</span>
          </Link>
        )}
        {mapsLink}
      </section>
    )
  }

  if (access.canEdit)
    return (
      <Link
        to={`/children/${childId}/citas/nueva`}
        className={
          desktop
            ? 'inline-flex min-h-12 items-center justify-center rounded-2xl border-2 border-dashed border-hint-border text-[15px] font-extrabold text-action hover:bg-hint'
            : 'inline-flex min-h-11 items-center self-start text-[15px] font-extrabold text-action'
        }
      >
        + Agregar cita
      </Link>
    )

  if (access.showPlan)
    return (
      <>
        <button
          ref={opener}
          type="button"
          onClick={() => setPlanOpen(true)}
          className={`flex cursor-pointer gap-2.5 rounded-2xl border-[1.5px] border-hint-border bg-surface px-4 text-left ${desktop ? 'flex-col items-start py-3.5' : 'min-h-[52px] items-center justify-between'}`}
        >
          <span className="text-[15px] text-body">
            <strong className="text-ink">Próxima cita</strong> · fecha, lugar y aviso
          </span>
          <span className="shrink-0 rounded-full border border-hint-border bg-hint px-[9px] py-[3px] text-[12px] font-extrabold text-action">Plan completo</span>
        </button>
        {planOpen && <FreemiumLimitModal reason="appointments" onStayFree={closePlan} onViewPlans={() => navigate('/planes')} opener={opener} />}
      </>
    )

  return null
}
