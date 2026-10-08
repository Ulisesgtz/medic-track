import { TimeField } from '../../shared/ui/TimeField'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { errorClass, fieldBorder, fieldRoutine, labelClass } from '../../shared/ui/formStyles'
import {
  MAX_NOTICES,
  NOTICE_EXAMPLES,
  leadMinutesOf,
  noticeFireAt,
  noticeLabel,
  pastNoticesNote,
  pastWhen,
  sameNotice,
  startsAtOf,
  whenText,
  type NoticeUnit,
} from './appointmentText'
import type { AppointmentErrors, AppointmentValues } from './appointmentValues'
import type { NoticeInput } from './types'

interface AppointmentFieldsProps {
  value: AppointmentValues
  onChange: (next: AppointmentValues) => void
  errors: AppointmentErrors
  /** «(opcional)» next to the title and the help line: only in «Nueva consulta», where the field can stay empty. */
  optional?: boolean
  help?: string
  /** The free plan: the fields are shown but can't be used, with a link to the plan (mock C4). */
  disabled?: boolean
  /** The clock, for «era hoy» and the notices that already passed (injected by tests). */
  now?: Date
}

const rowField = `${fieldRoutine} flex-1`

/**
 * The «Próxima cita» fields (mock CitaCampos), shared by «Nueva consulta», «Editar cita» and «Agregar próxima cita»: date,
 * time, a note and the notices as editable chips — the two by default are visible from the start. «+ Agregar aviso» opens a
 * small panel (time before, or a fixed hour some days before) with examples that only fill the field. At most 5; a notice that
 * already passed is dashed with a note, never in an alarm color. The words are the parent's: nothing is suggested (Principio I).
 */
