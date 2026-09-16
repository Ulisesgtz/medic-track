import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AccountSignupPage } from './AccountSignupPage'

describe('AccountSignupPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the account signup form', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <AccountSignupPage />
      </QueryClientProvider>,
    )

    expect(screen.getByRole('heading', { name: 'Crear cuenta' })).toBeInTheDocument()
  })
})
