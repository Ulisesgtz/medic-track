import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { OfflineMissing } from './OfflineMissing'
import { RequireConnection } from './RequireConnection'
import { reportNetworkFailure, resetConnectivity } from './connectivity'
import { needsConnection, showsLoadError } from './queryView'

beforeEach(() => resetConnectivity())
afterEach(() => resetConnectivity())

describe('OfflineMissing', () => {
  it('says the screen needs a connection and goes home with no history', async () => {
    render(
      <MemoryRouter initialEntries={['/children/c1/historial']}>
        <Routes>
          <Route path="/home" element={<p>Inicio</p>} />
          <Route path="*" element={<OfflineMissing />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Esta pantalla necesita conexión.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '← Volver' }))
    expect(await screen.findByText('Inicio')).toBeInTheDocument()
  })
})

describe('RequireConnection', () => {
  it('shows the screen online and the notice offline', () => {
    render(
      <MemoryRouter>
        <RequireConnection>
          <p>Historial</p>
        </RequireConnection>
      </MemoryRouter>,
    )
    expect(screen.getByText('Historial')).toBeInTheDocument()
    act(() => reportNetworkFailure())
    expect(screen.queryByText('Historial')).toBeNull()
    expect(screen.getByText('Esta pantalla necesita conexión.')).toBeInTheDocument()
  })
})

describe('queryView', () => {
  const q = (over: Partial<{ data: unknown; isError: boolean; fetchStatus: string }>) => ({ data: undefined, isError: false, fetchStatus: 'idle', ...over })

  it('shows data whenever there are some', () => {
    reportNetworkFailure()
    expect(needsConnection(q({ data: {}, isError: true }))).toBe(false)
    expect(showsLoadError(q({ data: {}, isError: true }))).toBe(false)
  })

  it('needs a connection with no data and a paused or failed query offline', () => {
    expect(needsConnection(q({ fetchStatus: 'paused' }))).toBe(true)
    expect(needsConnection(q({ isError: true }))).toBe(false)
    reportNetworkFailure()
    expect(needsConnection(q({ isError: true }))).toBe(true)
    expect(needsConnection(q({ fetchStatus: 'idle' }))).toBe(true)
    expect(needsConnection(q({ fetchStatus: 'fetching' }))).toBe(false)
    expect(showsLoadError(q({ isError: true }))).toBe(false)
  })

  it('keeps the load error online', () => {
    expect(showsLoadError(q({ isError: true }))).toBe(true)
    expect(needsConnection(q({ fetchStatus: 'fetching' }))).toBe(false)
  })
})