export function AppointmentFields({ value, onChange, errors, optional, help, disabled, now = new Date() }: AppointmentFieldsProps) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const start = startsAtOf(value.date, value.time)

  const set = (patch: Partial<AppointmentValues>) => onChange({ ...value, ...patch })

  const heading = (
    <div className="flex flex-col gap-1">
      <h3 className="text-lg font-black tracking-[-0.02em] text-ink">
        Próxima cita {optional && <span className="text-[15px] font-medium text-slate-600">(opcional)</span>}
      </h3>
      {help && <p className="text-sm leading-normal text-slate-600">{help}</p>}
    </div>
  )

  if (disabled) {
    return (
      <div className="flex flex-col gap-[18px]">
        {heading}
        <div className="flex flex-wrap gap-2.5">
          <div className="flex min-w-0 flex-[1_1_170px] flex-col gap-1.5">
            <span className="text-[13px] font-bold text-slate-600">Fecha de la cita</span>
            <input disabled aria-describedby="plan-cita" placeholder="dd mmm aaaa" className="min-h-12 rounded-[14px] border-[1.5px] border-slate-300 bg-slate-100 px-4 text-base text-slate-600" />
          </div>
          <div className="flex min-w-0 flex-[1_1_120px] flex-col gap-1.5">
            <span className="text-[13px] font-bold text-slate-600">Hora de la cita</span>
            <input disabled placeholder="hh:mm" className="min-h-12 rounded-[14px] border-[1.5px] border-slate-300 bg-slate-100 px-4 text-base text-slate-600" />
          </div>
        </div>
        <div
          id="plan-cita"
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-[14px] border-[1.5px] border-hint-border bg-hint px-4 py-3.5"
        >
          <span className="text-[15px] font-extrabold text-ink">Disponible en el plan completo</span>
          <Link to="/planes" className="inline-flex min-h-11 items-center text-[15px] font-extrabold text-action hover:underline">
            Ver el plan completo →
          </Link>
        </div>
      </div>
    )
  }

  const pastItems = start
    ? value.notices.flatMap((n) => {
        const fire = noticeFireAt(start, n)
        return fire && fire <= now ? [{ label: noticeLabel(n), fire }] : []
      })
    : []
  const pastNote = pastNoticesNote(pastItems, now)

  const saveNotice = (n: NoticeInput) => {
    const next = editing === null ? [...value.notices, n] : value.notices.map((old, i) => (i === editing ? n : old))
    onChange({ ...value, notices: next })
    setAdding(false)
    setEditing(null)
  }

  return (
    <div className="flex flex-col gap-[18px]">
      {heading}

      <div className="flex flex-wrap gap-2.5">
        <div className="flex min-w-0 flex-[1_1_170px] flex-col gap-1.5">
          <label htmlFor="appointment-date" className={labelClass}>
            Fecha de la cita
          </label>
          <input
            id="appointment-date"
            type="date"
            value={value.date}
            onChange={(e) => set({ date: e.target.value })}
            aria-invalid={errors.date ? true : undefined}
            aria-describedby={errors.date ? 'appointment-date-error' : undefined}
            className={`${rowField} ${fieldBorder(!!errors.date)}`}
          />
        </div>
        <div className="flex min-w-0 flex-[1_1_120px] flex-col gap-1.5">
          <label htmlFor="appointment-time" className={labelClass}>
            Hora de la cita
          </label>
          <TimeField
            id="appointment-time"
            value={value.time}
            onChange={(time) => set({ time })}
            invalid={!!errors.time}
            describedBy={errors.time ? 'appointment-time-error' : undefined}
            align="end"
          />
        </div>
      </div>
      {errors.date && (
        <span id="appointment-date-error" className={`-mt-2.5 ${errorClass}`}>
          {errors.date}
        </span>
      )}
      {errors.time && (
        <span id="appointment-time-error" className={`-mt-2.5 ${errorClass}`}>
          {errors.time}
        </span>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="appointment-note" className={labelClass}>
          Nota <span className="font-medium text-slate-600">(opcional)</span>
        </label>
        <input
          id="appointment-note"
          type="text"
          value={value.note}
          onChange={(e) => set({ note: e.target.value })}
          placeholder="Lo que quieras recordar de la cita"
          autoComplete="off"
          className={`${fieldRoutine} border-slate-300`}
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-0.5">
          <span className={labelClass}>Avisos</span>
          <span className="text-[13px] leading-snug font-medium text-slate-600">
            Llegan a cada persona de la familia que tenga sus avisos activados. Toca uno para cambiarlo.
          </span>
        </div>
        <ul className="flex flex-wrap gap-2">
          {value.notices.map((n, index) => {
            const fire = start ? noticeFireAt(start, n) : null
            const past = fire !== null && fire <= now
            const label = noticeLabel(n)
            return (
              <li
                key={`${label}-${index}`}
                className={`inline-flex items-center rounded-xl ${
                  past ? 'border-[1.5px] border-dashed border-slate-500 bg-slate-100' : 'border-[1.5px] border-hint-border bg-hint'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setEditing(index)
                    setAdding(true)
                  }}
                  aria-label={`Cambiar aviso «${label}»`}
                  className="flex min-h-11 flex-col items-start justify-center py-1 pr-0.5 pl-3.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
                >
                  <span className={`text-[15px] font-extrabold ${past ? 'text-slate-600' : 'text-action'}`}>{label}</span>
                  {fire && <span className="text-[13px] font-semibold text-slate-600">{past ? pastWhen(fire, now) : whenText(fire)}</span>}
                </button>
                <button
                  type="button"
                  aria-label={`Quitar aviso «${label}»`}
                  onClick={() => {
                    onChange({ ...value, notices: value.notices.filter((_, i) => i !== index) })
                    setAdding(false)
                    setEditing(null)
                  }}
                  className={`h-11 w-11 cursor-pointer rounded-xl text-xl font-bold hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-action ${past ? 'text-slate-600' : 'text-action'}`}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            )
          })}
        </ul>
        {pastNote && (
          <p role="status" className="rounded-[14px] border-[1.5px] border-hint-border bg-hint px-3.5 py-3 text-sm leading-normal text-body">
            {pastNote}
          </p>
        )}
        {!adding && value.notices.length < MAX_NOTICES && (
          <button
            type="button"
            onClick={() => {
              setEditing(null)
              setAdding(true)
            }}
            className="min-h-12 cursor-pointer rounded-[14px] border-2 border-dashed border-hint-border text-[15px] font-extrabold text-action hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
          >
            + Agregar aviso
          </button>
        )}
        {!adding && value.notices.length >= MAX_NOTICES && (
          <p role="status" className="text-sm leading-normal font-semibold text-slate-600">
            Son 5 avisos, el máximo. Para agregar otro, quita uno.
          </p>
        )}
        {adding && (
          <NoticePanel
            key={editing ?? 'new'}
            initial={editing === null ? null : value.notices[editing]}
            start={start}
            existing={value.notices.filter((_, i) => i !== editing)}
            onSave={saveNotice}
            onDiscard={() => {
              setAdding(false)
              setEditing(null)
            }}
          />
        )}
      </div>
    </div>
  )
}

interface NoticePanelProps {
  initial: NoticeInput | null
  start: Date | null
  existing: NoticeInput[]
  onSave: (n: NoticeInput) => void
  onDiscard: () => void
}

function unitOf(minutes: number): { amount: string; unit: NoticeUnit } {
  if (minutes % 1440 === 0) return { amount: String(minutes / 1440), unit: 'dias' }
  if (minutes % 60 === 0) return { amount: String(minutes / 60), unit: 'horas' }
  return { amount: String(minutes), unit: 'minutos' }
}

/** «Nuevo aviso» (mock E2): time before, or a fixed hour some days before; the examples only fill the fields. */
function NoticePanel({ initial, start, existing, onSave, onDiscard }: NoticePanelProps) {
  const initialLead = initial?.kind === 'before' && initial.leadMinutes ? unitOf(initial.leadMinutes) : { amount: '3', unit: 'horas' as NoticeUnit }
  const [kind, setKind] = useState<NoticeInput['kind']>(initial?.kind ?? 'before')
  const [amount, setAmount] = useState(initialLead.amount)
  const [unit, setUnit] = useState<NoticeUnit>(initialLead.unit)
  const [days, setDays] = useState(initial?.kind === 'at_time' ? String(initial.daysBefore) : '1')
  const [atTime, setAtTime] = useState(initial?.atTime ?? '20:00')
  const [error, setError] = useState<string | null>(null)

  const build = (): NoticeInput | null => {
    if (kind === 'before') {
      const minutes = leadMinutesOf(amount, unit)
      return minutes === null ? null : { kind: 'before', leadMinutes: minutes, daysBefore: null, atTime: null }
    }
    if (!/^\d{1,2}$/.test(days.trim()) || Number(days) > 30 || !/^\d{2}:\d{2}$/.test(atTime)) return null
    return { kind: 'at_time', leadMinutes: null, daysBefore: Number(days), atTime }
  }
  const draft = build()
  const fire = draft && start ? noticeFireAt(start, draft) : null

  const fill = (n: NoticeInput) => {
    setKind(n.kind)
    if (n.kind === 'before' && n.leadMinutes) {
      const u = unitOf(n.leadMinutes)
      setAmount(u.amount)
      setUnit(u.unit)
    } else {
      setDays(String(n.daysBefore))
      setAtTime(n.atTime ?? '20:00')
    }
    setError(null)
  }

  const save = () => {
    if (!draft) {
      setError(kind === 'before' ? 'Escribe una cantidad entera, hasta 30 días.' : 'Escribe los días (0 a 30) y la hora.')
      return
    }
    if (existing.some((n) => sameNotice(n, draft))) {
      setError('Ese aviso ya está en la lista.')
      return
    }
    if (start && fire && fire >= start) {
      setError('Un aviso no puede caer después de la cita.')
      return
    }
    onSave(draft)
  }

  const option = (value: NoticeInput['kind'], text: string) => (
    <button
      key={value}
      type="button"
      role="radio"
      aria-checked={kind === value}
      onClick={() => setKind(value)}
      className={`min-h-11 cursor-pointer text-sm font-extrabold focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-inset ${
        kind === value ? 'bg-ink text-white' : 'bg-surface text-ink hover:bg-hint'
      }`}
    >
      {text}
    </button>
  )

  return (
    <div className="flex flex-col gap-3.5 rounded-[14px] border-2 border-ink bg-surface p-4">
      <p className="text-[15px] font-extrabold text-ink">Nuevo aviso</p>
      <div role="radiogroup" aria-label="Tipo de aviso" className="grid grid-cols-2 overflow-hidden rounded-[14px] border-[1.5px] border-slate-300">
        {option('before', 'Tiempo antes')}
        {option('at_time', 'A una hora fija')}
      </div>
      {kind === 'before' ? (
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            aria-label="Cantidad"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="min-h-12 w-20 rounded-[14px] border-2 border-ink bg-surface px-3.5 text-base font-medium text-ink focus:outline-none"
          />
          <select
            aria-label="Unidad"
            value={unit}
            onChange={(e) => setUnit(e.target.value as NoticeUnit)}
            className="min-h-12 min-w-[120px] rounded-[14px] border-[1.5px] border-slate-300 bg-surface px-3 text-base font-medium text-ink"
          >
            <option value="horas">horas</option>
            <option value="minutos">minutos</option>
            <option value="dias">días</option>
          </select>
          <span className="text-base font-bold text-ink">antes</span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={30}
            aria-label="Días antes"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="min-h-12 w-20 rounded-[14px] border-2 border-ink bg-surface px-3.5 text-base font-medium text-ink focus:outline-none"
          />
          <span className="text-base font-bold text-ink">días antes, a las</span>
          <TimeField ariaLabel="Hora del aviso" value={atTime} onChange={setAtTime} align="end" />
        </div>
      )}
      {fire && <p className="text-sm font-semibold text-body">Llegaría el {whenText(fire).replace(', ', ' a las ')}.</p>}
      {error && (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-bold text-ink">Ejemplos</span>
        <div className="flex flex-wrap gap-2">
          {NOTICE_EXAMPLES.map((example) => (
            <button
              key={example.label}
              type="button"
              onClick={() => fill(example.notice)}
              className="min-h-11 cursor-pointer rounded-xl border-[1.5px] border-slate-300 bg-surface px-3.5 text-sm font-bold text-ink hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
            >
              {example.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={save}
          className="min-h-11 flex-[1_1_160px] cursor-pointer rounded-2xl border-2 border-action px-[18px] text-[15px] font-extrabold text-action hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
        >
          {initial ? 'Guardar este aviso' : 'Agregar este aviso'}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="min-h-11 cursor-pointer rounded-2xl px-3.5 text-[15px] font-extrabold text-action underline hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
        >
          Descartar
        </button>
      </div>
    </div>
  )
}
