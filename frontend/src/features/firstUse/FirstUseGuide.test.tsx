import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { OfflineError } from '../../shared/offline/connectivity'
import { INSTALL_OFFER_MARGIN_MS, resetInstallPromptForTests, startInstallPrompt } from '../../shared/install/installPrompt'
import type { Account } from '../home/types'
import type { ReminderState } from '../reminders/useReminders'
import { ClosedNotice, FirstUseGuide } from './FirstUseGuide'
import { useFirstUseGuide, NOTICE_MS } from './useFirstUseGuide'

vi.mock('@clerk/react', () => ({ useAuth: vi.fn() }))

const guardMock = vi.hoisted(() => vi.fn())
vi.mock('../../shared/offline/offlineGuard', () => ({ guardMutation: guardMock }))

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME = `${IPHONE_SAFARI} CriOS/120.0`
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
const originalUA = navigator.userAgent

function setUA(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ua })
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 0 })
  Object.defineProperty(navigator, 'standalone', { configurable: true, value: undefined })
}

function setInstalled(installed: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: installed && query.includes('standalone'), media: query, addEventListener() {}, removeEventListener() {} }))
}

const mateo = { id: 'child-1', firstName: 'Mateo', lastName: 'Gómez', birthDate: '2022-01-15', height: null, weight: null }
const lucia = { id: 'child-2', firstName: 'Lucía', lastName: 'Gómez', birthDate: '2020-03-01', height: null, weight: null }

function accountWith(patch: Partial<Account> = {}): Account {
  return {
    id: 'acc-1',
    firstName: 'Ana',
    lastName: 'Morales',
    email: 'ana@example.com',
    countryCode: null,
    stateCode: null,
    plan: 'free',
    children: [mateo],
    disclaimerVersion: '2026-11-02',
    disclaimerAccepted: true,
    reminderDetail: 'generic',
    firstUseGuide: { dismissed: false, firstConsultation: null },
    ...patch,
  }
}

const withConsultation = (patch: Partial<Account> = {}) =>
  accountWith({ firstUseGuide: { dismissed: false, firstConsultation: { id: 'cons-1', doctorName: 'Dra. López', childId: 'child-1' } }, ...patch })

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>
}

let activate: Mock
let recheck: Mock<() => string>
let queryClient: QueryClient

function Harness({ account, reminders, variant }: { account: Account; reminders: ReminderState; variant: 'phone' | 'desktop' }) {
  const { data } = useQuery({ queryKey: ['accounts', 'me'], queryFn: async () => account, initialData: account, staleTime: Infinity })
  const guide = useFirstUseGuide(data, {
    state: reminders,
    busy: false,
    error: null,
    activate,
    deactivate: vi.fn(),
    changeDetail: vi.fn(),
    recheck,
  } as unknown as Parameters<typeof useFirstUseGuide>[1])
  return (
    <>
      <FirstUseGuide guide={guide} variant={variant} />
      <ClosedNotice guide={guide} variant={variant} />
      <Where />
    </>
  )
}

