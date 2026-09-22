import { Link } from 'react-router-dom'
import { formatDateShort } from '../../shared/date'
import type { ConsultationSummary } from './types'

interface ConsultationCardProps {
  consultation: ConsultationSummary
  /** The most recent consultation gets the bright accent bar. */
  isLatest?: boolean
  /** 'phone' = mock 02 (stacked); 'desktop' = board screen 6 (with "Ver →"). */
  variant?: 'phone' | 'desktop'
}

/** "Fiebre y tos · 2 medicamentos"; a visit with no medication reads "sin receta". */
function subtitle({ symptoms, medicationCount }: ConsultationSummary): string {
  const meds =
    medicationCount === 0 ? 'sin receta' : `${medicationCount} ${medicationCount === 1 ? 'medicamento' : 'medicamentos'}`
  return [symptoms.trim(), meds].filter(Boolean).join(' · ')
}

/** One consultation's card in the listing (FR-001), built from the mockups.
 * Clicking navigates to that consultation's detail (Historia de Usuario 3). */
export function ConsultationCard({ consultation, isLatest = false, variant = 'phone' }: ConsultationCardProps) {
  const accent = `border-l-[5px] ${isLatest ? 'border-bright' : 'border-[#cffafe]'}`
  const text = (
    <>
      <p className="text-[13px] font-bold text-action">{formatDateShort(consultation.consultDate)}</p>
      <p
        className={`truncate font-extrabold tracking-tight text-ink ${
          variant === 'desktop' ? 'mt-1.5 text-[19px]' : 'mt-1.5 text-lg'
        }`}
      >
        {consultation.doctorName}
      </p>
      <p className={`truncate text-sm text-slate-600 ${variant === 'desktop' ? 'mt-1.5' : 'mt-1.5'}`}>
        {subtitle(consultation)}
      </p>
    </>
  )

  if (variant === 'desktop') {
    return (
      <Link
        to={`/consultations/${consultation.id}`}
        className={`flex cursor-pointer items-center justify-between gap-5 rounded-[18px] bg-surface p-[22px] shadow-[0_8px_20px_rgba(4,37,43,0.07)] transition-transform duration-200 hover:-translate-y-0.5 ${accent}`}
      >
        <div className="min-w-0">{text}</div>
        <span aria-hidden="true" className="shrink-0 text-sm font-extrabold text-action">
          Ver →
        </span>
      </Link>
    )
  }

  return (
    <Link
      to={`/consultations/${consultation.id}`}
      className={`block cursor-pointer rounded-3xl bg-surface p-5 shadow-[0_8px_20px_rgba(4,37,43,0.07)] transition-transform duration-200 hover:-translate-y-0.5 ${accent}`}
    >
      {text}
    </Link>
  )
}
