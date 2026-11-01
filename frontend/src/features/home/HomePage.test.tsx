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

/** The person's own supplement routines (specs/033, part 3): none, the notice already seen. */
const PERSONAL_NONE = { routines: [], activeCount: 0, limit: 10, paidPlan: true, noticeSeen: true }

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
          : url.includes('/routines')
            ? PERSONAL_NONE
            : account
      return { ok: true, json: async () => body } as Response
    }),
  )
}

const dose = (taken: boolean, status = taken ? 'taken' : 'due') => ({
  id: `d-${Math.random()}`, consultationId: 'c1', medicationName: 'Amoxicilina', scheduledAt: '2026-01-15T14:00:00Z', taken, status,
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
    expect(signOut).toHaveBeenCalledExactlyOnceWith({ redirectUrl: '/login' })
  })

  it.each([
    ['a server error', 500],
    ['an expired session', 401],
  ])('shows an error screen with Reintentar for %s, never an empty home or a way to add a child', async (_name, status) => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({ error: 'x', message: 'boom' }) })
    vi.stubGlobal('fetch', fetchMock)
    renderHome()

    expect(await screen.findByText('No pudimos cargar tu cuenta')).toBeInTheDocument()
    expect(screen.queryByText(/todavía no tienes hijos/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Agregar hijo/ })).not.toBeInTheDocument()

    const callsBefore = fetchMock.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore))

    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
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

    expect(await screen.findByText('Aún no registras a tus hijos')).toBeInTheDocument()
  })

  it('shows the "Antes de empezar" notice only while the account has not acknowledged it (specs/010)', async () => {
    const account = {
      id: 'account-notice', firstName: 'Ana', lastName: 'Gómez', email: 'ana@example.com',
      countryCode: null, stateCode: null, plan: 'free', children: [],
      disclaimerVersion: '2026-09-26', disclaimerAccepted: false,
    }
    stubApi(account)
    const { unmount } = renderHome()
    expect(await screen.findByRole('region', { name: 'Antes de empezar' })).toBeInTheDocument()
    unmount()

    stubApi({ ...account, disclaimerAccepted: true })
    renderHome()
    expect(await screen.findByText('Aún no registras a tus hijos')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Antes de empezar' })).not.toBeInTheDocument()
  })

  it('lists a card per child with name and age (FR-001)', async () => {
    window.localStorage.setItem('peditrack.accountId', 'account-with-child')
    stubApi({
        id: 'account-with-child', firstName: 'Ana', lastName: 'Gómez', email: 'ana@example.com',
        countryCode: null, stateCode: null, plan: 'free',
        children: [{ id: 'child-1', firstName: 'Luis', lastName: 'Gómez', birthDate: '2020-01-15', height: null, weight: null }],
      })
    renderHome()

    expect(await screen.findByRole('link', { name: 'Ver detalle de Luis' })).toHaveAttribute('href', '/children/child-1')
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

    expect(await screen.findByRole('dialog', { name: 'Tu plan incluye un hijo' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Agregar hijo/ })).toHaveTextContent('Tu plan incluye un hijo')
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
    const opener = await screen.findByRole('button', { name: /Agregar hijo/ })

    // A click that leaves the button unfocused, as Safari does; the pop-up is the one that focuses "Ahora no".
    fireEvent.click(opener)
    expect(await screen.findByRole('button', { name: 'Ahora no' })).toHaveFocus()
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

    beforeEach(() => window.localStorage.setItem('peditrack.accountId', 'account-chips'))

    it('is a centered column of at most 430px, as the mock', async () => {
      stubApi(account)
      renderHome()

      await screen.findByText('Hola, Ana')
      expect(screen.getByRole('main')).toHaveClass('mx-auto', 'max-w-[430px]')
    })

    it('greets the tutor first, with the date and their initials, then «Tu día», then the children (specs/055)', async () => {
      stubApi(account)
      renderHome()

      const hello = await screen.findByRole('heading', { level: 1, name: 'Hola, Ana' })
      expect(screen.getByText(/^(lunes|martes|miércoles|jueves|viernes|sábado|domingo) \d+ de /)).toBeInTheDocument()
      expect(screen.getByText('AM')).toBeInTheDocument()
      const children = screen.getByRole('heading', { level: 2, name: 'Tus hijos' })
      expect(hello.compareDocumentPosition(children) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('shows the day of each child: a row per kind with something today, and the next dose to mark (specs/055)', async () => {
      stubApi(account, { doses: [dose(false), dose(true)] })
      renderHome()

      const card = (await screen.findByRole('link', { name: 'Ver detalle de Mateo' })).closest('article')!
      expect(await within(card).findByText('2 tomas hoy · 1 por marcar')).toBeInTheDocument()
      expect(within(card).getByText('1 por marcar')).toBeInTheDocument()
      expect(within(card).queryByText('Suplementos')).not.toBeInTheDocument()
      expect(within(card).getByRole('button', { name: /^Marcar Amoxicilina/ })).toBeInTheDocument()
      expect(within(card).queryByText(/consulta/)).not.toBeInTheDocument()
    })

    it('says when the child has nothing today', async () => {
      stubApi(account)
      renderHome()

      expect(await screen.findByText('Hoy no hay tomas ni actividades')).toBeInTheDocument()
    })

    it('keeps the card and offers to try again when its day fails to load', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (input: RequestInfo | URL) =>
          String(input).includes('/children/')
            ? ({ ok: false, status: 500, json: async () => ({ error: 'x', message: 'boom' }) } as Response)
            : ({ ok: true, json: async () => (String(input).includes('/routines') ? PERSONAL_NONE : account) } as Response),
        ),
      )
      renderHome()

      expect(await screen.findByText('No pudimos cargar el día de Mateo')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    })

    it('alternates the avatar colour between children (action, then confirmed)', async () => {
      stubApi({
        ...account, plan: 'paid',
        children: [...account.children, { id: 'child-2', firstName: 'Sofía', lastName: 'Morales', birthDate: '2025-07-01', height: null, weight: null }],
      })
      renderHome()

      await screen.findByRole('link', { name: 'Ver detalle de Sofía' })
      const links = screen.getAllByRole('link', { name: /^Ver detalle de/ })
      expect(links[0].querySelector('[aria-hidden]')).toHaveClass('bg-action')
      expect(links[1].querySelector('[aria-hidden]')).toHaveClass('bg-confirmed')
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
      stubApi(account([kid('k1', 'Luis')]))
      renderDesktopHome()

      await screen.findByText('Hola, Ana')
      expect(screen.getByRole('main')).toHaveClass('px-6', 'py-8', 'lg:px-12', 'lg:pt-11')
      expect(screen.queryByRole('navigation', { name: 'Tus hijos' })).not.toBeInTheDocument()
    })

    it('shows the children in two columns, «+ Agregar hijo» with the plan note, and the sidebar (specs/055)', async () => {
      stubApi(account([kid('k1', 'Luis')]))
      renderDesktopHome()

      expect(await screen.findByRole('heading', { level: 1, name: 'Hola, Ana' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 2, name: 'Tus hijos' })).toBeInTheDocument()
      const main = screen.getByRole('main')
      expect(within(main).getByRole('button', { name: /Agregar hijo/ })).toHaveTextContent('Tu plan incluye un hijo')
      expect(await within(main).findByRole('link', { name: 'Ver detalle de Luis' })).toHaveAttribute('href', '/children/k1')
      expect(screen.getByRole('navigation', { name: 'Tus hijos' })).toBeInTheDocument()
    })

    it('signs out and clears the query cache when "Cerrar sesión" is clicked in the main content (desktop)', async () => {
      const user = userEvent.setup()
      stubApi(account([kid('k1', 'Luis')]))
      const { queryClientClearSpy } = renderDesktopHome()

      await screen.findByText('Hola, Ana')
      const main = screen.getByRole('main')
      await user.click(within(main).getByRole('button', { name: 'Cerrar sesión' }))

      expect(signOut).toHaveBeenCalledOnce()
      expect(queryClientClearSpy).toHaveBeenCalledOnce()
    })

    it('opens the plan-limit pop-up from the button, naming the child', async () => {
      const user = userEvent.setup()
      stubApi(account([kid('k1', 'Luis')]))
      renderDesktopHome()

      await screen.findByRole('link', { name: 'Ver detalle de Luis' })
      await user.click(within(screen.getByRole('main')).getByRole('button', { name: /Agregar hijo/ }))

      expect(await screen.findByText('Intentaste agregar a otro hijo. El plan gratuito incluye uno.')).toBeInTheDocument()
    })

    it('shows the empty state (with the sidebar) when there are no children yet', async () => {
      stubApi(account([]))
      renderDesktopHome()

      expect(await screen.findByText('Aún no registras a tus hijos')).toBeInTheDocument()
      expect(screen.queryByText('Tu plan incluye un hijo')).not.toBeInTheDocument()
    })
  })
})

