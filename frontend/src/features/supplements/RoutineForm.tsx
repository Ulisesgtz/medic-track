import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { errorClass, fieldBorder, fieldRoutine, fieldRoutineMultiline, labelClass } from '../../shared/ui/formStyles'
import { Notice } from '../../shared/ui/Notice'
import { SupplementApiError } from './api'
import {
  FIELD_OF_SERVER,
  MAX_TIMES,
  everyMinutes,
  newRoutineValues,
  serverMessage,
  toInput,
  validateValues,
  valuesOf,
  type EveryUnit,
  type FieldErrors,
  type FormValues,
} from './routineValues'
import { PERIOD_OPTIONS, WEEKDAY_SEGMENTS, activityPreview } from './scheduleText'
import type { Routine, RoutineInput, RoutineKind } from './types'

interface RoutineFormProps {
  /** Supplement (fixed hours) or activity (from one hour to another, every so often); an edit keeps its routine's. */
  kind: RoutineKind
  /** The one being edited; absent when creating. */
  routine?: Routine
  /** Saves it; rejects with a `SupplementApiError` (field errors are drawn next to their field, the plan is the caller's). */
  onSubmit: (input: RoutineInput) => Promise<void>
  onCancel: () => void
  /** The server answered that the plan isn't paid: the caller opens the plan notice, the typed data stays. */
  onPlanRequired: () => void
  /** Whether anything was typed that leaving would lose. */
  onDirtyChange?: (dirty: boolean) => void
  /** The person's own (specs/033, part 3): says nobody else sees it. */
  personal?: boolean
}

const segmented = 'grid overflow-hidden rounded-[14px] border-[1.5px] border-slate-300'
const segmentOn = 'bg-ink text-white'
const segmentOff = 'bg-surface text-ink hover:bg-hint'
const segmentBase = 'min-h-12 cursor-pointer text-[15px] font-extrabold focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-inset'

/** The weekday bar (0 = Monday): seven toggles, the chosen ones in `ink`. */
function WeekdayBar({ value, onToggle }: { value: number[]; onToggle: (day: number) => void }) {
  return (
    <div className={`${segmented} grid-cols-7`}>
      {WEEKDAY_SEGMENTS.map((segment, day) => {
        const on = value.includes(day)
        return (
          <button
            key={segment.l}
            type="button"
            aria-pressed={on}
            aria-label={segment.full}
            onClick={() => onToggle(day)}
            className={`${segmentBase} min-w-0 text-sm ${on ? segmentOn : segmentOff}`}
          >
            {segment.l}
          </button>
        )
      })}
    </div>
  )
}

