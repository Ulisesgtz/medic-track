import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { useAuth, useSignIn } from '@clerk/react'
import { ForgotPasswordPage } from './ForgotPasswordPage'

vi.mock('@clerk/react', () => ({ useAuth: vi.fn(), useSignIn: vi.fn() }))

const signIn = {
  status: 'needs_identifier',
  reset: vi.fn(),
  create: vi.fn(),
  finalize: vi.fn(),
  resetPasswordEmailCode: { sendCode: vi.fn(), verifyCode: vi.fn(), submitPassword: vi.fn() },
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/recuperar-contrasena']}>
      <Routes>
        <Route path="/recuperar-contrasena" element={<ForgotPasswordPage />} />
        <Route path="/login" element={<p>Login page</p>} />
        <Route path="/home" element={<p>Home page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function requestCode(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Correo'), 'ana@example.com')
  await user.click(screen.getByRole('button', { name: 'Enviar código' }))
}

async function fillReset(user: ReturnType<typeof userEvent.setup>, password = 'NuevaClave1!') {
  await user.type(await screen.findByLabelText('Código de verificación'), '123456')
  await user.type(screen.getByLabelText('Contraseña'), password)
  await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))
}

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    signIn.status = 'needs_identifier'
    signIn.reset.mockReset().mockResolvedValue({ error: null })
    signIn.create.mockReset().mockResolvedValue({ error: null })
    signIn.finalize.mockReset().mockResolvedValue({ error: null })
    signIn.resetPasswordEmailCode.sendCode.mockReset().mockResolvedValue({ error: null })
    signIn.resetPasswordEmailCode.verifyCode.mockReset().mockResolvedValue({ error: null })
    signIn.resetPasswordEmailCode.submitPassword.mockReset().mockImplementation(async () => {
      signIn.status = 'complete'
      return { error: null }
    })
    vi.mocked(useSignIn).mockReturnValue({ signIn } as unknown as ReturnType<typeof useSignIn>)
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: false } as unknown as ReturnType<typeof useAuth>)
  })

  it('asks for the correo and offers a way back to the login', () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'Recupera tu contraseña' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver a iniciar sesión' })).toHaveAttribute('href', '/login')
  })

  it('validates the correo before asking Clerk for a code', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('Correo'), 'no-es-correo')
    await user.click(screen.getByRole('button', { name: 'Enviar código' }))

    expect(await screen.findByText('Escribe un correo válido.')).toBeInTheDocument()
    expect(signIn.create).not.toHaveBeenCalled()
  })

  it('requests the code and moves to the code + new password step', async () => {
    const user = userEvent.setup()
    renderPage()

    await requestCode(user)

    expect(await screen.findByText(/Si el correo tiene una cuenta, te enviamos un código/)).toBeInTheDocument()
    expect(signIn.create).toHaveBeenCalledWith({ identifier: 'ana@example.com' })
    expect(signIn.resetPasswordEmailCode.sendCode).toHaveBeenCalledOnce()
  })

  it('goes to the same step for a correo with no account, without sending anything (no account enumeration)', async () => {
    // The shape a real Clerk API failure has: generic top-level code, the useful one nested.
    signIn.create.mockResolvedValue({ error: { code: 'api_response_error', errors: [{ code: 'form_identifier_not_found' }] } })
    const user = userEvent.setup()
    renderPage()

    await requestCode(user)

    expect(await screen.findByText(/Si el correo tiene una cuenta, te enviamos un código/)).toBeInTheDocument()
    expect(signIn.resetPasswordEmailCode.sendCode).not.toHaveBeenCalled()
  })

  it('shows a Spanish error and stays on the first step when Clerk rejects the request', async () => {
    signIn.create.mockResolvedValue({ error: { code: 'too_many_requests', message: 'Too many requests' } })
    const user = userEvent.setup()
    renderPage()

    await requestCode(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('demasiados intentos')
    expect(screen.queryByLabelText('Código de verificación')).not.toBeInTheDocument()
  })

  it('shows an error and stays on the first step when the code cannot be sent', async () => {
    signIn.resetPasswordEmailCode.sendCode.mockResolvedValue({ error: { code: 'unknown', message: 'boom' } })
    const user = userEvent.setup()
    renderPage()

    await requestCode(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cambiar la contraseña. Intenta de nuevo.')
    expect(screen.queryByLabelText('Código de verificación')).not.toBeInTheDocument()
  })

  it('verifies the code, saves the new password, finalizes the session and goes to /home', async () => {
    const user = userEvent.setup()
    renderPage()

    await requestCode(user)
    await fillReset(user)

    expect(await screen.findByText('Home page')).toBeInTheDocument()
    expect(signIn.resetPasswordEmailCode.verifyCode).toHaveBeenCalledWith({ code: '123456' })
    expect(signIn.resetPasswordEmailCode.submitPassword).toHaveBeenCalledWith({ password: 'NuevaClave1!' })
    expect(signIn.finalize).toHaveBeenCalledOnce()
  })

  it('shows the password rules while choosing the new password, and blocks one that breaks them', async () => {
    const user = userEvent.setup()
    renderPage()

    await requestCode(user)
    await fillReset(user, 'corta')

    expect(await screen.findByText('Reglas de la contraseña')).toBeInTheDocument()
    expect(screen.getByText('La contraseña no cumple con las reglas.')).toBeInTheDocument()
    expect(signIn.resetPasswordEmailCode.verifyCode).not.toHaveBeenCalled()
  })

  it('shows a Spanish message for a wrong code and does not touch the password', async () => {
    signIn.resetPasswordEmailCode.verifyCode.mockResolvedValue({ error: { code: 'form_code_incorrect', message: 'Incorrect' } })
    const user = userEvent.setup()
    renderPage()

    await requestCode(user)
    await fillReset(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('El código no es correcto')
    expect(signIn.resetPasswordEmailCode.submitPassword).not.toHaveBeenCalled()
  })

  it('shows Clerk\'s rejection of the new password (a leaked one) in Spanish', async () => {
    signIn.resetPasswordEmailCode.submitPassword.mockResolvedValue({ error: { code: 'form_password_pwned', message: 'pwned' } })
    const user = userEvent.setup()
    renderPage()

    await requestCode(user)
    await fillReset(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('filtraciones de datos')
    expect(signIn.finalize).not.toHaveBeenCalled()
  })

  it('shows an error when the session cannot be finalized after changing the password', async () => {
    signIn.finalize.mockResolvedValue({ error: { code: 'unknown', message: 'nope' } })
    const user = userEvent.setup()
    renderPage()

    await requestCode(user)
    await fillReset(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cambiar la contraseña. Intenta de nuevo.')
  })

  it('sends a tutor who already has a session straight to /home', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true } as unknown as ReturnType<typeof useAuth>)
    renderPage()

    expect(screen.getByText('Home page')).toBeInTheDocument()
  })
})
