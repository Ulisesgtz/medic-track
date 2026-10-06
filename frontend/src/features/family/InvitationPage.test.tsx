import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { InvitationPage } from './InvitationPage'
import { readPendingInvitation, savePendingInvitation } from './pendingInvitation'

vi.mock('@clerk/react', () => ({ useAuth: vi.fn() }))

type Reply = { status?: number; body?: unknown }

const preview = {
  ownerName: 'Ana',
  role: 'tutor',
  email: 'papa@example.com',
  expiresAt: '2026-10-13T10:00:00Z',
  emailMatches: true,
}
const account = { id: 'a1', firstName: 'Luis', lastName: 'Pérez', plan: 'free', children: [] }

function stubApi(routes: Record<string, Reply>) {
  const calls: { method: string; path: string; url: string; body?: unknown }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const method = init?.method ?? 'GET'
      calls.push({ method, path: url.pathname, url: url.toString(), body: init?.body ? JSON.parse(String(init.body)) : undefined })
      const reply = routes[`${method} ${url.pathname}`] ?? { status: 204 }
      const status = reply.status ?? 200
      return { ok: status < 300, status, json: async () => reply.body ?? {} } as Response
    }),
  )
  return calls
}

function renderPage(hash = '#SECRET') {
  window.location.hash = hash
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/familia/invitacion']}>
        <Routes>
          <Route path="/familia/invitacion" element={<InvitationPage />} />
          <Route path="/home" element={<p>home</p>} />
          <Route path="/login" element={<p>login</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function session(signedIn: boolean, signOut = vi.fn().mockResolvedValue(undefined)) {
  vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: signedIn, getToken: async () => 'tok', signOut } as unknown as ReturnType<typeof useAuth>)
  return signOut
}

beforeEach(() => {
  sessionStorage.clear()
  session(true)
})
afterEach(() => {
  vi.unstubAllGlobals()
  window.location.hash = ''
  sessionStorage.clear()
})

