import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Account, Child, FirstUseGuideState } from '../home/types'
import type { useReminders } from '../reminders/useReminders'
import { guardMutation } from '../../shared/offline/offlineGuard'
import { isRunningInstalled, platform as detectPlatform, type Platform } from '../../shared/install/platform'
import { useInstallPrompt } from '../../shared/install/installPrompt'
import { setFirstUseGuide } from './api'
import { guideSteps, guideVisibility, type GuideStep, type GuideView } from './guideSteps'

/** How long the farewell line and the «Cerraste la guía» notice stay (the design: 8 seconds). */
export const NOTICE_MS = 8000

const doneKey = (accountId: string) => `peditrack.firstUse.done.${accountId}`

function readDone(accountId: string): boolean {
  try {
    return window.localStorage.getItem(doneKey(accountId)) === '1'
  } catch {
    return false
  }
}

function writeDone(accountId: string) {
  try {
    window.localStorage.setItem(doneKey(accountId), '1')
  } catch {
    // Without storage the guide just says its farewell again on the next visit.
  }
}

type FirstConsultation = NonNullable<FirstUseGuideState['firstConsultation']>

export interface FirstUseGuideApi {
  account: Account
  view: GuideView
  /** The row «Primeros pasos · Ver guía» of the list at the bottom of the home. */
  reopenRow: boolean
  steps: GuideStep[]
  /** The account's oldest consultation, a child's or its own; null while it has none. */
  consultation: FirstConsultation | null
  /** The children the account owns (the guide is for the person who has their own). */
  ownChildren: Child[]
  platform: Platform
  canInstall: boolean
  /** Opens the browser's install dialog; the step is done when the person accepts. */
  install: () => Promise<void>
  reminders: ReturnType<typeof useReminders>
  /** «Ahora no» and the row that brings the guide back; both need a connection and change nothing without it. */
  dismiss: () => void
  reopen: () => void
  busy: boolean
  /** «Cerraste la guía…», shown for a few seconds after closing it. */
  closedNotice: boolean
  /** How many steps the farewell talks about («Los tres pasos…»). */
  stepCount: number
}

/**
 * The state of the first-use guide of the home (specs/071-primer-uso-guiado): the account's server state
 * (`firstUseGuide`), what this device is (platform, installed, can install), the reminders of this device and the mark of
 * «this device saw the guide complete». The steps and when to show them are the pure `guideSteps`/`guideVisibility`.
 * An account that comes from a backend that predates the guide (no `firstUseGuide`) never sees it.
 */
export function useFirstUseGuide(account: Account, reminders: ReturnType<typeof useReminders>): FirstUseGuideApi {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const prompt = useInstallPrompt()
  const [platform] = useState<Platform>(detectPlatform)
  const [installed, setInstalled] = useState(isRunningInstalled)
  const [storedDone] = useState(() => readDone(account.id))
  const [farewellOver, setFarewellOver] = useState(false)
  const [closedNotice, setClosedNotice] = useState(false)

  useEffect(() => {
    const onInstalled = () => setInstalled(true)
    window.addEventListener('appinstalled', onInstalled)
    return () => window.removeEventListener('appinstalled', onInstalled)
  }, [])

  const server = account.firstUseGuide
  const ownChildren = useMemo(() => account.children.filter((c) => !c.role || c.role === 'owner'), [account.children])
  const consultation = server?.firstConsultation ?? null

  const { steps, allDone } = guideSteps({
    platform,
    installed,
    canInstall: prompt.canInstall,
    reminders: reminders.state,
    hasConsultation: consultation !== null,
  })

  // On a computer whose browser can send the install offer, the offer may not have come yet: step 2 is not «absent» but unknown, and
  // the guide must not take every step for done (and write the mark that ends it) before the browser had its say. Nothing new is shown meanwhile.
  const installUnknown = platform === 'desktop' && !installed && prompt.waiting
  const visibility = guideVisibility({
    ownChildren: server ? ownChildren.length : 0,
    paused: !!account.deletion,
    disclaimerAccepted: account.disclaimerAccepted !== false,
    dismissed: server?.dismissed ?? false,
    allDone,
    deviceDone: storedDone,
  })
  const raw = installUnknown && visibility.view === 'done-line' ? { ...visibility, view: 'hidden' as const } : visibility

  // Everything done: write the mark for this device and say the farewell for a few seconds; from then on, nothing.
  useEffect(() => {
    if (raw.view !== 'done-line') return
    writeDone(account.id)
    const timer = setTimeout(() => setFarewellOver(true), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [raw.view, account.id])
  useEffect(() => {
    if (!closedNotice) return
    const timer = setTimeout(() => setClosedNotice(false), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [closedNotice])

  const view: GuideView = raw.view === 'done-line' && farewellOver ? 'gone' : raw.view

  const mutation = useMutation({
    mutationFn: async (dismissed: boolean) => {
      guardMutation()
      return setFirstUseGuide(account.id, dismissed, await getToken())
    },
    onSuccess: (state, dismissed) => {
      queryClient.setQueryData<Account>(['accounts', 'me'], (current) => (current ? { ...current, firstUseGuide: state } : current))
      setClosedNotice(dismissed)
    },
  })

  return {
    account,
    view,
    reopenRow: raw.reopenRow,
    steps,
    consultation,
    ownChildren,
    platform,
    canInstall: prompt.canInstall,
    install: async () => {
      if ((await prompt.promptInstall()) === 'accepted') setInstalled(true)
    },
    reminders,
    dismiss: () => mutation.mutate(true),
    reopen: () => mutation.mutate(false),
    busy: mutation.isPending,
    closedNotice,
    stepCount: steps.length,
  }
}
