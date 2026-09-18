import { Link } from 'react-router-dom'
import type { ConsultationSummary } from './types'

interface ConsultationCardProps {
  consultation: ConsultationSummary
  /** The most recent consultation gets the bright accent bar. */
  isLatest?: boolean
}

/** One consultation's card in the listing: date + doctor (FR-001). Clicking
 * navigates to that consultation's detail (Historia de Usuario 3). */
export function ConsultationCard({ consultation, isLatest = false }: ConsultationCardProps) {
  return (
    <Link
      to={`/consultations/${consultation.id}`}
      className="relative block cursor-pointer overflow-hidden rounded-[22px] bg-surface py-5 pr-5 pl-7 shadow-[0_8px_20px_rgba(4,37,43,0.07)] transition-transform duration-200 hover:-translate-y-0.5"
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-[5px] ${isLatest ? 'bg-bright' : 'bg-cyan-100'}`}
      />
      <p className="text-xl font-extrabold tracking-tight text-ink">{consultation.doctorName}</p>
      <p className="mt-1 text-sm font-semibold text-action">{consultation.consultDate}</p>
    </Link>
  )
}
