import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { WelcomeDisclaimer } from './WelcomeDisclaimer'
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

describe('WelcomeDisclaimer', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ getToken: vi.fn().mockResolvedValue('tok-1') } as unknown as ReturnType<typeof useAuth>)
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the informative-only notice to an account that has not acknowledged it', () => {
    renderBanner()

    const region = screen.getByRole('region', { name: 'Antes de empezar' })
    expect(region).toHaveTextContent('informativa y de seguimiento')
    expect(region).toHaveTextContent('no sustituye una consulta médica')
    expect(region).toHaveTextContent('acude siempre a tu médico')
    expect(region).toHaveTextContent('solo cuando está impresa (no escrita a mano)')
    expect(region).toHaveTextContent('no la interpretamos y no autollenamos ningún campo')
    expect(region).toHaveTextContent('la foto se guarda en tu cuenta y solo la ven las personas a las que tú invites')
    expect(region).toHaveTextContent('Compartir significa que otra persona ve los datos médicos del menor')
    expect(region).toHaveTextContent('solo repiten lo que tú escribiste')
  })

  it('is not shown once the account acknowledged it, nor while there is no account yet', () => {
    const { unmount } = renderBanner({ ...account, disclaimerAccepted: true })
    expect(screen.queryByRole('region', { name: 'Antes de empezar' })).not.toBeInTheDocument()
    unmount()

    renderBanner(null)
    expect(screen.queryByRole('region', { name: 'Antes de empezar' })).not.toBeInTheDocument()
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
    expect(screen.queryByRole('region', { name: 'Antes de empezar' })).not.toBeInTheDocument()
  })

  it('keeps the notice and says so when the acknowledgement could not be saved', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)
    const { queryClient } = renderBanner()

    await userEvent.click(screen.getByRole('button', { name: 'Entendido' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos guardar tu confirmación')
    expect(screen.getByRole('region', { name: 'Antes de empezar' })).toBeInTheDocument()
    expect(queryClient.getQueryData<Account>(['accounts', 'me'])?.disclaimerAccepted).toBe(false)
  })
})
