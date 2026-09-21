import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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

/** Every request gets an answer shaped like the real API: the account, a child's consultations, or its overview. */
function stubApi(account: unknown, { consultations = [], doses = [] }: { consultations?: unknown[]; doses?: unknown[] } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      const body = url.includes('/overview')
        ? { childId: 'child-1', doses, activeTreatment: null }
        : url.includes('/consultations')
          ? { consultations }
          : account
      return { ok: true, json: async () => body } as Response
    }),
  )
}

const dose = (taken: boolean) => ({
  id: `d-${Math.random()}`, consultationId: 'c1', medicationName: 'Amoxicilina', scheduledAt: '2026-01-15T14:00:00Z', taken,
})

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
    stubApi({
        id: 'account-with-child', firstName: 'Ana', lastName: 'Gómez', email: 'ana@example.com',
        countryCode: null, stateCode: null, plan: 'free',
        children: [{ id: 'child-1', firstName: 'Luis', lastName: 'Gómez', birthDate: '2020-01-15', height: null, weight: null }],
      })
    renderHome()

    expect(await screen.findByText('Luis Gómez')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Luis Gómez/ })).toHaveAttribute('href', '/children/child-1')
  })

  it('opens the AddChildModal when "Agregar hijo" is clicked and the plan has room (FR-004)', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('peditrack.accountId', 'account-with-child')
    stubApi({
        id: 'account-with-child', firstName: 'Ana', lastName: 'Gómez', email: 'ana@example.com',
        countryCode: null, stateCode: null, plan: 'paid',
        children: [{ id: 'child-1', firstName: 'Luis', lastName: 'Gómez', birthDate: '2020-01-15', height: null, weight: null }],
      })
    renderHome()

    await user.click(await screen.findByRole('button', { name: /Agregar hijo/ }))

    expect(await screen.findByRole('dialog', { name: 'Agregar hijo' })).toBeInTheDocument()
  })

  it('shows the plan-limit pop-up right away, without a form, on the free plan with a child (mockups 05/15)', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('peditrack.accountId', 'account-free')
    stubApi({
        id: 'account-free', firstName: 'Ana', lastName: 'Gómez', email: 'ana@example.com',
        countryCode: null, stateCode: null, plan: 'free',
        children: [{ id: 'child-1', firstName: 'Luis', lastName: 'Gómez', birthDate: '2020-01-15', height: null, weight: null }],
      })
    renderHome()

    await user.click(await screen.findByRole('button', { name: /Agregar hijo/ }))

    expect(await screen.findByRole('dialog', { name: 'Llegaste a un hijo registrado' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    expect(screen.getByText('El plan gratuito incluye un hijo.')).toBeInTheDocument()
  })

  it('gives the focus back to "+ Agregar hijo" when the plan pop-up closes, even if the click never focused it (Safari)', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('peditrack.accountId', 'account-free')
    stubApi({
      id: 'account-free', firstName: 'Ana', lastName: 'Gómez', email: 'ana@example.com',
      countryCode: null, stateCode: null, plan: 'free',
      children: [{ id: 'child-1', firstName: 'Luis', lastName: 'Gómez', birthDate: '2020-01-15', height: null, weight: null }],
    })
    renderHome()
    const opener = await screen.findByRole('button', { name: '+ Agregar hijo' })

    // A click that leaves the button unfocused, as Safari does; the pop-up is the one that focuses "Ver planes".
    fireEvent.click(opener)
    expect(await screen.findByRole('button', { name: 'Ver planes' })).toHaveFocus()
    expect(opener).not.toHaveFocus()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
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

  describe('child card chips on the phone (board screen 2)', () => {
    const account = {
      id: 'account-chips', firstName: 'Ana', lastName: 'Morales', email: 'ana@example.com',
      countryCode: null, stateCode: null, plan: 'free',
      children: [{ id: 'child-1', firstName: 'Mateo', lastName: 'Morales', birthDate: '2021-03-14', height: null, weight: null }],
    }
    const consultation = (id: string) => ({ id, doctorName: 'Dra. López', consultDate: '2026-01-15', symptoms: '', medicationCount: 1 })

    beforeEach(() => window.localStorage.setItem('peditrack.accountId', 'account-chips'))

    it('is a centered column of at most 430px, as the mock', async () => {
      stubApi(account)
      renderHome()

      await screen.findByText('Hola, Ana')
      expect(screen.getByRole('main')).toHaveClass('mx-auto', 'max-w-[430px]')
    })

    it('greets the tutor and shows their initials in the header', async () => {
      stubApi(account)
      renderHome()

      expect(await screen.findByText('Hola, Ana')).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 1, name: 'Tus hijos' })).toBeInTheDocument()
      expect(screen.getByText('AM')).toBeInTheDocument()
    })

    it('shows how many consultations the child has, and the doses still unmarked today', async () => {
      stubApi(account, { consultations: [consultation('c1'), consultation('c2')], doses: [dose(false), dose(false), dose(true)] })
      renderHome()

      expect(await screen.findByText('2 consultas')).toBeInTheDocument()
      expect(await screen.findByText('2 tomas hoy')).toBeInTheDocument()
    })

    it('uses the singular for one consultation and one dose', async () => {
      stubApi(account, { consultations: [consultation('c1')], doses: [dose(false)] })
      renderHome()

      expect(await screen.findByText('1 consulta')).toBeInTheDocument()
      expect(await screen.findByText('1 toma hoy')).toBeInTheDocument()
    })

    it('reads "Sin tomas pendientes" when nothing is left to mark (all taken, or none today)', async () => {
      stubApi(account, { consultations: [consultation('c1')], doses: [dose(true)] })
      renderHome()

      expect(await screen.findByText('Sin tomas pendientes')).toBeInTheDocument()
    })

    it('keeps the card without chips when the counts fail to load', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (input: RequestInfo | URL) =>
          String(input).includes('/children/')
            ? ({ ok: false, status: 500, json: async () => ({ error: 'x', message: 'boom' }) } as Response)
            : ({ ok: true, json: async () => account } as Response),
        ),
      )
      renderHome()

      expect(await screen.findByText('Mateo Morales')).toBeInTheDocument()
      expect(screen.queryByText(/consulta/)).not.toBeInTheDocument()
      expect(screen.queryByText(/tomas/)).not.toBeInTheDocument()
    })

    it('alternates the avatar colour between children (cyan, then mint)', async () => {
      stubApi({
        ...account, plan: 'paid',
        children: [...account.children, { id: 'child-2', firstName: 'Sofía', lastName: 'Morales', birthDate: '2025-07-01', height: null, weight: null }],
      })
      renderHome()

      const links = await screen.findAllByRole('link', { name: /Morales/ })
      expect(links[0].querySelector('[aria-hidden]')).toHaveClass('bg-bright')
      expect(links[1].querySelector('[aria-hidden]')).toHaveClass('bg-[#a7f3d0]')
    })
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

    it('shows "Hola, Ana / Tus hijos", the solid "Agregar hijo" button, the cards and the plan tile (mock 15)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => account([kid('k1', 'Luis')]) }))
      renderDesktopHome()

      expect(await screen.findByText('Hola, Ana')).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 1, name: 'Tus hijos' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Agregar hijo' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Luis Gómez/ })).toHaveAttribute('href', '/children/k1')
      expect(screen.getByText('Tu plan incluye un hijo')).toBeInTheDocument()
      expect(screen.getByRole('navigation', { name: 'Tus hijos' })).toBeInTheDocument()
    })

    it('opens the plan-limit pop-up from the button, naming the child', async () => {
      const user = userEvent.setup()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => account([kid('k1', 'Luis')]) }))
      renderDesktopHome()

      await user.click(await screen.findByRole('button', { name: 'Agregar hijo' }))

      expect(await screen.findByText(/Luis sigue disponible sin cambios/)).toBeInTheDocument()
    })

    it('shows the empty state (with the sidebar) when there are no children yet', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => account([]) }))
      renderDesktopHome()

      expect(await screen.findByText('Todavía no tienes hijos dados de alta')).toBeInTheDocument()
      expect(screen.queryByText('Tu plan incluye un hijo')).not.toBeInTheDocument()
    })
  })
})
