import { useEffect, useState } from 'react'
import { groupByPeriod } from '../../consultations/dayPeriods'
import { takenByText } from '../../consultations/doseStatus'
import { MarkNotice } from '../../../shared/marks/MarkNotice'
import type { OverviewDose } from '../../consultations/types'
import type { Routine } from '../../supplements/types'
import { formatTime, formatWeekdayLong } from '../../../shared/date'
import { DayIcon } from '../../../shared/ui/DayRow'
import { useLocalDay } from '../../../shared/useLocalDay'
import { PHONE } from '../childText'
import { accessGone, useActivities, useDone, useMarkDose, useMe, useOverview, useRotation } from './hooks'
import { NoAccess } from './NoAccess'
import { RemindersCard } from './RemindersCard'
import { isIOS } from '../../reminders/deviceSupport'
import { clearCredential, readCredential } from './storage'

// specs/055 (estado 7 del diseño del inicio): the same rows, icons and chips as the child's card on the parents' home.
const card = 'flex flex-col rounded-[22px] bg-surface p-4 shadow-[0_8px_20px_rgba(4,37,43,0.07)]'
const outline =
  'min-h-11 shrink-0 cursor-pointer rounded-[14px] border-2 border-action text-[15px] font-extrabold text-action hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60'
const mint = 'inline-flex min-h-11 shrink-0 items-center rounded-[14px] bg-confirmed-soft font-extrabold text-confirmed-strong'
const row = 'flex min-h-14 items-center gap-3 border-b border-hint-edge'

/** True when the page runs as the app installed on the home screen (the advice to install is then not needed). */
function isInstalled(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  } catch {
    return false
  }
}

/**
 * One dose: «Marcar», the child's own mark «✓ 16:02» (tapping it takes it back) or somebody else's «✓ por Ana, 08:05» (locked).
 * A toggle with a fixed name and its state in `aria-pressed`, as every dose chip of the app.
 */
function DoseRow({ credential, dose }: { credential: string; dose: OverviewDose }) {
  const mark = useMarkDose(credential)
  const time = formatTime(dose.scheduledAt)
  const others = dose.taken && dose.takenBy?.mine !== true
  return (
    <li className={row}>
      <DayIcon kind={dose.kind === 'supplement' ? 'sup' : 'med'} />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-[16px] font-extrabold text-ink [overflow-wrap:anywhere]">{dose.medicationName}</span>
        <span className="text-[14px] text-body">
          {dose.kind === 'supplement' ? `${PHONE.supplement} · ${time}` : time}
          {dose.status === 'unregistered' && ` · ${PHONE.unregistered}`}
        </span>
      </span>
      <button
        type="button"
        aria-label={PHONE.markLabel(dose.medicationName, time)}
        aria-pressed={dose.taken}
        disabled={others}
        onClick={() => mark.mutate({ dose, taken: !dose.taken })}
        className={dose.taken ? `${mint} ${others ? 'px-3 text-[14px]' : 'cursor-pointer px-3.5 text-[15px]'}` : `${outline} min-w-24 px-[18px]`}
      >
        {!dose.taken ? PHONE.mark : others ? `✓ ${takenByText(dose.takenBy)}` : `✓ ${formatTime(dose.takenBy?.at ?? dose.scheduledAt)}`}
      </button>
    </li>
  )
}

/** One activity: its hour (or its count when it repeats in the day) and «✓ Realizado» while one is still unmarked. */
function ActivityRow({ activity, onDone }: { activity: Routine; onDone: () => void }) {
  const doses = activity.doses
  const done = doses.filter((d) => d.taken)
  const last = [...done].sort((a, b) => (a.takenBy?.at ?? '').localeCompare(b.takenBy?.at ?? '')).at(-1)
  const detail = doses.length === 1 ? formatTime(doses[0].scheduledAt) : PHONE.activitiesCount(done.length, doses.length)
  return (
    <li className={row}>
      <DayIcon kind="act" />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-[16px] font-extrabold text-ink [overflow-wrap:anywhere]">{activity.name}</span>
        <span className="text-[14px] text-body">{detail}</span>
      </span>
      {done.length < doses.length ? (
        <button type="button" aria-label={`Realizado: ${activity.name}`} onClick={onDone} className={`${outline} px-4`}>
          {PHONE.done}
        </button>
      ) : (
        last && (
          <span className={`${mint} px-3 text-[14px]`}>
            ✓ {last.takenBy?.mine === false ? takenByText(last.takenBy) : formatTime(last.takenBy?.at ?? last.scheduledAt)}
          </span>
        )
      )}
    </li>
  )
}

/**
 * `/hijo/hoy` (specs/047): the child's own screen — today's doses (medications and supplements) with the same chip a parent sees,
 * and the child's activities with «Realizado». It shows nothing else: no consultations, photos, notes, family or plan. It talks to the
 * API with the phone's credential only; if the server says the access is gone the phone forgets it and says one sentence.
 */
export function ChildTodayPage() {
  const [credential, setCredential] = useState(readCredential)
  if (!credential) return <NoAccess />
  return <Today credential={credential} onRotated={setCredential} />
}

