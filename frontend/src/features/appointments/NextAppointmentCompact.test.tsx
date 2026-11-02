import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { account, stubApi } from '../supplements/supplements.test-utils'
import { NextAppointmentCompact } from './NextAppointmentCompact'
import { appointment } from './appointments.test-utils'

// specs/056 (design A, deviation 4 closed): the child's next appointment as a compact card.

function renderCard(variant: 'phone' | 'desktop' = 'phone') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/children/child-1']}>
        <Routes>
          <Route path="/children/:childId" element={<NextAppointmentCompact childId="child-1" variant={variant} />} />
          <Route path="/children/:childId/citas" element={<div>CITAS</div>} />
          <Route path="/children/:childId/citas/nueva" element={<div>NUEVA CITA</div>} />
          <Route path="/planes" element={<div>PLANES</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const forChild = (next: unknown, paidPlan = true) => ({ body: { next, history: [], paidPlan } })
const api = (next: unknown, acc: unknown = account(), paidPlan = true) =>
  stubApi({ 'GET /accounts/me': { body: acc }, 'GET /children/child-1/appointments': forChild(next, paidPlan) })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 6, 15, 10))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

describe('NextAppointmentCompact', () => {
  it('says when, with whom and where, opens the child’s appointments and the place in Maps', async () => {
    api(appointment({ location: 'Clínica del Valle, consultorio 214' }))
    renderCard()
    const card = await screen.findByRole('region', { name: 'Próxima cita' })
    expect(card).toHaveTextContent('viernes 9 de octubre · 10:30')
    expect(card).toHaveTextContent('Dra. Laura López')
    expect(card).toHaveTextContent('Clínica del Valle, consultorio 214')
    const maps = screen.getByRole('link', { name: 'Abrir en Maps' })
    expect(maps).toHaveAttribute('href', expect.stringContaining('google.com/maps'))
    expect(maps).toHaveAttribute('target', '_blank')
    await setup().click(screen.getByRole('link', { name: /viernes 9 de octubre/ }))
    expect(await screen.findByText('CITAS')).toBeInTheDocument()
  })

  it('has no «Abrir en Maps» without a place, and the same parts on the web', async () => {
    api(appointment())
    renderCard('desktop')
    expect(await screen.findByRole('region', { name: 'Próxima cita' })).toHaveTextContent('viernes 9 de octubre · 10:30')
    expect(screen.queryByRole('link', { name: 'Abrir en Maps' })).not.toBeInTheDocument()
  })

  it('offers «+ Agregar cita» when there is none', async () => {
    api(null)
    renderCard()
    expect(await screen.findByRole('link', { name: '+ Agregar cita' })).toHaveAttribute('href', '/children/child-1/citas/nueva')
  })

  it('on the free plan with none, the row with «Plan completo» opens the plan notice', async () => {
    api(null, account({ plan: 'free' }), false)
    renderCard()
    const row = await screen.findByRole('button', { name: /Próxima cita/ })
    expect(row).toHaveTextContent('Plan completo')
    await setup().click(row)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('shows a Caregiver nothing when there is none', async () => {
    const fetchMock = api(null, account({ plan: 'free' }, { role: 'caregiver', plan: 'paid', readOnly: false, accountId: 'owner' }))
    const { container } = renderCard()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 50))
    expect(container).toBeEmptyDOMElement()
  })
})
