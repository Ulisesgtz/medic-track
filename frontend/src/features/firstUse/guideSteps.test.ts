import { describe, expect, it } from 'vitest'
import type { Platform } from '../../shared/install/platform'
import type { ReminderState } from '../reminders/useReminders'
import { guideSteps, guideVisibility, type GuideStepsInput } from './guideSteps'

const PLATFORMS: Platform[] = ['android', 'ios-safari', 'ios-other', 'desktop']
const REMINDERS: ReminderState[] = ['loading', 'unsupported', 'ios-needs-install', 'denied', 'unavailable', 'off', 'on']

function every(): GuideStepsInput[] {
  const out: GuideStepsInput[] = []
  for (const platform of PLATFORMS)
    for (const installed of [false, true])
      for (const canInstall of [false, true])
        for (const reminders of REMINDERS)
          for (const hasConsultation of [false, true]) out.push({ platform, installed, canInstall, reminders, hasConsultation })
  return out
}

describe('guideSteps over every combination', () => {
  it.each(every().map((input) => [JSON.stringify(input), input] as const))('%s', (_label, input) => {
    const { steps, allDone } = guideSteps(input)

    // The numbering is 1..n among the shown steps and step 1 is always the consultation.
    expect(steps.map((s) => s.number)).toEqual(steps.map((_, i) => i + 1))
    expect(steps[0].id).toBe('consultation')
    expect(steps[0].state).toBe(input.hasConsultation ? 'done' : 'pending')

    // Step 2: done when installed; a computer without the offer and not installed does not show it.
    const install = steps.find((s) => s.id === 'install')
    if (input.installed) expect(install?.state).toBe('done')
    else if (input.platform === 'desktop' && !input.canInstall) expect(install).toBeUndefined()
    else expect(install?.state).toBe('pending')
    if (install && !input.installed) expect(install.optional).toBe(input.platform === 'desktop')

    // Step 3.
    const reminders = steps.find((s) => s.id === 'reminders')
    if (input.reminders === 'unsupported' || input.reminders === 'unavailable') expect(reminders).toBeUndefined()
    else if (input.reminders === 'on') expect(reminders?.state).toBe('done')
    else if (input.reminders === 'ios-needs-install') expect(reminders?.state).toBe('blocked')
    else expect(reminders?.state).toBe('pending')

    // One solid button at most, and it is a pending, non-optional step that has a button.
    const solid = steps.filter((s) => s.button === 'solid')
    expect(solid.length).toBeLessThanOrEqual(1)
    for (const s of solid) {
      expect(s.state).toBe('pending')
      expect(s.optional).toBe(false)
      expect(s.hasButton).toBe(true)
    }
    for (const s of steps) {
      if (s.state === 'done') expect(s.button).toBe('none')
      if (s.hasButton && s.state !== 'done') expect(s.button).not.toBe('none')
      if (!s.hasButton) expect(s.button).toBe('none')
    }
    // The solid one is the FIRST step that can have it.
    const firstEligible = steps.find((s) => s.state === 'pending' && !s.optional && s.hasButton)
    expect(solid[0]).toBe(firstEligible)

    expect(allDone).toBe(steps.every((s) => s.state === 'done'))
  })
})

