import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { useAuth, useSignIn } from '@clerk/react'
import { LoginPage } from './LoginPage'

vi.mock('@clerk/react', () => ({ useAuth: vi.fn(), useSignIn: vi.fn() }))

// One mutable object handed back on every render, as the live Clerk resource: the
// mocked calls below flip `status` the way Clerk's server would.
const signIn = {
  status: 'needs_identifier',
  reset: vi.fn(),
  password: vi.fn(),
  finalize: vi.fn(),
  sso: vi.fn(),
  mfa: { sendEmailCode: vi.fn(), verifyEmailCode: vi.fn() },
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/home" element={<p>Home page</p>} />
        <Route path="/signup" element={<p>Signup page</p>} />
        <Route path="/recuperar-contrasena" element={<p>Recuperar page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, email = 'ana@example.com', password = 'Secreto123!') {
  await user.type(screen.getByLabelText('Correo'), email)
  await user.type(screen.getByLabelText('Contraseña'), password)
  await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
}

describe('LoginPage', () => {
  beforeEach(() => {
    signIn.status = 'needs_identifier'
    signIn.reset.mockReset().mockResolvedValue({ error: null })
    signIn.password.mockReset().mockImplementation(async () => {
      signIn.status = 'complete'
      return { error: null }
    })
    signIn.finalize.mockReset().mockResolvedValue({ error: null })
    signIn.mfa.sendEmailCode.mockReset().mockResolvedValue({ error: null })
    signIn.mfa.verifyEmailCode.mockReset().mockImplementation(async () => {
      signIn.status = 'complete'
      return { error: null }
    })
    vi.mocked(useSignIn).mockReturnValue({ signIn } as unknown as ReturnType<typeof useSignIn>)
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: false } as unknown as ReturnType<typeof useAuth>)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('has the fields, the Google button and the links to recover the password and to sign up', () => {
    renderLogin()

    expect(screen.getByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.getByLabelText('Correo')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Continuar con Google' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' })).toHaveAttribute('href', '/recuperar-contrasena')
    expect(screen.getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute('href', '/signup')
  })

  it('shows the web design (split screen) from 900px, never the phone one', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    renderLogin()

    expect(screen.getByRole('heading', { level: 1, name: 'La bitácora médica de tus hijos, en un solo lugar.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Iniciar sesión' })).toBeInTheDocument()
  })

  it('lets the tutor see the password with the eye button', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText('Contraseña'), 'secreto')
    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }))

    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'text')
  })

  it('signs in with the correo and password, finalizes the session and goes to /home', async () => {
    const user = userEvent.setup()
    renderLogin()

    await fillAndSubmit(user)

    expect(await screen.findByText('Home page')).toBeInTheDocument()
    expect(signIn.reset).toHaveBeenCalledBefore(signIn.password)
    expect(signIn.password).toHaveBeenCalledWith({ emailAddress: 'ana@example.com', password: 'Secreto123!' })
    expect(signIn.finalize).toHaveBeenCalledOnce()
  })

  it('does not call Clerk when the fields are empty, and says what is missing', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    expect(await screen.findByText('Escribe un correo válido.')).toBeInTheDocument()
    expect(screen.getByText('Escribe tu contraseña.')).toBeInTheDocument()
    expect(signIn.password).not.toHaveBeenCalled()
  })

  it.each([
    ['a wrong password', 'form_password_incorrect'],
    ['an unknown correo', 'form_identifier_not_found'],
  ])('answers %s with the same message, never saying which one it was (FR-009)', async (_name, code) => {
    // Real Clerk API failures: generic top-level code, the specific one nested.
    signIn.password.mockResolvedValue({ error: { code: 'api_response_error', message: 'English message that must not show', errors: [{ code }] } })
    const user = userEvent.setup()
    renderLogin()

    await fillAndSubmit(user)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('El correo o la contraseña no son correctos.')
    expect(alert).not.toHaveTextContent('English message')
    expect(signIn.finalize).not.toHaveBeenCalled()
  })

  it('asks for the emailed code on a new device, then finishes signing in with it', async () => {
    signIn.password.mockImplementation(async () => {
      signIn.status = 'needs_client_trust'
      return { error: null }
    })
    const user = userEvent.setup()
    renderLogin()

    await fillAndSubmit(user)
    await user.type(await screen.findByLabelText('Código de verificación'), '123456')
    await user.click(screen.getByRole('button', { name: 'Verificar código' }))

    expect(await screen.findByText('Home page')).toBeInTheDocument()
    expect(signIn.mfa.sendEmailCode).toHaveBeenCalledOnce()
    expect(signIn.mfa.verifyEmailCode).toHaveBeenCalledWith({ code: '123456' })
    expect(signIn.finalize).toHaveBeenCalledOnce()
  })

  it('shows a Spanish message when the emailed code is wrong, and stays on the code step', async () => {
    signIn.password.mockImplementation(async () => {
      signIn.status = 'needs_client_trust'
      return { error: null }
    })
    signIn.mfa.verifyEmailCode.mockResolvedValue({ error: { code: 'form_code_incorrect', message: 'Incorrect code' } })
    const user = userEvent.setup()
    renderLogin()

    await fillAndSubmit(user)
    await user.type(await screen.findByLabelText('Código de verificación'), '000000')
    await user.click(screen.getByRole('button', { name: 'Verificar código' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El código no es correcto')
    expect(screen.getByLabelText('Código de verificación')).toBeInTheDocument()
    expect(signIn.finalize).not.toHaveBeenCalled()
  })

  it('shows an error when Clerk cannot send the code', async () => {
    signIn.password.mockImplementation(async () => {
      signIn.status = 'needs_second_factor'
      return { error: null }
    })
    signIn.mfa.sendEmailCode.mockResolvedValue({ error: { code: 'unknown', message: 'nope' } })
    const user = userEvent.setup()
    renderLogin()

    await fillAndSubmit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo iniciar sesión. Intenta de nuevo.')
    expect(screen.queryByLabelText('Código de verificación')).not.toBeInTheDocument()
  })

  it('shows an error when the sign-in ends in a state the app cannot continue from', async () => {
    signIn.password.mockImplementation(async () => {
      signIn.status = 'needs_new_password'
      return { error: null }
    })
    const user = userEvent.setup()
    renderLogin()

    await fillAndSubmit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo iniciar sesión. Intenta de nuevo.')
  })

  it('shows Clerk\'s finalize failure as a Spanish message', async () => {
    signIn.finalize.mockResolvedValue({ error: { code: 'too_many_requests', message: 'Too many' } })
    const user = userEvent.setup()
    renderLogin()

    await fillAndSubmit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('demasiados intentos')
  })

  it('sends a tutor who already has a session straight to /home', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true } as unknown as ReturnType<typeof useAuth>)
    renderLogin()

    expect(screen.getByText('Home page')).toBeInTheDocument()
  })
})