function Today({ credential, onRotated }: { credential: string; onRotated: (credential: string) => void }) {
  const day = useLocalDay()
  const me = useMe(credential)
  const childId = me.data?.childId
  const overview = useOverview(credential, childId, day.from, day.to)
  const activities = useActivities(credential, childId, day.from, day.to)
  const done = useDone(credential, day.from, day.to)
  useRotation(credential, me.data?.rotateAfter, onRotated)
  const gone = accessGone(me.error, overview.error, activities.error)

  useEffect(() => {
    if (!gone) return
    // Another tab may have renewed the credential (the storage is shared): this one then reloads to use it. Only the credential this
    // tab holds, if it is still the stored one, is forgotten.
    const stored = readCredential()
    if (stored && stored !== credential) window.location.reload()
    else clearCredential()
  }, [gone, credential])

  if (gone) return <NoAccess />
  const failed = me.isError || overview.isError || activities.isError
  const loading = me.isPending || overview.isPending || activities.isPending

  const doses = (overview.data?.doses ?? []).filter((d) => d.status !== 'canceled')
  const activeActivities = (activities.data ?? []).filter((a) => a.status === 'active' && a.doses.length > 0)
  const toMark = doses.filter((d) => d.status === 'due').length
  const actDoses = activeActivities.flatMap((a) => a.doses)
  // The day's chip counts the activities whose time came too (never «Todo marcado» over one still to mark).
  const dueAll = toMark + actDoses.filter((d) => d.status === 'due').length
  const ready = !!overview.data && !!activities.data
  const nothing = ready && doses.length === 0 && actDoses.length === 0

  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col gap-5 bg-canvas px-5 pb-8 leading-[normal]"
      style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top))' }}
    >
      <header className="flex items-center gap-3.5">
        <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-action text-[19px] font-black text-white">
          {(me.data?.childFirstName ?? '').charAt(0)}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="text-[28px] leading-tight font-black tracking-[-0.03em] text-ink [overflow-wrap:anywhere]">
            {PHONE.greeting(me.data?.childFirstName ?? '')}
          </h1>
          <span className="text-[15px] text-body">{formatWeekdayLong(day.from)}</span>
        </div>
      </header>

      {!isInstalled() && <p className="text-[13px] leading-relaxed text-body">{isIOS() ? PHONE.installIos : PHONE.install}</p>}
      {loading && !failed && (
        <p role="status" className="text-[16px] font-semibold text-action">
          {PHONE.loading}
        </p>
      )}
      {failed && (
        <div className={`${card} gap-3`} role="status">
          <p className="text-[16px] font-bold text-ink">{PHONE.loadError}</p>
          <button
            type="button"
            className={`${outline} self-start px-5`}
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

      {ready && !nothing && dueAll > 0 && (
        <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-pending-soft px-3 py-[5px] text-[14px] font-extrabold text-on-pending-chip">
          <span aria-hidden="true" className="h-[9px] w-[9px] rounded-full border-2 border-pending-dot" />
          {PHONE.toMark(dueAll)}
        </span>
      )}
      {ready && !nothing && dueAll === 0 && (
        <span className="self-start rounded-full bg-confirmed-soft px-3 py-[5px] text-[14px] font-extrabold text-confirmed-strong">{PHONE.allMarked}</span>
      )}
      {nothing && (
        <div className="rounded-[22px] border-2 border-dashed border-hint-border px-5 py-7 text-center text-[16px] leading-normal text-muted">
          {PHONE.nothingToday}
        </div>
      )}

      {ready && doses.length > 0 && (
        <section aria-label={PHONE.today} className={`${card} gap-1.5`}>
          <div className="flex items-baseline justify-between gap-2 pb-1">
            <h2 className="text-[18px] font-extrabold text-ink">{PHONE.dosesTitle}</h2>
            <span className="text-[15px] font-bold text-ink">{PHONE.dosesCount(doses.length, toMark)}</span>
          </div>
          {groupByPeriod(doses).map((group) => (
            <div key={group.key} role="group" aria-label={group.label} className="flex flex-col gap-0.5 pt-2">
              <span className="text-[12px] font-extrabold tracking-[0.08em] text-action uppercase">{group.label}</span>
              <ul className="flex flex-col">
                {group.doses.map((dose) => (
                  <DoseRow key={`${dose.kind ?? 'medication'}-${dose.id}`} credential={credential} dose={dose} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {ready && activeActivities.length > 0 && (
        <section aria-label={PHONE.activities} className={`${card} gap-0.5`}>
          <div className="flex items-baseline justify-between gap-2 pb-1">
            <h2 className="text-[18px] font-extrabold text-ink">{PHONE.activities}</h2>
            <span className="text-[15px] font-bold text-ink">
              {PHONE.activitiesCount(actDoses.filter((d) => d.taken).length, actDoses.length)}
            </span>
          </div>
          <ul className="flex flex-col">
            {activeActivities.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} onDone={() => done.mutate(activity)} />
            ))}
          </ul>
        </section>
      )}

      {!failed && !loading && <RemindersCard credential={credential} />}
      <MarkNotice />
    </main>
  )
}
