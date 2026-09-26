import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CompleteGoogleSignupPage } from './CompleteGoogleSignupPage'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/registro/completar']}>
        <Routes>
          <Route path="/registro/completar" element={<CompleteGoogleSignupPage />} />
          <Route path="/home" element={<div>HOME PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const byId = (id: string) => document.getElementById(id) as HTMLInputElement

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Tu nombre'), 'Ana')
  await user.type(screen.getByLabelText('Tu apellido'), 'Gómez')
  await user.type(byId('children.0.firstName'), 'Luis')
  await user.type(byId('children.0.lastName'), 'Gómez')
  await user.type(byId('children.0.birthDate'), '2020-01-15')
}

const postCalls = () =>
  vi.mocked(fetch).mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')

describe('CompleteGoogleSignupPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('has no correo/contraseña fields — Google already gave Clerk that', () => {
    renderPage()

    expect(screen.queryByLabelText('Correo')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument()
  })

  it('creates the account with the already-active session token and navigates home', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if (init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            id: 'a1', firstName: 'Ana', lastName: 'Gómez', email: 'ana@gmail.com',
            countryCode: null, stateCode: null, plan: 'free',
            children: [{ id: 'c1', firstName: 'Luis', lastName: 'Gómez', birthDate: '2020-01-15', height: null, weight: null }],
          }),
        } as Response
      }
      return { ok: true, json: async () => [] } as Response
    })
    renderPage()

    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Terminar mi registro' }))

    expect(await screen.findByText('HOME PAGE')).toBeInTheDocument()
    const [, init] = postCalls()[0]
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer test-token' })
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      firstName: 'Ana',
      lastName: 'Gómez',
      children: [{ firstName: 'Luis', lastName: 'Gómez', birthDate: '2020-01-15' }],
    })
  })

  it('sends a single POST /accounts even on a fast double click (isSubmitting covers the token fetch and the POST)', async () => {
    const user = userEvent.setup()
    let release: (r: Response) => void = () => {}
    vi.mocked(fetch).mockImplementation((_input, init) =>
      init?.method === 'POST'
        ? new Promise<Response>((resolve) => {
            release = resolve
          })
        : Promise.resolve({ ok: true, json: async () => [] } as Response),
    )
    renderPage()
    await fillRequired(user)

    const button = screen.getByRole('button', { name: 'Terminar mi registro' })
    await user.dblClick(button)
    expect(await screen.findByRole('button', { name: 'Creando cuenta…' })).toBeDisabled()
    release({ ok: true, json: async () => ({ id: 'a1', firstName: 'Ana', lastName: 'Gómez', email: 'ana@gmail.com', countryCode: null, stateCode: null, plan: 'free', children: [] }) } as Response)

    expect(await screen.findByText('HOME PAGE')).toBeInTheDocument()
    expect(postCalls()).toHaveLength(1)
  })

  it('shows a validation error and does not submit when required fields are empty', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Terminar mi registro' }))

    expect(await screen.findByText('El nombre es obligatorio')).toBeInTheDocument()
    expect(postCalls()).toHaveLength(0)
  })

  it('shows the server message when account creation fails', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if (init?.method === 'POST') {
        return { ok: false, status: 409, json: async () => ({ message: 'Email is already in use' }) } as Response
      }
      return { ok: true, json: async () => [] } as Response
    })
    renderPage()

    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Terminar mi registro' }))

    expect(await screen.findByText('Email is already in use')).toBeInTheDocument()
  })
})