function renderGuide({ account = accountWith(), reminders = 'off', variant = 'phone' }: { account?: Account; reminders?: ReminderState; variant?: 'phone' | 'desktop' } = {}) {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route path="*" element={<Harness account={account} reminders={reminders} variant={variant} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function offerInstall(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
  event.prompt = vi.fn().mockResolvedValue(undefined)
  event.userChoice = Promise.resolve({ outcome })
  act(() => {
    window.dispatchEvent(event)
  })
  return event
}

const card = () => screen.getByRole('region', { name: 'Primeros pasos' })
const solids = (el: HTMLElement) => Array.from(el.querySelectorAll('a, button')).filter((b) => b.className.includes('bg-confirmed'))

beforeEach(() => {
  window.localStorage.clear()
  setUA(ANDROID)
  setInstalled(false)
  resetInstallPromptForTests()
  startInstallPrompt()
  activate = vi.fn()
  recheck = vi.fn().mockReturnValue('ready')
  guardMock.mockReset()
  vi.mocked(useAuth).mockReturnValue({ getToken: vi.fn().mockResolvedValue('tok') } as unknown as ReturnType<typeof useAuth>)
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  setUA(originalUA)
  window.localStorage.clear()
})

describe.each([
  ['phone', 'phone' as const],
  ['web', 'desktop' as const],
])('the first-use guide, %s design', (_name, variant) => {
  describe('state A: a new account with its three steps pending', () => {
    it('shows «Primeros pasos» with three steps and one solid button', () => {
      offerInstall()
      renderGuide({ variant })

      const section = card()
      expect(within(section).getByRole('heading', { name: 'Primeros pasos' })).toBeInTheDocument()
      expect(within(section).getByText('Tres pasos, en el orden que quieras.')).toBeInTheDocument()
      expect(within(section).getByText('Registra tu primera consulta')).toBeInTheDocument()
      expect(within(section).getByText('Instala PediTrack en tu pantalla de inicio')).toBeInTheDocument()
      expect(within(section).getByText('Activa los recordatorios')).toBeInTheDocument()
      expect(within(section).getByText('Un aviso a la hora de cada toma, aunque la app esté cerrada.')).toBeInTheDocument()
      expect(within(section).getByText('Tu navegador te pedirá permiso.')).toBeInTheDocument()

      // The numbers are in circles; the only solid button is the first step's.
      expect(solids(section)).toHaveLength(1)
      expect(within(section).getByRole('link', { name: 'Tomar foto de la receta' }).className).toContain('bg-confirmed')
      expect(within(section).getByRole('button', { name: 'Instalar' }).className).toContain('border-action')
      expect(within(section).getByRole('button', { name: 'Activar recordatorios' }).className).toContain('border-action')
    })

    it('uses the design\'s sizes for each layout', () => {
      renderGuide({ variant })
      const section = card()
      const heading = within(section).getByRole('heading', { name: 'Primeros pasos' })
      if (variant === 'desktop') {
        expect(heading.className).toContain('text-xl')
        expect(section.className).toContain('px-6')
        expect(section.querySelector('.w-56')).not.toBeNull() // the 224 px column of buttons
        expect(section.querySelector('.h-10.w-10')).not.toBeNull()
      } else {
        expect(heading.className).toContain('text-lg')
        expect(section.className).toContain('px-[18px]')
        expect(section.querySelector('.w-56')).toBeNull()
        expect(section.querySelector('.h-9.w-9')).not.toBeNull()
      }
    })

    it('the first step goes to «Nueva consulta» of the only child', async () => {
      renderGuide({ variant })
      await userEvent.click(screen.getByRole('link', { name: 'Tomar foto de la receta' }))
      expect(screen.getByTestId('where')).toHaveTextContent('/children/child-1/consultations/new')
    })

    it('says «Nueva consulta» on a computer', () => {
      setUA(DESKTOP)
      renderGuide({ variant })
      expect(screen.getByRole('link', { name: 'Nueva consulta' })).toBeInTheDocument()
      expect(screen.getByText(/^Sube una foto de la receta/)).toBeInTheDocument()
    })

    it('with several children it asks whose consultation it is, then goes to that child', async () => {
      renderGuide({ variant, account: accountWith({ children: [mateo, lucia] }) })

      const opener = screen.getByRole('button', { name: 'Tomar foto de la receta' })
      await userEvent.click(opener)

      const dialog = screen.getByRole('dialog', { name: '¿De quién es la consulta?' })
      expect(within(dialog).getByRole('button', { name: 'Mateo' })).toHaveFocus()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Lucía' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByTestId('where')).toHaveTextContent('/children/child-2/consultations/new')
    })

    it('the child picker closes with Escape, the backdrop and «Cancelar», and gives the focus back', async () => {
      renderGuide({ variant, account: accountWith({ children: [mateo, lucia] }) })
      const opener = screen.getByRole('button', { name: 'Tomar foto de la receta' })

      await userEvent.click(opener)
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(opener).toHaveFocus()

      await userEvent.click(opener)
      await userEvent.click(screen.getByRole('dialog').parentElement as HTMLElement)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      await userEvent.click(opener)
      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByTestId('where')).toHaveTextContent('/home')
    })

    it('Tab stays inside the child picker', async () => {
      renderGuide({ variant, account: accountWith({ children: [mateo, lucia] }) })
      await userEvent.click(screen.getByRole('button', { name: 'Tomar foto de la receta' }))
      const dialog = screen.getByRole('dialog')
      await userEvent.tab({ shift: true })
      expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus()
      await userEvent.tab()
      expect(within(dialog).getByRole('button', { name: 'Mateo' })).toHaveFocus()
    })
  })

  describe('state B: the consultation is registered', () => {
    it('marks step 1 done with the doctor and «Ver consulta», and moves the solid button on', () => {
      offerInstall()
      renderGuide({ variant, account: withConsultation() })

      const section = card()
      expect(within(section).getByRole('img', { name: 'Hecho' })).toBeInTheDocument()
      expect(within(section).getByText('Registraste la consulta con Dra. López.')).toBeInTheDocument()
      expect(within(section).getByRole('link', { name: 'Ver consulta' })).toHaveAttribute('href', '/consultations/cons-1')
      expect(within(section).queryByRole('link', { name: 'Tomar foto de la receta' })).not.toBeInTheDocument()
      expect(solids(section)).toHaveLength(1)
      expect(within(section).getByRole('button', { name: 'Instalar' }).className).toContain('bg-confirmed')
    })

    it('an own consultation (no child) opens the same consultation page', () => {
      renderGuide({ variant, account: accountWith({ firstUseGuide: { dismissed: false, firstConsultation: { id: 'own-9', doctorName: 'Dr. Paz', childId: null } } }) })
      expect(screen.getByRole('link', { name: 'Ver consulta' })).toHaveAttribute('href', '/consultations/own-9')
    })
  })

  describe('state G: the free plan with a saved consultation', () => {
    it('does the same as B and never says a word about plans, limits or prices', () => {
      renderGuide({ variant, account: withConsultation({ plan: 'free' }) })
      const section = card()
      expect(within(section).getByRole('img', { name: 'Hecho' })).toBeInTheDocument()
      expect(section.textContent ?? '').not.toMatch(/plan|gratis|gratuito|precio|MX\$|límite|premium/i)
    })
  })

  describe('state C: an iPhone that has not installed the app', () => {
    beforeEach(() => setUA(IPHONE_SAFARI))

    it('shows the three Safari steps, locks the reminders and offers a shortcut to step 2', async () => {
      renderGuide({ variant, reminders: 'ios-needs-install' })

      const section = card()
      expect(within(section).getByText('Tres pasos, en el orden que quieras.')).toBeInTheDocument()
      expect(within(section).getByText('En iPhone se hace desde Safari, en tres pasos:')).toBeInTheDocument()
      expect(within(section).getByRole('img', { name: 'Barra inferior de Safari con el botón Compartir resaltado' })).toBeInTheDocument()
      expect(within(section).getByText('Toca Compartir, en la barra de abajo de Safari.')).toBeInTheDocument()
      expect(within(section).getByText('Desliza y toca «Agregar a pantalla de inicio».')).toBeInTheDocument()
      expect(within(section).getByText('Toca «Agregar», arriba a la derecha.')).toBeInTheDocument()
      expect(within(section).getByText('Cuando abras PediTrack desde el ícono nuevo, este paso se marcará solo.')).toBeInTheDocument()
      expect(within(section).getByRole('img', { name: 'Bloqueado hasta el paso 2' })).toBeInTheDocument()
      expect(within(section).getByText(/^En iPhone, los avisos solo funcionan con PediTrack en la pantalla de inicio/)).toBeInTheDocument()

      const shortcut = within(section).getByRole('button', { name: 'Ir al paso 2' })
      expect(shortcut.className).toContain('border-action')
      expect(solids(section)).toHaveLength(1) // the first step's, not the locked one

      const scroll = vi.fn()
      const step2 = document.getElementById('first-use-step-install') as HTMLElement
      step2.scrollIntoView = scroll
      await userEvent.click(shortcut)
      expect(scroll).toHaveBeenCalled()
      expect(step2).toHaveFocus()
    })

    it('an iPhone browser that is not Safari asks to open PediTrack in Safari', () => {
      setUA(IPHONE_CHROME)
      renderGuide({ variant, reminders: 'ios-needs-install' })
      expect(screen.getByText('Abre PediTrack en Safari para instalarla.')).toBeInTheDocument()
      expect(screen.queryByRole('img', { name: /Safari/ })).not.toBeInTheDocument()
    })

    it('a computer whose browser does not offer to install has two steps', () => {
      setUA(DESKTOP)
      renderGuide({ variant })
      const section = card()
      expect(within(section).getByText('Dos pasos, en el orden que quieras.')).toBeInTheDocument()
      expect(within(section).queryByText(/Instala PediTrack/)).not.toBeInTheDocument()
    })
  })

  describe('the install step', () => {
    it('Android with the offer: «Instalar» opens the browser\'s dialog and the step is done once it is accepted', async () => {
      const event = offerInstall('accepted')
      renderGuide({ variant })
      await userEvent.click(screen.getByRole('button', { name: 'Instalar' }))

      expect(event.prompt).toHaveBeenCalled()
      expect(await screen.findByText('PediTrack está en tu pantalla de inicio.')).toBeInTheDocument()
    })

    it('a dismissed install dialog leaves the step as it was (the offer is spent, the menu steps appear)', async () => {
      offerInstall('dismissed')
      renderGuide({ variant })
      await userEvent.click(screen.getByRole('button', { name: 'Instalar' }))
      expect(await screen.findByText('En Android se hace desde el menú del navegador, en dos pasos:')).toBeInTheDocument()
      expect(screen.queryByText('PediTrack está en tu pantalla de inicio.')).not.toBeInTheDocument()
    })

    it('Android without the offer shows the browser-menu steps and no button', () => {
      renderGuide({ variant })
      expect(screen.getByText('En Android se hace desde el menú del navegador, en dos pasos:')).toBeInTheDocument()
      expect(screen.getByText('Elige «Instalar app» o «Agregar a pantalla de inicio».')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Instalar' })).not.toBeInTheDocument()
    })

    it('a computer that can install: «Opcional» with an outline button', () => {
      setUA(DESKTOP)
      offerInstall()
      renderGuide({ variant })
      const section = card()
      expect(within(section).getByText('Instala PediTrack en tu computadora')).toBeInTheDocument()
      expect(within(section).getByText('Opcional')).toBeInTheDocument()
      expect(within(section).getByRole('button', { name: 'Instalar' }).className).toContain('border-action')
      expect(within(section).getByText('Tres pasos, en el orden que quieras.')).toBeInTheDocument()
    })

    it('the app running installed has the step done', () => {
      setInstalled(true)
      renderGuide({ variant })
      expect(screen.getByText('PediTrack está en tu pantalla de inicio.')).toBeInTheDocument()
    })

    it('«appinstalled» marks it done', () => {
      setUA(DESKTOP)
      offerInstall()
      renderGuide({ variant })
      act(() => {
        window.dispatchEvent(new Event('appinstalled'))
      })
      expect(screen.getByText('PediTrack está instalada en esta computadora.')).toBeInTheDocument()
    })
  })

  describe('the reminders step', () => {
    it('«Activar recordatorios» turns them on with what the account chose', async () => {
      renderGuide({ variant })
      await userEvent.click(screen.getByRole('button', { name: 'Activar recordatorios' }))
      expect(activate).toHaveBeenCalledWith()
    })

    it('the first time for the account it asks what the reminders show before anything else', async () => {
      renderGuide({ variant, account: accountWith({ reminderDetail: null }) })
      await userEvent.click(screen.getByRole('button', { name: 'Activar recordatorios' }))
      expect(activate).not.toHaveBeenCalled()

      const dialog = screen.getByRole('dialog')
      await userEvent.click(within(dialog).getAllByRole('button')[0])
      expect(activate).toHaveBeenCalledOnce()
      expect(activate.mock.calls[0][0]).toMatch(/detailed|generic/)
    })

    it('reminders on: step 3 is done', () => {
      renderGuide({ variant, reminders: 'on' })
      expect(screen.getByText('Los avisos están activos en este dispositivo.')).toBeInTheDocument()
    })

    it('reminders still loading: pending with no button', () => {
      renderGuide({ variant, reminders: 'loading' })
      expect(screen.getByText('Activa los recordatorios')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Activar recordatorios' })).not.toBeInTheDocument()
    })

    it('a browser without reminders (or the server without keys) has no step 3', () => {
      renderGuide({ variant, reminders: 'unsupported' })
      expect(screen.queryByText('Activa los recordatorios')).not.toBeInTheDocument()
      expect(screen.getByText('Dos pasos, en el orden que quieras.')).toBeInTheDocument()
    })
  })

  describe('state D: the permission was refused', () => {
    it('explains where to change it, in neutral words, and keeps the step pending', () => {
      renderGuide({ variant, reminders: 'denied' })
      const section = card()
      expect(within(section).getByText(/^Los avisos están desactivados en este navegador/)).toBeInTheDocument()
      expect(within(section).getByText('Toca el ícono junto a la dirección del sitio.')).toBeInTheDocument()
      expect(within(section).getByText('Abre «Permisos» y luego «Notificaciones».')).toBeInTheDocument()
      expect(within(section).getByText('Elige «Permitir» y regresa a PediTrack.')).toBeInTheDocument()
      expect(within(section).getByText('Si prefieres no recibirlos, la app funciona igual.')).toBeInTheDocument()
      expect(within(section).getByRole('button', { name: 'Ya los activé' })).toBeInTheDocument()
    })

    it('on a computer the instructions are the browser\'s', () => {
      setUA(DESKTOP)
      renderGuide({ variant, reminders: 'denied' })
      expect(screen.getByText('Haz clic en el candado junto a la dirección.')).toBeInTheDocument()
      expect(screen.getByText('En «Notificaciones» elige «Permitir» y recarga la página.')).toBeInTheDocument()
    })

    it('«Ya los activé» with the permission still refused changes nothing and never asks again', async () => {
      const requestPermission = vi.fn()
      vi.stubGlobal('Notification', { permission: 'denied', requestPermission })
      renderGuide({ variant, reminders: 'denied' })

      await userEvent.click(screen.getByRole('button', { name: 'Ya los activé' }))

      expect(recheck).not.toHaveBeenCalled()
      expect(requestPermission).not.toHaveBeenCalled()
      expect(activate).not.toHaveBeenCalled()
    })

    it('«Ya los activé» without a Notification API changes nothing either', async () => {
      vi.stubGlobal('Notification', undefined)
      renderGuide({ variant, reminders: 'denied' })
      await userEvent.click(screen.getByRole('button', { name: 'Ya los activé' }))
      expect(recheck).not.toHaveBeenCalled()
    })

    it('«Ya los activé» with the permission granted reads it again and turns the reminders on', async () => {
      const requestPermission = vi.fn()
      vi.stubGlobal('Notification', { permission: 'granted', requestPermission })

      function Flow() {
        return <ReadyFlow variant={variant} />
      }
      queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Flow />
          </MemoryRouter>
        </QueryClientProvider>,
      )

      await userEvent.click(screen.getByRole('button', { name: 'Ya los activé' }))

      expect(recheck).toHaveBeenCalledOnce()
      await vi.waitFor(() => expect(activate).toHaveBeenCalledOnce())
      expect(requestPermission).not.toHaveBeenCalled()
    })
  })

  describe('state E: everything is done', () => {
    const allDone = () => withConsultation()

    it('says goodbye in one line, writes the mark for this device and goes away after 8 seconds', () => {
      vi.useFakeTimers()
      setInstalled(true)
      renderGuide({ variant, account: allDone(), reminders: 'on' })

      expect(screen.getByRole('status')).toHaveTextContent('Los tres pasos están hechos. Esta guía ya no se mostrará.')
      expect(screen.queryByRole('region', { name: 'Primeros pasos' })).not.toBeInTheDocument()
      expect(window.localStorage.getItem('peditrack.firstUse.done.acc-1')).toBe('1')

      act(() => {
        vi.advanceTimersByTime(NOTICE_MS - 1)
      })
      expect(screen.getByRole('status')).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('says «Los dos pasos» when only two are shown', () => {
      setUA(DESKTOP)
      renderGuide({ variant, account: allDone(), reminders: 'on' })
      expect(screen.getByRole('status')).toHaveTextContent('Los dos pasos están hechos. Esta guía ya no se mostrará.')
    })

    it('on a computer whose browser can offer to install it waits for the offer before taking the guide for done', () => {
      vi.useFakeTimers()
      setUA(DESKTOP)
      setInstalled(false)
      ;(window as unknown as Record<string, unknown>).onbeforeinstallprompt = null
      resetInstallPromptForTests()
      startInstallPrompt()
      try {
        renderGuide({ variant, account: allDone(), reminders: 'on' })

        // Meanwhile nothing is shown and nothing is written: the offer may still arrive.
        expect(screen.queryByRole('status')).not.toBeInTheDocument()
        expect(screen.queryByRole('region', { name: 'Primeros pasos' })).not.toBeInTheDocument()
        expect(window.localStorage.getItem('peditrack.firstUse.done.acc-1')).toBeNull()

        act(() => {
          vi.advanceTimersByTime(INSTALL_OFFER_MARGIN_MS)
        })
        expect(screen.getByRole('status')).toHaveTextContent('Los dos pasos están hechos.')
        expect(window.localStorage.getItem('peditrack.firstUse.done.acc-1')).toBe('1')
      } finally {
        delete (window as unknown as Record<string, unknown>).onbeforeinstallprompt
      }
    })

    it('the offer arriving in that margin shows the optional install step instead of the goodbye', () => {
      vi.useFakeTimers()
      setUA(DESKTOP)
      ;(window as unknown as Record<string, unknown>).onbeforeinstallprompt = null
      resetInstallPromptForTests()
      startInstallPrompt()
      try {
        renderGuide({ variant, account: allDone(), reminders: 'on' })
        offerInstall()
        expect(screen.getByRole('region', { name: 'Primeros pasos' })).toBeInTheDocument()
        expect(screen.getByText('Opcional')).toBeInTheDocument()
        expect(window.localStorage.getItem('peditrack.firstUse.done.acc-1')).toBeNull()
      } finally {
        delete (window as unknown as Record<string, unknown>).onbeforeinstallprompt
      }
    })

    it('after that, on this device, nothing — not even the goodbye', () => {
      window.localStorage.setItem('peditrack.firstUse.done.acc-1', '1')
      setInstalled(true)
      renderGuide({ variant, account: allDone(), reminders: 'on' })
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Primeros pasos' })).not.toBeInTheDocument()
    })

    it('a device without storage still says it, once', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      setInstalled(true)
      renderGuide({ variant, account: allDone(), reminders: 'on' })
      expect(screen.getByRole('status')).toBeInTheDocument()
      vi.restoreAllMocks()
    })
  })

  describe('state F: «Ahora no»', () => {
    it('closes the guide for the account, says where to find it again and the notice goes away after 8 seconds', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ dismissed: true, firstConsultation: null }) } as Response)
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      renderGuide({ variant })

      await user.click(screen.getByRole('button', { name: 'Ahora no' }))

      const [url, init] = vi.mocked(fetch).mock.calls[0]
      expect(String(url)).toMatch(/\/accounts\/acc-1\/first-use-guide$/)
      expect((init as RequestInit).method).toBe('PUT')
      expect(JSON.parse((init as RequestInit).body as string)).toEqual({ dismissed: true })
      expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' })

      const notice = await screen.findByRole('status')
      expect(notice).toHaveTextContent('Cerraste la guía. Puedes volver a abrirla en Primeros pasos, al final del inicio.')
      expect(notice.className).toContain('bg-ink')
      expect(screen.queryByRole('region', { name: 'Primeros pasos' })).not.toBeInTheDocument()
      expect(queryClient.getQueryData<Account>(['accounts', 'me'])?.firstUseGuide?.dismissed).toBe(true)

      act(() => {
        vi.advanceTimersByTime(NOTICE_MS)
      })
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('without a connection it says nothing new and changes nothing', async () => {
      guardMock.mockImplementation(() => {
        throw new OfflineError()
      })
      renderGuide({ variant })

      await userEvent.click(screen.getByRole('button', { name: 'Ahora no' }))

      expect(fetch).not.toHaveBeenCalled()
      expect(screen.getByRole('region', { name: 'Primeros pasos' })).toBeInTheDocument()
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      expect(queryClient.getQueryData<Account>(['accounts', 'me'])?.firstUseGuide?.dismissed).toBe(false)
    })

    it('a closed guide is not drawn on the next visit', () => {
      renderGuide({ variant, account: accountWith({ firstUseGuide: { dismissed: true, firstConsultation: null } }) })
      expect(screen.queryByRole('region', { name: 'Primeros pasos' })).not.toBeInTheDocument()
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
  })

  describe('who never sees the guide', () => {
    it.each([
      ['an account with no child of its own', { children: [] }],
      ['someone with only children shared with them', { children: [{ ...mateo, role: 'caregiver' as const, accountId: 'owner' }] }],
      ['an account scheduled for deletion', { deletion: { scheduledFor: '2026-12-12T18:00:00Z' } }],
      ['an account that has not confirmed «Antes de empezar»', { disclaimerAccepted: false }],
      ['an account from a backend that predates the guide', { firstUseGuide: undefined }],
    ])('%s', (_label, patch) => {
      renderGuide({ variant, account: accountWith(patch as Partial<Account>) })
      expect(screen.queryByRole('region', { name: 'Primeros pasos' })).not.toBeInTheDocument()
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
  })
})

/** The reminders state of the guide changes when the device is checked again, as the real hook does. */
function ReadyFlow({ variant }: { variant: 'phone' | 'desktop' }) {
  const account = accountWith()
  const { data } = useQuery({ queryKey: ['accounts', 'me'], queryFn: async () => account, initialData: account, staleTime: Infinity })
  const [state, setState] = useState<ReminderState>('denied')
  const guide = useFirstUseGuide(data, {
    state,
    busy: false,
    error: null,
    activate,
    deactivate: vi.fn(),
    changeDetail: vi.fn(),
    recheck: () => {
      recheck()
      setState('off')
      return 'ready'
    },
  } as unknown as Parameters<typeof useFirstUseGuide>[1])
  return <FirstUseGuide guide={guide} variant={variant} />
}

