import { Link } from 'react-router-dom'
import type { ConsultationSummary } from './types'

interface ConsultationCardProps {
  consultation: ConsultationSummary
}

/** One consultation's card in the listing: date + doctor (FR-001). Clicking
 * navigates to that consultation's detail (Historia de Usuario 3). */
export function ConsultationCard({ consultation }: ConsultationCardProps) {
  return (
    <Link
      to={`/consultations/${consultation.id}`}
      className="block cursor-pointer rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition-colors duration-200 hover:border-cyan-300 hover:bg-cyan-50/40"
    >
      <p className="text-base font-semibold text-slate-900">{consultation.doctorName}</p>
      <p className="mt-1 text-sm text-slate-500">{consultation.consultDate}</p>
    </Link>
  )
}
