import { useEffect, useState } from 'react'
import { DoseChipView } from '../../consultations/DoseChip'
import type { OverviewDose } from '../../consultations/types'
import { DayProgress } from '../../supplements/DayProgress'
import { dayCount } from '../../supplements/scheduleText'
import { useLocalDay } from '../../../shared/useLocalDay'
import { PHONE } from '../childText'
import { accessGone, useActivities, useDone, useMarkDose, useMe, useOverview } from './hooks'
import { NoAccess } from './NoAccess'
import { clearCredential, readCredential } from './storage'

const card = 'flex flex-col gap-3 rounded-[22px] bg-surface px-[22px] py-5 shadow-[0_8px_20px_rgba(4,37,43,0.07)]'

function DoseRow({ credential, dose }: { credential: string; dose: OverviewDose }) {
  const mark = useMarkDose(credential)
  return (
    <li className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col">
        <span className="text-base font-extrabold text-ink [overflow-wrap:anywhere]">{dose.medicationName}</span>
        {dose.kind === 'supplement' && <span className="text-[13px] font-semibold text-body">{PHONE.supplement}</span>}
      </div>
      <DoseChipView dose={dose} canManage={false} pending={mark.isPending} onToggle={() => mark.mutate({ dose, taken: !dose.taken })} />
    </li>
  )
}

/**
 * `/hijo/hoy` (specs/047): the child's own screen — today's doses (medications and supplements) with the same chip a parent sees,
 * and the child's activities with «Realizado». It shows nothing else: no consultations, photos, notes, family or plan. It talks to the
 * API with the phone's credential only; if the server says the access is gone the phone forgets it and says one sentence.
 */
export function ChildTodayPage() {
  const [credential] = useState(readCredential)
  if (!credential) return <NoAccess />
  return <Today credential={credential} />
}

function Today({ credential }: { credential: string }) {
  const day = useLocalDay()
  const me = useMe(credential)
  const childId = me.data?.childId
  const overview = useOverview(credential, childId, day.from, day.to)
  const activities = useActivities(credential, childId, day.from, day.to)
  const done = useDone(credential, day.from, day.to)
  const gone = accessGone(me.error, overview.error, activities.error)

  useEffect(() => {
    if (gone) clearCredential()
  }, [gone])

  if (gone) return <NoAccess />
  const failed = me.isError || overview.isError || activities.isError
  const loading = me.isPending || overview.isPending || activities.isPending

  return (
    <main className="mx-auto min-h-screen w-full max-w-[430px] bg-canvas pb-10">
      <header className="bg-ink px-6 pt-8 pb-7">
        <p className="text-sm font-semibold text-hint-border">PediTrack</p>
        <h1 className="mt-1 text-3xl leading-[1.15] font-black tracking-[-0.03em] text-white [overflow-wrap:anywhere]">
          {PHONE.greeting(me.data?.childFirstName ?? '')}
        </h1>
      </header>
      <div className="flex flex-col gap-5 px-5 pt-6">
        {loading && !failed && (
          <p role="status" className="text-base font-semibold text-action">
            {PHONE.loading}
          </p>
        )}
        {failed && (
          <div className={card} role="status">
            <p className="text-base font-bold text-ink">{PHONE.loadError}</p>
            <button
              type="button"
              className="min-h-12 cursor-pointer self-start rounded-2xl border-2 border-action px-5 text-base font-extrabold text-action hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
              onClick={() => {
                void me.refetch()
                void overview.refetch()
                void activities.refetch()
              }}
            >
              {PHONE.retry}
            </button>
          </div>
        )}

        {overview.data && (
          <section aria-label={PHONE.today} className={card}>
            <h2 className="text-xl font-black tracking-[-0.02em] text-ink">{PHONE.today}</h2>
            {overview.data.doses.length === 0 ? (
              <p className="text-[15px] text-body">{PHONE.noDoses}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {overview.data.doses.map((dose) => (
                  <DoseRow key={`${dose.kind ?? 'medication'}-${dose.id}`} credential={credential} dose={dose} />
                ))}
              </ul>
            )}
          </section>
        )}

        {activities.data && activities.data.length > 0 && (
          <section aria-label={PHONE.activities} className={card}>
            <h2 className="text-xl font-black tracking-[-0.02em] text-ink">{PHONE.activities}</h2>
            <ul className="flex flex-col gap-4">
              {activities.data
                .filter((a) => a.status === 'active')
                .map((activity) => {
                  const count = dayCount(activity.doses)
                  return (
                    <li key={activity.id} className="flex flex-col gap-2">
                      <span className="text-base font-extrabold text-ink [overflow-wrap:anywhere]">{activity.name}</span>
                      {count.total > 0 && (
                        <>
                          <DayProgress done={count.done} total={count.total} label={`Avance de ${activity.name}`} />
                          <span className="text-[13px] font-semibold text-body">{PHONE.doneOf(count.done, count.total)}</span>
                        </>
                      )}
                      <button
                        type="button"
                        aria-label={`Realizado: ${activity.name}`}
                        disabled={done.isPending || count.total === 0}
                        onClick={() => done.mutate(activity.id)}
                        className="min-h-12 cursor-pointer self-start rounded-2xl border-2 border-action px-[18px] text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span aria-hidden="true">✓ </span>Realizado
                      </button>
                    </li>
                  )
                })}
            </ul>
          </section>
        )}
      </div>
    </main>
  )
}
