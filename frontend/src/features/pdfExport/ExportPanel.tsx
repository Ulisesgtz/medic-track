import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useSymptoms } from '../../shared/catalog/useCatalog'
import { useBodyScrollLock } from '../../shared/ui/useBodyScrollLock'
import { useIsDesktop } from '../../shared/ui/useIsDesktop'
import type { HistorySearchRequest } from '../consultations/historyCriteria'
import { PlanAvisoCompacto } from '../plans/PlanAvisoCompacto'
import { localToday } from '../vaccinations/vaccineForm'
import { fullName } from './document/model'
import { PANEL } from './exportText'
import { canGenerate, emptyPeriod, filtersSummary, fileSize, readyPeriod } from './panelModel'
import { canShareFile, downloadFile, shareFile } from './share'
import type { ExportPeriod, ExportRequest } from './types'
import { STAGES, useExport, type ExportResult, type ExportStage } from './useExport'

export interface ExportPanelProps {
  childId: string
  child: { firstName: string; lastName: string }
  /** The child's family is on the free plan: the panel opens on the plan notice and asks the server nothing. */
  free: boolean
  /** The history's current filters (only what is on); without them «Usar los filtros del historial» isn't offered. */
  filters?: HistorySearchRequest | null
  /** Where it was opened: from the vaccination card the card is on and the consultations off. */
  origin?: 'history' | 'card'
  onClose: () => void
  /** The button that opened this: focus goes back to it. */
  opener: RefObject<HTMLElement | null>
}

type PeriodKind = ExportPeriod['kind']

function stageText(stage: ExportStage, photo?: { done: number; total: number }): string {
  if (stage === 'photos' && photo) return PANEL.stagePhotos(photo.done, photo.total)
  return stage === 'data' ? PANEL.stageData : PANEL.stageDocument
}

const solid =
  'min-h-[52px] w-full cursor-pointer rounded-2xl bg-confirmed px-4 text-[17px] font-extrabold text-white transition-colors duration-200 hover:bg-confirmed-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-confirmed'
const outline =
  'min-h-[52px] w-full cursor-pointer rounded-2xl border-2 border-action bg-transparent px-4 text-[17px] font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2'
const eyebrow = 'text-xs font-extrabold tracking-[0.1em] text-action uppercase'
const privacyBox = 'rounded-2xl border-[1.5px] border-hint-border bg-hint px-4 py-3.5 text-[15px] leading-normal text-ink'

/**
 * «Exportar a PDF» (specs/050, mock ExportarPanel): what to put in the PDF, then generating, ready, nothing in the period, an error
 * or the plan notice. A real dialog (rendered into <body>, Escape, focus in and back, Tab stays inside): a sheet from the bottom on
 * the phone, a 560 px dialog on the web. The file is made on this device and handed over with the share sheet or a download.
 */
