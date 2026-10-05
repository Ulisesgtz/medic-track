import type { Dose } from './types'
import { medicationProgress, progressText, unregisteredSuffix } from './progress'

/**
 * How many doses of a medication the parent marked out of all scheduled (specs/014): "3 / 9 tomas" and a bar in that
 * proportion, with "· 2 sin registrar" apart when there are (they do not count). An accessible progress bar; nothing
 * for a medication without doses. Says only what was marked — never "bien", "atrasado" or advice (Principio I).
 */
export function ProgressBar({ doses }: { doses: Dose[] }) {
  const progress = medicationProgress(doses)
  if (progress.total === 0) return null
  const percent = Math.round((progress.taken / progress.total) * 100)

  return (
    <div className="mt-3">
      {/* The bar below carries the same numbers for a screen reader (aria-valuetext): read only once. */}
      <p aria-hidden="true" className="text-[13px] font-bold text-ink-soft">
        {progressText(progress)}
        {progress.unregistered > 0 && (
          <span className="font-semibold text-slate-600">{unregisteredSuffix(progress.unregistered)}</span>
        )}
      </p>
      <div
        role="progressbar"
        aria-label="Progreso de las tomas"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.taken}
        aria-valuetext={`${progress.taken} de ${progress.total} ${progress.total === 1 ? 'toma registrada' : 'tomas registradas'}${progress.unregistered > 0 ? `, ${progress.unregistered} sin registrar` : ''}`}
        // slate-300 track: slate-200 was ~1.2:1 on the white card, the empty bar almost vanished.
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-300"
      >
        <div
          className="h-full rounded-full bg-confirmed transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
