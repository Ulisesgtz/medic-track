import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('redirects "/" to the account signup page', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Crear cuenta' })).toBeInTheDocument()
  })
})
