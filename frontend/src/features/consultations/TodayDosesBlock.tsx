import { useMarkAllDoses } from './useMarkAllDoses'
import { isUnmarked, isUnregistered, unregisteredText } from './doseStatus'
import type { OverviewDose } from './types'

interface TodayDosesBlockProps {
  doses: OverviewDose[]
  status: 'ready' | 'loading' | 'error'
}

/**
 * The amber "Tomas de hoy" block of the phone child detail (mock 02):
 * "2 sin marcar · Amoxicilina" and a "Marcar tomas" button that marks all of
 * today's doses at once. Once nothing is left unmarked the block turns to the
 * soft green and the button goes away. Amber only ever means "the parent
 * hasn't marked it", never a medical warning (Principio I).
 *
 * specs/013: doses "sin registrar" (their next dose came unmarked) are counted apart — "2 sin marcar · 1 sin
 * registrar · …" — and "Marcar tomas" leaves them alone: those are marked one by one, if they really were given.
 */
export function TodayDosesBlock({ doses, status }: TodayDosesBlockProps) {
  const markAll = useMarkAllDoses()
  const unmarked = doses.filter(isUnmarked)
  const unregistered = doses.filter(isUnregistered).length
  const pending = status === 'ready' && unmarked.length > 0

  const names = [...new Set((unmarked.length > 0 ? unmarked : doses).map((d) => d.medicationName))].join(', ')
  let summary: string
  let detail: string | null = null
  if (status === 'loading') summary = 'Cargando…'
  else if (status === 'error') summary = 'No se pudieron cargar las tomas de hoy.'
  else if (doses.length === 0) summary = 'Sin tomas hoy'
  else if (unmarked.length === 0 && unregistered > 0) {
    summary = 'Sin tomas pendientes'
    detail = unregisteredText(unregistered)
  } else
    summary = [`${unmarked.length} sin marcar`, unregistered > 0 ? unregisteredText(unregistered) : null, names]
      .filter(Boolean)
      .join(' · ')

  const ink = pending ? 'text-[#451a03]' : 'text-[#065f46]'

  return (
    <section aria-labelledby="today-block-title" className="px-6 pt-6">
      <div className={`rounded-3xl p-5 ${pending ? 'bg-pending' : 'bg-confirmed-soft'}`}>
        <p id="today-block-title" className={`text-xs font-extrabold tracking-[0.1em] uppercase ${ink}`}>
          Tomas de hoy
        </p>
        <p className={`mt-3 text-lg font-extrabold tracking-tight ${ink}`}>{summary}</p>
        {detail && <p className={`mt-1 text-sm font-bold ${ink}`}>{detail}</p>}
        {pending && (
          <button
            type="button"
            disabled={markAll.isPending}
            onClick={() => markAll.mutate(unmarked)}
            className="mt-4 min-h-11 w-full cursor-pointer rounded-xl bg-[#451a03] py-3 text-sm font-extrabold text-pending-soft transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Marcar tomas
          </button>
        )}
      </div>
    </section>
  )
}
