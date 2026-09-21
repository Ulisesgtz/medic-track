import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './AppShell'

const account = {
  id: 'a1', firstName: 'Ana', lastName: 'Gómez', email: 'ana@example.com',
  countryCode: null, stateCode: null, plan: 'free',
  children: [
    { id: 'k1', firstName: 'Luis', lastName: 'Gómez', birthDate: '2021-05-10', height: null, weight: null },
    { id: 'k2', firstName: 'Sofía', lastName: 'Gómez', birthDate: '2023-02-01', height: null, weight: null },
  ],
}

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

/** A window `width` px wide: every `(min-width: N)` query matches when N <= width. */
function stubWidth(width: number) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: width >= Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? Infinity),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

function renderShell(activeChildId?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AppShell activeChildId={activeChildId}>
          <p>SCREEN CONTENT</p>
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AppShell', () => {
  beforeEach(() => {
    window.localStorage.setItem('peditrack.accountId', 'a1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => account }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it('shows only the screen below 900px (no sidebar)', () => {
    stubMatchMedia(false)
    renderShell()

    expect(screen.getByText('SCREEN CONTENT')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Tus hijos' })).not.toBeInTheDocument()
  })

  it('shows only the screen when there is no saved account, even on desktop', () => {
    stubMatchMedia(true)
    window.localStorage.clear()
    renderShell()

    expect(screen.getByText('SCREEN CONTENT')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Tus hijos' })).not.toBeInTheDocument()
  })

  it('adds the children sidebar next to the screen on desktop, highlighting the active child', async () => {
    stubMatchMedia(true)
    renderShell('k2')

    const nav = await screen.findByRole('navigation', { name: 'Tus hijos' })
    expect(screen.getByText('SCREEN CONTENT')).toBeInTheDocument()
    const luis = await screen.findByRole('link', { name: /^Luis/ })
    const sofia = screen.getByRole('link', { name: /^Sofía/ })
    expect(nav).toContainElement(luis)
    expect(luis).toHaveAttribute('href', '/children/k1')
    expect(luis).not.toHaveAttribute('aria-current')
    expect(sofia).toHaveAttribute('aria-current', 'page')
  })

  it("shows each child's age and the tutor's initials", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 16, 12))
    stubMatchMedia(true)
    renderShell('k1')

    const nav = await screen.findByRole('navigation', { name: 'Tus hijos' })
    expect(await within(nav).findByText('5a 4m')).toBeInTheDocument()
    expect(within(nav).getByText('3a 7m')).toBeInTheDocument()
    expect(await screen.findByText('AG')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('shows the account name and plan at the bottom of the sidebar', async () => {
    stubMatchMedia(true)
    renderShell()

    expect(await screen.findByText('Ana Gómez')).toBeInTheDocument()
    expect(screen.getByText('Plan gratuito')).toBeInTheDocument()
  })

  it("opens the plan-limit pop-up (in <body>, not inside the sticky sidebar) when the free plan is full", async () => {
    stubMatchMedia(true)
    const user = userEvent.setup()
    renderShell()

    await user.click(await screen.findByRole('button', { name: /Agregar hijo/ }))

    const dialog = screen.getByRole('dialog', { name: 'Llegaste a un hijo registrado' })
    expect(dialog.closest('aside')).toBeNull()
    expect(document.body.contains(dialog)).toBe(true)
    expect(screen.getByText(/Luis sigue disponible sin cambios/)).toBeInTheDocument()
  })

  it('labels a paid account "Plan completo"', async () => {
    stubMatchMedia(true)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...account, plan: 'paid' }) }))
    renderShell()

    expect(await screen.findByText('Plan completo')).toBeInTheDocument()
  })

  it('opens the add-child form from the sidebar when the plan still has room, rendered in <body>', async () => {
    stubMatchMedia(true)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...account, plan: 'paid' }) }))
    const user = userEvent.setup()
    renderShell()

    await user.click(await screen.findByRole('button', { name: /Agregar hijo/ }))

    const dialog = screen.getByRole('dialog', { name: 'Agregar hijo' })
    expect(dialog.closest('aside')).toBeNull()
  })

  it('adds the sidebar from 1024px (`lg`, as the web mockups) and not between 900 and 1023px', async () => {
    stubWidth(1023)
    const { unmount } = renderShell()
    expect(screen.getByText('SCREEN CONTENT')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Tus hijos' })).not.toBeInTheDocument()
    unmount()

    stubWidth(1024)
    renderShell()
    expect(await screen.findByRole('navigation', { name: 'Tus hijos' })).toBeInTheDocument()
  })
})
