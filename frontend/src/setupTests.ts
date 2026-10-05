import '@testing-library/jest-dom/vitest'
import type { ReactNode } from 'react'
import { vi } from 'vitest'

// Default stub for every test: a signed-in Clerk session with a fake token,
// so useCurrentAccount()'s query (and anything built on it) fires exactly
// like it did against the old account_id-in-localStorage session, without
// every existing test needing its own <ClerkProvider>. Tests that care about
// a specific auth state (signed out, a real signIn/signUp flow) override this
// with their own `vi.mock('@clerk/react', ...)` at the top of that file.
vi.mock('@clerk/react', () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    getToken: async () => 'test-token',
    signOut: vi.fn(),
  }),
  // Defaults a signup submission straight to "already verified" (skips the
  // email-code step) so the many existing tests that only care about *this
  // app's own* validation/UI don't each need their own Clerk mock. Tests
  // that specifically exercise the Clerk sign-up flow (specs/008) override
  // this with their own `vi.mock('@clerk/react', ...)`.
  useSignUp: () => ({
    signUp: {
      status: 'complete',
      isTransferable: false,
      existingSession: undefined,
      password: vi.fn().mockResolvedValue({ error: null }),
      finalize: vi.fn().mockResolvedValue({ error: null }),
      verifications: {
        sendEmailCode: vi.fn().mockResolvedValue({ error: null }),
        verifyEmailCode: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    errors: null,
    fetchStatus: 'idle',
  }),
  useSignIn: () => ({
    signIn: {
      status: 'missing_requirements',
      isTransferable: false,
      existingSession: undefined,
      reset: vi.fn().mockResolvedValue({ error: null }),
      sso: vi.fn().mockResolvedValue({ error: null }),
      finalize: vi.fn().mockResolvedValue({ error: null }),
    },
    errors: null,
    fetchStatus: 'idle',
  }),
  useClerk: () => ({ setActive: vi.fn() }),
}))
