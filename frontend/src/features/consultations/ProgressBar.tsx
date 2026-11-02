import type { Dose } from './types'
import { medicationProgress, progressText, unregisteredSuffix } from './progress'

/**
 * How many doses of a medication the parent marked out of all scheduled (specs/014): «3 de 9 tomas» and a bar in that
 * proportion, with «· 2 sin registrar» apart when there are (they do not count). An accessible progress bar; nothing for a
 * medication without doses. Says only what was marked — never «bien», «atrasado» or advice (Principio I). specs/056: the
 * design's look (15 px count, 8 px `hint-edge` track filled with `action`); on the web it sits at the right of the card's title.
 */
export function ProgressBar({ doses, className = '', align = 'left' }: { doses: Dose[]; className?: string; align?: 'left' | 'right' }) {
  const progress = medicationProgress(doses)
  if (progress.total === 0) return null
  const percent = Math.round((progress.taken / progress.total) * 100)

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {/* The bar below carries the same numbers for a screen reader (aria-valuetext): read only once. */}
      <p aria-hidden="true" className={`text-[15px] font-extrabold text-ink ${align === 'right' ? 'text-right' : ''}`}>
        {progressText(progress)}
        {progress.unregistered > 0 && <span className="font-medium text-body">{unregisteredSuffix(progress.unregistered)}</span>}
      </p>
      <div
        role="progressbar"
        aria-label="Progreso de las tomas"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.taken}
        aria-valuetext={`${progress.taken} de ${progress.total} ${progress.total === 1 ? 'toma registrada' : 'tomas registradas'}${progress.unregistered > 0 ? `, ${progress.unregistered} sin registrar` : ''}`}
        className="h-2 overflow-hidden rounded-full bg-hint-edge"
      >
        <div className="h-full rounded-full bg-action transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
