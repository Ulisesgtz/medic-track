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
}))
