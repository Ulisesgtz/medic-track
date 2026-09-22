import { useMarkAllDoses } from './useMarkAllDoses'
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
 */
export function TodayDosesBlock({ doses, status }: TodayDosesBlockProps) {
  const markAll = useMarkAllDoses()
  const unmarked = doses.filter((d) => !d.taken)
  const pending = status === 'ready' && unmarked.length > 0

  const names = [...new Set((unmarked.length > 0 ? unmarked : doses).map((d) => d.medicationName))].join(', ')
  let summary: string
  if (status === 'loading') summary = 'Cargando…'
  else if (status === 'error') summary = 'No se pudieron cargar las tomas de hoy.'
  else if (doses.length === 0) summary = 'Sin tomas hoy'
  else summary = `${unmarked.length} sin marcar · ${names}`

  const ink = pending ? 'text-[#451a03]' : 'text-[#065f46]'

  return (
    <section aria-labelledby="today-block-title" className="px-6 pt-6">
      <div className={`rounded-3xl p-5 ${pending ? 'bg-pending' : 'bg-confirmed-soft'}`}>
        <p id="today-block-title" className={`text-xs font-extrabold tracking-[0.1em] uppercase ${ink}`}>
          Tomas de hoy
        </p>
        <p className={`mt-3 text-lg font-extrabold tracking-tight ${ink}`}>{summary}</p>
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