// specs/032-compartir-con-familia: the home of somebody who shares children with a family.
describe('HomePage, family (specs/032)', () => {
  const shared = (role: string, familyPlan = 'paid', readOnly = false) => ({
    id: 'me', firstName: 'Luis', lastName: 'Pérez', email: 'luis@example.com',
    countryCode: null, stateCode: null, plan: 'free',
    children: [{ id: 'k1', firstName: 'Mía', lastName: 'Gómez', birthDate: '2020-01-15', height: null, weight: null, accountId: 'owner', role, plan: familyPlan, readOnly }],
    family: { role, ownerAccountId: 'owner', ownerName: 'Ana', plan: familyPlan, readOnly },
  })

  beforeEach(() => {
    sessionStorage.clear()
    vi.mocked(useAuth).mockReturnValue({
      isLoaded: true, isSignedIn: true, getToken: async () => 'test-token', signOut: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })

  it('links to «Planes» from the phone home, which has no sidebar', async () => {
    stubApi(shared('tutor'))
    renderHome()
    expect(await screen.findByRole('link', { name: /^Planes/ })).toHaveAttribute('href', '/planes')
  })

  it('links to «Familia» from the home', async () => {
    stubApi(shared('tutor'))
    renderHome()
    expect(await screen.findByRole('link', { name: /Familia/ })).toHaveAttribute('href', '/familia')
  })

  it.each([
    ['a Caregiver', shared('caregiver')],
    ['a child-role member', shared('child')],
    ['a Tutor of a family that stopped paying', shared('tutor', 'free', true)],
  ])('does not offer %s to add a child, but still shows the shared child', async (_who, account) => {
    stubApi(account)
    renderHome()
    expect(await screen.findByRole('link', { name: 'Ver detalle de Mía' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Agregar hijo/ })).not.toBeInTheDocument()
    expect(screen.queryByText('El plan gratuito incluye un hijo.')).not.toBeInTheDocument()
  })

  it('lets a Tutor of a paid family add a child (to the family\'s account) without the free plan\'s limit', async () => {
    const user = userEvent.setup()
    stubApi(shared('tutor'))
    renderHome()
    await user.click(await screen.findByRole('button', { name: /Agregar hijo/ }))
    expect(await screen.findByRole('dialog', { name: 'Agregar hijo' })).toBeInTheDocument()
  })

  it('takes somebody who opened an invitation before logging in back to it, once', async () => {
    sessionStorage.setItem('invitacion-pendiente', 'TOKEN')
    stubApi(shared('tutor'))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/home']}>
          <Routes>
            <Route path="/home" element={<HomePage />} />
            <Route path="/familia/invitacion" element={<p>pantalla de la invitación</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('pantalla de la invitación')).toBeInTheDocument()
  })
})
