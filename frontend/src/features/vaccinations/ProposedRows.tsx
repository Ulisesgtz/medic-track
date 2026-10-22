import { useId, useMemo, useState } from 'react'
import type { Vaccine } from '../../shared/catalog/api'
import { fieldProposed } from '../../shared/ui/formStyles'
import { VaccinationApiError } from './api'
import { useSaveVaccination } from './hooks'
import { parseVaccineText, type ProposedRow } from './parseVaccineText'
import { OTHER, localToday, toInput, validateDose, type DoseFormValues } from './vaccineForm'
import { TEXT } from './vaccineText'

interface Row extends ProposedRow {
  selected: boolean
  error?: string
  duplicate?: boolean
}

const ghost =
  'min-h-11 cursor-pointer rounded-xl px-3 text-[15px] font-extrabold text-action underline hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:opacity-60'
const outline =
  'min-h-11 cursor-pointer rounded-2xl border-2 border-action px-4 text-[15px] font-extrabold text-action hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:opacity-60'

const asValues = (r: Row): DoseFormValues => ({ vaccine: r.vaccine, customName: r.customName, appliedOn: r.appliedOn, doseNumber: r.doseNumber, lot: '', place: '', notes: '' })

interface ProposedRowsProps {
  childId: string
  birthDate: string
  /** The text the phone read from the photo. */
  text: string
  catalog: Vaccine[]
  /** All the rows were saved or discarded. */
  onDone: () => void
}

/**
 * The rows the reading of a card photo proposes (specs/046, FR-010): each one editable (vaccine from the same list, date, dose),
 * discardable and savable on its own; «Guardar las seleccionadas» saves only the ones left checked. **Nothing is saved until the parent
 * confirms**, a row with a date that doesn't fit is marked instead of sent, and a reading with nothing in it blocks nothing. The reading
 * never leaves the phone (Principio II).
 */
