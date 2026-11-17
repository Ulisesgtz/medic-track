import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// specs/072: the page-level boundary wraps the paused-account guard too, so a guard that breaks shows the error screen (B), not a blank page.
vi.mock('./features/account/PausedAccountGate', () => ({
  PausedAccountGate: () => {
    throw new Error('the guard broke')
  },
}))

import App from './App'

describe('App error boundary', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    window.history.pushState({}, '', '/home')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows the error screen when the paused-account guard breaks', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Algo no cargó bien' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Volver a cargar' })).toBeInTheDocument()
  })
})
