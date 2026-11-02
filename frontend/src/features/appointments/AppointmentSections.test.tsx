import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { account, stubApi } from '../supplements/supplements.test-utils'
import { ConsultationAppointmentSection } from './AppointmentSections'
import { appointment } from './appointments.test-utils'

function renderConsultation() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/consultations/c1']}>
        <Routes>
          <Route path="/consultations/:id" element={<ConsultationAppointmentSection consultationId="c1" childId="child-1" />} />
          <Route path="/consultations/:id/cita/nueva" element={<div>NUEVA</div>} />
          <Route path="/planes" element={<div>PLANES</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const caregiver = account({ plan: 'free' }, { role: 'caregiver', plan: 'paid', readOnly: false, accountId: 'owner' })
const ana = account()

function api(routes: Parameters<typeof stubApi>[0], acc: unknown = ana) {
  return stubApi({
    'GET /accounts/me': { body: acc },
    'POST /appointments/ap1/status': { body: appointment({ status: 'done', statusBy: 'Ana' }) },
    'PUT /appointments/ap1/my-reminders': { body: { myReminders: false } },
    ...routes,
  })
}

describe('ConsultationAppointmentSection', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 6, 15, 10))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shows the consultation\'s appointment without the consultation link', async () => {
    api({ 'GET /consultations/c1/appointment': { body: { appointment: appointment(), paidPlan: true } } })
    renderConsultation()
    expect(await screen.findByText('Vie 9 oct')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /De la consulta del/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Historial de citas →' })).not.toBeInTheDocument()
  })

  it('shows «Pasó sin marcar» and no reminders switch for one whose day ended', async () => {
    api({ 'GET /consultations/c1/appointment': { body: { appointment: appointment({ status: 'unmarked' }), paidPlan: true } } })
    renderConsultation()
    expect(await screen.findByText('Pasó sin marcar')).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Marcar realizada' })).toBeInTheDocument()
  })

  it('invites a Tutor to add one without changing anything else of the consultation', async () => {
    api({ 'GET /consultations/c1/appointment': { body: { appointment: null, paidPlan: true } } })
    renderConsultation()
    expect(await screen.findByText('Si el pediatra dio una fecha para volver, se puede anotar sin cambiar nada más de la consulta.')).toBeInTheDocument()
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('link', { name: 'Agregar próxima cita' }))
    expect(await screen.findByText('NUEVA')).toBeInTheDocument()
  })

  it('sends a Tutor on the free plan to the plan instead', async () => {
    api({ 'GET /consultations/c1/appointment': { body: { appointment: null, paidPlan: false } } }, account({ plan: 'free' }))
    renderConsultation()
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(await screen.findByRole('link', { name: /Disponible en el plan completo/ }))
    expect(await screen.findByText('PLANES')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Agregar próxima cita' })).not.toBeInTheDocument()
  })

  it('shows nothing to a Caregiver when there is no appointment', async () => {
    api({ 'GET /consultations/c1/appointment': { body: { appointment: null, paidPlan: true } } }, caregiver)
    const { container } = renderConsultation()
    await waitFor(() => expect(container.querySelector('section')).toBeNull())
  })
})
