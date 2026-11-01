import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { MoreLinks } from './MoreLinks'
import { AccountMenu } from './AccountMenu'
import type { Account } from './types'

vi.mock('@clerk/react', () => ({ useAuth: vi.fn() }))

const ana = {
  id: 'acc', firstName: 'Ana', lastName: 'Morales', plan: 'paid', children: [], reminderDetail: null,
  disclaimerVersion: 'v', disclaimerAccepted: true, email: 'a@example.com', countryCode: null, stateCode: null,
} as unknown as Account
const rosa = { ...ana, firstName: 'Rosa', lastName: 'Luna', plan: 'free', family: { role: 'caregiver', ownerAccountId: 'o', ownerName: 'Ana', plan: 'paid', readOnly: false } } as Account

let signOut: ReturnType<typeof vi.fn>
let queryClient: QueryClient

function renderIn(ui: React.ReactNode) {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  signOut = vi.fn().mockResolvedValue(undefined)
  vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true, getToken: async () => 't', signOut } as unknown as ReturnType<typeof useAuth>)
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ owner: { id: 'acc', name: 'Ana' }, members: [{ name: 'Luis' }, { name: 'Rosa' }], invitations: [], capacity: { max: 4 } }),
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('MoreLinks', () => {
  it('phone: Familia, Planes, Recordatorios and Cerrar sesión, each with its value', async () => {
    renderIn(<MoreLinks account={ana} variant="phone" />)
    const nav = screen.getByRole('navigation', { name: 'Más opciones' })
    expect(within(nav).getByRole('link', { name: /Familia/ })).toHaveAttribute('href', '/familia')
    expect(await within(nav).findByText('3 personas')).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /Planes/ })).toHaveTextContent('Plan completo')
    expect(within(nav).getByRole('button', { name: /Recordatorios/ })).toHaveTextContent('Desactivados')
    expect(within(nav).getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
  })

  it('«Recordatorios» opens the reminders card right under it', async () => {
    const user = userEvent.setup()
    renderIn(<MoreLinks account={ana} variant="desktop" />)
    const toggle = screen.getByRole('button', { name: /Recordatorios/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('heading', { name: 'Recordatorios de tomas' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Más opciones' })).toHaveClass('grid-cols-4')
  })

  it('«Cerrar sesión» signs out', async () => {
    const user = userEvent.setup()
    renderIn(<MoreLinks account={ana} variant="phone" />)
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(signOut).toHaveBeenCalledOnce()
  })

  it('a Caregiver sees the family and its role, and no «Planes»', () => {
    renderIn(<MoreLinks account={rosa} variant="phone" />)
    expect(screen.getByText('Familia de Ana · Cuidador')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Planes/ })).not.toBeInTheDocument()
  })
})

describe('AccountMenu', () => {
  it('the initials open the name, the plan and «Cerrar sesión»; Escape closes it and the focus goes back', async () => {
    const user = userEvent.setup()
    renderIn(<AccountMenu account={ana} variant="phone" />)
    const button = screen.getByRole('button', { name: 'Menú de cuenta' })
    expect(button).toHaveTextContent('AM')
    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Ana Morales')).toBeInTheDocument()
    expect(screen.getByText('Plan completo')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it('a tap outside closes it, and «Cerrar sesión» signs out', async () => {
    const user = userEvent.setup()
    renderIn(
      <>
        <p>fuera</p>
        <AccountMenu account={rosa} variant="sidebar" />
      </>,
    )
    const button = screen.getByRole('button', { name: 'Menú de cuenta' })
    expect(button).toHaveTextContent('Rosa Luna')
    expect(button).toHaveTextContent('Plan completo')
    await user.click(button)
    await user.click(screen.getByText('fuera'))
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await user.click(button)
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(signOut).toHaveBeenCalledOnce()
  })
})
