import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { HomePage } from './HomePage'

vi.mock('@clerk/react', () => ({ useAuth: vi.fn() }))

let signOut: ReturnType<typeof vi.fn>

function renderHome() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const spy = vi.spyOn(queryClient, 'clear')
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/home']}>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...utils, queryClientClearSpy: spy }
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
    signOut = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      getToken: async () => 'test-token',
      signOut,
    } as unknown as ReturnType<typeof useAuth>)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it('invites the tutor to finish their registration when the session has no linked account yet (FR-006, specs/008)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'account_not_found_for_session', message: 'No account is linked to this session yet' }),
      }),
    )
    renderHome()

    expect(await screen.findByText('Falta terminar tu registro')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Terminar registro' })).toHaveAttribute('href', '/registro/completar')

    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(signOut).toHaveBeenCalledOnce()
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

  it('signs out and clears the query cache when "Cerrar sesión" is clicked (phone)', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('peditrack.accountId', 'account-with-child')
    stubApi({
      id: 'account-with-child', firstName: 'Ana', lastName: 'Gómez', email: 'ana@example.com',
      countryCode: null, stateCode: null, plan: 'free',
      children: [{ id: 'child-1', firstName: 'Luis', lastName: 'Gómez', birthDate: '2020-01-15', height: null, weight: null }],
    })
    const { queryClientClearSpy } = renderHome()

    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }))

    expect(signOut).toHaveBeenCalledOnce()
    expect(queryClientClearSpy).toHaveBeenCalledOnce()
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
      const spy = vi.spyOn(queryClient, 'clear')
      const utils = render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/home']}>
            <Routes>
              <Route path="/home" element={<HomePage />} />
              <Route path="/children/:childId" element={<p>DETALLE DEL HIJO</p>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      )
      return { ...utils, queryClientClearSpy: spy }
    }

    it("keeps the mock's responsive margins: smaller below 1024px, where the sidebar is hidden", async () => {
      // 1000px: the web design (from 900px) but no sidebar (from 1024px).
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockImplementation((query: string) => ({
          matches: 1000 >= Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? Infinity),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      )
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => account([kid('k1', 'Luis')]) }))
      renderDesktopHome()

      await screen.findByText('Hola, Ana')
      expect(screen.getByRole('main')).toHaveClass('px-6', 'py-8', 'lg:px-12', 'lg:py-11')
      expect(screen.queryByRole('navigation', { name: 'Tus hijos' })).not.toBeInTheDocument()
    })

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

    it('signs out and clears the query cache when "Cerrar sesión" is clicked in the main content (desktop)', async () => {
      const user = userEvent.setup()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => account([kid('k1', 'Luis')]) }))
      const { queryClientClearSpy } = renderDesktopHome()

      await screen.findByText('Hola, Ana')
      const main = screen.getByRole('main')
      await user.click(within(main).getByRole('button', { name: 'Cerrar sesión' }))

      expect(signOut).toHaveBeenCalledOnce()
      expect(queryClientClearSpy).toHaveBeenCalledOnce()
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
