import { useEffect, useId, useRef, useState, type Ref } from 'react'
import { useIsDesktop } from './useIsDesktop'

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))
/** Every five minutes: the finest «cada» an activity accepts, and enough for any appointment or hour of a routine. */
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

const chipBase =
  'min-h-11 min-w-0 cursor-pointer rounded-xl border-[1.5px] text-base tabular-nums transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-1'
const chipOff = 'border-slate-300 bg-surface font-bold text-ink hover:border-hint-border hover:bg-hint'
/** The chosen one: `action` with white text, and — a second indicator besides the color — underlined and with a ✓. */
const chipOn = 'relative border-action bg-action font-extrabold text-white underline decoration-2 underline-offset-4'

/** One hour or minute button; `focusRef` marks the one that takes the focus when the panel opens. */
function Chip({ label, on, onPick, focusRef }: { label: string; on: boolean; onPick: () => void; focusRef?: Ref<HTMLButtonElement> }) {
  return (
    <button ref={focusRef} type="button" aria-pressed={on} onClick={onPick} className={`${chipBase} ${on ? chipOn : chipOff}`}>
      {label}
      {on && (
        <span aria-hidden="true" className="absolute top-px right-1 text-[11px] leading-[1.2] no-underline">
          ✓
        </span>
      )}
    </button>
  )
}

/**
 * The hour picker of the app's forms (the delivered design «Hora fija y selector de hora»): a compact 148 px field that says
 * «Elegir hora» while it is empty — never a suggested hour — or «08:30», and opens a panel with every hour (00–23) and every five
 * minutes as buttons: one tap each, the same on the phone and on the web, in place of the browser's own time popup. The value is
 * always «HH:MM» or «».
 *
 * With no value yet the hour waits for its minutes: the panel says «10:—» and stays open until the minutes are chosen, which sets
 * the value and closes it; closing it any other way («Listo», Escape, a tap outside) with only the hour chosen means «:00». With a
 * value, changing the hour changes the value at once. The field's name comes from a `<label htmlFor={id}>` or from `ariaLabel`.
 * `panelWidth` is the width the panel has (it spans its card: 314 on the phone, 372 on the web by default), `cols` the buttons per
 * row (6; 4 for a narrow card) and `align` the edge of the field the panel hangs from («end» for a field at the right of a row).
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
  panelWidth,
  cols = 6,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  /** The field's name when there is no `<label htmlFor>` for it. */
  ariaLabel?: string
  invalid?: boolean
  describedBy?: string
  align?: 'start' | 'end'
  placeholder?: string
  panelWidth?: number
  cols?: 4 | 6
}) {
  const autoId = useId()
  const fieldId = id ?? `time-${autoId}`
  const valueId = `${fieldId}-value`
  const isDesktop = useIsDesktop()
  const width = panelWidth ?? (isDesktop ? 372 : 314)
  const [open, setOpen] = useState(false)
  // What was chosen in the open panel before there is a whole value: the hour waits for its minutes and the other way round.
  const [draftHour, setDraftHour] = useState<string | null>(null)
  const [draftMinute, setDraftMinute] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLButtonElement>(null)
  const hourRef = useRef<HTMLButtonElement>(null)

  const [valueHour, valueMinute] = /^\d{2}:\d{2}$/.test(value) ? value.split(':') : [null, null]
  const hour = valueHour ?? draftHour
  const minute = valueMinute ?? draftMinute
  const shown = hour === null ? '' : `${hour}:${minute ?? '—'}`

  // Closing: what was only half chosen is settled (an hour alone is «:00»); a minute alone with no hour is dropped.
  function close() {
    if (open && valueHour === null && draftHour !== null) onChange(`${draftHour}:${draftMinute ?? '00'}`)
    setOpen(false)
    setDraftHour(null)
    setDraftMinute(null)
    fieldRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    function away(event: Event) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close()
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('touchstart', away)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('touchstart', away)
    }
    // `close` reads the draft: the listener is renewed with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draftHour, draftMinute, valueHour])

  useEffect(() => {
    if (open) hourRef.current?.focus()
  }, [open])

  function pickHour(h: string) {
    if (valueHour !== null) {
      onChange(`${h}:${valueMinute}`)
      return
    }
    if (draftMinute !== null) {
      onChange(`${h}:${draftMinute}`)
      setOpen(false)
      setDraftHour(null)
      setDraftMinute(null)
      fieldRef.current?.focus()
      return
    }
    setDraftHour(h)
  }

  function pickMinute(m: string) {
    const h = hour
    if (h === null) {
      setDraftMinute(m)
      return
    }
    onChange(`${h}:${m}`)
    setOpen(false)
    setDraftHour(null)
    setDraftMinute(null)
    fieldRef.current?.focus()
  }

  const gridCols = cols === 4 ? 'grid-cols-4' : 'grid-cols-6'
  const fieldState = open ? 'border-2 border-ink bg-hint pr-[13px] pl-[15px]' : invalid ? 'border-2 border-red-700 bg-surface pr-[13px] pl-[15px]' : 'border-[1.5px] border-slate-300 bg-surface pr-3.5 pl-4 hover:border-action'
  const arrowColor = open ? 'text-ink' : invalid ? 'text-red-700' : 'text-action'

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
        onClick={() => (open ? close() : setOpen(true))}
        className={`flex min-h-12 w-[148px] max-w-full cursor-pointer items-center justify-between gap-2 rounded-[14px] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 ${fieldState}`}
      >
        <span id={valueId} className={shown ? 'text-[17px] font-extrabold text-ink tabular-nums' : 'text-base font-medium text-slate-600'}>
          {shown || placeholder}
        </span>
        <span aria-hidden="true" className={`text-xs ${arrowColor}`}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Elegir hora"
          style={{ width }}
          className={`absolute top-14 z-30 flex max-w-[calc(100vw-32px)] flex-col gap-3.5 rounded-[18px] border-[1.5px] border-hint-border bg-surface px-3.5 pt-4 pb-3.5 shadow-[0_16px_40px_rgba(4,37,43,0.2)] ${
            align === 'end' ? 'right-0' : 'left-0'
          }`}
        >
          <div role="group" aria-label="Hora" className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-extrabold text-ink">Hora</span>
              <span className="text-[15px] font-extrabold text-action tabular-nums">{shown || '—:—'}</span>
            </div>
            <div className={`grid gap-1.5 ${gridCols}`}>
              {HOURS.map((h) => (
                <Chip key={h} label={h} on={hour === h} onPick={() => pickHour(h)} focusRef={h === (hour ?? '08') ? hourRef : undefined} />
              ))}
            </div>
          </div>
          <div role="group" aria-label="Minutos" className="flex flex-col gap-2">
            <span className="text-[13px] font-extrabold text-ink">Minutos</span>
            <div className={`grid gap-1.5 ${gridCols}`}>
              {MINUTES.map((m) => (
                <Chip key={m} label={m} on={minute === m} onPick={() => pickMinute(m)} />
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="min-h-11 min-w-[110px] cursor-pointer self-end rounded-2xl border-2 border-action px-5 text-[15px] font-extrabold text-action transition-colors duration-150 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-1"
          >
            Listo
          </button>
        </div>
      )}
    </div>
  )
}
