import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FreemiumLimitModal } from '../account-signup/FreemiumLimitModal'
import { GROWTH, latestWhen, valuesLine } from './growthText'
import type { GrowthList, Measurement } from './types'

// specs/065: the small cards of «Crecimiento», with the mock's sizes (research R3). Two designs by `desktop`, never mixed.

export const growthCard = 'rounded-2xl border border-line bg-surface'
const eyebrow = 'text-[13px] leading-[normal] font-extrabold tracking-[0.06em] text-action uppercase'

/** «ÚLTIMA MEDIDA · 11.4 kg · 82 cm · hace 12 días · 12 oct 2026»: only the values of the newest measurement. */
export function LatestCard({ measurement, today, desktop }: { measurement: Measurement; today: string; desktop: boolean }) {
  return (
    <section aria-label={GROWTH.latest} className={`${growthCard} flex flex-col ${desktop ? 'gap-1.5 px-6 py-5' : 'gap-1 px-[18px] py-4'}`}>
      <span className={eyebrow}>{GROWTH.latest}</span>
      <span
        className={`font-black tracking-[-0.03em] text-ink tabular-nums ${desktop ? 'text-[44px] leading-[1.05]' : 'text-[34px] leading-[1.1]'}`}
      >
        {valuesLine(measurement.weightKg, measurement.heightCm)}
      </span>
      <span className={`leading-[normal] font-medium text-body ${desktop ? 'text-[16px]' : 'text-[15px]'}`}>{latestWhen(today, measurement.measuredOn)}</span>
    </section>
  )
}

/** «AL REGISTRAR A MATEO · 3.3 kg · 50 cm · Sin fecha…» and, for who can write, «Anotarla con fecha». */
export function RegisteredBox({
  registered,
  childName,
  childId,
  canEdit,
  desktop,
}: {
  registered: NonNullable<GrowthList['registered']>
  childName: string
  childId: string
  canEdit: boolean
  desktop: boolean
}) {
  return (
    <section
      aria-label={GROWTH.registeredSection}
      className={`flex flex-col gap-1 rounded-2xl border-[1.5px] border-dashed border-hint-border bg-surface ${desktop ? 'px-[22px] py-5' : 'px-4 py-3.5'}`}
    >
      <span className={eyebrow}>{GROWTH.registeredLead(childName)}</span>
      <span className={`leading-[normal] font-extrabold text-ink tabular-nums ${desktop ? 'text-[20px]' : 'text-[17px]'}`}>
        {valuesLine(registered.weightKg, registered.heightCm)}
      </span>
      <span className={`leading-[1.45] text-body ${desktop ? 'text-[15px]' : 'text-[14px]'}`}>{GROWTH.registeredWhy}</span>
      {canEdit && (
        <Link
          to={`/children/${childId}/crecimiento/nueva`}
          state={{ registered }}
          className="inline-flex min-h-11 items-center self-start text-[15px] font-extrabold text-action hover:text-ink hover:underline"
        >
          {GROWTH.registeredAction}
        </Link>
      )}
    </section>
  )
}

/** The fixed sentences under the chart (inside its card, or alone in the empty and free-plan states). */
export function WhoNote({ desktop, className = '' }: { desktop: boolean; className?: string }) {
  return (
    <div
      role="note"
      className={`flex flex-col rounded-[14px] border border-hint-border bg-hint leading-[1.45] text-body ${desktop ? 'gap-0.5 px-4 py-3 text-[15px]' : 'gap-1 px-3.5 py-3 text-[14px]'} ${className}`}
    >
      <p>{GROWTH.whoNote}</p>
      <p className="font-bold text-ink">{GROWTH.whoNoteStrong}</p>
    </div>
  )
}

/** «Vista de Cuidadora. Puedes ver las medidas. Anotarlas lo hace la familia.» (or «Solo lectura.» for another role). */
export function ReadOnlyNote({ caregiver, desktop }: { caregiver: boolean; desktop: boolean }) {
  return (
    <div
      role="note"
      className={`rounded-2xl border-[1.5px] border-hint-border bg-surface text-[15px] leading-[1.45] text-body ${desktop ? 'px-[18px] py-3.5' : 'px-4 py-3.5'}`}
    >
      <strong className="text-ink">{caregiver ? GROWTH.caregiverLead : GROWTH.readOnlyLead}</strong> {GROWTH.readOnlyBody}
    </div>
  )
}

/** State C: nothing written yet. The one solid button of the screen, for who can write. */
export function EmptyCard({ childId, canEdit, desktop }: { childId: string; canEdit: boolean; desktop: boolean }) {
  return (
    <section
      className={`flex flex-col gap-2.5 rounded-2xl border-[1.5px] border-dashed border-hint-border bg-surface ${desktop ? 'items-start px-6 py-8' : 'items-center px-5 py-7 text-center'}`}
    >
      <span className={`font-extrabold text-ink ${desktop ? 'text-[20px]' : 'text-[18px]'}`}>{GROWTH.emptyLong}</span>
      <span className={`leading-normal text-body ${desktop ? 'text-[16px]' : 'text-[15px]'}`}>{GROWTH.emptyBody}</span>
      {canEdit && (
        <Link
          to={`/children/${childId}/crecimiento/nueva`}
          className={`inline-flex min-h-[52px] items-center justify-center rounded-2xl bg-confirmed text-[16px] font-extrabold text-white hover:bg-confirmed-strong ${desktop ? 'mt-2 px-7' : 'mt-1.5 self-stretch px-6'}`}
        >
          {GROWTH.emptyAction}
        </Link>
      )}
    </section>
  )
}

/** State E: the chart is the full plan's. The chart itself is never asked; the app's one plan notice opens. */
export function ChartLockedCard({ childName, desktop, onViewPlans }: { childName: string; desktop: boolean; onViewPlans: () => void }) {
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  const badge = 'flex-none rounded-full border border-hint-border bg-hint px-2.5 py-1 text-[12px] font-extrabold text-action'
  const button = (
    <button
      ref={opener}
      type="button"
      onClick={() => setOpen(true)}
      className={`inline-flex flex-none cursor-pointer items-center rounded-[14px] border-2 border-action bg-transparent text-[15px] font-extrabold text-action hover:bg-hint ${desktop ? 'min-h-12 px-[22px]' : 'min-h-11 self-start px-[18px]'}`}
    >
      {GROWTH.showChart}
    </button>
  )
  return (
    <section aria-label={GROWTH.chartSection} className={`${growthCard} flex ${desktop ? 'items-center gap-6 p-6' : 'flex-col gap-2.5 p-[18px]'}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className={`flex items-center gap-2.5 ${desktop ? '' : 'justify-between'}`}>
          <h2 className={`font-extrabold text-ink ${desktop ? 'text-[20px]' : 'text-[18px]'}`}>{GROWTH.chartSection}</h2>
          <span className={badge}>{GROWTH.planBadge}</span>
        </div>
        <p className={`leading-normal text-body ${desktop ? 'text-[16px]' : 'text-[15px]'}`}>{GROWTH.lockedBody(childName)}</p>
      </div>
      {button}
      {open && <FreemiumLimitModal reason="growth_chart" opener={opener} onStayFree={() => setOpen(false)} onViewPlans={onViewPlans} />}
    </section>
  )
}
