import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { account, callsOf, stubApi, stubWeb } from '../supplements/supplements.test-utils'
import { AppointmentFormPage } from './AppointmentFormPage'
import { AppointmentHistoryPage } from './AppointmentHistoryPage'
import { appointment } from './appointments.test-utils'

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/citas/:appointmentId/editar" element={<AppointmentFormPage />} />
          <Route path="/consultations/:consultationId/cita/nueva" element={<AppointmentFormPage />} />
          <Route path="/children/:childId/citas" element={<AppointmentHistoryPage />} />
          <Route path="/children/:childId" element={<div>HIJO</div>} />
          <Route path="/consultations/:consultationId" element={<div>CONSULTA</div>} />
          <Route path="/planes" element={<div>PLANES</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const caregiver = account({ plan: 'free' }, { role: 'caregiver', plan: 'paid', readOnly: false, accountId: 'owner' })
const consultation = { id: 'c1', childId: 'child-1', doctorName: 'Dr. Jorge Ramírez', consultDate: '2026-08-14', photoBase64: '', notes: '', symptoms: [], medications: [] }
const sentBody = (mock: ReturnType<typeof vi.fn>, method: string) => JSON.parse(mock.mock.calls.find(([, i]) => i?.method === method)![1].body)

function api(extra: Parameters<typeof stubApi>[0] = {}, acc: unknown = account()) {
  return stubApi({
    'GET /accounts/me': { body: acc },
    'GET /appointments/ap1': { body: appointment() },
    'PATCH /appointments/ap1': { body: appointment({ note: 'nueva' }) },
    'GET /consultations/c1': { body: consultation },
    'GET /consultations/c1/appointment': { body: { appointment: null, paidPlan: true } },
    'POST /consultations/c1/appointments': { status: 201, body: appointment() },
    ...extra,
  })
}

describe('AppointmentFormPage — edit', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 6, 15, 10))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
  const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

  it('fills the fields with the appointment, says the family sees the change and saves it', async () => {
    const mock = api()
    renderAt('/citas/ap1/editar')
    expect(await screen.findByRole('heading', { name: 'Editar cita', level: 1 })).toBeInTheDocument()
    expect(await screen.findByLabelText('Fecha de la cita')).toHaveValue('2026-10-09')
    expect(screen.getByLabelText('Hora de la cita')).toHaveValue('10:30')
    expect(screen.getByText('Los cambios los ve toda la familia y los avisos se vuelven a programar.')).toBeInTheDocument()
    expect(await screen.findByText('Próxima cita · Mateo Morales')).toBeInTheDocument()

    const user = setup()
    const note = screen.getByLabelText('Nota', { exact: false })
    await user.clear(note)
    await user.type(note, 'nueva')
    await user.click(screen.getByRole('button', { name: 'Quitar aviso «1 día antes»' }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText('HIJO')).toBeInTheDocument()
    const body = sentBody(mock, 'PATCH')
    expect(body.note).toBe('nueva')
    expect(body.notices).toEqual([{ kind: 'before', leadMinutes: 120, daysBefore: null, atTime: null }])
    expect(body.startsAt).toBe(new Date(2026, 9, 9, 10, 30).toISOString())
  })

  it('shows the plan notice when the server says the plan is not paid, keeping what was typed', async () => {
    api({ 'PATCH /appointments/ap1': { status: 422, body: { error: 'freemium_consultation_limit_exceeded', reason: 'appointments' } } })
    renderAt('/citas/ap1/editar')
    const user = setup()
    const note = await screen.findByLabelText('Nota', { exact: false })
    await user.type(note, ' y más')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Próxima cita con recordatorio')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Entendido' }))
    expect(screen.getByLabelText('Nota', { exact: false })).toHaveValue('Revisión de oído; pidió la cartilla de vacunas. y más')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await user.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Ver planes' }))
    expect(await screen.findByText('PLANES')).toBeInTheDocument()
  })

  const failWith = async (response: { status: number; body: unknown }, text: string) => {
    api({ 'PATCH /appointments/ap1': response })
    renderAt('/citas/ap1/editar')
    await setup().click(await screen.findByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText(text)).toBeInTheDocument()
  }

  it('says a closed appointment cannot be edited', () =>
    failWith({ status: 409, body: { error: 'appointment_closed' } }, 'Esta cita ya está cerrada y no se puede editar.'))

  it('says the date is before the consultation when the server says so', () =>
    failWith({ status: 400, body: { error: 'validation_error', details: [{ field: 'startsAt', message: 'x' }] } }, 'La próxima cita no puede ser antes de la consulta.'))

  it('says the data must be checked for any other validation failure', () =>
    failWith({ status: 400, body: { error: 'validation_error', details: [{ field: 'notices', message: 'x' }] } }, 'No se pudo guardar la cita. Revisa los datos e inténtalo de nuevo.'))

  it('says to try again for an unknown failure', () =>
    failWith({ status: 500, body: {} }, 'No se pudo guardar la cita. Inténtalo de nuevo.'))

  it('checks the date before asking the server', async () => {
    const mock = api({ 'GET /appointments/ap1': { body: appointment({ consultDate: '2026-10-20' }) } })
    renderAt('/citas/ap1/editar')
    await setup().click(await screen.findByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText('La próxima cita va después de la consulta (20 oct 2026).')).toBeInTheDocument()
    expect(callsOf(mock)).not.toContain('PATCH /appointments/ap1')
  })

  it('leaves without asking when nothing changed, and asks when something did', async () => {
    api()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    renderAt('/citas/ap1/editar')
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(await screen.findByText('HIJO')).toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('keeps the form when leaving is refused', async () => {
    api()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    renderAt('/citas/ap1/editar')
    const user = setup()
    await user.type(await screen.findByLabelText('Nota', { exact: false }), ' más')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('heading', { name: 'Editar cita', level: 1 })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(await screen.findByText('HIJO')).toBeInTheDocument()
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('does not edit a closed appointment, nor one that does not exist, and a Caregiver cannot', async () => {
    api({ 'GET /appointments/ap1': { body: appointment({ status: 'canceled' }) } })
    renderAt('/citas/ap1/editar')
    expect(await screen.findByText(/Esta cita ya está cerrada y no se puede editar\. Para otra fecha/)).toBeInTheDocument()

    api({ 'GET /appointments/ap1': { status: 404, body: {} } })
    renderAt('/citas/ap1/editar')
    expect(await screen.findAllByText('No se encontró esta cita.')).not.toHaveLength(0)

    api({}, caregiver)
    renderAt('/citas/ap1/editar')
    expect(await screen.findByText('Solo un Tutor puede anotar o editar citas.')).toBeInTheDocument()
  })

  it('on a lapsed plan shows the fields disabled with no way to save', async () => {
    api({ 'GET /appointments/ap1': { body: appointment({ canEdit: false }) } }, account({ plan: 'free' }))
    renderAt('/citas/ap1/editar')
    expect(await screen.findByText('Disponible en el plan completo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
  })

  it('has a web design with a text header', async () => {
    stubWeb(true)
    api()
    renderAt('/citas/ap1/editar')
    expect(await screen.findByRole('link', { name: '← Mateo' })).toHaveAttribute('href', '/children/child-1')
  })

  it('says it is loading', async () => {
    api()
    renderAt('/citas/ap1/editar')
    expect(screen.getByText('Cargando…')).toBeInTheDocument()
    await screen.findByLabelText('Fecha de la cita')
  })
})

describe('AppointmentFormPage — add to a saved consultation', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 6, 15, 10))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
  const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

  it('shows the consultation as a read-only reference, starts empty and saves only the appointment', async () => {
    const mock = api()
    renderAt('/consultations/c1/cita/nueva')
    expect(await screen.findByRole('heading', { name: 'Agregar próxima cita', level: 1 })).toBeInTheDocument()
    expect(await screen.findByText(/Consulta del 14 agosto 2026 con Dr\. Jorge Ramírez\. Solo se agrega la cita; lo demás de la consulta no\s+cambia\./)).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha de la cita')).toHaveValue('')

    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Guardar cita' }))
    expect(screen.getByText('Elige la fecha de la cita.')).toBeInTheDocument()
    expect(callsOf(mock)).not.toContain('POST /consultations/c1/appointments')

    await user.type(screen.getByLabelText('Fecha de la cita'), '2026-10-20')
    await user.type(screen.getByLabelText('Hora de la cita'), '09:30')
    await user.click(screen.getByRole('button', { name: 'Guardar cita' }))
    expect(await screen.findByText('CONSULTA')).toBeInTheDocument()
    expect(sentBody(mock, 'POST').startsAt).toBe(new Date(2026, 9, 20, 9, 30).toISOString())
    expect(callsOf(mock).filter((c) => c.startsWith('PATCH /consultations'))).toHaveLength(0)
  })

  it('refuses a date before the consultation', async () => {
    const mock = api()
    renderAt('/consultations/c1/cita/nueva')
    const user = setup()
    await user.type(await screen.findByLabelText('Fecha de la cita'), '2026-08-01')
    await user.type(screen.getByLabelText('Hora de la cita'), '09:30')
    await user.click(screen.getByRole('button', { name: 'Guardar cita' }))
    expect(await screen.findByText('La próxima cita va después de la consulta (14 ago 2026).')).toBeInTheDocument()
    expect(callsOf(mock)).not.toContain('POST /consultations/c1/appointments')
  })

  it('says when the consultation already has one scheduled', async () => {
    api({ 'POST /consultations/c1/appointments': { status: 409, body: { error: 'appointment_exists' } } })
    renderAt('/consultations/c1/cita/nueva')
    const user = setup()
    await user.type(await screen.findByLabelText('Fecha de la cita'), '2026-10-20')
    await user.type(screen.getByLabelText('Hora de la cita'), '09:30')
    await user.click(screen.getByRole('button', { name: 'Guardar cita' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta consulta ya tiene una próxima cita.')
  })

  it('does not add a second one when one is already scheduled', async () => {
    api({ 'GET /consultations/c1/appointment': { body: { appointment: appointment(), paidPlan: true } } })
    renderAt('/consultations/c1/cita/nueva')
    expect(await screen.findByText(/Esta consulta ya tiene una próxima cita/)).toBeInTheDocument()
  })

  it('on the free plan shows the fields disabled and no save button', async () => {
    api({ 'GET /consultations/c1/appointment': { body: { appointment: null, paidPlan: false } } }, account({ plan: 'free' }))
    renderAt('/consultations/c1/cita/nueva')
    expect(await screen.findByText('Disponible en el plan completo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar cita' })).not.toBeInTheDocument()
  })

  it('says the consultation was not found', async () => {
    api({ 'GET /consultations/c1': { status: 404, body: {} } })
    renderAt('/consultations/c1/cita/nueva')
    expect(await screen.findByText('No se encontró esta consulta.')).toBeInTheDocument()
  })
})

describe('AppointmentHistoryPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 6, 15, 10))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
  const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const history = [
    appointment({ id: 'h1', status: 'done', statusBy: 'Ana', startsAt: new Date(2026, 8, 15, 17, 0).toISOString(), consultDate: '2026-09-01', doctorName: 'Dra. Laura López' }),
    appointment({ id: 'h2', status: 'unmarked', startsAt: new Date(2026, 7, 20, 9, 30).toISOString(), consultDate: '2026-08-14', doctorName: 'Dr. Jorge Ramírez' }),
    appointment({
      id: 'h3',
      status: 'canceled',
      statusBy: 'Luis',
      statusAt: new Date(2026, 7, 1, 12, 0).toISOString(),
      startsAt: new Date(2026, 7, 3, 12, 0).toISOString(),
      consultDate: '2026-07-20',
      doctorName: 'Dr. Jorge Ramírez',
    }),
  ]

  it('lists what is done, passed without being marked and canceled, each with a neutral chip and who did it', async () => {
    const mock = stubApi({
      'GET /accounts/me': { body: account() },
      'GET /children/child-1/appointments': { body: { next: appointment(), history, paidPlan: true } },
      'POST /appointments/h2/status': { body: appointment({ id: 'h2', status: 'done' }) },
      'POST /appointments/h1/status': { body: appointment({ id: 'h1', status: 'scheduled' }) },
    })
    renderAt('/children/child-1/citas')
    expect(await screen.findByRole('heading', { name: 'Historial de citas', level: 1 })).toBeInTheDocument()
    expect(await screen.findByText('mar 15 sep 2026 · 17:00')).toBeInTheDocument()
    expect(screen.getByText('De la consulta del mar 1 sep · marcada por Ana')).toBeInTheDocument()
    expect(screen.getByText('De la consulta del vie 14 ago · nadie la marcó')).toBeInTheDocument()
    expect(screen.getByText('De la consulta del lun 20 jul · cancelada el sáb 1 ago por Luis')).toBeInTheDocument()
    expect(screen.getByText('Realizada')).toBeInTheDocument()
    expect(screen.getByText('Cancelada')).toBeInTheDocument()
    expect(screen.getAllByText('Pasó sin marcar')).toHaveLength(1)
    expect(screen.getByText('Anteriores')).toBeInTheDocument()
    // The next one is on top.
    expect(screen.getByText('Vie 9 oct')).toBeInTheDocument()

    const user = setup()
    await user.click(screen.getAllByRole('button', { name: 'Marcar realizada' }).at(-1) as HTMLElement)
    await waitFor(() => expect(callsOf(mock)).toContain('POST /appointments/h2/status'))
    await user.click(screen.getByRole('button', { name: 'Deshacer' }))
    await waitFor(() => expect(callsOf(mock)).toContain('POST /appointments/h1/status'))
  })

  it('says there are none yet', async () => {
    stubApi({
      'GET /accounts/me': { body: account() },
      'GET /children/child-1/appointments': { body: { next: null, history: [], paidPlan: true } },
    })
    renderAt('/children/child-1/citas')
    expect(await screen.findByRole('heading', { name: 'Aún no hay citas anotadas' })).toBeInTheDocument()
    expect(screen.getByText(/las que pasaron sin marcar/)).toBeInTheDocument()
  })

  it('shows a Caregiver the history without any way to mark', async () => {
    stubApi({
      'GET /accounts/me': { body: caregiver },
      'GET /children/child-1/appointments': { body: { next: null, history, paidPlan: true } },
    })
    renderAt('/children/child-1/citas')
    expect(await screen.findByText('Pasó sin marcar')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Marcar realizada' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deshacer' })).not.toBeInTheDocument()
  })

  it('says it could not load, and while loading, and has the web design', async () => {
    stubApi({ 'GET /accounts/me': { body: account() }, 'GET /children/child-1/appointments': { status: 500, body: {} } })
    renderAt('/children/child-1/citas')
    expect(screen.getByText('Cargando…')).toBeInTheDocument()
    expect(await screen.findByText('No se pudo cargar el historial de citas.')).toBeInTheDocument()
    stubWeb(true)
    stubApi({ 'GET /accounts/me': { body: account() }, 'GET /children/child-1/appointments': { body: { next: null, history: [], paidPlan: true } } })
    renderAt('/children/child-1/citas')
    expect(await screen.findAllByRole('link', { name: '← Mateo' })).not.toHaveLength(0)
  })
})
