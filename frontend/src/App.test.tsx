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

  it('shows a "Planes de pago" placeholder at /planes (where "Ver planes" points) instead of a blank screen', async () => {
    window.history.pushState({}, '', '/planes')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Planes de pago' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver a mi home' })).toHaveAttribute('href', '/home')
  })

  it('shows a not-found page with a way back for an unknown route', async () => {
    window.history.pushState({}, '', '/no-existe')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Esta página no existe' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver a mi home' })).toBeInTheDocument()
  })
})
