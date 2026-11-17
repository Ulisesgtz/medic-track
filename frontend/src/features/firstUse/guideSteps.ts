import type { ReminderState } from '../reminders/useReminders'
import type { Platform } from '../../shared/install/platform'

// specs/071-primer-uso-guiado (data-model.md «Lógica de los pasos»): which steps the first-use guide shows and in what state.
// Pure: no plan, no medical judgement, nothing but the device and what the person has registered.

export type StepId = 'consultation' | 'install' | 'reminders'
export type StepState = 'done' | 'pending' | 'blocked'

/** What each step looks like while it is not done. */
export type StepVariant =
  | 'default' // consultation: the button that starts a consultation
  | 'install-button' // the browser's own install dialog
  | 'menu' // Android without the install offer: the browser menu
  | 'safari' // iPhone in Safari: the three steps of «Compartir»
  | 'open-in-safari' // iPhone in another browser
  | 'activate' // the reminders button
  | 'denied' // the permission was refused: the three steps of the settings
  | 'loading' // reminders still being read: pending with no button
  | 'needs-install' // iPhone not installed: locked until step 2

export type ButtonKind = 'solid' | 'outline' | 'none'

export interface GuideStep {
  id: StepId
  /** 1..n among the steps shown. */
  number: number
  state: StepState
  variant: StepVariant
  optional: boolean
  /** The only solid button is the first pending step that has a button and is neither optional nor blocked. */
  button: ButtonKind
  /** Whether a button exists for it when it is not done (done steps never have one). */
  hasButton: boolean
}

export interface GuideStepsInput {
  platform: Platform
  installed: boolean
  canInstall: boolean
  reminders: ReminderState
  /** Whether the account has a consultation (step 1 is done once it does). */
  hasConsultation: boolean
}

export interface GuideSteps {
  steps: GuideStep[]
  /** True when every shown step is done. */
  allDone: boolean
}

type Draft = Omit<GuideStep, 'number' | 'button'>

function installStep(input: GuideStepsInput): Draft | null {
  const base = { id: 'install' as const, optional: false }
  if (input.installed) return { ...base, state: 'done', variant: 'install-button', hasButton: false }
  switch (input.platform) {
    case 'android':
      return input.canInstall
        ? { ...base, state: 'pending', variant: 'install-button', hasButton: true }
        : { ...base, state: 'pending', variant: 'menu', hasButton: false }
    case 'ios-safari':
      return { ...base, state: 'pending', variant: 'safari', hasButton: false }
    case 'ios-other':
      return { ...base, state: 'pending', variant: 'open-in-safari', hasButton: false }
    default:
      // A computer: optional, and only when the browser offers it.
      return input.canInstall ? { ...base, optional: true, state: 'pending', variant: 'install-button', hasButton: true } : null
  }
}

function remindersStep(reminders: ReminderState): Draft | null {
  const base = { id: 'reminders' as const, optional: false }
  switch (reminders) {
    case 'on':
      return { ...base, state: 'done', variant: 'activate', hasButton: false }
    case 'off':
      return { ...base, state: 'pending', variant: 'activate', hasButton: true }
    case 'denied':
      return { ...base, state: 'pending', variant: 'denied', hasButton: true }
    case 'loading':
      return { ...base, state: 'pending', variant: 'loading', hasButton: false }
    case 'ios-needs-install':
      return { ...base, state: 'blocked', variant: 'needs-install', hasButton: true }
    default:
      return null // unsupported or unavailable: the step does not exist here
  }
}

export function guideSteps(input: GuideStepsInput): GuideSteps {
  const drafts: Draft[] = [
    input.hasConsultation
      ? { id: 'consultation', optional: false, state: 'done', variant: 'default', hasButton: false }
      : { id: 'consultation', optional: false, state: 'pending', variant: 'default', hasButton: true },
  ]
  const install = installStep(input)
  if (install) drafts.push(install)
  const reminders = remindersStep(input.reminders)
  if (reminders) drafts.push(reminders)

  let solidTaken = false
  const steps = drafts.map((draft, i): GuideStep => {
    let button: ButtonKind = 'none'
    if (draft.state !== 'done' && draft.hasButton) {
      if (!solidTaken && !draft.optional && draft.state !== 'blocked') {
        button = 'solid'
        solidTaken = true
      } else {
        button = 'outline'
      }
    }
    return { ...draft, number: i + 1, button }
  })
  return { steps, allDone: steps.every((s) => s.state === 'done') }
}

export interface GuideVisibilityInput {
  /** How many children the account owns (the guide is for the person who has their own). */
  ownChildren: number
  /** The account asked to delete itself (specs/070). */
  paused: boolean
  /** The «Antes de empezar» notice is confirmed: its window goes first. */
  disclaimerAccepted: boolean
  /** The account closed the guide with «Ahora no». */
  dismissed: boolean
  /** Every shown step is done right now. */
  allDone: boolean
  /** This device already saw the guide complete (the `localStorage` mark). */
  deviceDone: boolean
}

export type GuideView = 'hidden' | 'card' | 'done-line' | 'gone'

export interface GuideVisibility {
  view: GuideView
  /** The «Primeros pasos · Ver guía» row of the list at the bottom of the home. */
  reopenRow: boolean
}

export function guideVisibility(input: GuideVisibilityInput): GuideVisibility {
  const eligible = input.ownChildren > 0 && !input.paused && input.disclaimerAccepted
  if (!eligible) return { view: 'hidden', reopenRow: false }
  if (input.deviceDone) return { view: 'gone', reopenRow: false }
  if (input.dismissed) return { view: 'hidden', reopenRow: !input.allDone }
  return { view: input.allDone ? 'done-line' : 'card', reopenRow: false }
}