export function ExportPanel({ childId, child, free, filters, origin = 'history', onClose, opener }: ExportPanelProps) {
  const id = useId()
  const desktop = useIsDesktop()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const symptoms = useSymptoms()
  const symptomNames = useMemo(() => Object.fromEntries((symptoms.data ?? []).map((s) => [s.code, s.name])), [symptoms.data])
  const { state, generate, cancel, back, retry } = useExport({ childId, free, symptomNames })

  const summary = filtersSummary(filters, symptomNames)
  const [kind, setKind] = useState<PeriodKind>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [consultations, setConsultations] = useState(origin !== 'card')
  const [vaccinations, setVaccinations] = useState(true)
  const [photos, setPhotos] = useState(false)

  const period: ExportPeriod =
    kind === 'range' ? { kind, from, to } : kind === 'filters' && filters ? { kind, filters } : { kind: 'all' }
  const sections = { consultations, vaccinations, photos }
  const ready = canGenerate(period, sections)
  const datesTurned = kind === 'range' && from !== '' && to !== '' && to < from
  const name = fullName(child)
  const today = localToday()

  useBodyScrollLock()

  const closeLatest = useRef(onClose)
  useEffect(() => {
    closeLatest.current = onClose
  })

  useEffect(() => {
    const restoreTo = opener.current
    closeRef.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeLatest.current()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input, a[href]') ?? [])
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      restoreTo?.focus()
    }
  }, [opener])

  // A new state replaces the button that had the focus: it goes to the new state's content, which is read out.
  const shown = useRef(state.status)
  useEffect(() => {
    if (shown.current === state.status) return
    shown.current = state.status
    bodyRef.current?.focus()
  }, [state.status])

  const request: ExportRequest = { period, sections }

  let body: ReactNode
  switch (state.status) {
    case 'options':
      body = (
        <>
          <div className="flex flex-col gap-2.5">
            <p id={`${id}-period`} className={eyebrow}>
              {PANEL.period}
            </p>
            <div role="radiogroup" aria-labelledby={`${id}-period`} className="flex flex-col gap-2">
              <div className="rounded-2xl border-[1.5px] border-hint-border bg-surface">
                <Radio checked={kind === 'all'} onPick={() => setKind('all')}>
                  <span className="text-base font-bold text-ink">{PANEL.periodAll}</span>
                </Radio>
              </div>
              <div className="flex flex-col rounded-2xl border-[1.5px] border-hint-border bg-surface">
                <Radio checked={kind === 'range'} onPick={() => setKind('range')}>
                  <span className="text-base font-bold text-ink">{PANEL.periodRange}</span>
                </Radio>
                {kind === 'range' && (
                  <div className="flex flex-col gap-2 px-4 pb-4 pl-[50px]">
                    <div className="grid grid-cols-2 gap-2.5">
                      <DateField id={`${id}-from`} label={PANEL.from} value={from} max={to || today} onChange={setFrom} invalid={datesTurned} />
                      <DateField id={`${id}-to`} label={PANEL.to} value={to} max={today} onChange={setTo} invalid={datesTurned} />
                    </div>
                    {datesTurned && (
                      <p role="alert" className="text-[13px] font-semibold text-ink-soft">
                        {PANEL.fixDates}
                      </p>
                    )}
                  </div>
                )}
              </div>
              {summary && (
                <div className="rounded-2xl border-[1.5px] border-hint-border bg-surface">
                  <Radio checked={kind === 'filters'} onPick={() => setKind('filters')}>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-base font-bold text-ink">{PANEL.periodFilters}</span>
                      <span className="text-sm text-body">{summary}</span>
                    </span>
                  </Radio>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <p className={`${eyebrow} mb-1.5`}>{PANEL.include}</p>
            <Switch checked={consultations} onToggle={() => setConsultations((v) => !v)} rule>
              {PANEL.consultations}
            </Switch>
            <Switch checked={vaccinations} onToggle={() => setVaccinations((v) => !v)} rule>
              {PANEL.vaccinations}
            </Switch>
            <Switch checked={photos} onToggle={() => setPhotos((v) => !v)} hint={PANEL.photosHint}>
              {PANEL.photos}
            </Switch>
          </div>

          <p className={privacyBox}>{PANEL.privacy(child.firstName)}</p>
          <button type="button" className={solid} disabled={!ready} onClick={() => void generate(request)}>
            {PANEL.generate}
          </button>
        </>
      )
      break

    case 'generating': {
      const step = STAGES.indexOf(state.stage) + 1
      const steps = STAGES.length + 1
      body = (
        <>
          <div className="flex flex-col gap-3.5 pt-2 pb-1">
            <span className="text-[17px] font-extrabold text-ink">{PANEL.generating}</span>
            <div
              role="progressbar"
              aria-label={PANEL.generating}
              aria-valuemin={0}
              aria-valuemax={steps}
              aria-valuenow={step}
              className="h-2.5 overflow-hidden rounded-full border border-hint-border bg-hint"
            >
              <div className="h-full rounded-full bg-action transition-[width] duration-300" style={{ width: `${(step / steps) * 100}%` }} />
            </div>
            <span aria-live="polite" className="text-[15px] text-body">
              {stageText(state.stage, state.photo)}
            </span>
          </div>
          <p className={privacyBox}>{PANEL.privacy(child.firstName)}</p>
          <button type="button" className={outline} onClick={cancel}>
            {PANEL.cancel}
          </button>
        </>
      )
      break
    }

    case 'ready':
      body = <Ready result={state} child={child} desktop={desktop} title={`Historial de ${name}`} />
      break

    case 'error':
      body = (
        <>
          <div className="flex items-start gap-3.5 rounded-2xl border-[1.5px] border-slate-300 bg-surface p-[18px]">
            <span
              aria-hidden="true"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-ink text-lg font-black text-ink"
            >
              !
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-[17px] font-extrabold text-ink">{PANEL.errorTitle}</span>
              <span className="text-[15px] leading-normal text-body">{PANEL.errorBody}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            <button type="button" className={solid} onClick={retry}>
              {PANEL.retry}
            </button>
            <button type="button" className={outline} onClick={onClose}>
              {PANEL.close}
            </button>
          </div>
        </>
      )
      break

    case 'empty':
      body = (
        <>
          <div className="flex flex-col gap-2 rounded-[22px] border-2 border-dashed border-hint-border px-5 py-[22px]">
            <span className="text-lg font-black tracking-[-0.02em] text-ink">{PANEL.emptyTitle}</span>
            <span className="text-[15px] leading-[1.55] text-body">{PANEL.emptyBody(emptyPeriod(state.request.period), child.firstName)}</span>
          </div>
          <button type="button" className={solid} onClick={back}>
            {PANEL.changePeriod}
          </button>
        </>
      )
      break

    case 'plan':
      body = (
        <>
          <PlanAvisoCompacto title={PANEL.planTitle} text={PANEL.planBody(child.firstName)} />
          <button type="button" className={outline} onClick={onClose}>
            {PANEL.notNow}
          </button>
        </>
      )
      break
  }

  const panel = (
    <div className="flex flex-col gap-5 text-ink">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={`${id}-title`} className="text-[22px] font-black tracking-[-0.02em] text-ink">
            {PANEL.title}
          </h2>
          <span className="text-[15px] text-body">{PANEL.subtitle(name)}</span>
        </div>
        <button
          ref={closeRef}
          type="button"
          aria-label={PANEL.close}
          onClick={onClose}
          className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-hint text-[22px] font-bold text-action transition-colors duration-200 hover:bg-hint-edge focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div ref={bodyRef} tabIndex={-1} className="flex flex-col gap-5 focus:outline-none">
        {body}
      </div>
    </div>
  )

  return createPortal(
    <div className={`fixed inset-0 z-50 flex bg-ink/50 ${desktop ? 'items-center justify-center p-6' : 'items-end'}`} onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onClick={(e) => e.stopPropagation()}
        className={
          desktop
            ? 'max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-[22px] bg-surface p-8 shadow-[0_24px_60px_rgba(4,37,43,0.3)]'
            : 'flex max-h-[94vh] w-full flex-col gap-3 overflow-y-auto rounded-t-[22px] bg-surface px-5 pt-2.5 pb-7'
        }
      >
        {!desktop && <div aria-hidden="true" className="h-[5px] w-10 shrink-0 self-center rounded-full bg-slate-300" />}
        {panel}
      </div>
    </div>,
    document.body,
  )
}

/** One choice of «Periodo»: the whole row is the radio. */
function Radio({ checked, onPick, children }: { checked: boolean; onPick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onPick}
      className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
    >
      <span
        aria-hidden="true"
        className={`inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 ${checked ? 'border-action' : 'border-calendar-muted'}`}
      >
        {checked && <span className="h-2.5 w-2.5 rounded-full bg-action" />}
      </span>
      {children}
    </button>
  )
}

