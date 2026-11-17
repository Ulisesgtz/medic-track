import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { MoreLinks as MoreLinksList } from './MoreLinks'
import { useReminders } from '../reminders/useReminders'
import { AccountMenu } from './AccountMenu'
import type { Account } from './types'

vi.mock('@clerk/react', () => ({ useAuth: vi.fn() }))

const ana = {
  id: 'acc', firstName: 'Ana', lastName: 'Morales', plan: 'paid', children: [], reminderDetail: null,
  disclaimerVersion: 'v', disclaimerAccepted: true, email: 'a@example.com', countryCode: null, stateCode: null,
} as unknown as Account
const rosa = { ...ana, firstName: 'Rosa', lastName: 'Luna', plan: 'free', family: { role: 'caregiver', ownerAccountId: 'o', ownerName: 'Ana', plan: 'paid', readOnly: false } } as Account

// The home holds one `useReminders` for «Lo demás» and the first-use guide; here the list gets its own.
function MoreLinks(props: Omit<React.ComponentProps<typeof MoreLinksList>, 'reminders'>) {
  return <MoreLinksList {...props} reminders={useReminders(props.account)} />
}

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
    // jsdom has no Push API: the row says they can't be had here, never «Desactivados».
    expect(within(nav).getByRole('button', { name: /Recordatorios/ })).toHaveTextContent('No disponibles aquí')
    expect(within(nav).getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
    // Specs/070: «Mi cuenta» (download all the data, delete the account), before «Cerrar sesión».
    expect(within(nav).getByRole('link', { name: /Mi cuenta/ })).toHaveAttribute('href', '/cuenta')
  })

  it('says nothing about the family until it answers (no «Solo tú» while it loads)', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    renderIn(<MoreLinks account={ana} variant="phone" />)
    expect(screen.getByRole('link', { name: /Familia/ })).toHaveTextContent(/^Familia$/)
    expect(screen.queryByText('Solo tú')).not.toBeInTheDocument()
  })

  it('«Recordatorios» opens the reminders card right under it', async () => {
    const user = userEvent.setup()
    renderIn(<MoreLinks account={ana} variant="desktop" />)
    const toggle = screen.getByRole('button', { name: /Recordatorios/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('heading', { name: 'Recordatorios de tomas' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Más opciones' })).toHaveClass('grid-cols-5')
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

describe('MoreLinksList with the first-use guide row (specs/071, state F)', () => {
  const reminders = { state: 'off', busy: false, error: null, activate: vi.fn(), deactivate: vi.fn(), changeDetail: vi.fn(), recheck: vi.fn() } as unknown as Parameters<typeof MoreLinksList>[0]['reminders']

  it.each(['phone', 'desktop'] as const)('%s: «Primeros pasos · Ver guía» is the first row and opens the guide again', async (variant) => {
    const onOpen = vi.fn()
    renderIn(<MoreLinksList account={ana} variant={variant} reminders={reminders} guideRow={{ show: true, onOpen, busy: false }} />)

    const nav = screen.getByRole('navigation', { name: 'Más opciones' })
    const row = within(nav).getByRole('button', { name: /Primeros pasos/ })
    expect(row).toHaveTextContent('Ver guía')
    expect(nav.firstElementChild).toBe(row)
    expect(row.querySelector('span')?.className).toContain('text-action')
    await userEvent.click(row)
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('the web strip has six columns only with that row', () => {
    const { unmount } = renderIn(<MoreLinksList account={ana} variant="desktop" reminders={reminders} guideRow={{ show: true, onOpen: vi.fn(), busy: false }} />)
    expect(screen.getByRole('navigation', { name: 'Más opciones' })).toHaveClass('grid-cols-6')
    unmount()
    renderIn(<MoreLinksList account={ana} variant="desktop" reminders={reminders} guideRow={{ show: false, onOpen: vi.fn(), busy: false }} />)
    expect(screen.getByRole('navigation', { name: 'Más opciones' })).toHaveClass('grid-cols-5')
    expect(screen.queryByRole('button', { name: /Primeros pasos/ })).not.toBeInTheDocument()
  })

  it('the row waits while the guide is being reopened', () => {
    renderIn(<MoreLinksList account={ana} variant="phone" reminders={reminders} guideRow={{ show: true, onOpen: vi.fn(), busy: true }} />)
    expect(screen.getByRole('button', { name: /Primeros pasos/ })).toBeDisabled()
  })
})
