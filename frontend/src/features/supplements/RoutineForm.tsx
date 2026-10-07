import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { errorClass, fieldBorder, fieldRoutine, fieldRoutineMultiline, labelClass } from '../../shared/ui/formStyles'
import { Notice } from '../../shared/ui/Notice'
import { SupplementApiError } from './api'
import { FIELD_OF_SERVER, SERVER_MESSAGES, newRoutineValues, toInput, validateValues, valuesOf, type FieldErrors, type FormValues } from './routineValues'
import { PERIOD_OPTIONS, WEEKDAY_SEGMENTS, intervalPreview } from './scheduleText'
import type { Routine, RoutineInput } from './types'

interface RoutineFormProps {
  /** The routine being edited; absent when creating. */
  routine?: Routine
  /** Saves it; rejects with a `SupplementApiError` (field errors are drawn next to their field, the plan is the caller's). */
  onSubmit: (input: RoutineInput) => Promise<void>
  onCancel: () => void
  /** The server answered that the plan isn't paid: the caller opens the plan notice, the typed data stays. */
  onPlanRequired: () => void
  /** Whether anything was typed that leaving would lose. */
  onDirtyChange?: (dirty: boolean) => void
  /** A routine of the person's own (specs/033, part 3): says nobody else sees it. */
  personal?: boolean
}

/**
 * Create and edit a routine (mock RutinaForm), one form for the three periodicities: the fields change with «Cada cuánto».
 * It records what the parent writes exactly: no example in the fields, no check of the name, the amount or the time
 * (Principio I) — it says so in the fixed sentence under the form. Errors go under their field.
 */
