import { useState } from 'react'
import { useMyReminders } from './hooks'

/**
 * «Tus avisos» (mock D1/D4): each person turns the reminders of THIS routine on or off for themselves, a Caregiver included.
 * Only an active routine has reminders, so the card isn't drawn for a paused or finished one. A switch with a fixed name;
 * the state is only `aria-checked`.
 */
export function MyRemindersToggle({ routineId, enabled, personal = false }: { routineId: string; enabled: boolean; personal?: boolean }) {
  const mutation = useMyReminders(routineId)
  const [failed, setFailed] = useState(false)

  return (
    <div className="flex flex-col gap-2.5 rounded-[22px] bg-surface px-[22px] py-5 shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-[17px] font-black tracking-[-0.01em] text-ink">{personal ? 'Avisos' : 'Tus avisos'}</h3>
          <p className="text-sm leading-normal text-body">A la hora de cada toma, en este dispositivo.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={personal ? 'Avisos de esta rutina' : 'Avisos de esta rutina para ti'}
          disabled={mutation.isPending}
          onClick={() => {
            setFailed(false)
            mutation.mutate(!enabled, { onError: () => setFailed(true) })
          }}
          className="flex min-h-11 w-[60px] shrink-0 cursor-pointer items-center justify-center focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 [&:focus-visible>span]:ring-2 [&:focus-visible>span]:ring-action [&:focus-visible>span]:ring-offset-2"
        >
          <span aria-hidden="true" className={`relative h-8 w-[52px] rounded-full transition-colors duration-200 ${enabled ? 'bg-action' : 'bg-slate-300'}`}>
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-surface transition-all duration-200 ${enabled ? 'right-1' : 'left-1'}`} />
          </span>
        </button>
      </div>
      <p className="text-[13px] leading-normal text-slate-600">
        {personal ? 'Se activan en cada dispositivo por separado.' : 'Cada persona de la familia elige los suyos. Activarlos aquí no los activa para nadie más.'}
      </p>
      {failed && (
        <p role="alert" className="text-[13px] font-semibold text-red-700">
          No se pudo guardar tu elección. Inténtalo de nuevo.
        </p>
      )}
    </div>
  )
}