/** One part of «Qué incluir», on or off. */
function Switch(props: { checked: boolean; onToggle: () => void; rule?: boolean; hint?: string; children: ReactNode }) {
  const { checked, onToggle, rule = false, hint, children } = props
  const id = useId()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={`${id}-label`}
      aria-describedby={hint ? `${id}-hint` : undefined}
      onClick={onToggle}
      className={`flex w-full cursor-pointer items-center justify-between gap-4 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-action ${hint ? 'min-h-16' : 'min-h-14'} ${rule ? 'border-b border-hint-edge' : ''}`}
    >
      <span className="flex flex-col gap-0.5">
        <span id={`${id}-label`} className="text-base font-bold text-ink">
          {children}
        </span>
        {hint && (
          <span id={`${id}-hint`} className="text-sm font-normal text-body">
            {hint}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={`flex h-8 w-[52px] shrink-0 items-center rounded-full p-[3px] transition-colors duration-200 ${checked ? 'justify-end bg-action' : 'justify-start bg-calendar-muted'}`}
      >
        <span className="h-[26px] w-[26px] rounded-full bg-surface" />
      </span>
    </button>
  )
}

function DateField(props: { id: string; label: string; value: string; max: string; invalid: boolean; onChange: (value: string) => void }) {
  return (
    <label htmlFor={props.id} className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[13px] font-bold text-body">{props.label}</span>
      <input
        id={props.id}
        type="date"
        value={props.value}
        max={props.max}
        aria-invalid={props.invalid || undefined}
        onChange={(e) => props.onChange(e.target.value)}
        className={`min-h-12 w-full min-w-0 rounded-xl border-[1.5px] bg-surface px-3 text-base font-semibold text-ink focus:border-2 focus:border-ink focus:outline-none ${props.invalid ? 'border-ink' : 'border-hint-border'}`}
      />
    </label>
  )
}

/** «Tu PDF está listo»: the file, its pages, size and period, and how to hand it over. */
function Ready({ result, child, desktop, title }: { result: ExportResult; child: { firstName: string }; desktop: boolean; title: string }) {
  const sharable = canShareFile(result.file)
  const download = () => downloadFile(result.file, result.file.name)
  const share = () => {
    // A share sheet that refuses the file still leaves the download.
    shareFile(result.file, title).catch(download)
  }
  const shareButton = (primary: boolean) => (
    <button type="button" className={primary ? solid : outline} onClick={share}>
      {PANEL.share}
    </button>
  )
  const downloadButton = (primary: boolean) => (
    <button type="button" className={primary ? solid : outline} onClick={download}>
      {PANEL.download}
    </button>
  )
  return (
    <>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-confirmed-soft text-[22px] font-black text-confirmed"
        >
          ✓
        </span>
        <span className="text-lg font-extrabold text-ink">{PANEL.ready}</span>
      </div>
      <div className="flex items-center gap-3.5 rounded-2xl border-[1.5px] border-hint-border bg-surface px-4 py-3.5">
        <span
          aria-hidden="true"
          className="inline-flex h-[54px] w-11 shrink-0 items-end justify-center rounded-lg border-[1.5px] border-action pb-2 text-xs font-black text-action"
        >
          PDF
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[15px] font-extrabold [overflow-wrap:anywhere] text-ink">{result.file.name}</span>
          <span className="text-sm text-body">{PANEL.readyMeta(result.pages, fileSize(result.size), readyPeriod(result.request.period))}</span>
        </span>
      </div>
      <p className="text-sm leading-normal text-body">{PANEL.privacy(child.firstName)}</p>
      {desktop ? (
        <div className="flex flex-wrap gap-2.5">
          <div className="min-w-[180px] flex-1">{downloadButton(true)}</div>
          {sharable && <div className="min-w-[180px] flex-1">{shareButton(false)}</div>}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {sharable && shareButton(true)}
          {downloadButton(!sharable)}
        </div>
      )}
    </>
  )
}
