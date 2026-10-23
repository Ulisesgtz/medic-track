import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// specs/047: the installed app opens at /home (the manifest's start_url). A phone with a child's access and no parent session is the
// child's: it goes to its own screen, not to the parents' login.

let signedIn = false
vi.mock('@clerk/react', () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ isLoaded: true, isSignedIn: signedIn, userId: signedIn ? 'u1' : null, getToken: async () => 'test-token', signOut: vi.fn() }),
  useSignIn: () => ({
    signIn: { status: 'missing_requirements', isTransferable: false, existingSession: undefined, reset: vi.fn(), sso: vi.fn(), finalize: vi.fn() },
    errors: null,
    fetchStatus: 'idle',
  }),
  useSignUp: () => ({ signUp: { status: 'missing_requirements', isTransferable: false, existingSession: undefined }, errors: null, fetchStatus: 'idle' }),
  useClerk: () => ({ setActive: vi.fn() }),
}))

import App from './App'

describe('App /home', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }))
    window.history.pushState({}, '', '/home')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
    signedIn = false
  })

  it('takes a phone with a child access and no parent session to the child screen', async () => {
    window.localStorage.setItem('hijo-credencial', 'cred-del-hijo')
    render(<App />)
    expect(await screen.findByRole('heading', { name: /Hola/ })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/hijo/hoy')
  })

  it('still sends a signed-out visitor without a child access to the login', async () => {
    render(<App />)
    await screen.findByRole('heading', { level: 1 })
    expect(window.location.pathname).toBe('/login')
  })

  it('never takes a signed-in parent away from the home, even on a phone that carries a child access', async () => {
    signedIn = true
    window.localStorage.setItem('hijo-credencial', 'cred-del-hijo')
    render(<App />)
    await screen.findByRole('main')
    expect(window.location.pathname).toBe('/home')
  })
})
