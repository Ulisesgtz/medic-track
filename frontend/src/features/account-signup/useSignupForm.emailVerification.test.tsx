import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth, useSignIn, useSignUp } from '@clerk/react'
import { AccountSignupForm } from './AccountSignupForm'

// This file exercises the branch the global setupTests.ts mock skips by
// default (status: 'complete', no code step) — Clerk's own email
// verification step (specs/008-autenticacion-cuenta, Historia 1, T028).
vi.mock('@clerk/react', () => ({
  useAuth: vi.fn(),
  useSignUp: vi.fn(),
  useSignIn: vi.fn(),
}))

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
}

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/signup']}>
        <Routes>
          <Route path="/signup" element={<AccountSignupForm />} />
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
  await user.type(screen.getByLabelText('Correo'), 'ana@example.com')
  await user.type(screen.getByLabelText('Contraseña'), 'secreto123')
  await user.type(byId('children.0.firstName'), 'Luis')
  await user.type(byId('children.0.lastName'), 'Gómez')
  await user.type(byId('children.0.birthDate'), '2020-01-15')
}

function mockSignUp(overrides: Record<string, unknown> = {}) {
  const signUp = {
    status: 'missing_requirements',
    password: vi.fn().mockResolvedValue({ error: null }),
    finalize: vi.fn().mockResolvedValue({ error: null }),
    verifications: {
      sendEmailCode: vi.fn().mockResolvedValue({ error: null }),
      verifyEmailCode: vi.fn().mockResolvedValue({ error: null }),
    },
    ...overrides,
  }
  vi.mocked(useSignUp).mockReturnValue({ signUp } as unknown as ReturnType<typeof useSignUp>)
  return signUp
}

describe('useSignupForm — email verification step', () => {
  beforeEach(() => {
    stubMatchMedia(false)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
    vi.mocked(useAuth).mockReturnValue({ getToken: async () => 'test-token' } as unknown as ReturnType<typeof useAuth>)
    vi.mocked(useSignIn).mockReturnValue({ signIn: { sso: vi.fn() } } as unknown as ReturnType<typeof useSignIn>)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks for the emailed code when Clerk has not verified the email yet', async () => {
    const user = userEvent.setup()
    const signUp = mockSignUp()
    renderForm()

    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByLabelText('Código de verificación')).toBeInTheDocument()
    expect(signUp.password).toHaveBeenCalledWith({ emailAddress: 'ana@example.com', password: 'secreto123' })
    expect(signUp.verifications.sendEmailCode).toHaveBeenCalledOnce()
    expect(signUp.finalize).not.toHaveBeenCalled()
  })

  it('creates the account once the code is verified', async () => {
    const user = userEvent.setup()
    const signUp = mockSignUp()
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if (init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ id: 'a1', firstName: 'Ana', lastName: 'Gómez', email: 'ana@example.com', countryCode: null, stateCode: null, plan: 'free', children: [] }),
        } as Response
      }
      return { ok: true, json: async () => [] } as Response
    })
    renderForm()

    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    await screen.findByLabelText('Código de verificación')

    await user.type(screen.getByLabelText('Código de verificación'), '123456')
    await user.click(screen.getByRole('button', { name: 'Verificar código' }))

    expect(await screen.findByText('HOME PAGE')).toBeInTheDocument()
    expect(signUp.verifications.verifyEmailCode).toHaveBeenCalledWith({ code: '123456' })
    expect(signUp.finalize).toHaveBeenCalledOnce()
  })

  it('shows an error and stays on the code step when the code is wrong', async () => {
    const user = userEvent.setup()
    mockSignUp({
      verifications: {
        sendEmailCode: vi.fn().mockResolvedValue({ error: null }),
        verifyEmailCode: vi.fn().mockResolvedValue({ error: { message: 'wrong code' } }),
      },
    })
    renderForm()

    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    await screen.findByLabelText('Código de verificación')

    await user.type(screen.getByLabelText('Código de verificación'), '000000')
    await user.click(screen.getByRole('button', { name: 'Verificar código' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El código no es correcto')
    expect(screen.getByLabelText('Código de verificación')).toBeInTheDocument()
  })

  it('shows an error and does not send the code when signUp.password() fails', async () => {
    const user = userEvent.setup()
    mockSignUp({ password: vi.fn().mockResolvedValue({ error: { message: 'correo ya usado' } }) })
    renderForm()

    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('correo ya usado')
    expect(screen.queryByLabelText('Código de verificación')).not.toBeInTheDocument()
  })
})
