import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSignIn } from '@clerk/react'
import { GoogleSignupButton } from './GoogleSignupButton'

vi.mock('@clerk/react', () => ({
  useSignIn: vi.fn(),
}))

describe('GoogleSignupButton', () => {
  it('resets any stale attempt, then calls signIn.sso() with the Google strategy and the callback/final URLs', async () => {
    const user = userEvent.setup()
    const reset = vi.fn().mockResolvedValue({ error: null })
    const sso = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(useSignIn).mockReturnValue({ signIn: { reset, sso } } as unknown as ReturnType<typeof useSignIn>)

    render(<GoogleSignupButton />)
    await user.click(screen.getByRole('button', { name: 'Registrarme con Google' }))

    expect(reset).toHaveBeenCalledOnce()
    expect(reset.mock.invocationCallOrder[0]).toBeLessThan(sso.mock.invocationCallOrder[0])
    expect(sso).toHaveBeenCalledWith({
      strategy: 'oauth_google',
      redirectCallbackUrl: '/sso-callback',
      redirectUrl: '/home',
    })
  })

  it('shows an error message when Clerk rejects the SSO attempt', async () => {
    const user = userEvent.setup()
    const reset = vi.fn().mockResolvedValue({ error: null })
    const sso = vi.fn().mockResolvedValue({ error: { code: 'unknown', message: 'Google did not respond.' } })
    vi.mocked(useSignIn).mockReturnValue({ signIn: { reset, sso } } as unknown as ReturnType<typeof useSignIn>)

    render(<GoogleSignupButton />)
    await user.click(screen.getByRole('button', { name: 'Registrarme con Google' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No se pudo continuar con Google. Intenta de nuevo.')
    expect(alert).not.toHaveTextContent('Google did not respond')
  })

  it('shows a friendly info message (not an error) when the tutor cancelled on Google', async () => {
    const user = userEvent.setup()
    const reset = vi.fn().mockResolvedValue({ error: null })
    const sso = vi.fn().mockResolvedValue({ error: { code: 'oauth_access_denied', message: 'access denied' } })
    vi.mocked(useSignIn).mockReturnValue({ signIn: { reset, sso } } as unknown as ReturnType<typeof useSignIn>)

    render(<GoogleSignupButton />)
    await user.click(screen.getByRole('button', { name: 'Registrarme con Google' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Cancelaste el acceso con Google')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does nothing when Clerk has not loaded signIn yet', async () => {
    const user = userEvent.setup()
    vi.mocked(useSignIn).mockReturnValue({ signIn: undefined } as unknown as ReturnType<typeof useSignIn>)

    render(<GoogleSignupButton />)
    await user.click(screen.getByRole('button', { name: 'Registrarme con Google' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
