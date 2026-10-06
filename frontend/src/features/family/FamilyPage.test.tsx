import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FamilyPage } from './FamilyPage'
import type { FamilyView } from './types'

const family = (extra: Partial<FamilyView> = {}): FamilyView => ({
  role: 'owner',
  plan: 'paid',
  readOnly: false,
  owner: { id: 'o1', name: 'Ana' },
  members: [],
  invitations: [],
  capacity: { max: 4, used: 1 },
  ...extra,
})

type Reply = { status?: number; body?: unknown }

/** One stub for the whole API: `/family` reads, and each write is answered from `writes`. */
function stubApi(read: () => FamilyView, writes: Record<string, Reply> = {}) {
  const calls: { method: string; path: string; body?: unknown }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname
      const method = init?.method ?? 'GET'
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (method === 'GET' && path === '/family') {
        try {
          const data = read()
          return { ok: true, status: 200, json: async () => data } as Response
        } catch {
          return { ok: false, status: 500, json: async () => ({}) } as Response
        }
      }
      if (path.startsWith('/accounts/me')) return { ok: true, status: 200, json: async () => ({ id: 'a', firstName: 'Ana', lastName: 'G', plan: 'paid', children: [] }) } as Response
      const reply = writes[`${method} ${path}`] ?? { status: 204 }
      const status = reply.status ?? 200
      return { ok: status < 300, status, json: async () => reply.body ?? {} } as Response
    }),
  )
  return calls
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/familia']}>
        <Routes>
          <Route path="/familia" element={<FamilyPage />} />
          <Route path="/planes" element={<p>pantalla de planes</p>} />
          <Route path="/home" element={<p>home</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('FamilyPage', () => {
  it('lists the family: the owner first, then each person with their role, and the places used', async () => {
    stubApi(() =>
      family({
        members: [{ id: 'm1', name: 'Luis', role: 'tutor', childId: null, since: '2026-10-01T10:00:00Z', canRemove: false }],
        capacity: { max: 4, used: 2 },
      }),
    )
    renderPage()

    const people = within(await screen.findByRole('list', { name: 'Personas de la familia' }))
    expect(people.getAllByRole('listitem')).toHaveLength(2)
    expect(people.getByText('Ana')).toBeInTheDocument()
    expect(people.getByText(/Tutor · desde el/)).toBeInTheDocument()
    expect(screen.getByText('2 de 4 personas')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Tus hijos' })).toHaveAttribute('href', '/home')
  })

  it('says the places include pending invitations when some are waiting', async () => {
    stubApi(() =>
      family({
        invitations: [{ id: 'i1', email: 'p@x.com', role: 'caregiver', status: 'pending', expiresAt: '2026-10-13T10:00:00Z', childId: null }],
        capacity: { max: 4, used: 2 },
      }),
    )
    renderPage()
    expect(await screen.findByText(/2 de 4 personas \(contando invitaciones pendientes\)/)).toBeInTheDocument()
  })

  it('shows the plan card instead of the invite form on the free plan, and the card opens the plan notice', async () => {
    stubApi(() => family({ plan: 'free' }))
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Comparte con tu familia')
    expect(screen.queryByRole('form', { name: 'Invitar a alguien' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ver el plan completo' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Compartir con tu familia')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Ver planes' }))
    expect(await screen.findByText('pantalla de planes')).toBeInTheDocument()
  })

  it('tells an invited person whose family stopped paying why they can only view and mark', async () => {
    stubApi(() => family({ role: 'tutor', plan: 'free', readOnly: true }))
    renderPage()
    expect(await screen.findByText(/ya no tiene el plan completo/)).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Invitar a alguien' })).not.toBeInTheDocument()
    expect(screen.queryByText('Comparte con tu familia')).not.toBeInTheDocument()
  })

  it('does not offer a Caregiver the form nor the invitations', async () => {
    stubApi(() => family({ role: 'caregiver' }))
    renderPage()
    await screen.findByRole('list', { name: 'Personas de la familia' })
    expect(screen.queryByRole('form', { name: 'Invitar a alguien' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Invitaciones' })).not.toBeInTheDocument()
  })

  it('shows an error with Reintentar when the family cannot be read', async () => {
    let fail = true
    stubApi(() => {
      if (fail) throw new Error('boom')
      return family()
    })
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText(/No pudimos cargar tu familia/)).toBeInTheDocument()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('list', { name: 'Personas de la familia' })).toBeInTheDocument()
  })

  it('invites somebody, shows the one-time link in the fragment and lets the tutor copy it', async () => {
    const calls = stubApi(() => family(), {
      'POST /family/invitations': {
        status: 201,
        body: { id: 'i1', email: 'papa@example.com', role: 'tutor', status: 'pending', expiresAt: '2026-10-13T10:00:00Z', token: 'TOKEN123' },
      },
    })
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    // After setup(): user-event installs its own clipboard stub, and this one has to win.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderPage()

    await user.type(await screen.findByLabelText('Correo de la persona'), 'papa@example.com')
    await user.click(screen.getByRole('button', { name: 'Crear invitación' }))

    const link = (await screen.findByLabelText('Liga de la invitación')) as HTMLInputElement
    expect(link.value).toBe(`${window.location.origin}/familia/invitacion#TOKEN123`)
    expect(calls.find((c) => c.method === 'POST' && c.path === '/family/invitations')?.body).toEqual({ email: 'papa@example.com', role: 'tutor' })

    await user.click(screen.getByRole('button', { name: 'Copiar liga' }))
    expect(writeText).toHaveBeenCalledWith(link.value)
    expect(await screen.findByText('Liga copiada')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Listo' }))
    expect(screen.queryByLabelText('Liga de la invitación')).not.toBeInTheDocument()
  })

  it('says so when the link cannot be copied', async () => {
    stubApi(() => family(), {
      'POST /family/invitations': { status: 201, body: { id: 'i1', email: 'a@b.com', role: 'caregiver', status: 'pending', expiresAt: '2026-10-13T10:00:00Z', token: 'T' } },
    })
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('no')) }, configurable: true })
    renderPage()

    await user.type(await screen.findByLabelText('Correo de la persona'), 'a@b.com')
    await user.click(screen.getByLabelText(/Cuidador/))
    await user.click(screen.getByRole('button', { name: 'Crear invitación' }))
    await user.click(await screen.findByRole('button', { name: 'Copiar liga' }))
    expect(await screen.findByText(/No pudimos copiarla/)).toBeInTheDocument()
  })

  it('validates the e-mail before sending anything', async () => {
    const calls = stubApi(() => family())
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Crear invitación' }))
    expect(screen.getByText('Escribe el correo de la persona.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Correo de la persona'), 'no-es-correo')
    expect(screen.getByText(/Escribe un correo válido/)).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it.each([
    ['already_member', 409, /ya tiene acceso/],
    ['invitation_pending', 409, /invitación pendiente/],
    ['family_full', 422, /máximo de personas/],
    ['validation_error', 400, /no parece válido/],
    ['internal_error', 500, /No pudimos crear la invitación/],
  ])('explains a refusal of %s', async (error, status, text) => {
    stubApi(() => family(), { 'POST /family/invitations': { status, body: { error, message: 'x' } } })
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByLabelText('Correo de la persona'), 'a@b.com')
    await user.click(screen.getByRole('button', { name: 'Crear invitación' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
  })

  it('opens the plan notice when the server says the plan is no longer paid', async () => {
    stubApi(() => family(), {
      'POST /family/invitations': { status: 422, body: { error: 'freemium_consultation_limit_exceeded', reason: 'family', message: 'x' } },
    })
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByLabelText('Correo de la persona'), 'a@b.com')
    await user.click(screen.getByRole('button', { name: 'Crear invitación' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('Compartir con tu familia')
  })

  it('disables inviting when the family is full', async () => {
    stubApi(() => family({ capacity: { max: 4, used: 4 } }))
    renderPage()
    expect(await screen.findByRole('button', { name: 'Crear invitación' })).toBeDisabled()
    expect(screen.getByText(/ya tiene el máximo de personas/)).toBeInTheDocument()
  })

  describe('invitations waiting', () => {
    const pending = family({
      invitations: [
        { id: 'i1', email: 'p@x.com', role: 'caregiver', status: 'pending', expiresAt: '2026-10-13T10:00:00Z', childId: null },
        { id: 'i2', email: 'old@x.com', role: 'tutor', status: 'expired', expiresAt: '2026-09-01T10:00:00Z', childId: null },
      ],
      capacity: { max: 4, used: 2 },
    })

    it('shows each one with its state and expiry', async () => {
      stubApi(() => pending)
      renderPage()
      const list = within(await screen.findByRole('heading', { name: 'Invitaciones' }).then((h) => h.closest('section')!))
      expect(list.getByText('p@x.com')).toBeInTheDocument()
      expect(list.getByText('Pendiente')).toBeInTheDocument()
      expect(list.getByText('Vencida')).toBeInTheDocument()
    })

    it('sends one again and shows its new link', async () => {
      stubApi(() => pending, {
        'POST /family/invitations/i2/resend': {
          status: 200,
          body: { id: 'i2', email: 'old@x.com', role: 'tutor', status: 'pending', expiresAt: '2026-10-13T10:00:00Z', token: 'NEW' },
        },
      })
      const user = userEvent.setup()
      renderPage()
      await user.click(await screen.findByRole('button', { name: /Enviar de nuevo a old@x.com/ }))
      expect(((await screen.findByLabelText('Liga de la invitación')) as HTMLInputElement).value).toMatch(/#NEW$/)
    })

    it.each([
      [422, { error: 'family_full' }, /máximo de personas/],
      [500, { error: 'internal_error' }, /No pudimos enviar la invitación de nuevo/],
    ])('explains why it could not be sent again (%i)', async (status, body, text) => {
      stubApi(() => pending, { 'POST /family/invitations/i1/resend': { status, body } })
      const user = userEvent.setup()
      renderPage()
      await user.click(await screen.findByRole('button', { name: /Enviar de nuevo a p@x.com/ }))
      expect(await screen.findByRole('alert')).toHaveTextContent(text)
    })

    it('opens the plan notice when resending finds the plan no longer paid', async () => {
      stubApi(() => pending, {
        'POST /family/invitations/i1/resend': { status: 422, body: { error: 'freemium_consultation_limit_exceeded', reason: 'family' } },
      })
      const user = userEvent.setup()
      renderPage()
      await user.click(await screen.findByRole('button', { name: /Enviar de nuevo a p@x.com/ }))
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
    })

    it('cancels one and refreshes the list; a failure is explained', async () => {
      let canceled = false
      const calls = stubApi(() => (canceled ? family() : pending), { 'POST /family/invitations/i1/cancel': { status: 204 } })
      const user = userEvent.setup()
      renderPage()
      const cancel = await screen.findByRole('button', { name: /Cancelar la invitación de p@x.com/ })
      canceled = true
      await user.click(cancel)
      await waitFor(() => expect(screen.queryByText('p@x.com')).not.toBeInTheDocument())
      expect(calls.some((c) => c.path === '/family/invitations/i1/cancel')).toBe(true)
    })

    it('explains when canceling fails', async () => {
      stubApi(() => pending, { 'POST /family/invitations/i1/cancel': { status: 404, body: { error: 'invitation_not_found' } } })
      const user = userEvent.setup()
      renderPage()
      await user.click(await screen.findByRole('button', { name: /Cancelar la invitación de p@x.com/ }))
      expect(await screen.findByRole('alert')).toHaveTextContent(/No pudimos cancelar/)
    })

    it('hides the link of an invitation once it is canceled', async () => {
      stubApi(() => pending, {
        'POST /family/invitations/i1/resend': { status: 200, body: { id: 'i1', email: 'p@x.com', role: 'caregiver', status: 'pending', expiresAt: '2026-10-13T10:00:00Z', token: 'L' } },
        'POST /family/invitations/i1/cancel': { status: 204 },
      })
      const user = userEvent.setup()
      renderPage()
      await user.click(await screen.findByRole('button', { name: /Enviar de nuevo a p@x.com/ }))
      await screen.findByLabelText('Liga de la invitación')
      await user.click(screen.getByRole('button', { name: /Cancelar la invitación de p@x.com/ }))
      await waitFor(() => expect(screen.queryByLabelText('Liga de la invitación')).not.toBeInTheDocument())
    })
  })
})
