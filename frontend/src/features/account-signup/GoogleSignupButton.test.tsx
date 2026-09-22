import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSignIn } from '@clerk/react'
import { GoogleSignupButton } from './GoogleSignupButton'

vi.mock('@clerk/react', () => ({
  useSignIn: vi.fn(),
}))

describe('GoogleSignupButton', () => {
  it('calls signIn.sso() with the Google strategy and the callback/final URLs', async () => {
    const user = userEvent.setup()
    const sso = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(useSignIn).mockReturnValue({ signIn: { sso } } as unknown as ReturnType<typeof useSignIn>)

    render(<GoogleSignupButton />)
    await user.click(screen.getByRole('button', { name: 'Registrarme con Google' }))

    expect(sso).toHaveBeenCalledWith({
      strategy: 'oauth_google',
      redirectCallbackUrl: '/sso-callback',
      redirectUrl: '/home',
    })
  })

  it('shows an error message when Clerk rejects the SSO attempt', async () => {
    const user = userEvent.setup()
    const sso = vi.fn().mockResolvedValue({ error: { message: 'Google no respondió.' } })
    vi.mocked(useSignIn).mockReturnValue({ signIn: { sso } } as unknown as ReturnType<typeof useSignIn>)

    render(<GoogleSignupButton />)
    await user.click(screen.getByRole('button', { name: 'Registrarme con Google' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Google no respondió.')
  })

  it('does nothing when Clerk has not loaded signIn yet', async () => {
    const user = userEvent.setup()
    vi.mocked(useSignIn).mockReturnValue({ signIn: undefined } as unknown as ReturnType<typeof useSignIn>)

    render(<GoogleSignupButton />)
    await user.click(screen.getByRole('button', { name: 'Registrarme con Google' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
