import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HomePage } from './HomePage'

function renderHome() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/home']}>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('HomePage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it('shows an invitation to create an account when no account id is saved (FR-002)', async () => {
    renderHome()

    expect(await screen.findByText('Bienvenido a PediTrack')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute('href', '/signup')
  })

  it('shows an empty state when the account has no children yet (FR-006)', async () => {
    window.localStorage.setItem('peditrack.accountId', 'account-empty')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'account-empty', firstName: 'Ana', lastName: 'Gómez', email: 'ana@example.com',
          countryCode: null, stateCode: null, plan: 'free', children: [],
        }),
      }),
    )
    renderHome()

    expect(await screen.findByText(/todavía no tienes hijos/i)).toBeInTheDocument()
  })

  it('lists a card per child with name and age (FR-001)', async () => {
    window.localStorage.setItem('peditrack.accountId', 'account-with-child')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'account-with-child', firstName: 'Ana', lastName: 'Gómez', email: 'ana@example.com',
          countryCode: null, stateCode: null, plan: 'free',
          children: [{ id: 'child-1', firstName: 'Luis', lastName: 'Gómez', birthDate: '2020-01-15', height: null, weight: null }],
        }),
      }),
    )
    renderHome()

    expect(await screen.findByText('Luis Gómez')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Luis Gómez/ })).toHaveAttribute('href', '/children/child-1')
  })

  it('opens the AddChildModal when "Agregar hijo" is clicked (FR-004)', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('peditrack.accountId', 'account-with-child')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'account-with-child', firstName: 'Ana', lastName: 'Gómez', email: 'ana@example.com',
          countryCode: null, stateCode: null, plan: 'free',
          children: [{ id: 'child-1', firstName: 'Luis', lastName: 'Gómez', birthDate: '2020-01-15', height: null, weight: null }],
        }),
      }),
    )
    renderHome()

    await user.click(await screen.findByRole('button', { name: 'Agregar hijo' }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('clears the saved account id and shows the invitation when the account no longer exists (Caso Límite)', async () => {
    window.localStorage.setItem('peditrack.accountId', 'stale-id')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'account_not_found', message: 'Account not found' }),
      }),
    )
    renderHome()

    expect(await screen.findByText('Bienvenido a PediTrack')).toBeInTheDocument()
    expect(window.localStorage.getItem('peditrack.accountId')).toBeNull()
  })

  describe('on desktop (sidebar on screen)', () => {
    const account = (children: unknown[]) => ({
      id: 'a1', firstName: 'Ana', lastName: 'Gómez', email: 'ana@example.com',
      countryCode: null, stateCode: null, plan: 'free', children,
    })
    const kid = (id: string, firstName: string) => ({
      id, firstName, lastName: 'Gómez', birthDate: '2021-05-10', height: null, weight: null,
    })

    beforeEach(() => {
      window.localStorage.setItem('peditrack.accountId', 'a1')
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
      )
    })

    function renderDesktopHome() {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      return render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/home']}>
            <Routes>
              <Route path="/home" element={<HomePage />} />
              <Route path="/children/:childId" element={<p>DETALLE DEL HIJO</p>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      )
    }

    it("opens the first child's detail instead of the list (mock 6, 'Home con detalle')", async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => account([kid('k1', 'Luis'), kid('k2', 'Sofía')]) }))
      renderDesktopHome()

      expect(await screen.findByText('DETALLE DEL HIJO')).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Tus hijos' })).not.toBeInTheDocument()
    })

    it('keeps the empty state (with the sidebar) when there are no children yet', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => account([]) }))
      renderDesktopHome()

      expect(await screen.findByText('Todavía no tienes hijos dados de alta')).toBeInTheDocument()
      expect(screen.queryByText('DETALLE DEL HIJO')).not.toBeInTheDocument()
    })
  })
})