export function ProposedRows({ childId, birthDate, text, catalog, onDone }: ProposedRowsProps) {
  const id = useId()
  const initial = useMemo(() => parseVaccineText(text, catalog, birthDate).map((r): Row => ({ ...r, selected: true })), [text, catalog, birthDate])
  const [rows, setRows] = useState<Row[]>(initial)
  const [busy, setBusy] = useState(false)
  const save = useSaveVaccination(childId)

  const patch = (key: string, change: Partial<Row>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...change, error: undefined, duplicate: false } : r)))
  const drop = (keys: string[]) => {
    const left = rows.filter((r) => !keys.includes(r.key))
    setRows(left)
    if (left.length === 0) onDone()
  }

  /** Saves the given rows one after the other; the ones that are saved leave the list, the others keep their reason. */
  async function saveRows(keys: string[], allowDuplicate: boolean) {
    setBusy(true)
    const today = localToday()
    const saved: string[] = []
    const marks: Record<string, Partial<Row>> = {}
    for (const row of rows.filter((r) => keys.includes(r.key))) {
      const errors = validateDose(asValues(row), birthDate, today)
      if (Object.keys(errors).length > 0) {
        marks[row.key] = { error: errors.appliedOn ?? errors.vaccine ?? errors.customName ?? errors.doseNumber }
        continue
      }
      try {
        await save.mutateAsync(toInput(asValues(row), allowDuplicate))
        saved.push(row.key)
      } catch (error) {
        marks[row.key] = error instanceof VaccinationApiError && error.kind === 'duplicate' ? { duplicate: true } : { error: TEXT.proposed.saveError }
      }
    }
    setBusy(false)
    setRows((all) => all.filter((r) => !saved.includes(r.key)).map((r) => ({ ...r, ...marks[r.key] })))
    if (rows.every((r) => saved.includes(r.key))) onDone()
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-2 rounded-[22px] border-2 border-dashed border-hint-border px-[22px] py-5">
        <p className="text-[15px] leading-relaxed text-body">{TEXT.proposed.none}</p>
        <button type="button" className={`${ghost} self-start`} onClick={onDone}>
          {TEXT.dialog.close}
        </button>
      </div>
    )
  }

  const selected = rows.filter((r) => r.selected).map((r) => r.key)
  return (
    <section aria-label={TEXT.proposed.title} className="flex flex-col gap-4 rounded-[22px] bg-surface px-[22px] py-5 shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-black tracking-[-0.02em] text-ink">{TEXT.proposed.title}</h3>
        <p className="text-[15px] leading-normal text-body">{TEXT.proposed.help}</p>
      </div>
      <ul className="flex flex-col gap-4">
        {rows.map((row, i) => {
          const rid = `${id}-${row.key}`
          return (
            <li key={row.key} className="flex flex-col gap-3 rounded-2xl border-2 border-hint-border p-4">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] font-bold text-ink">
                <input type="checkbox" checked={row.selected} onChange={(e) => patch(row.key, { selected: e.target.checked })} className="h-5 w-5 accent-[var(--color-action)]" />
                {TEXT.proposed.include} {i + 1}
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <label htmlFor={`${rid}-v`} className="text-[13px] font-bold text-body">
                    {TEXT.dialog.vaccine}
                  </label>
                  <select id={`${rid}-v`} value={row.vaccine} onChange={(e) => patch(row.key, { vaccine: e.target.value })} className={fieldProposed}>
                    <option value="">{TEXT.dialog.chooseVaccine}</option>
                    {catalog.map((v) => (
                      <option key={v.code} value={v.code}>
                        {v.name}
                      </option>
                    ))}
                    <option value={OTHER}>{TEXT.dialog.other}</option>
                  </select>
                </div>
                {row.vaccine === OTHER && (
                  <div className="flex min-w-0 flex-col gap-1">
                    <label htmlFor={`${rid}-n`} className="text-[13px] font-bold text-body">
                      {TEXT.dialog.customName}
                    </label>
                    <input id={`${rid}-n`} type="text" value={row.customName} onChange={(e) => patch(row.key, { customName: e.target.value })} className={fieldProposed} />
                  </div>
                )}
                <div className="flex min-w-0 flex-col gap-1">
                  <label htmlFor={`${rid}-d`} className="text-[13px] font-bold text-body">
                    {TEXT.dialog.appliedOn}
                  </label>
                  <input
                    id={`${rid}-d`}
                    type="date"
                    value={row.appliedOn}
                    min={birthDate.slice(0, 10)}
                    max={localToday()}
                    onChange={(e) => patch(row.key, { appliedOn: e.target.value })}
                    aria-invalid={!row.appliedOn || !!row.error}
                    className={fieldProposed}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <label htmlFor={`${rid}-s`} className="text-[13px] font-bold text-body">
                    {TEXT.dialog.doseNumber}
                  </label>
                  <input id={`${rid}-s`} type="text" inputMode="numeric" value={row.doseNumber} onChange={(e) => patch(row.key, { doseNumber: e.target.value })} className={fieldProposed} />
                </div>
              </div>
              {!row.appliedOn && !row.error && <p className="text-[13px] font-semibold text-body">{TEXT.proposed.fixDate}</p>}
              {row.error && (
                <p role="alert" className="text-[13px] font-semibold text-red-700">
                  {row.error}
                </p>
              )}
              {row.duplicate && (
                <div role="alert" className="flex flex-col gap-2 text-[14px] text-body">
                  <p>{TEXT.dialog.duplicate}</p>
                  <button type="button" disabled={busy} className={`${outline} self-start`} onClick={() => void saveRows([row.key], true)}>
                    {TEXT.dialog.saveAnyway}
                  </button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} className={outline} onClick={() => void saveRows([row.key], false)} aria-label={`${TEXT.proposed.confirmOne} fila ${i + 1}`}>
                  {busy ? TEXT.proposed.saving : TEXT.proposed.confirmOne}
                </button>
                <button type="button" disabled={busy} className={ghost} onClick={() => drop([row.key])} aria-label={`${TEXT.proposed.discard} fila ${i + 1}`}>
                  {TEXT.proposed.discard}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy || selected.length === 0}
          onClick={() => void saveRows(selected, false)}
          className="min-h-12 cursor-pointer rounded-2xl border-2 border-action px-5 text-base font-extrabold text-action hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? TEXT.proposed.saving : TEXT.proposed.confirmSelected}
        </button>
        <button type="button" disabled={busy} className={ghost} onClick={onDone}>
          {TEXT.proposed.discardAll}
        </button>
      </div>
    </section>
  )
}
