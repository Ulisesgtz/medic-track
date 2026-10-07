import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { account, callsOf, stubApi } from '../supplements/supplements.test-utils'
import { ChildAppointmentSection, ConsultationAppointmentSection } from './AppointmentSections'
import { appointment } from './appointments.test-utils'

function renderChild() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/children/child-1']}>
        <Routes>
          <Route path="/children/:childId" element={<ChildAppointmentSection childId="child-1" historyPath="/children/child-1/citas" />} />
          <Route path="/children/:childId/citas" element={<div>HISTORIAL</div>} />
          <Route path="/citas/:id/editar" element={<div>EDITAR</div>} />
          <Route path="/consultations/:id" element={<div>CONSULTA</div>} />
          <Route path="/consultations/:id/cita/nueva" element={<div>NUEVA</div>} />
          <Route path="/planes" element={<div>PLANES</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

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
const forChild = (next: unknown, history: unknown[] = [], paidPlan = true) => ({ body: { next, history, paidPlan } })

function api(routes: Parameters<typeof stubApi>[0], acc: unknown = ana) {
  return stubApi({
    'GET /accounts/me': { body: acc },
    'POST /appointments/ap1/status': { body: appointment({ status: 'done', statusBy: 'Ana' }) },
    'PUT /appointments/ap1/my-reminders': { body: { myReminders: false } },
    ...routes,
  })
}

describe('ChildAppointmentSection', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 6, 15, 10))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
  const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

  it('shows the next appointment: date and time big, a neutral count-down, who with, the note and the notices', async () => {
    api({ 'GET /children/child-1/appointments': forChild(appointment(), [appointment({ id: 'old', status: 'done' })]) })
    renderChild()
    expect(await screen.findByText('Próxima cita', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('en 3 días')).toBeInTheDocument()
    expect(screen.getByText('Vie 9 oct')).toBeInTheDocument()
    expect(screen.getByText('10:30')).toBeInTheDocument()
    expect(screen.getByText('Dra. Laura López')).toBeInTheDocument()
    expect(screen.getByText('Revisión de oído; pidió la cartilla de vacunas.')).toBeInTheDocument()
    expect(screen.getByText('1 día antes')).toBeInTheDocument()
    expect(screen.getByText('jue 8 oct, 10:30')).toBeInTheDocument()
    expect(screen.getByText('2 horas antes')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'De la consulta del lun 28 sep →' })).toHaveAttribute('href', '/consultations/c1')
    expect(screen.getByRole('link', { name: 'Historial de citas →' })).toHaveAttribute('href', '/children/child-1/citas')
    expect(screen.getByRole('link', { name: 'Editar' })).toHaveAttribute('href', '/citas/ap1/editar')
    expect(screen.getByRole('switch', { name: 'Tus avisos de esta cita' })).toHaveAttribute('aria-checked', 'true')
  })

  it('marks it done without asking, says so and takes it back', async () => {
    const mock = api({
      'GET /children/child-1/appointments': forChild(appointment()),
      'POST /appointments/ap1/status': { body: appointment({ status: 'done' }) },
    })
    renderChild()
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Marcar realizada' }))
    await waitFor(() => expect(callsOf(mock)).toContain('POST /appointments/ap1/status'))
    expect(JSON.parse(mock.mock.calls.find(([, i]) => i?.method === 'POST')![1].body)).toEqual({ status: 'done' })
    expect(await screen.findByText('La cita del vie 9 oct quedó como realizada.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Deshacer' }))
    await waitFor(() => expect(screen.queryByText(/quedó como realizada/)).not.toBeInTheDocument())
    expect(JSON.parse(mock.mock.calls.filter(([, i]) => i?.method === 'POST')[1][1].body)).toEqual({ status: 'scheduled' })
  })

  it('cancels only after the neutral confirmation, whose safe button is «Volver»', async () => {
    const mock = api({
      'GET /children/child-1/appointments': forChild(appointment()),
      'POST /appointments/ap1/status': { body: appointment({ status: 'canceled' }) },
    })
    renderChild()
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Cancelar cita' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: '¿Cancelar la cita del vie 9 oct?' })).toBeInTheDocument()
    expect(within(dialog).getByText('Los avisos de esta cita ya no llegan a nadie de la familia.')).toBeInTheDocument()
    expect(within(dialog).getByText('La cita queda en el historial como «Cancelada», con la fecha y quién la canceló.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Volver' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Volver' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(callsOf(mock)).not.toContain('POST /appointments/ap1/status')

    await user.click(screen.getByRole('button', { name: 'Cancelar cita' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar cita' }))
    await waitFor(() => expect(callsOf(mock)).toContain('POST /appointments/ap1/status'))
    expect(JSON.parse(mock.mock.calls.find(([, i]) => i?.method === 'POST')![1].body)).toEqual({ status: 'canceled' })
  })

  it('says it could not mark or cancel', async () => {
    api({ 'GET /children/child-1/appointments': forChild(appointment()), 'POST /appointments/ap1/status': { status: 500, body: {} } })
    renderChild()
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Marcar realizada' }))
    expect(await screen.findByText('No se pudo marcar la cita. Inténtalo de nuevo.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar cita' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar cita' }))
    expect(await within(await screen.findByRole('dialog')).findByRole('alert')).toHaveTextContent('No se pudo cancelar la cita.')
  })

  it('turns the session\'s own reminders off, and says if saving failed', async () => {
    const mock = api({ 'GET /children/child-1/appointments': forChild(appointment({ myReminders: false })) })
    renderChild()
    const toggle = await screen.findByRole('switch', { name: 'Tus avisos de esta cita' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await setup().click(toggle)
    await waitFor(() => expect(callsOf(mock)).toContain('PUT /appointments/ap1/my-reminders'))
    expect(JSON.parse(mock.mock.calls.find(([, i]) => i?.method === 'PUT')![1].body)).toEqual({ enabled: true })
  })

  it('shows «Pasó sin marcar» instead of a count-down, with no reminders switch', async () => {
    api({ 'GET /children/child-1/appointments': forChild(null, [appointment({ status: 'unmarked' })]) })
    renderChild()
    // No next one: the empty block says where appointments are written, and the history is one tap away.
    expect(await screen.findByText(/Las citas se anotan al registrar una consulta/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Historial de citas →' })).toHaveAttribute('href', '/children/child-1/citas')
  })

  it('tells a Caregiver that a Tutor edits, without any action', async () => {
    api({ 'GET /children/child-1/appointments': forChild(appointment({ canEdit: false, canMark: false })) }, caregiver)
    renderChild()
    expect(await screen.findByText('Un Tutor puede editar, marcar o cancelar esta cita.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Marcar realizada' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Tus avisos de esta cita' })).toBeInTheDocument()
  })

  it('on a lapsed plan a Tutor can mark but not edit', async () => {
    api({ 'GET /children/child-1/appointments': forChild(appointment({ canEdit: false }), [], false) }, account({ plan: 'free' }))
    renderChild()
    expect(await screen.findByRole('button', { name: 'Marcar realizada' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument()
  })

  it('shows nothing to a free account with no appointments and no history', async () => {
    const mock = api({ 'GET /children/child-1/appointments': forChild(null, [], false) }, account({ plan: 'free' }))
    const { container } = renderChild()
    await waitFor(() => expect(callsOf(mock)).toContain('GET /children/child-1/appointments'))
    await waitFor(() => expect(container.querySelector('section')).toBeNull())
  })

  it('shows the empty block to a paid account and no history link without history', async () => {
    api({ 'GET /children/child-1/appointments': forChild(null) })
    renderChild()
    expect(await screen.findByText(/Las citas se anotan al registrar una consulta/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Historial de citas →' })).not.toBeInTheDocument()
  })
})

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
