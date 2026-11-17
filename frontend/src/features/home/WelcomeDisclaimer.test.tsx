import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { act } from '@testing-library/react'
import { WelcomeDisclaimer } from './WelcomeDisclaimer'
import { reportNetworkFailure, reportReachable, resetConnectivity } from '../../shared/offline/connectivity'
import type { Account } from './types'

vi.mock('@clerk/react', () => ({ useAuth: vi.fn() }))

const account: Account = {
  id: 'acc-1',
  firstName: 'Ana',
  lastName: 'Gómez',
  email: 'ana@example.com',
  countryCode: null,
  stateCode: null,
  plan: 'free',
  children: [],
  disclaimerVersion: '2026-09-26',
  disclaimerAccepted: false,
  reminderDetail: null,
}

function renderBanner(value: Account | null = account) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  queryClient.setQueryData(['accounts', 'me'], value ?? undefined)
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <WelcomeDisclaimer account={value ?? undefined} />
    </QueryClientProvider>,
  )
  return { ...utils, queryClient }
}

function stubDesktop(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

describe('WelcomeDisclaimer', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ getToken: vi.fn().mockResolvedValue('tok-1') } as unknown as ReturnType<typeof useAuth>)
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    resetConnectivity()
  })

  it('is not shown without a connection (it could not be closed) and comes back by itself with it (specs/067)', () => {
    renderBanner()
    expect(screen.getByRole('dialog', { name: 'Antes de empezar' })).toBeInTheDocument()

    act(() => reportNetworkFailure())
    expect(screen.queryByRole('dialog', { name: 'Antes de empezar' })).not.toBeInTheDocument()
    expect(document.documentElement.style.overflow).not.toBe('hidden')

    act(() => reportReachable())
    expect(screen.getByRole('dialog', { name: 'Antes de empezar' })).toBeInTheDocument()
  })

  it('shows the informative-only notice to an account that has not acknowledged it', () => {
    renderBanner()

    const region = screen.getByRole('dialog', { name: 'Antes de empezar' })
    expect(region).toHaveTextContent('informativa y de seguimiento')
    expect(region).toHaveTextContent('no sustituye una consulta médica')
    expect(region).toHaveTextContent('acude siempre a tu médico')
    expect(region).toHaveTextContent('solo cuando está impresa (no escrita a mano)')
    expect(region).toHaveTextContent('no la interpretamos y no autollenamos ningún campo')
    expect(region).toHaveTextContent('la foto se guarda en tu cuenta y solo la ven las personas a las que tú invites')
    expect(region).toHaveTextContent('podrá marcarlas; no se guarda ningún dato personal suyo')
    expect(region).toHaveTextContent('Compartir significa que otra persona ve los datos médicos del menor')
    expect(region).toHaveTextContent('solo repiten lo que tú escribiste')
    expect(region).toHaveTextContent('Las vacunas y las fotos de la cartilla de tu hijo son datos de salud')
    expect(region).toHaveTextContent('las personas que invites podrán verlas según su rol')
    // specs/058: the person's own consultations are theirs, shared only if they decide.
    expect(region).toHaveTextContent('tus propias consultas')
    expect(region).toHaveTextContent('nunca las ve un Cuidador ni el teléfono de un hijo')
  })

  it('is not shown once the account acknowledged it, nor while there is no account yet', () => {
    const { unmount } = renderBanner({ ...account, disclaimerAccepted: true })
    expect(screen.queryByRole('dialog', { name: 'Antes de empezar' })).not.toBeInTheDocument()
    unmount()

    renderBanner(null)
    expect(screen.queryByRole('dialog', { name: 'Antes de empezar' })).not.toBeInTheDocument()
  })

  it('"Entendido" records the acknowledgement of the served version and hides the notice', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: '2026-09-26', acceptedAt: '2026-09-26T18:00:00Z' }),
    } as Response)
    const { queryClient, rerender } = renderBanner()

    await userEvent.click(screen.getByRole('button', { name: 'Entendido' }))

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toMatch(/\/accounts\/acc-1\/disclaimer-acceptance$/)
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok-1' })
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ version: '2026-09-26' })

    // The cached account now says it was acknowledged, so the home stops showing the notice.
    await vi.waitFor(() =>
      expect(queryClient.getQueryData<Account>(['accounts', 'me'])?.disclaimerAccepted).toBe(true),
    )
    rerender(
      <QueryClientProvider client={queryClient}>
        <WelcomeDisclaimer account={queryClient.getQueryData<Account>(['accounts', 'me'])} />
      </QueryClientProvider>,
    )
    expect(screen.queryByRole('dialog', { name: 'Antes de empezar' })).not.toBeInTheDocument()
  })

  it('keeps the notice and says so when the acknowledgement could not be saved', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)
    const { queryClient } = renderBanner()

    await userEvent.click(screen.getByRole('button', { name: 'Entendido' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos guardar tu confirmación')
    expect(screen.getByRole('dialog', { name: 'Antes de empezar' })).toBeInTheDocument()
    expect(queryClient.getQueryData<Account>(['accounts', 'me'])?.disclaimerAccepted).toBe(false)
  })

  describe.each([
    ['phone', false],
    ['web', true],
  ])('as a window (specs/071, state A0) on the %s', (_name, desktop) => {
    beforeEach(() => stubDesktop(desktop))

    it('is a modal dialog with its title and the notice scrolls inside it', () => {
      renderBanner()
      const dialog = screen.getByRole('dialog', { name: 'Antes de empezar' })
      expect(dialog).toHaveAttribute('aria-modal', 'true')
      expect(screen.getByRole('heading', { name: 'Antes de empezar', level: 2 })).toBeInTheDocument()
      expect(dialog.querySelector('.overflow-auto')).not.toBeNull()
    })

    it('draws the sheet with its grabber on the phone and the 600 px dialog on the web', () => {
      renderBanner()
      const dialog = screen.getByRole('dialog')
      if (desktop) expect(dialog.className).toContain('w-[600px]')
      else expect(dialog.querySelector('span[aria-hidden="true"]')).not.toBeNull()
    })

    it('Escape and a click on the backdrop do not close it', async () => {
      renderBanner()
      fireEvent.keyDown(document, { key: 'Escape' })
      await userEvent.click(screen.getByRole('dialog').parentElement as HTMLElement)
      expect(screen.getByRole('dialog', { name: 'Antes de empezar' })).toBeInTheDocument()
      expect(fetch).not.toHaveBeenCalled()
    })

    it('the focus starts on the title and Tab never leaves the window', async () => {
      renderBanner()
      const title = screen.getByRole('heading', { name: 'Antes de empezar' })
      const button = screen.getByRole('button', { name: 'Entendido' })
      expect(title).toHaveFocus()
      await userEvent.tab()
      expect(button).toHaveFocus()
      await userEvent.tab()
      expect(title).toHaveFocus()
      await userEvent.tab({ shift: true })
      expect(button).toHaveFocus()
      // Focus that ended up outside (a click on the page behind) comes back in.
      document.body.focus()
      await userEvent.tab()
      expect(title).toHaveFocus()
    })

    it('locks the page behind while open and says «Guardando…» while it saves', async () => {
      vi.mocked(fetch).mockReturnValueOnce(new Promise(() => {}))
      renderBanner()
      expect(document.documentElement.style.overflow).toBe('hidden')
      await userEvent.click(screen.getByRole('button', { name: 'Entendido' }))
      expect(await screen.findByRole('button', { name: 'Guardando…' })).toBeDisabled()
    })
  })
})
