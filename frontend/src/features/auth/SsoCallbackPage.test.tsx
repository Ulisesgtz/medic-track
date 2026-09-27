import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { useAuth, useClerk, useSignIn, useSignUp } from '@clerk/react'
import { SsoCallbackPage } from './SsoCallbackPage'

vi.mock('@clerk/react', () => ({
  useAuth: vi.fn(),
  useSignIn: vi.fn(),
  useSignUp: vi.fn(),
  useClerk: vi.fn(),
}))

function renderCallback() {
  return render(
    <MemoryRouter initialEntries={['/sso-callback']}>
      <Routes>
        <Route path="/sso-callback" element={<SsoCallbackPage />} />
        <Route path="/home" element={<p>Home page</p>} />
        <Route path="/registro/completar" element={<p>Completar registro</p>} />
        <Route path="/login" element={<p>Login page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const baseSignIn = {
  status: 'missing_requirements',
  isTransferable: false,
  existingSession: undefined,
  finalize: vi.fn().mockResolvedValue({ error: null }),
}
const baseSignUp = {
  status: 'missing_requirements',
  existingSession: undefined,
  create: vi.fn().mockResolvedValue({ error: null }),
  finalize: vi.fn().mockResolvedValue({ error: null }),
}

describe('SsoCallbackPage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true } as unknown as ReturnType<typeof useAuth>)
    vi.mocked(useClerk).mockReturnValue({ setActive: vi.fn() } as unknown as ReturnType<typeof useClerk>)
  })

  it('shows a loading state while waiting to resolve', () => {
    vi.mocked(useSignIn).mockReturnValue({ signIn: undefined } as unknown as ReturnType<typeof useSignIn>)
    vi.mocked(useSignUp).mockReturnValue({ signUp: undefined } as unknown as ReturnType<typeof useSignUp>)

    renderCallback()

    expect(screen.getByText('Iniciando sesión…')).toBeInTheDocument()
  })

  it('keeps showing the loading state while Clerk is still fetching signIn/signUp, then resolves once it settles', async () => {
    const finalize = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(useSignIn).mockReturnValue({
      signIn: { ...baseSignIn, status: 'needs_identifier' },
      fetchStatus: 'fetching',
    } as unknown as ReturnType<typeof useSignIn>)
    vi.mocked(useSignUp).mockReturnValue({
      signUp: baseSignUp,
      fetchStatus: 'fetching',
    } as unknown as ReturnType<typeof useSignUp>)

    const { rerender } = renderCallback()
    expect(screen.getByText('Iniciando sesión…')).toBeInTheDocument()

    vi.mocked(useSignIn).mockReturnValue({
      signIn: { ...baseSignIn, status: 'complete', finalize },
      fetchStatus: 'idle',
    } as unknown as ReturnType<typeof useSignIn>)
    vi.mocked(useSignUp).mockReturnValue({
      signUp: baseSignUp,
      fetchStatus: 'idle',
    } as unknown as ReturnType<typeof useSignUp>)
    rerender(
      <MemoryRouter initialEntries={['/sso-callback']}>
        <Routes>
          <Route path="/sso-callback" element={<SsoCallbackPage />} />
          <Route path="/home" element={<p>Home page</p>} />
          <Route path="/registro/completar" element={<p>Completar registro</p>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Home page')).toBeInTheDocument()
    expect(finalize).toHaveBeenCalledOnce()
  })

  it('decides nothing until Clerk has loaded — its blank placeholders are not a failed Google return', async () => {
    const create = vi.fn().mockResolvedValue({ error: null })
    const finalize = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(useAuth).mockReturnValue({ isLoaded: false } as unknown as ReturnType<typeof useAuth>)
    // What useSignIn/useSignUp return before Clerk loads: blank defaults, nothing fetching.
    vi.mocked(useSignIn).mockReturnValue({
      signIn: { ...baseSignIn, status: 'needs_identifier' },
      fetchStatus: 'idle',
    } as unknown as ReturnType<typeof useSignIn>)
    vi.mocked(useSignUp).mockReturnValue({ signUp: baseSignUp, fetchStatus: 'idle' } as unknown as ReturnType<typeof useSignUp>)

    const view = renderCallback()
    expect(screen.getByText('Iniciando sesión…')).toBeInTheDocument()
    expect(screen.queryByText('No se pudo continuar')).not.toBeInTheDocument()
    expect(document.getElementById('clerk-captcha')).toBeInTheDocument()

    // Clerk loads with the real result of a brand-new Google identity.
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true } as unknown as ReturnType<typeof useAuth>)
    vi.mocked(useSignIn).mockReturnValue({
      signIn: { ...baseSignIn, isTransferable: true },
      fetchStatus: 'idle',
    } as unknown as ReturnType<typeof useSignIn>)
    vi.mocked(useSignUp).mockReturnValue({
      signUp: { ...baseSignUp, create, finalize },
      fetchStatus: 'idle',
    } as unknown as ReturnType<typeof useSignUp>)
    view.rerender(
      <MemoryRouter initialEntries={['/sso-callback']}>
        <Routes>
          <Route path="/sso-callback" element={<SsoCallbackPage />} />
          <Route path="/registro/completar" element={<p>Completar registro</p>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Completar registro')).toBeInTheDocument()
    expect(create).toHaveBeenCalledWith({ transfer: true })
  })

  it.each(['needs_second_factor', 'needs_client_trust', 'needs_new_password'])(
    'sends a sign-in that still needs a step (%s) to /login, which asks for it',
    async (status) => {
      vi.mocked(useSignIn).mockReturnValue({ signIn: { ...baseSignIn, status } } as unknown as ReturnType<typeof useSignIn>)
      vi.mocked(useSignUp).mockReturnValue({ signUp: baseSignUp } as unknown as ReturnType<typeof useSignUp>)

      renderCallback()

      expect(await screen.findByText('Login page')).toBeInTheDocument()
    },
  )

  it('finalizes a sign-up that Clerk already completed and goes to /registro/completar', async () => {
    const finalize = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(useSignIn).mockReturnValue({ signIn: baseSignIn } as unknown as ReturnType<typeof useSignIn>)
    vi.mocked(useSignUp).mockReturnValue({
      signUp: { ...baseSignUp, status: 'complete', finalize },
    } as unknown as ReturnType<typeof useSignUp>)

    renderCallback()

    expect(await screen.findByText('Completar registro')).toBeInTheDocument()
    expect(finalize).toHaveBeenCalledOnce()
  })

  it('shows an error when finalizing an already-completed sign-up fails', async () => {
    const finalize = vi.fn().mockResolvedValue({ error: { code: 'unknown', message: 'nope' } })
    vi.mocked(useSignIn).mockReturnValue({ signIn: baseSignIn } as unknown as ReturnType<typeof useSignIn>)
    vi.mocked(useSignUp).mockReturnValue({
      signUp: { ...baseSignUp, status: 'complete', finalize },
    } as unknown as ReturnType<typeof useSignUp>)

    renderCallback()

    expect(await screen.findByText('No se pudo continuar el registro con Google. Intenta de nuevo.')).toBeInTheDocument()
  })

  it('finalizes and goes to /home when the sign-in is complete (returning tutor)', async () => {
    const finalize = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(useSignIn).mockReturnValue({
      signIn: { ...baseSignIn, status: 'complete', finalize },
    } as unknown as ReturnType<typeof useSignIn>)
    vi.mocked(useSignUp).mockReturnValue({ signUp: baseSignUp } as unknown as ReturnType<typeof useSignUp>)

    renderCallback()

    expect(await screen.findByText('Home page')).toBeInTheDocument()
    expect(finalize).toHaveBeenCalledOnce()
  })

  it('transfers to sign-up and goes to /registro/completar for a brand-new Google identity', async () => {
    const create = vi.fn().mockResolvedValue({ error: null })
    const finalize = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(useSignIn).mockReturnValue({
      signIn: { ...baseSignIn, isTransferable: true },
    } as unknown as ReturnType<typeof useSignIn>)
    vi.mocked(useSignUp).mockReturnValue({
      signUp: { ...baseSignUp, create, finalize },
    } as unknown as ReturnType<typeof useSignUp>)

    renderCallback()

    expect(await screen.findByText('Completar registro')).toBeInTheDocument()
    expect(create).toHaveBeenCalledWith({ transfer: true })
    expect(finalize).toHaveBeenCalledOnce()
  })

  it('shows an error when the sign-up transfer never completes (missing requirements)', async () => {
    const create = vi.fn().mockResolvedValue({ error: null })
    const finalize = vi.fn().mockResolvedValue({ error: { code: 'unknown', message: 'Missing requirements.' } })
    vi.mocked(useSignIn).mockReturnValue({
      signIn: { ...baseSignIn, isTransferable: true },
    } as unknown as ReturnType<typeof useSignIn>)
    vi.mocked(useSignUp).mockReturnValue({
      signUp: { ...baseSignUp, status: 'missing_requirements', create, finalize },
    } as unknown as ReturnType<typeof useSignUp>)

    renderCallback()

    expect(await screen.findByText('No se pudo continuar el registro con Google. Intenta de nuevo.')).toBeInTheDocument()
  })

  it("activates the browser's existing session directly instead of finalizing", async () => {
    const setActive = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useClerk).mockReturnValue({ setActive } as unknown as ReturnType<typeof useClerk>)
    vi.mocked(useSignIn).mockReturnValue({
      signIn: { ...baseSignIn, existingSession: { sessionId: 'sess_123' } },
    } as unknown as ReturnType<typeof useSignIn>)
    vi.mocked(useSignUp).mockReturnValue({ signUp: baseSignUp } as unknown as ReturnType<typeof useSignUp>)

    renderCallback()

    expect(await screen.findByText('Home page')).toBeInTheDocument()
    expect(setActive).toHaveBeenCalledWith({ session: 'sess_123' })
  })

  it("activates the browser's existing session from signUp when signIn has none", async () => {
    const setActive = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useClerk).mockReturnValue({ setActive } as unknown as ReturnType<typeof useClerk>)
    vi.mocked(useSignIn).mockReturnValue({ signIn: baseSignIn } as unknown as ReturnType<typeof useSignIn>)
    vi.mocked(useSignUp).mockReturnValue({
      signUp: { ...baseSignUp, existingSession: { sessionId: 'sess_456' } },
    } as unknown as ReturnType<typeof useSignUp>)

    renderCallback()

    expect(await screen.findByText('Home page')).toBeInTheDocument()
    expect(setActive).toHaveBeenCalledWith({ session: 'sess_456' })
  })

  it('shows the Clerk error message when the sign-up transfer itself fails', async () => {
    const create = vi.fn().mockResolvedValue({ error: { code: 'unknown', message: 'Transfer failed.' } })
    vi.mocked(useSignIn).mockReturnValue({
      signIn: { ...baseSignIn, isTransferable: true },
    } as unknown as ReturnType<typeof useSignIn>)
    vi.mocked(useSignUp).mockReturnValue({
      signUp: { ...baseSignUp, create },
    } as unknown as ReturnType<typeof useSignUp>)

    renderCallback()

    expect(await screen.findByText('No se pudo continuar el registro con Google. Intenta de nuevo.')).toBeInTheDocument()
  })

  it('shows an error message when neither sign-in nor sign-up resolved to anything usable', async () => {
    vi.mocked(useSignIn).mockReturnValue({ signIn: baseSignIn } as unknown as ReturnType<typeof useSignIn>)
    vi.mocked(useSignUp).mockReturnValue({ signUp: baseSignUp } as unknown as ReturnType<typeof useSignUp>)

    renderCallback()

    expect(await screen.findByText('No se pudo continuar')).toBeInTheDocument()
  })

  it('shows a Spanish message (mapped from the Clerk error code) when finalize fails', async () => {
    const finalize = vi.fn().mockResolvedValue({ error: { code: 'too_many_requests', message: 'Too many requests.' } })
    vi.mocked(useSignIn).mockReturnValue({
      signIn: { ...baseSignIn, status: 'complete', finalize },
    } as unknown as ReturnType<typeof useSignIn>)
    vi.mocked(useSignUp).mockReturnValue({ signUp: baseSignUp } as unknown as ReturnType<typeof useSignUp>)

    renderCallback()

    expect(await screen.findByText(/demasiados intentos/i)).toBeInTheDocument()
  })
})