describe('InvitationPage', () => {
  it('explains a link with no invitation in it', () => {
    renderPage('')
    expect(screen.getByRole('heading', { name: 'Esta liga no sirve' })).toBeInTheDocument()
  })

  it('waits for Clerk before deciding anything', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: false } as unknown as ReturnType<typeof useAuth>)
    renderPage()
    expect(screen.getByText('Cargando…')).toBeInTheDocument()
  })

  it('asks a visitor with no session to log in or sign up, and remembers the invitation for the way back', () => {
    session(false)
    renderPage()
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute('href', '/signup')
    expect(readPendingInvitation()).toBe('SECRET')
  })

  it('takes the token from the saved one when the address has none (back from logging in)', async () => {
    savePendingInvitation('SAVED')
    const calls = stubApi({ 'GET /accounts/me': { body: account }, 'POST /family/invitations/preview': { body: preview } })
    renderPage('')
    await screen.findByRole('button', { name: 'Aceptar' })
    expect(calls.find((c) => c.path === '/family/invitations/preview')?.body).toEqual({ token: 'SAVED' })
  })

  it('shows what the invitation offers, with the medical-data warning, and never sends the token in an address', async () => {
    const calls = stubApi({ 'GET /accounts/me': { body: account }, 'POST /family/invitations/preview': { body: preview } })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Ana te invita a su familia' })).toBeInTheDocument()
    expect(screen.getByText(/Tutor/)).toBeInTheDocument()
    expect(screen.getByText(/datos médicos de los hijos de Ana/)).toBeInTheDocument()
    expect(screen.getByText('papa@example.com')).toBeInTheDocument()
    expect(calls.every((c) => !c.url.includes('SECRET'))).toBe(true)
  })

  it('clears the way back once the person is in', async () => {
    savePendingInvitation('SECRET')
    stubApi({ 'GET /accounts/me': { body: account }, 'POST /family/invitations/preview': { body: preview } })
    renderPage()
    await screen.findByRole('button', { name: 'Aceptar' })
    expect(readPendingInvitation()).toBeNull()
  })

  it('accepts and goes to the home with the shared children', async () => {
    const calls = stubApi({
      'GET /accounts/me': { body: account },
      'POST /family/invitations/preview': { body: preview },
      'POST /family/invitations/accept': { body: { id: 'm1', role: 'tutor', name: 'Luis' } },
    })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Aceptar' }))

    expect(await screen.findByText('home')).toBeInTheDocument()
    expect(calls.find((c) => c.path === '/family/invitations/accept')?.body).toEqual({ token: 'SECRET' })
  })

  it('declines and goes to the home', async () => {
    const calls = stubApi({ 'GET /accounts/me': { body: account }, 'POST /family/invitations/preview': { body: preview } })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Rechazar' }))
    expect(await screen.findByText('home')).toBeInTheDocument()
    expect(calls.some((c) => c.path === '/family/invitations/decline')).toBe(true)
  })

  it.each([
    ['email_mismatch', 403, /otro correo/],
    ['email_not_verified', 403, /no está verificado/],
    ['already_in_family', 409, /familia de otra persona/],
    ['family_full', 422, /máximo de personas/],
    ['invitation_not_found', 404, /ya no sirve/],
    ['account_required', 409, /necesitas tu cuenta/],
    ['internal_error', 500, /No pudimos completar esto/],
  ])('explains a refusal of %s when accepting', async (error, status, text) => {
    stubApi({
      'GET /accounts/me': { body: account },
      'POST /family/invitations/preview': { body: preview },
      'POST /family/invitations/accept': { status, body: { error } },
    })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Aceptar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
    expect(screen.queryByText('home')).not.toBeInTheDocument()
  })

  it('says the plan is the reason when the family stopped paying before the person accepted', async () => {
    stubApi({
      'GET /accounts/me': { body: account },
      'POST /family/invitations/preview': { body: preview },
      'POST /family/invitations/accept': { status: 422, body: { error: 'freemium_consultation_limit_exceeded', reason: 'family' } },
    })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Aceptar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/ya no tiene el plan completo/)
  })

  it('does not offer to accept to a session whose e-mail is not the invited one: it offers to log out', async () => {
    const signOut = session(true)
    stubApi({ 'GET /accounts/me': { body: account }, 'POST /family/invitations/preview': { body: { ...preview, emailMatches: false } } })
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText(/Entraste con otro correo/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aceptar' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(signOut).toHaveBeenCalled()
  })

  it('tells a link that was used, expired or canceled that it no longer works', async () => {
    savePendingInvitation('SECRET')
    stubApi({ 'GET /accounts/me': { body: account }, 'POST /family/invitations/preview': { status: 404, body: { error: 'invitation_not_found' } } })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Esta liga ya no sirve' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir a mi home' })).toHaveAttribute('href', '/home')
  })

  it('offers to try again when the invitation cannot be read', async () => {
    let fail = true
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const path = new URL(String(input)).pathname
        if (path === '/accounts/me') return { ok: true, status: 200, json: async () => account } as Response
        if (fail) return { ok: false, status: 500, json: async () => ({}) } as Response
        return { ok: true, status: 200, json: async () => preview } as Response
      }),
    )
    const user = userEvent.setup()
    renderPage()
    const retry = await screen.findByRole('button', { name: 'Reintentar' })
    fail = false
    await user.click(retry)
    expect(await screen.findByRole('button', { name: 'Aceptar' })).toBeInTheDocument()
  })

  it('asks a person with no PediTrack account for their name and creates one with no children', async () => {
    let created = false
    const calls: { method: string; path: string; body?: unknown }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname
        const method = init?.method ?? 'GET'
        calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined })
        if (path === '/accounts/me' && !created) return { ok: false, status: 404, json: async () => ({ error: 'account_not_found_for_session' }) } as Response
        if (path === '/accounts/me') return { ok: true, status: 200, json: async () => account } as Response
        if (method === 'POST' && path === '/accounts') {
          created = true
          return { ok: true, status: 201, json: async () => account } as Response
        }
        return { ok: true, status: 200, json: async () => preview } as Response
      }),
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Continuar' }))
    expect(screen.getAllByText('Escribe tu nombre.')).toHaveLength(2)
    await user.type(screen.getByLabelText('Nombre'), 'Luis')
    await user.type(screen.getByLabelText('Apellido'), '1234')
    expect(screen.getByText(/Usa solo letras/)).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Apellido'))
    await user.type(screen.getByLabelText('Apellido'), 'Pérez')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByRole('button', { name: 'Aceptar' })).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'POST' && c.path === '/accounts')?.body).toEqual({ firstName: 'Luis', lastName: 'Pérez', children: [] })
  })

  it('says so when the account cannot be created', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname
        if (path === '/accounts/me') return { ok: false, status: 404, json: async () => ({}) } as Response
        if (init?.method === 'POST') return { ok: false, status: 500, json: async () => ({ message: 'boom' }) } as Response
        return { ok: true, status: 200, json: async () => preview } as Response
      }),
    )
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByLabelText('Nombre'), 'Luis')
    await user.type(screen.getByLabelText('Apellido'), 'Pérez')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/No pudimos crear tu cuenta/)
  })

  it('offers to try again when the account cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response))
    renderPage()
    expect(await screen.findByRole('heading', { name: 'No pudimos cargar tu cuenta' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })
})