/** A two-option segmented control (radio buttons drawn as the mocks' `ink` bars). */
function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`${segmented} grid-cols-2`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`${segmentBase} ${value === option.value ? segmentOn : segmentOff}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Create and edit a supplement or an activity (mocks RutinaForm / ActividadForm): one form, two schedules. A supplement is
 * «Todos los días» or «Ciertos días» with one to six fixed hours; an activity is «Desde las / Hasta las» and «Cada [n] minutos u
 * horas», on all days or some. It records what the parent writes exactly: no example in the fields, no check of the name, the amount
 * or the hours (Principio I) — it says so in the fixed sentence under the form. Errors go under their field.
 */
export function RoutineForm({ kind, routine, onSubmit, onCancel, onPlanRequired, onDirtyChange, personal = false }: RoutineFormProps) {
  const editing = routine !== undefined
  const activity = kind === 'activity'
  const noun = activity ? 'la actividad' : 'el suplemento'
  const initial = useMemo(() => (routine ? valuesOf(routine) : newRoutineValues(kind)), [routine, kind])
  const [values, setValues] = useState<FormValues>(initial)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const dirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(initial), [values, initial])
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange])

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setValues((prev) => ({ ...prev, [key]: value }))

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setNotice(null)
    const found = validateValues(values)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      if (found.name) nameRef.current?.focus()
      return
    }
    setSaving(true)
    try {
      await onSubmit(toInput(values))
    } catch (error) {
      if (error instanceof SupplementApiError && error.kind === 'validation_error') {
        const next: FieldErrors = {}
        for (const d of error.details ?? []) {
          const field = FIELD_OF_SERVER[d.field]
          if (field) next[field] = serverMessage(kind, d.field)
        }
        setErrors(next)
        if (Object.keys(next).length === 0) setNotice(`No se pudo guardar ${noun}. Revisa los datos e inténtalo de nuevo.`)
      } else if (error instanceof SupplementApiError && error.kind === 'plan_required') {
        onPlanRequired()
      } else if (error instanceof SupplementApiError && error.kind === 'routine_limit') {
        const what = activity ? 'actividades activas' : 'suplementos activos'
        setNotice(
          personal
            ? `Ya tienes el máximo de ${what}. Pausa o finaliza ${activity ? 'una' : 'uno'} para poder agregar ${activity ? 'otra' : 'otro'}.`
            : `Este hijo ya tiene el máximo de ${what}. Pausa o finaliza ${activity ? 'una' : 'uno'} para poder agregar ${activity ? 'otra' : 'otro'}.`,
        )
      } else if (error instanceof SupplementApiError && error.kind === 'routine_ended') {
        setNotice(`${activity ? 'Esta actividad' : 'Este suplemento'} ya terminó y no se puede editar. Para volver a registrar${activity ? 'la' : 'lo'}, agrega ${activity ? 'una actividad nueva' : 'un suplemento nuevo'}.`)
      } else {
        setNotice(`No se pudo guardar ${noun}. Inténtalo de nuevo.`)
      }
    } finally {
      setSaving(false)
    }
  }

  const updateTime = (index: number, value: string) => set('times', values.times.map((t, i) => (i === index ? value : t)))
  const toggleDay = (day: number) =>
    set('weekdays', values.weekdays.includes(day) ? values.weekdays.filter((d) => d !== day) : [...values.weekdays, day])
  const full = values.times.length >= MAX_TIMES

  const minutes = everyMinutes(values)
  const preview =
    activity && minutes !== null
      ? activityPreview(values.windowStart, values.windowEnd, minutes, values.daysMode === 'some' ? values.weekdays : [])
      : null

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="flex flex-col gap-[22px] rounded-[22px] bg-surface px-[18px] py-5 shadow-[0_8px_20px_rgba(4,37,43,0.07)]"
    >
      {(editing || personal) && (
        <p role="note" className="rounded-[14px] border-[1.5px] border-hint-border bg-hint px-4 py-3.5 text-sm leading-normal text-body">
          {personal && (activity ? 'Es una actividad personal: solo tú la ves y solo a ti te llegan sus avisos.' : 'Es un suplemento personal: solo tú lo ves y solo a ti te llegan sus avisos.')}
          {personal && editing && ' '}
          {editing && (activity ? 'Los cambios cuentan desde el siguiente aviso. Lo ya marcado no cambia.' : 'Los cambios cuentan desde la siguiente toma. Las tomas ya marcadas no cambian.')}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="routine-name" className={labelClass}>
          Nombre
        </label>
        <input
          ref={nameRef}
          id="routine-name"
          type="text"
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'routine-name-error' : undefined}
          autoComplete="off"
          className={`${fieldRoutine} ${fieldBorder(!!errors.name)}`}
        />
        {errors.name && (
          <span id="routine-name-error" className={errorClass}>
            {errors.name}
          </span>
        )}
      </div>

      {activity ? (
        <>
          <fieldset className="flex flex-col">
            <legend className={`${labelClass} mb-2`}>Horario del día</legend>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-body">Desde las</span>
                <input
                  type="time"
                  value={values.windowStart}
                  onChange={(e) => set('windowStart', e.target.value)}
                  aria-invalid={errors.windowStart ? true : undefined}
                  className={`${fieldRoutine} ${fieldBorder(!!errors.windowStart)}`}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-body">Hasta las</span>
                <input
                  type="time"
                  value={values.windowEnd}
                  onChange={(e) => set('windowEnd', e.target.value)}
                  aria-invalid={errors.windowEnd ? true : undefined}
                  className={`${fieldRoutine} ${fieldBorder(!!errors.windowEnd)}`}
                />
              </label>
            </div>
            {errors.windowStart && <span className={`mt-1.5 ${errorClass}`}>{errors.windowStart}</span>}
            {errors.windowEnd && <span className={`mt-1.5 ${errorClass}`}>{errors.windowEnd}</span>}
          </fieldset>

          <fieldset className="flex flex-col">
            <legend className={`${labelClass} mb-2`}>Cada cuánto</legend>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-base font-bold text-ink">Cada</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                aria-label="Cantidad"
                value={values.every}
                onChange={(e) => set('every', e.target.value)}
                aria-invalid={errors.every ? true : undefined}
                className={`${fieldRoutine} !w-[84px] ${fieldBorder(!!errors.every)}`}
              />
              <div className="min-w-[170px] flex-[1_1_170px]">
                <Segmented<EveryUnit>
                  label="Unidad"
                  options={[
                    { value: 'min', label: 'minutos' },
                    { value: 'h', label: 'horas' },
                  ]}
                  value={values.unit}
                  onChange={(unit) => set('unit', unit)}
                />
              </div>
            </div>
            {errors.every && <span className={`mt-1.5 ${errorClass}`}>{errors.every}</span>}
            {preview && <p className="mt-2.5 rounded-[14px] bg-hint px-3.5 py-3 text-sm leading-normal font-semibold text-ink">{preview}</p>}
          </fieldset>

          <fieldset className="flex flex-col gap-2.5">
            <legend className={`${labelClass} mb-2`}>Días</legend>
            <Segmented<'all' | 'some'>
              label="Días"
              options={[
                { value: 'all', label: 'Todos los días' },
                { value: 'some', label: 'Ciertos días' },
              ]}
              value={values.daysMode}
              onChange={(mode) => set('daysMode', mode)}
            />
            {values.daysMode === 'some' && (
              <>
                <WeekdayBar value={values.weekdays} onToggle={toggleDay} />
                {errors.weekdays && <span className={errorClass}>{errors.weekdays}</span>}
              </>
            )}
          </fieldset>
        </>
      ) : (
        <>
          <fieldset className="flex flex-col gap-2.5">
            <legend className={`${labelClass} mb-2`}>Cada cuánto</legend>
            {PERIOD_OPTIONS.map((option) => {
              const on = values.period === option.value
              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-[14px] px-4 py-3.5 ${
                    on ? 'border-2 border-ink bg-hint px-[15px] py-[13px]' : 'border-[1.5px] border-slate-300 bg-surface'
                  } has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-action has-[:focus-visible]:ring-offset-2`}
                >
                  <input
                    type="radio"
                    name="routine-period"
                    value={option.value}
                    checked={on}
                    onChange={() => set('period', option.value)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-ink' : 'border-slate-500'}`}
                  >
                    {on && <span className="h-2.5 w-2.5 rounded-full bg-ink" />}
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-base font-extrabold text-ink">{option.label}</span>
                    <span className="text-sm leading-snug text-body">{option.desc}</span>
                  </span>
                </label>
              )
            })}
          </fieldset>

          {values.period === 'weekdays' && (
            <fieldset className="flex flex-col">
              <legend className={`${labelClass} mb-2`}>Días</legend>
              <WeekdayBar value={values.weekdays} onToggle={toggleDay} />
              {errors.weekdays && <span className={`mt-1.5 ${errorClass}`}>{errors.weekdays}</span>}
            </fieldset>
          )}

          <div className="flex flex-col gap-2.5">
            <span className={labelClass}>Horas</span>
            {values.times.map((time, index) => (
              <div key={index} className="flex gap-2.5">
                <input
                  type="time"
                  value={time}
                  onChange={(e) => updateTime(index, e.target.value)}
                  aria-label={values.times.length > 1 ? `Hora ${index + 1}` : 'Hora'}
                  aria-invalid={errors.times ? true : undefined}
                  className={`${fieldRoutine} flex-1 ${fieldBorder(!!errors.times)}`}
                />
                {values.times.length > 1 && (
                  <button
                    type="button"
                    onClick={() => set('times', values.times.filter((_, i) => i !== index))}
                    aria-label={`Quitar la hora ${time || index + 1}`}
                    className="min-h-12 shrink-0 cursor-pointer rounded-2xl border-2 border-red-700 px-4 text-[15px] font-extrabold text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2"
                  >
                    Quitar
                  </button>
                )}
              </div>
            ))}
            {errors.times && <span className={errorClass}>{errors.times}</span>}
            <span className="text-[13px] font-medium text-slate-600">{full ? 'Ya son seis horas, el máximo.' : 'De una a seis horas.'}</span>
            {!full && (
              <button
                type="button"
                onClick={() => set('times', [...values.times, ''])}
                className="min-h-12 cursor-pointer rounded-[14px] border-2 border-dashed border-hint-border text-[15px] font-extrabold text-action hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
              >
                + Agregar otra hora
              </button>
            )}
          </div>
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="routine-first-date" className={labelClass}>
          {activity ? 'Fecha de inicio' : 'Primera toma'}
        </label>
        <input
          id="routine-first-date"
          type="date"
          value={values.firstDate}
          onChange={(e) => set('firstDate', e.target.value)}
          aria-invalid={errors.firstDate ? true : undefined}
          className={`${fieldRoutine} ${fieldBorder(!!errors.firstDate)}`}
        />
        {errors.firstDate && <span className={errorClass}>{errors.firstDate}</span>}
      </div>

      <fieldset className="flex flex-col">
        <legend className={`${labelClass} mb-2`}>Fecha de fin</legend>
        <Segmented<'none' | 'date'>
          label="Fecha de fin"
          options={[
            { value: 'none', label: 'Sin fin' },
            { value: 'date', label: 'Hasta una fecha' },
          ]}
          value={values.endMode}
          onChange={(mode) => set('endMode', mode)}
        />
        {values.endMode === 'none' && <span className="mt-1.5 text-[13px] font-medium text-slate-600">Se repite hasta que la pauses o la finalices.</span>}
        {values.endMode === 'date' && (
          <input
            type="date"
            value={values.endDate}
            onChange={(e) => set('endDate', e.target.value)}
            aria-label={activity ? 'Último día' : 'Última toma el'}
            aria-invalid={errors.endDate ? true : undefined}
            className={`${fieldRoutine} mt-2.5 ${fieldBorder(!!errors.endDate)}`}
          />
        )}
        {errors.endDate && <span className={`mt-1.5 ${errorClass}`}>{errors.endDate}</span>}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="routine-note" className={labelClass}>
          Nota <span className="font-medium text-slate-600">(opcional)</span>
        </label>
        <textarea
          id="routine-note"
          rows={3}
          value={values.note}
          onChange={(e) => set('note', e.target.value)}
          className={`${fieldRoutineMultiline} resize-y border-slate-300`}
        />
        <span className="text-[13px] font-medium text-slate-600">{personal ? 'Solo la ves tú.' : 'La ve toda la familia.'}</span>
      </div>

      <p className="text-sm leading-relaxed text-slate-600">
        {activity
          ? 'PediTrack guarda lo que escribas tal cual: no revisa el nombre, el horario ni cada cuánto.'
          : 'PediTrack guarda lo que escribas tal cual: no revisa el nombre, la cantidad ni el horario.'}
      </p>

      {notice && <Notice tone="error">{notice}</Notice>}

      <div className="flex flex-wrap justify-end gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-12 flex-[1_1_120px] cursor-pointer rounded-2xl border-2 border-action px-5 text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="min-h-12 flex-[2_1_180px] cursor-pointer rounded-2xl bg-confirmed px-7 text-base font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-confirmed focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Guardando…' : editing ? 'Guardar cambios' : activity ? 'Guardar actividad' : 'Guardar suplemento'}
        </button>
      </div>
    </form>
  )
}