describe('guideSteps, the cases the design names', () => {
  const base: GuideStepsInput = { platform: 'android', installed: false, canInstall: true, reminders: 'off', hasConsultation: false }

  it('a new account on Android: three pending steps, the first is solid', () => {
    const { steps } = guideSteps(base)
    expect(steps.map((s) => [s.id, s.state, s.button])).toEqual([
      ['consultation', 'pending', 'solid'],
      ['install', 'pending', 'outline'],
      ['reminders', 'pending', 'outline'],
    ])
  })

  it('with the consultation done the solid button moves to the next step with a button', () => {
    const { steps } = guideSteps({ ...base, hasConsultation: true })
    expect(steps[0].button).toBe('none')
    expect(steps[1].button).toBe('solid')
  })

  it('Android without the install offer shows the menu instructions and no button', () => {
    const install = guideSteps({ ...base, canInstall: false }).steps[1]
    expect(install.variant).toBe('menu')
    expect(install.button).toBe('none')
  })

  it('iPhone in Safari: instructions, and the reminders are blocked with a shortcut button', () => {
    const { steps } = guideSteps({ platform: 'ios-safari', installed: false, canInstall: false, reminders: 'ios-needs-install', hasConsultation: false })
    expect(steps[1].variant).toBe('safari')
    expect(steps[2]).toMatchObject({ state: 'blocked', variant: 'needs-install', button: 'outline' })
  })

  it('iPhone in another browser asks to open Safari', () => {
    expect(guideSteps({ platform: 'ios-other', installed: false, canInstall: false, reminders: 'ios-needs-install', hasConsultation: false }).steps[1].variant).toBe('open-in-safari')
  })

  it('a computer that can install shows an optional step with an outline button', () => {
    const { steps } = guideSteps({ platform: 'desktop', installed: false, canInstall: true, reminders: 'off', hasConsultation: false })
    expect(steps[1]).toMatchObject({ optional: true, button: 'outline' })
    expect(steps[2].button).toBe('outline')
    expect(steps[0].button).toBe('solid')
  })

  it('a computer that cannot install has two steps', () => {
    expect(guideSteps({ platform: 'desktop', installed: false, canInstall: false, reminders: 'off', hasConsultation: false }).steps).toHaveLength(2)
  })

  it('reminders still loading are pending with no button', () => {
    const step = guideSteps({ ...base, reminders: 'loading' }).steps[2]
    expect(step).toMatchObject({ state: 'pending', variant: 'loading', button: 'none' })
  })

  it('denied reminders keep the «Ya los activé» button', () => {
    expect(guideSteps({ ...base, reminders: 'denied' }).steps[2]).toMatchObject({ variant: 'denied', hasButton: true })
  })

  it('everything done', () => {
    expect(guideSteps({ platform: 'android', installed: true, canInstall: false, reminders: 'on', hasConsultation: true }).allDone).toBe(true)
  })
})

describe('guideVisibility', () => {
  const ok = { ownChildren: 1, paused: false, disclaimerAccepted: true, dismissed: false, allDone: false, deviceDone: false }

  it('shows the card to an account with its own child', () => {
    expect(guideVisibility(ok)).toEqual({ view: 'card', reopenRow: false })
  })

  it.each([
    ['no own child (or only shared ones)', { ownChildren: 0 }],
    ['the account is paused', { paused: true }],
    ['the notice is not confirmed', { disclaimerAccepted: false }],
  ])('is hidden, with no row: %s', (_name, patch) => {
    expect(guideVisibility({ ...ok, ...patch, dismissed: true })).toEqual({ view: 'hidden', reopenRow: false })
    expect(guideVisibility({ ...ok, ...patch })).toEqual({ view: 'hidden', reopenRow: false })
  })

  it('closed: hidden, with the row to open it again', () => {
    expect(guideVisibility({ ...ok, dismissed: true })).toEqual({ view: 'hidden', reopenRow: true })
  })

  it('closed but complete: no row', () => {
    expect(guideVisibility({ ...ok, dismissed: true, allDone: true })).toEqual({ view: 'hidden', reopenRow: false })
  })

  it('everything done and not yet seen on this device: the farewell line', () => {
    expect(guideVisibility({ ...ok, allDone: true })).toEqual({ view: 'done-line', reopenRow: false })
  })

  it('complete on this device: nothing, whatever else, and no row', () => {
    expect(guideVisibility({ ...ok, allDone: true, deviceDone: true })).toEqual({ view: 'gone', reopenRow: false })
    expect(guideVisibility({ ...ok, dismissed: true, deviceDone: true })).toEqual({ view: 'gone', reopenRow: false })
    expect(guideVisibility({ ...ok, deviceDone: true })).toEqual({ view: 'gone', reopenRow: false })
  })
})
