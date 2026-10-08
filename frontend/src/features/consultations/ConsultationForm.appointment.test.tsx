import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConsultationForm } from './ConsultationForm'
import { pickTime } from '../../shared/ui/timeField.test-utils'

// The form is large and each hour is picked on the grid: under the coverage run these tests are slow, so they get more time.
vi.setConfig({ testTimeout: 20_000 })

// specs/033, part 2: the «Próxima cita» field of «Nueva consulta». The appointment is its own call, made after the consultation.

vi.mock('tesseract.js', () => ({
  default: { recognize: vi.fn().mockResolvedValue({ data: { text: '' } }) },
}))
vi.mock('../../shared/catalog/useCatalog', () => ({
  SYMPTOMS_QUERY_KEY: ['catalog', 'symptoms'],
  useSymptoms: () => ({ data: [], isPending: false, isError: false }),
}))

function renderForm(variant: 'phone' | 'desktop' = 'phone', extra: Partial<Parameters<typeof ConsultationForm>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onSuccess = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/nueva']}>
        <Routes>
          <Route path="/nueva" element={<ConsultationForm childId="child-1" variant={variant} cancelTo="/hijo" onSuccess={onSuccess} {...extra} />} />
          <Route path="/hijo" element={<p>DETALLE DEL HIJO</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { onSuccess }
}

const byId = (id: string) => document.getElementById(id) as HTMLInputElement

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Doctor'), 'Dra. López')
  await user.type(screen.getByLabelText('Fecha'), '2026-01-15')
  await user.upload(screen.getByLabelText('Foto de la receta'), new File(['fake-bytes'], 'receta.jpg', { type: 'image/jpeg' }))
  await user.type(byId('medications.0.name'), 'Amoxicilina 250 mg')
  await user.type(byId('medications.0.frequencyHours'), 'c/8 h')
  await user.type(byId('medications.0.durationDays'), '7 días')
  await user.type(byId('medications.0.startTime'), '0800')
}

const consultation = { id: 'consultation-1', childId: 'child-1', doctorName: 'Dra. López', consultDate: '2026-01-15', photoBase64: 'Zm9v', notes: '', symptoms: [], medications: [], recordOnly: false }

/** Answers the consultation with 201 and the appointment with whatever the test says. */
function stubApi(appointment: { ok: boolean; status: number; body: unknown }) {
  const mock = vi.fn((url: string) =>
    Promise.resolve(
      String(url).endsWith('/appointments')
        ? { ok: appointment.ok, status: appointment.status, json: async () => appointment.body }
        : { ok: true, status: 201, json: async () => consultation },
    ),
  )
  vi.stubGlobal('fetch', mock)
  return mock
}
const calls = (mock: ReturnType<typeof vi.fn>) =>
  mock.mock.calls.map((c) => {
    const [url, init] = c as [string, RequestInit]
    return { path: String(url).replace('http://localhost:8080', ''), method: init.method, body: init.body ? JSON.parse(String(init.body)) : undefined }
  })

describe('ConsultationForm, next appointment (specs/033 part 2)', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it.each(['phone', 'desktop'] as const)('%s: saves the consultation first and then its appointment, with the default notices', async (variant) => {
    const user = userEvent.setup()
    const mock = stubApi({ ok: true, status: 201, body: {} })
    const { onSuccess } = renderForm(variant)
    await fillValid(user)
    await user.type(screen.getByLabelText('Fecha de la cita'), '2026-02-10')
    await pickTime(user, 'Hora de la cita', '10:30')
    await user.click(screen.getByRole('button', { name: 'Guardar consulta' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('consultation-1', false))
    const made = calls(mock)
    expect(made.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /children/child-1/consultations', 'POST /consultations/consultation-1/appointments'])
    expect(made[1].body.startsAt).toBe(new Date(2026, 1, 10, 10, 30).toISOString())
    expect(made[1].body.notices).toEqual([
      { kind: 'before', leadMinutes: 1440, daysBefore: null, atTime: null },
      { kind: 'before', leadMinutes: 120, daysBefore: null, atTime: null },
    ])
  })

  it('without a date or hour makes no second call', async () => {
    const user = userEvent.setup()
    const mock = stubApi({ ok: true, status: 201, body: {} })
    const { onSuccess } = renderForm()
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'Guardar consulta' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('consultation-1', false))
    expect(calls(mock)).toHaveLength(1)
  })

  it('keeps the consultation and says so when the appointment could not be saved', async () => {
    const user = userEvent.setup()
    stubApi({ ok: false, status: 500, body: {} })
    const { onSuccess } = renderForm()
    await fillValid(user)
    await user.type(screen.getByLabelText('Fecha de la cita'), '2026-02-10')
    await pickTime(user, 'Hora de la cita', '10:30')
    await user.click(screen.getByRole('button', { name: 'Guardar consulta' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('consultation-1', true))
  })

  it('asks for the hour when only the date was typed, and does not save anything', async () => {
    const user = userEvent.setup()
    const mock = stubApi({ ok: true, status: 201, body: {} })
    const { onSuccess } = renderForm()
    await fillValid(user)
    await user.type(screen.getByLabelText('Fecha de la cita'), '2026-02-10')
    await user.click(screen.getByRole('button', { name: 'Guardar consulta' }))

    expect(await screen.findByText('Escribe la hora de la cita.')).toBeInTheDocument()
    expect(mock).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('refuses an appointment before the consultation date', async () => {
    const user = userEvent.setup()
    const mock = stubApi({ ok: true, status: 201, body: {} })
    renderForm()
    await fillValid(user)
    await user.type(screen.getByLabelText('Fecha de la cita'), '2026-01-10')
    await pickTime(user, 'Hora de la cita', '10:30')
    await user.click(screen.getByRole('button', { name: 'Guardar consulta' }))

    expect(await screen.findByText('La próxima cita va después de la consulta (15 ene 2026).')).toBeInTheDocument()
    expect(mock).not.toHaveBeenCalled()
  })

  it('on the free plan shows the field disabled and never sends an appointment', async () => {
    const user = userEvent.setup()
    const mock = stubApi({ ok: true, status: 201, body: {} })
    const { onSuccess } = renderForm('phone', { appointmentAvailable: false })
    expect(screen.getByText('Disponible en el plan completo')).toBeInTheDocument()
    expect(screen.queryByLabelText('Fecha de la cita')).not.toBeInTheDocument()
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'Guardar consulta' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('consultation-1', false))
    expect(calls(mock)).toHaveLength(1)
  })
})
