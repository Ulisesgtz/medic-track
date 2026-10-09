import { useEffect, useId, useRef, useState } from 'react'
import { fieldBorder } from './formStyles'

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))
/** Every five minutes: the finest «cada» an activity accepts, and enough for any appointment or hour of a routine. */
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

const chip =
  'min-h-11 min-w-0 cursor-pointer rounded-xl border text-[15px] font-bold tabular-nums transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-1'
const chipOn = 'border-ink bg-ink text-white'
const chipOff = 'border-hint-edge bg-surface text-ink hover:bg-hint'

/**
 * The hour picker of the app's forms (the grid of the delivered options, «A»): a compact field that shows «08:30» and opens a panel
 * with every hour (00–23) and every five minutes as buttons — one tap each, the same on the phone and on the web, in place of the
 * browser's own time popup (a long scrolling list on a computer). It starts EMPTY (no hour is suggested). The value is always
 * «HH:MM» or «». The field's name comes from a `<label htmlFor={id}>` next to it or from `ariaLabel`; the panel is closed by
 * Escape, by a tap outside and by «Listo»; choosing a minute after an hour closes it too.
 */
export function TimeField({
  id,
  value,
  onChange,
  ariaLabel,
  invalid = false,
  describedBy,
  align = 'start',
  placeholder = 'Elegir hora',
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  /** The field's name when there is no `<label htmlFor>` for it. */
  ariaLabel?: string
  invalid?: boolean
  describedBy?: string
  /** Which edge of the field the panel hangs from: «end» for a field at the right of the row, so it doesn't leave the screen. */
  align?: 'start' | 'end'
  placeholder?: string
}) {
  const autoId = useId()
  const fieldId = id ?? `time-${autoId}`
  const valueId = `${fieldId}-value`
  const [open, setOpen] = useState(false)
  // A minute chosen before any hour waits for it.
  const [pendingMinute, setPendingMinute] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLButtonElement>(null)
  const hourRef = useRef<HTMLButtonElement>(null)

  const [hour, minute] = /^\d{2}:\d{2}$/.test(value) ? value.split(':') : [null, null]

  useEffect(() => {
    if (!open) return
    function away(event: Event) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('touchstart', away)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('touchstart', away)
    }
  }, [open])

  useEffect(() => {
    if (open) hourRef.current?.focus()
  }, [open])

  function close() {
    setOpen(false)
    setPendingMinute(null)
    fieldRef.current?.focus()
  }

  function pickHour(h: string) {
    onChange(`${h}:${minute ?? pendingMinute ?? '00'}`)
    setPendingMinute(null)
  }

  function pickMinute(m: string) {
    if (hour === null) {
      setPendingMinute(m)
      return
    }
    onChange(`${hour}:${m}`)
    close()
  }

  return (
    <div
      ref={rootRef}
      className="relative inline-block max-w-full"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          close()
        }
      }}
    >
      <button
        ref={fieldRef}
        id={fieldId}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={[valueId, describedBy].filter(Boolean).join(' ')}
        onClick={() => setOpen((v) => !v)}
        className={`flex min-h-12 w-[148px] max-w-full cursor-pointer items-center justify-between gap-2 rounded-[14px] border-[1.5px] bg-surface px-3.5 text-left text-base font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 ${fieldBorder(invalid)} ${
          open ? '!border-ink' : ''
        }`}
      >
        <span id={valueId} className={`tabular-nums ${value ? 'text-ink' : 'text-slate-600'}`}>
          {value || placeholder}
        </span>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px] shrink-0 text-action" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="10" cy="10" r="7.5" />
          <path d="M10 5.5V10l3 2" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Elegir hora"
          className={`absolute z-30 mt-2 w-[312px] max-w-[calc(100vw-40px)] rounded-[18px] border-2 border-hint-border bg-surface p-3 shadow-[0_12px_28px_rgba(4,37,43,0.18)] ${
            align === 'end' ? 'right-0' : 'left-0'
          }`}
        >
          <div role="group" aria-label="Hora" className="flex flex-col gap-1.5">
            <p className="text-xs font-extrabold tracking-[0.1em] text-action uppercase">Hora</p>
            <div className="grid grid-cols-6 gap-1.5">
              {HOURS.map((h) => (
                <button
                  key={h}
                  ref={h === (hour ?? '08') ? hourRef : undefined}
                  type="button"
                  aria-pressed={hour === h}
                  onClick={() => pickHour(h)}
                  className={`${chip} ${hour === h ? chipOn : chipOff}`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
          <div role="group" aria-label="Minutos" className="mt-3 flex flex-col gap-1.5">
            <p className="text-xs font-extrabold tracking-[0.1em] text-action uppercase">Minutos</p>
            <div className="grid grid-cols-4 gap-1.5">
              {MINUTES.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={(minute ?? pendingMinute) === m}
                  onClick={() => pickMinute(m)}
                  className={`${chip} ${(minute ?? pendingMinute) === m ? chipOn : chipOff}`}
                >
                  :{m}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="mt-3 min-h-11 w-full cursor-pointer rounded-xl border-2 border-action text-[15px] font-extrabold text-action transition-colors duration-150 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-1"
          >
            Listo
          </button>
        </div>
      )}
    </div>
  )
}
