import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
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
})
