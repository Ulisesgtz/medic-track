import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { NewConsultationEntry } from '../consultations/NewConsultationEntry'
import type { Child } from '../home/types'
import type { ReminderDetail } from '../reminders/api'
import { ReminderDetailDialog } from '../reminders/ReminderDetailDialog'
import { useReminderActivation } from '../reminders/useReminderActivation'
import { ChildPickerDialog } from './ChildPickerDialog'
import {
  DENIED_PHONE,
  DENIED_WEB,
  FIRST_USE,
  consultationDone,
  farewell,
  stepsSubtitle,
} from './firstUseText'
import type { ButtonKind, GuideStep } from './guideSteps'
import { NumberedSteps, SafariInstallSteps } from './SafariInstallSteps'
import type { FirstUseGuideApi } from './useFirstUseGuide'

type Variant = 'phone' | 'desktop'

const buttonBase =
  'inline-flex min-h-12 cursor-pointer items-center justify-center rounded-2xl text-base font-extrabold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70'
const solid = `${buttonBase} border-0 bg-confirmed text-white hover:opacity-90`
const outline = `${buttonBase} border-2 border-action bg-transparent text-action hover:bg-hint`

const check = (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="stroke-white">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)

/** The circle of a step: a check when done, its number in an outline when pending, a dashed padlock when it waits for another step. */
function Circle({ step, desktop }: { step: GuideStep; desktop: boolean }) {
  const size = desktop ? 'h-10 w-10' : 'h-9 w-9'
  if (step.state === 'done') {
    return (
      <span role="img" aria-label={FIRST_USE.done} className={`flex ${size} flex-none items-center justify-center rounded-full bg-confirmed`}>
        <span className={`block ${desktop ? 'h-5 w-5' : 'h-[18px] w-[18px]'}`}>{check}</span>
      </span>
    )
  }
  if (step.state === 'blocked') {
    return (
      <span
        role="img"
        aria-label={FIRST_USE.blockedLabel}
        className={`flex ${size} flex-none items-center justify-center rounded-full border-2 border-dashed border-calendar-muted bg-surface`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="stroke-muted">
          <path d="M7 11V8a5 5 0 0 1 10 0v3" />
          <rect x="5" y="11" width="14" height="9" rx="2" />
        </svg>
      </span>
    )
  }
  return (
    <span
      aria-hidden="true"
      className={`flex ${size} flex-none items-center justify-center rounded-full border-2 border-action bg-surface font-black text-action ${desktop ? 'text-[17px]' : 'text-base'}`}
    >
      {step.number}
    </span>
  )
}

interface RowProps {
  id: string
  step: GuideStep
  desktop: boolean
  title: string
  optional?: boolean
  description: string
  /** What goes under the description: a link, a panel with instructions, a note. */
  extra?: ReactNode
  /** The step's button; `null` when it has none (a done step, or instructions only). */
  button: ReactNode
  /** The small line under the button («Tu navegador te pedirá permiso.»). */
  hint?: string
}

function Row({ id, step, desktop, title, optional, description, extra, button, hint }: RowProps) {
  return (
    <div id={id} tabIndex={-1} className={`flex items-start border-t border-hint-edge focus:outline-none ${desktop ? 'gap-[18px] py-5' : 'gap-3.5 py-4'}`}>
      <Circle step={step} desktop={desktop} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`leading-[1.3] font-extrabold text-ink ${desktop ? 'text-[17px]' : 'text-base'}`}>{title}</span>
          {optional && (
            <span className="rounded-full border border-hint-border bg-hint px-2.5 py-[3px] text-[13px] font-extrabold text-action">{FIRST_USE.optional}</span>
          )}
        </div>
        <span className={`leading-normal text-body ${desktop ? 'max-w-[600px] text-[15px]' : 'text-sm'}`}>{description}</span>
        {extra}
        {!desktop && button && (
          <div className="mt-1.5 flex flex-col items-start gap-1.5">
            {button}
            {hint && <span className="text-[13px] leading-[1.4] text-muted">{hint}</span>}
          </div>
        )}
      </div>
      {desktop && button && (
        <div className="flex w-56 flex-none flex-col items-stretch gap-1.5">
          {button}
          {hint && <span className="text-center text-[13px] leading-[1.4] text-muted">{hint}</span>}
        </div>
      )}
    </div>
  )
}

function buttonClass(kind: ButtonKind, desktop: boolean) {
  return `${kind === 'solid' ? solid : outline} ${desktop ? 'px-5' : 'px-[22px]'}`
}

/**
 * The first-use guide of the home (specs/071-primer-uso-guiado; the design `referencia/Primer uso guiado PediTrack.dc.html`,
 * states A–G): «Primeros pasos» with up to three steps — the first consultation, installing the app, the reminders — in two
 * designs. Everything it says is in `firstUseText.ts`; it never speaks of plans or advises (FR-025, FR-026).
 */
export function FirstUseGuide({ guide, variant }: { guide: FirstUseGuideApi; variant: Variant }) {
  const desktop = variant === 'desktop'
  const { view } = guide
  if (view === 'done-line') return <Farewell count={guide.stepCount} desktop={desktop} />
  if (view !== 'card') return null
  return <Card guide={guide} desktop={desktop} />
}

