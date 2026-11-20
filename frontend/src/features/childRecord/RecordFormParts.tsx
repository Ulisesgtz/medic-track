import type { ReactNode } from 'react'
import type { UseFormRegisterReturn } from 'react-hook-form'
import { FORM, RECORD, bloodLabel, itemLegend, itemWord } from './recordText'
import { ALLERGY_KINDS, BLOOD_TYPES, type AllergyKind, type BloodType } from './types'
import { selectedFill } from '../../shared/ui/selection'

// specs/073 (mock «Ficha del hijo PediTrack», state D): the pieces of the form. The field errors use the system's red (`error`
// token) with bold text and a counter — the owner's decision of 2026-11-17 (contracts/ui.md, deviation 2); the record itself, seen,
// never carries red.

export const formCard = 'flex flex-col gap-3 rounded-[22px] bg-surface p-4 shadow-[0_8px_20px_rgba(4,37,43,0.07)]'
const labelClass = 'text-[13px] font-bold text-ink'
const input = 'min-h-12 w-full min-w-0 rounded-[14px] bg-surface px-3.5 text-[16px] font-medium text-ink focus:outline-none'
const ok = 'border-[1.5px] border-calendar-muted focus:border-2 focus:border-ink'
const bad = 'border-2 border-error focus:border-ink'
const textButton = 'inline-flex min-h-11 cursor-pointer items-center justify-center px-3 text-[15px] font-extrabold text-action underline'
const moveButton =
  'h-11 w-11 cursor-pointer rounded-xl border-[1.5px] border-hint-border bg-surface text-[18px] font-extrabold text-action disabled:cursor-not-allowed disabled:opacity-40'
export const dashedAdd = 'min-h-[52px] cursor-pointer rounded-2xl border-2 border-dashed border-hint-border bg-transparent text-[15px] font-extrabold text-action'

/** The error line of a field: bold, with the counter «98 de 80» when the text is too long. */
function FieldError({ id, message, length, max }: { id: string; message: string; length: number; max?: number }) {
  return (
    <div id={id} className="flex justify-between gap-3 text-[14px] font-bold text-error">
      <span>{message}</span>
      {max !== undefined && length > max && <span className="shrink-0">{`${length} de ${max}`}</span>}
    </div>
  )
}

/** A labelled text field (or text area) with its error. `value` is the current text, for the counter. */
export function TextField({
  id,
  label,
  registration,
  error,
  value,
  max,
  type = 'text',
  rows,
  counter,
}: {
  id: string
  label: string
  registration: UseFormRegisterReturn
  error?: string
  value: string
  max: number
  type?: string
  rows?: number
  /** Always show «69 de 1000» under the field (the general note). */
  counter?: boolean
}) {
  const describedBy = error ? `${id}-error` : undefined
  const common = { id, 'aria-invalid': !!error, 'aria-describedby': describedBy, ...registration }
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {rows ? (
        <textarea {...common} rows={rows} className={`${input} resize-none py-3 leading-normal ${error ? bad : ok}`} />
      ) : (
        <input {...common} type={type} className={`${input} ${error ? bad : ok}`} />
      )}
      {error && <FieldError id={describedBy!} message={error} length={value.length} max={max} />}
      {counter && !error && <span className="text-right text-[13px] text-muted">{`${value.length} de ${max}`}</span>}
    </div>
  )
}

/** A group of option pills (one choice; tapping the chosen one again clears it). */
export function Pills<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  labelOf,
  minWidth,
}: {
  legend: string
  name: string
  options: readonly T[]
  value: T | ''
  onChange: (value: T | '') => void
  labelOf: (option: T) => string
  minWidth: string
}) {
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className={`${labelClass} mb-1.5 p-0`}>{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const chosen = value === option
          return (
            <label
              key={option}
              className={`relative inline-flex min-h-11 ${minWidth} cursor-pointer items-center justify-center rounded-full border-[1.5px] px-3.5 text-[15px] font-extrabold focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-action ${chosen ? selectedFill : 'border-hint-border bg-surface text-action'}`}
            >
              <input
                type="radio"
                name={name}
                value={option}
                checked={chosen}
                onChange={() => onChange(option)}
                onClick={() => chosen && onChange('')}
                className="absolute h-px w-px opacity-0"
              />
              {labelOf(option)}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export function KindPills({ name, value, onChange }: { name: string; value: AllergyKind | ''; onChange: (v: AllergyKind | '') => void }) {
  return <Pills legend={FORM.kind} name={name} options={ALLERGY_KINDS} value={value} onChange={onChange} labelOf={(k) => RECORD.kinds[k]} minWidth="min-w-24" />
}

export function BloodPills({ name, value, onChange }: { name: string; value: BloodType | ''; onChange: (v: BloodType | '') => void }) {
  return <Pills legend={FORM.bloodHelp} name={name} options={BLOOD_TYPES} value={value} onChange={onChange} labelOf={bloodLabel} minWidth="min-w-14" />
}

/** A list's heading with its «2 de 30». */
export function ListHeading({ title, count }: { title: string; count: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="text-[18px] font-extrabold text-ink">{title}</h2>
      {count && <span className="text-[14px] font-bold text-body">{count}</span>}
    </div>
  )
}

/** One entry of a list: its fields in a `fieldset`, «Subir» / «Bajar» (44 px, named) and «Quitar» as a text action. */
export function ItemFieldset({
  kind,
  index,
  count,
  children,
  onMove,
  onRemove,
}: {
  kind: 'allergy' | 'condition'
  index: number
  count: number
  children: ReactNode
  onMove: (delta: number) => void
  onRemove: () => void
}) {
  const word = itemWord(kind)
  const n = index + 1
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 rounded-[18px] border-[1.5px] border-hint-border bg-surface p-3.5">
      <legend className="px-1.5 text-[13px] font-extrabold text-action">{itemLegend(kind, n)}</legend>
      {children}
      <div className="flex items-center gap-2">
        <button type="button" aria-label={`Subir ${word} ${n}`} disabled={index === 0} onClick={() => onMove(-1)} className={moveButton}>
          ↑
        </button>
        <button type="button" aria-label={`Bajar ${word} ${n}`} disabled={index === count - 1} onClick={() => onMove(1)} className={moveButton}>
          ↓
        </button>
        <span className="flex-1" />
        <button type="button" aria-label={`${FORM.remove} ${word} ${n}`} onClick={onRemove} className={textButton}>
          {FORM.remove}
        </button>
      </div>
    </fieldset>
  )
}

/** The compact rows of a full list (D2): two entries with «Editar» and «y 28 alergias más · Ver las 30». */
export function CompactRows({ names, more, onOpen, seeAll }: { names: string[]; more: string; onOpen: () => void; seeAll: string }) {
  const outline = 'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[14px] border-2 border-action px-3.5 text-[15px] font-extrabold text-action hover:bg-hint'
  return (
    <>
      {names.map((name, i) => (
        <div key={i} className="flex min-h-[52px] items-center justify-between gap-2.5 rounded-[14px] border-[1.5px] border-hint-border px-3.5 py-1.5">
          <span className="min-w-0 break-words text-[16px] font-extrabold text-ink">{name}</span>
          <button type="button" onClick={onOpen} className={outline}>
            {FORM.edit}
          </button>
        </div>
      ))}
      <div className="flex min-h-[52px] items-center justify-between gap-2.5 rounded-[14px] border-[1.5px] border-dashed border-hint-border px-3.5 py-1.5">
        <span className="text-[15px] text-body">{more}</span>
        <button type="button" onClick={onOpen} className={outline}>
          {seeAll}
        </button>
      </div>
    </>
  )
}
