import { Link } from 'react-router-dom'
import { formatDateShortNoPad } from '../../shared/date'
import { ageAt } from './growthAge'
import { GROWTH, byLine, cmText, correctedLine, countLine, kgText, noteLine, valuesLine } from './growthText'
import type { Measurement } from './types'

// specs/065: «Medidas anotadas», the same data as the chart (its accessible alternative): a list on the phone and a table on the web,
// newest first, with «Corregir» / «Quitar» only for who can write (the mock's sizes, research R3).

interface MeasurementsProps {
  measurements: Measurement[]
  birthDate: string
  childId: string
  canEdit: boolean
  onRemove: (m: Measurement, opener: HTMLButtonElement) => void
}

const action = 'min-h-11 cursor-pointer font-extrabold'

function Actions({ m, childId, onRemove, desktop }: { m: Measurement; childId: string; onRemove: MeasurementsProps['onRemove']; desktop: boolean }) {
  const date = formatDateShortNoPad(m.measuredOn)
  const size = desktop ? 'px-3 text-[15px]' : 'text-[14px]'
  return (
    <>
      <Link
        to={`/children/${childId}/crecimiento/${m.id}/editar`}
        aria-label={`${GROWTH.correct} ${date}`}
        className={`${action} ${size} inline-flex items-center text-action hover:text-ink hover:underline`}
      >
        {GROWTH.correct}
      </Link>
      <button
        type="button"
        aria-label={`${GROWTH.remove} ${date}`}
        onClick={(e) => onRemove(m, e.currentTarget)}
        className={`${action} ${size} bg-transparent text-error hover:underline`}
      >
        {GROWTH.remove}
      </button>
    </>
  )
}

function Title({ count, desktop }: { count: number; desktop: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className={`font-black tracking-[-0.02em] text-ink ${desktop ? 'text-[22px]' : 'text-[20px]'}`}>{GROWTH.listTitle}</h2>
      <span className={`text-body ${desktop ? 'text-[15px]' : 'text-[14px]'}`}>{countLine(count)}</span>
    </div>
  )
}

/** The phone's list: date and values, age and who wrote it, the note, the correction and the actions. */
export function MeasurementsList({ measurements, birthDate, childId, canEdit, onRemove }: MeasurementsProps) {
  return (
    <section aria-label={GROWTH.listTitle} className="flex flex-col gap-2.5 leading-[normal]">
      <Title count={measurements.length} desktop={false} />
      <ul className="flex flex-col gap-px overflow-hidden rounded-2xl border border-line bg-hint-edge">
        {measurements.map((m) => (
          <li key={m.id} className={`flex flex-col gap-[3px] bg-surface px-4 pt-3 leading-[normal] ${canEdit ? 'pb-1' : 'pb-3'}`}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[16px] font-extrabold text-ink">{formatDateShortNoPad(m.measuredOn)}</span>
              <span className="text-right text-[16px] font-extrabold text-ink tabular-nums">{valuesLine(m.weightKg, m.heightCm)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[14px] text-body">{ageAt(birthDate, m.measuredOn)}</span>
              <span className="text-[13px] font-semibold text-muted">{byLine(m.createdBy.name)}</span>
            </div>
            {m.note ? <span className="text-[14px] leading-[1.4] text-body [overflow-wrap:anywhere]">{noteLine(m.note)}</span> : null}
            {m.corrected ? <span className="text-[13px] font-semibold text-muted">{correctedLine(m.corrected)}</span> : null}
            {canEdit ? (
              <div className="flex gap-5">
                <Actions m={m} childId={childId} onRemove={onRemove} desktop={false} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

const columns = 'grid grid-cols-[132px_128px_96px_96px_minmax(0,1fr)_168px] gap-4'

/** The web's table: Fecha · Edad · Peso · Talla · Anotada por, and the actions at the right; an empty value is «—». */
export function MeasurementsTable({ measurements, birthDate, childId, canEdit, onRemove }: MeasurementsProps) {
  return (
    <section aria-label={GROWTH.listTitle} className="flex flex-col gap-3 leading-[normal]">
      <Title count={measurements.length} desktop />
      <div role="table" aria-label={GROWTH.listTitle} className="flex flex-col gap-px overflow-hidden rounded-2xl border border-line bg-hint-edge">
        <div role="row" className={`${columns} bg-canvas px-5 py-3 text-[13px] font-extrabold tracking-[0.04em] text-muted uppercase`}>
          <span role="columnheader">{GROWTH.colDate}</span>
          <span role="columnheader">{GROWTH.colAge}</span>
          <span role="columnheader">{GROWTH.colWeight}</span>
          <span role="columnheader">{GROWTH.colHeight}</span>
          <span role="columnheader">{GROWTH.colBy}</span>
          <span role="columnheader" className="sr-only">
            {GROWTH.colActions}
          </span>
        </div>
        {measurements.map((m) => (
          <div key={m.id} role="row" className={`${columns} min-h-16 items-center bg-surface px-5 py-2.5`}>
            <span role="cell" className="text-[16px] font-extrabold text-ink">
              {formatDateShortNoPad(m.measuredOn)}
            </span>
            <span role="cell" className="text-[15px] text-body">
              {ageAt(birthDate, m.measuredOn)}
            </span>
            <span role="cell" aria-label={m.weightKg != null ? kgText(m.weightKg) : GROWTH.noWeight} className="text-[16px] font-bold text-ink tabular-nums">
              {m.weightKg != null ? kgText(m.weightKg) : '—'}
            </span>
            <span role="cell" aria-label={m.heightCm != null ? cmText(m.heightCm) : GROWTH.noHeight} className="text-[16px] font-bold text-ink tabular-nums">
              {m.heightCm != null ? cmText(m.heightCm) : '—'}
            </span>
            <span role="cell" className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[15px] text-body">{m.createdBy.name}</span>
              {m.note ? <span className="text-[14px] text-body [overflow-wrap:anywhere]">{noteLine(m.note)}</span> : null}
              {m.corrected ? <span className="text-[13px] font-semibold text-muted">{correctedLine(m.corrected)}</span> : null}
            </span>
            <span role="cell" className="flex justify-end gap-1.5">
              {canEdit ? <Actions m={m} childId={childId} onRemove={onRemove} desktop /> : null}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