function Farewell({ count, desktop }: { count: number; desktop: boolean }) {
  return (
    <div role="status" className={`flex items-center gap-3 rounded-[22px] bg-confirmed-soft ${desktop ? 'px-[22px] py-4' : 'px-4 py-3.5'}`}>
      <span aria-hidden="true" className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-confirmed">
        <span className="block h-[17px] w-[17px]">{check}</span>
      </span>
      <span className={`leading-[1.4] font-bold text-confirmed-strong ${desktop ? 'text-base' : 'text-[15px]'}`}>{farewell(count)}</span>
    </div>
  )
}

function Card({ guide, desktop }: { guide: FirstUseGuideApi; desktop: boolean }) {
  const { account, steps, platform, reminders } = guide
  const navigate = useNavigate()
  const phoneDevice = platform !== 'desktop'

  const [picker, setPicker] = useState(false)
  const [activateWhenReady, setActivateWhenReady] = useState(false)
  const pickerOpener = useRef<HTMLButtonElement>(null)
  const activation = useReminderActivation(account, reminders)
  const { activateButton } = activation
  const autoRan = useRef(false)
  const closePicker = useCallback(() => setPicker(false), [])

  const [one] = guide.ownChildren

  // The choice dialog is the reminders card's flow; here it also opens by itself when «Ya los activé» finds the permission granted
  // and the account never chose what the reminders show.
  const askDetail = activation.dialog === 'activate' || (activateWhenReady && reminders.state === 'off' && account.reminderDetail === null)
  function chooseDetail(choice: ReminderDetail) {
    setActivateWhenReady(false)
    activation.choose(choice)
  }
  function cancelDetail() {
    setActivateWhenReady(false)
    activation.cancel()
  }

  // «Ya los activé»: read the permission again; if it is granted the reminders turn on as soon as the device is ready for them.
  function alreadyActivated() {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    autoRan.current = false
    reminders.recheck()
    setActivateWhenReady(true)
  }
  // With the permission already granted the device only has to subscribe: it does so once the reminders are ready for it.
  useEffect(() => {
    if (!activateWhenReady || autoRan.current) return
    if (reminders.state === 'off' && account.reminderDetail !== null) {
      autoRan.current = true
      void reminders.activate()
    }
    // `reminders.activate` changes identity on every render; the state is what matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activateWhenReady, reminders.state])

  function goToStep2() {
    const el = document.getElementById('first-use-step-install')
    if (!el) return
    el.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    el.focus()
  }

  function chooseChild(child: Child) {
    setPicker(false)
    navigate(`/children/${child.id}/consultations/new`)
  }

  const row = (step: GuideStep) => {
    const kind = step.button
    if (step.id === 'consultation') {
      const consultation = guide.consultation
      if (step.state === 'done' && consultation) {
        return (
          <Row
           
            id="first-use-step-consultation"
            step={step}
            desktop={desktop}
            title={FIRST_USE.consultationTitle}
            description={consultationDone(consultation.doctorName)}
            extra={
              <Link to={`/consultations/${consultation.id}`} className={`inline-flex min-h-11 items-center self-start font-bold text-action hover:text-ink hover:underline ${desktop ? 'text-[15px]' : 'text-sm'}`}>
                {FIRST_USE.seeConsultation}
              </Link>
            }
            button={null}
          />
        )
      }
      const label = phoneDevice ? FIRST_USE.consultationPhone : FIRST_USE.consultationWeb
      const className = buttonClass(kind, desktop)
      return (
        <Row
         
          id="first-use-step-consultation"
          step={step}
          desktop={desktop}
          title={FIRST_USE.consultationTitle}
          description={phoneDevice ? FIRST_USE.consultationDescPhone : FIRST_USE.consultationDescWeb}
          button={
            guide.ownChildren.length > 1 ? (
              <button ref={pickerOpener} type="button" onClick={() => setPicker(true)} className={className}>
                {label}
              </button>
            ) : (
              // No consultation exists yet, so no treatment is running: the free plan's rule never blocks this first one.
              <NewConsultationEntry to={`/children/${one?.id ?? ''}/consultations/new`} blocked={false} className={className}>
                {label}
              </NewConsultationEntry>
            )
          }
        />
      )
    }

    if (step.id === 'install') {
      const title = phoneDevice ? FIRST_USE.installTitlePhone : FIRST_USE.installTitleWeb
      const common = { id: 'first-use-step-install', step, desktop, title, optional: step.optional }
      if (step.state === 'done') {
        return <Row {...common} description={phoneDevice ? FIRST_USE.installDonePhone : FIRST_USE.installDoneWeb} button={null} />
      }
      switch (step.variant) {
        case 'safari':
          return <Row {...common} description={FIRST_USE.installIosIntro} extra={<><SafariInstallSteps /><span className="text-sm leading-normal text-body">{FIRST_USE.installIosNote}</span></>} button={null} />
        case 'open-in-safari':
          return <Row {...common} description={FIRST_USE.installOpenInSafari} extra={<span className="text-sm leading-normal text-body">{FIRST_USE.installOpenInSafariNote}</span>} button={null} />
        case 'menu':
          return <Row {...common} description={FIRST_USE.installMenuIntro} extra={<NumberedSteps steps={FIRST_USE.installMenu} />} button={null} />
        default:
          return (
            <Row
              {...common}
              description={phoneDevice ? FIRST_USE.installDescPhone : FIRST_USE.installDescWeb}
              button={
                <button type="button" onClick={() => void guide.install()} className={buttonClass(kind, desktop)}>
                  {FIRST_USE.installButton}
                </button>
              }
            />
          )
      }
    }

    // Step 3: the reminders.
    const common = { id: 'first-use-step-reminders', step, desktop, title: FIRST_USE.remindersTitle }
    if (step.state === 'done') {
      return <Row {...common} description={phoneDevice ? FIRST_USE.remindersDonePhone : FIRST_USE.remindersDoneWeb} button={null} />
    }
    if (step.variant === 'needs-install') {
      return (
        <Row
          {...common}
          description={FIRST_USE.remindersBlocked}
          button={
            <button type="button" onClick={goToStep2} className={buttonClass(kind, desktop)}>
              {FIRST_USE.remindersGoToStep2}
            </button>
          }
        />
      )
    }
    if (step.variant === 'denied') {
      return (
        <Row
          {...common}
          description={FIRST_USE.remindersDenied}
          extra={
            <>
              <NumberedSteps steps={phoneDevice ? DENIED_PHONE : DENIED_WEB} />
              <span className="text-sm leading-normal text-body">{FIRST_USE.remindersSkipNote}</span>
            </>
          }
          button={
            <button type="button" onClick={alreadyActivated} disabled={reminders.busy} className={buttonClass(kind, desktop)}>
              {FIRST_USE.remindersAlreadyOn}
            </button>
          }
        />
      )
    }
    return (
      <Row
        {...common}
        description={FIRST_USE.remindersDesc}
        button={
          step.hasButton ? (
            <button ref={activateButton} type="button" onClick={activation.start} disabled={reminders.busy} className={buttonClass(kind, desktop)}>
              {FIRST_USE.remindersButton}
            </button>
          ) : null
        }
        hint={step.hasButton ? FIRST_USE.remindersHint : undefined}
      />
    )
  }

  return (
    <section aria-label={FIRST_USE.title} className={`rounded-[22px] bg-surface pb-1 shadow-[0_8px_20px_rgba(4,37,43,0.07)] ${desktop ? 'px-6 pt-[22px]' : 'px-[18px] pt-[18px]'}`}>
      <div className={`flex items-start justify-between gap-3 ${desktop ? 'pb-3.5' : 'pb-2.5'}`}>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className={`m-0 tracking-[-0.02em] text-ink ${desktop ? 'text-xl font-black' : 'text-lg font-extrabold'}`}>{FIRST_USE.title}</h3>
          <span className={`text-body ${desktop ? 'text-[15px]' : 'text-sm'}`}>{stepsSubtitle(steps.length)}</span>
        </div>
        <button
          type="button"
          onClick={guide.dismiss}
          disabled={guide.busy}
          className={`-mt-1.5 -mr-2 min-h-11 min-w-11 flex-none cursor-pointer rounded-xl px-3 font-extrabold text-action transition-colors hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:cursor-wait disabled:opacity-70 ${desktop ? 'text-[15px]' : 'text-sm'}`}
        >
          {FIRST_USE.dismiss}
        </button>
      </div>
      {steps.map((step) => (
        <Fragment key={step.id}>{row(step)}</Fragment>
      ))}
      {picker && <ChildPickerDialog options={guide.ownChildren} onChoose={chooseChild} onCancel={closePicker} opener={pickerOpener} />}
      {askDetail && (
        <ReminderDetailDialog
          childName={activation.childName}
          current={account.reminderDetail}
          onChoose={chooseDetail}
          onCancel={cancelDetail}
          opener={activateButton}
        />
      )}
      {reminders.error && (
        <p role="alert" className="m-0 pb-4 text-[13px] font-semibold text-error">
          {reminders.error}
        </p>
      )}
    </section>
  )
}

/** «Cerraste la guía. Puedes volver a abrirla en Primeros pasos, al final del inicio.» — the ink notice at the end of the home. */
export function ClosedNotice({ guide, variant }: { guide: FirstUseGuideApi; variant: Variant }) {
  if (!guide.closedNotice) return null
  return (
    <div
      role="status"
      className={`sticky bottom-5 z-30 rounded-2xl bg-ink px-[18px] py-3.5 text-sm leading-[1.45] font-semibold text-white shadow-[0_12px_30px_rgba(4,37,43,0.25)] ${variant === 'desktop' ? 'max-w-[560px] self-start' : '-mx-1'}`}
    >
      {FIRST_USE.closedNotice} <strong className="text-bright-soft">{FIRST_USE.closedNoticeLink}</strong>
      {FIRST_USE.closedNoticeEnd}
    </div>
  )
}
