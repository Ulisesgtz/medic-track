import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { RequireSession } from './RequireSession'

vi.mock('@clerk/react', () => ({
  useAuth: vi.fn(),
}))

function renderGuarded() {
  return render(
    <MemoryRouter initialEntries={['/home']}>
      <Routes>
        <Route
          path="/home"
          element={
            <RequireSession>
              <p>Protected content</p>
            </RequireSession>
          }
        />
        <Route path="/login" element={<p>Login page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireSession', () => {
  it('shows a loading state while Clerk has not resolved auth yet', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: false, isSignedIn: false } as unknown as ReturnType<typeof useAuth>)

    renderGuarded()

    expect(screen.getByText('Cargando…')).toBeInTheDocument()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })

  it('redirects to /login when the visitor is not signed in', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: false } as unknown as ReturnType<typeof useAuth>)

    renderGuarded()

    expect(screen.getByText('Login page')).toBeInTheDocument()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })

  it('renders the protected content once signed in', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true } as unknown as ReturnType<typeof useAuth>)

    renderGuarded()

    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })
})