export function RoutineForm({ routine, onSubmit, onCancel, onPlanRequired, onDirtyChange, personal = false }: RoutineFormProps) {
  const editing = routine !== undefined
  const initial = useMemo(() => (routine ? valuesOf(routine) : newRoutineValues()), [routine])
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
          if (field) next[field] = SERVER_MESSAGES[d.field]
        }
        setErrors(next)
        if (Object.keys(next).length === 0) setNotice('No se pudo guardar la rutina. Revisa los datos e inténtalo de nuevo.')
      } else if (error instanceof SupplementApiError && error.kind === 'plan_required') {
        onPlanRequired()
      } else if (error instanceof SupplementApiError && error.kind === 'routine_limit') {
        setNotice('Este hijo ya tiene el máximo de rutinas activas. Pausa o finaliza una para poder agregar otra.')
      } else if (error instanceof SupplementApiError && error.kind === 'routine_ended') {
        setNotice('Esta rutina ya terminó y no se puede editar. Para volver a registrarla, crea una rutina nueva.')
      } else {
        setNotice('No se pudo guardar la rutina. Inténtalo de nuevo.')
      }
    } finally {
      setSaving(false)
    }
  }

  const interval = values.period === 'interval'
  const preview = interval ? intervalPreview(values.firstTime, Number(values.everyN)) : null

  const updateTime = (index: number, value: string) => set('times', values.times.map((t, i) => (i === index ? value : t)))
  const toggleDay = (day: number) =>
    set('weekdays', values.weekdays.includes(day) ? values.weekdays.filter((d) => d !== day) : [...values.weekdays, day])

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="flex flex-col gap-[22px] rounded-[22px] bg-surface px-[18px] py-5 shadow-[0_8px_20px_rgba(4,37,43,0.07)]"
    >
      {(editing || personal) && (
        <p role="note" className="rounded-[14px] border-[1.5px] border-hint-border bg-hint px-4 py-3.5 text-sm leading-normal text-body">
          {personal && 'Es una rutina personal: solo tú la ves y solo a ti te llegan sus avisos.'}
          {personal && editing && ' '}
          {editing && 'Los cambios cuentan desde la siguiente toma. Las tomas ya marcadas no cambian.'}
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
          placeholder="Como lo llaman en casa"
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
          <div className="grid grid-cols-7 overflow-hidden rounded-[14px] border-[1.5px] border-slate-300">
            {WEEKDAY_SEGMENTS.map((segment, day) => {
              const on = values.weekdays.includes(day)
              return (
                <button
                  key={segment.l}
                  type="button"
                  aria-pressed={on}
                  aria-label={segment.full}
                  onClick={() => toggleDay(day)}
                  className={`min-h-12 min-w-0 cursor-pointer text-sm font-extrabold focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-inset ${
                    on ? 'bg-ink text-white' : 'bg-surface text-ink hover:bg-hint'
                  }`}
                >
                  {segment.l}
                </button>
              )
            })}
          </div>
          {errors.weekdays && <span className={`mt-1.5 ${errorClass}`}>{errors.weekdays}</span>}
        </fieldset>
      )}

      {!interval && (
        <div className="flex flex-col gap-2.5">
          <span className={labelClass}>Hora del día</span>
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
          {values.times.length < 6 && (
            <button
              type="button"
              onClick={() => set('times', [...values.times, ''])}
              className="min-h-12 cursor-pointer rounded-[14px] border-2 border-dashed border-hint-border text-[15px] font-extrabold text-action hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
            >
              + Agregar otra hora
            </button>
          )}
        </div>
      )}

      {interval && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="routine-every" className={labelClass}>
            Cada cuántas horas
          </label>
          <div className="flex items-center gap-2.5">
            <span className="text-base font-bold text-ink">Cada</span>
            <input
              id="routine-every"
              type="number"
              inputMode="numeric"
              min={1}
              max={24}
              value={values.everyN}
              onChange={(e) => set('everyN', e.target.value)}
              aria-invalid={errors.everyN ? true : undefined}
              aria-describedby="routine-every-help"
              className={`${fieldRoutine} !w-[88px] ${fieldBorder(!!errors.everyN)}`}
            />
            <span className="text-base font-bold text-ink">horas</span>
          </div>
          <span id="routine-every-help" className={errors.everyN ? errorClass : 'text-[13px] font-medium text-slate-600'}>
            {errors.everyN ?? 'De 1 a 24.'}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Primera toma</span>
        <div className="flex flex-wrap gap-2.5">
          <input
            type="date"
            value={values.firstDate}
            onChange={(e) => set('firstDate', e.target.value)}
            aria-label="Fecha de la primera toma"
            aria-invalid={errors.firstDate ? true : undefined}
            className={`${fieldRoutine} flex-[1_1_160px] ${fieldBorder(!!errors.firstDate)}`}
          />
          {interval && (
            <input
              type="time"
              value={values.firstTime}
              onChange={(e) => set('firstTime', e.target.value)}
              aria-label="Hora de la primera toma"
              aria-invalid={errors.firstTime ? true : undefined}
              className={`${fieldRoutine} flex-[1_1_110px] ${fieldBorder(!!errors.firstTime)}`}
            />
          )}
        </div>
        {errors.firstDate && <span className={errorClass}>{errors.firstDate}</span>}
        {errors.firstTime && <span className={errorClass}>{errors.firstTime}</span>}
        {preview && <p className="mt-2.5 rounded-[14px] bg-hint px-3.5 py-3 text-sm leading-normal font-semibold text-ink">{preview}</p>}
      </div>

      <fieldset className="flex flex-col">
        <legend className={`${labelClass} mb-2`}>Fecha de fin</legend>
        <div role="radiogroup" aria-label="Fecha de fin" className="grid grid-cols-2 overflow-hidden rounded-[14px] border-[1.5px] border-slate-300">
          {(
            [
              ['none', 'Sin fin'],
              ['date', 'Hasta una fecha'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={values.endMode === mode}
              onClick={() => set('endMode', mode)}
              className={`min-h-12 cursor-pointer text-[15px] font-extrabold focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-inset ${
                values.endMode === mode ? 'bg-ink text-white' : 'bg-surface text-ink hover:bg-hint'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {values.endMode === 'none' && <span className="mt-1.5 text-[13px] font-medium text-slate-600">Se repite hasta que la pauses o la finalices.</span>}
        {values.endMode === 'date' && (
          <input
            type="date"
            value={values.endDate}
            onChange={(e) => set('endDate', e.target.value)}
            aria-label="Última toma el"
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
          placeholder="Lo que quieras recordar al darla"
          className={`${fieldRoutineMultiline} resize-y border-slate-300`}
        />
        <span className="text-[13px] font-medium text-slate-600">{personal ? 'Solo la ves tú.' : 'La ve toda la familia.'}</span>
      </div>

      <p className="text-sm leading-relaxed text-slate-600">
        PediTrack guarda lo que escribas tal cual: no revisa el nombre, la cantidad ni el horario.
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
          {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar rutina'}
        </button>
      </div>
    </form>
  )
}
