import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditConsultationPage } from './EditConsultationPage'
import { EDIT_TEXT } from './editText'

vi.mock('tesseract.js', () => ({
  default: { recognize: vi.fn().mockResolvedValue({ data: { text: '' } }) },
}))

type Role = 'owner' | 'tutor' | 'caregiver'

function account(role: Role = 'owner') {
  return {
    id: 'a1', firstName: 'Ana', lastName: 'Gómez', email: 'ana@example.com', countryCode: null, stateCode: null, plan: 'paid',
    children: [{ id: 'k1', firstName: 'Mateo', lastName: 'Morales', birthDate: '2021-03-01', height: null, weight: null, role, plan: 'paid', readOnly: false }],
  }
}

function detail(over: Record<string, unknown> = {}) {
  return {
    id: 'c1', childId: 'k1', doctorName: 'Dra. Laura Cazares', consultDate: '2026-10-18', photoBase64: 'Zm9v', notes: 'Fiebre',
    symptoms: [], recordOnly: false, createdAt: '2026-10-18T15:20:00.123456Z', edited: null,
    medications: [
      {
        id: 'm1', name: 'Amoxicilina', frequencyHours: 8, durationDays: 7, startTime: '08:00', endedAt: null as string | null, extendableDoses: 0, extensions: [],
        doses: [{ id: 'd1', scheduledAt: '2026-10-18T14:00:00Z', taken: true, status: 'taken' }],
      },
    ],
    ...over,
  }
}

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
}

interface Api {
  role?: Role
  detail?: unknown
  put?: { status: number; body: unknown }
  detailFails?: boolean
}

function stubApi({ role = 'owner', detail: d = detail(), put = { status: 200, body: detail() }, detailFails = false }: Api = {}) {
  const fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'PUT') return { ok: put.status < 300, status: put.status, json: async () => put.body }
    if (url.includes('/accounts/')) return { ok: true, status: 200, json: async () => account(role) }
    if (url.includes('/catalog/symptoms')) return { ok: true, status: 200, json: async () => [] }
    if (detailFails) return { ok: false, status: 404, json: async () => ({ error: 'consultation_not_found' }) }
    return { ok: true, status: 200, json: async () => d }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/consultations/c1/editar']}>
        <Routes>
          <Route path="/consultations/:consultationId/editar" element={<EditConsultationPage />} />
          <Route path="/consultations/:consultationId" element={<p>DETALLE DE CONSULTA</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { invalidate }
}

const byId = (id: string) => document.getElementById(id) as HTMLInputElement
const putBody = (fetchMock: ReturnType<typeof vi.fn>) =>
  JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')![1].body))

describe('EditConsultationPage', () => {
  beforeEach(() => stubMatchMedia(false))

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it.each([
    ['phone', false],
    ['web', true],
  ])('%s: the form with what was saved, without «Próxima cita», and «Guardar cambios»', async (_, desktop) => {
    stubMatchMedia(desktop)
    stubApi()
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: EDIT_TEXT.title })).toBeInTheDocument()
    expect(screen.getByLabelText('Doctor')).toHaveValue('Dra. Laura Cazares')
    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-10-18')
    expect(byId('medications.0.name')).toHaveValue('Amoxicilina')
    expect(byId('medications.0.frequencyHours')).toHaveValue('8')
    expect(byId('medications.0.startTime')).toHaveValue('08:00')
    expect(screen.queryByText(/Próxima cita/)).not.toBeInTheDocument()
    expect(screen.getByText(EDIT_TEXT.photoKept)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: EDIT_TEXT.changePhoto })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /solo como registro/ })).toBeDisabled()
    expect(screen.getByText(EDIT_TEXT.recordOnlyFixed)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: EDIT_TEXT.save })).toBeInTheDocument()
  })

  it('saves the whole consultation with the version and the medication id, and goes back to it', async () => {
    const user = userEvent.setup()
    const fetchMock = stubApi()
    const { invalidate } = renderPage()
    const doctor = await screen.findByLabelText('Doctor')
    await user.clear(doctor)
    await user.type(doctor, 'Dra. Laura Cázares')
    await user.click(screen.getByRole('button', { name: EDIT_TEXT.save }))

    expect(await screen.findByText('DETALLE DE CONSULTA')).toBeInTheDocument()
    const [url] = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')!
    expect(String(url)).toMatch(/\/consultations\/c1$/)
    const body = putBody(fetchMock)
    expect(body).toMatchObject({
      expectedVersion: '2026-10-18T15:20:00.123456Z',
      doctorName: 'Dra. Laura Cázares',
      medications: [{ id: 'm1', name: 'Amoxicilina', frequencyHours: 8, durationDays: 7, startTime: '08:00' }],
    })
    expect(body).not.toHaveProperty('photoBase64')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['consultations', 'k1'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['history', 'k1'] })
  })

  it('a conflict says so and shows the saved version again', async () => {
    const user = userEvent.setup()
    const fetchMock = stubApi({ put: { status: 409, body: { error: 'edit_conflict', message: 'x' } } })
    renderPage()
    const doctor = await screen.findByLabelText('Doctor')
    await user.clear(doctor)
    await user.type(doctor, 'Otro')
    await user.click(screen.getByRole('button', { name: EDIT_TEXT.save }))

    expect(await screen.findByText(EDIT_TEXT.conflict)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Doctor')).toHaveValue('Dra. Laura Cazares'))
    expect(fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith('/consultations/c1') && !init?.method).length).toBeGreaterThan(1)
  })

  it('a medication taken out that got a mark meanwhile: says so', async () => {
    const user = userEvent.setup()
    stubApi({ put: { status: 409, body: { error: 'medication_has_marks', message: 'x' } } })
    renderPage()
    await screen.findByLabelText('Doctor')
    await user.click(screen.getByRole('button', { name: EDIT_TEXT.save }))

    expect(await screen.findByText(EDIT_TEXT.hasMarks)).toBeInTheDocument()
  })

  it('another failure keeps what was typed and says nothing changed', async () => {
    const user = userEvent.setup()
    stubApi({ put: { status: 500, body: { message: 'boom' } } })
    renderPage()
    const doctor = await screen.findByLabelText('Doctor')
    await user.clear(doctor)
    await user.type(doctor, 'Otro')
    await user.click(screen.getByRole('button', { name: EDIT_TEXT.save }))

    expect(await screen.findByText(EDIT_TEXT.error)).toBeInTheDocument()
    expect(screen.getByLabelText('Doctor')).toHaveValue('Otro')
  })

  it('leaving with changes asks first', async () => {
    const user = userEvent.setup()
    stubApi()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPage()
    await user.type(await screen.findByLabelText('Doctor'), ' x')
    await user.click(screen.getByRole('link', { name: '← Cancelar' }))

    expect(confirm).toHaveBeenCalledWith(EDIT_TEXT.leave)
    expect(screen.getByRole('heading', { level: 1, name: EDIT_TEXT.title })).toBeInTheDocument()
  })

  it('a new schedule asks first: «Volver» sends nothing, confirming saves', async () => {
    const user = userEvent.setup()
    const fetchMock = stubApi()
    renderPage()
    const frequency = await screen.findByLabelText('Frecuencia')
    await user.clear(frequency)
    await user.type(frequency, '6')
    await user.click(screen.getByRole('button', { name: EDIT_TEXT.save }))

    const dialog = await screen.findByRole('dialog', { name: EDIT_TEXT.scheduleConfirm.title })
    expect(dialog).toHaveTextContent('Las tomas que ya marcaste no cambian.')
    expect(dialog).toHaveTextContent('Las que aún no llegan se acomodan al nuevo horario.')
    await user.click(within(dialog).getByRole('button', { name: EDIT_TEXT.scheduleConfirm.cancel }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)

    await user.click(screen.getByRole('button', { name: EDIT_TEXT.save }))
    const again = await screen.findByRole('dialog', { name: EDIT_TEXT.scheduleConfirm.title })
    await user.click(within(again).getByRole('button', { name: EDIT_TEXT.scheduleConfirm.confirm }))
    expect(await screen.findByText('DETALLE DE CONSULTA')).toBeInTheDocument()
    expect(putBody(fetchMock).medications[0].frequencyHours).toBe(6)
  })

  it('another date asks too', async () => {
    const user = userEvent.setup()
    stubApi()
    renderPage()
    const date = await screen.findByLabelText('Fecha')
    await user.clear(date)
    await user.type(date, '2026-10-17')
    await user.click(screen.getByRole('button', { name: EDIT_TEXT.save }))
    expect(await screen.findByRole('dialog', { name: EDIT_TEXT.scheduleConfirm.title })).toBeInTheDocument()
  })

  it('an ended treatment keeps its schedule: frequency, duration and first dose are read-only, the name is not', async () => {
    const ended = detail()
    ended.medications[0] = { ...ended.medications[0], endedAt: '2026-10-20T10:00:00Z' }
    stubApi({ detail: ended })
    renderPage()

    expect(await screen.findByText(EDIT_TEXT.ended)).toBeInTheDocument()
    expect(byId('medications.0.frequencyHours')).toHaveAttribute('readonly')
    expect(byId('medications.0.durationDays')).toHaveAttribute('readonly')
    expect(byId('medications.0.startTime')).toHaveAttribute('readonly')
    expect(byId('medications.0.name')).not.toHaveAttribute('readonly')
    expect(byId('medications.0.frequencyHours')).toHaveAccessibleDescription(EDIT_TEXT.ended)
  })

  it('a medication with a marked dose is not taken out; one without marks can, and a new one goes without id', async () => {
    const user = userEvent.setup()
    const two = detail()
    two.medications = [
      two.medications[0],
      { ...two.medications[0], id: 'm2', name: 'Repetido', doses: [{ id: 'd9', scheduledAt: '2026-10-18T14:00:00Z', taken: false, status: 'taken' }] },
    ]
    const fetchMock = stubApi({ detail: two })
    renderPage()

    expect(await screen.findByText(EDIT_TEXT.cantRemove)).toBeInTheDocument()
    const first = screen.getByTestId('medication-fieldset-0')
    expect(within(first).queryByRole('button', { name: 'Quitar medicamento' })).not.toBeInTheDocument()
    await user.click(within(screen.getByTestId('medication-fieldset-1')).getByRole('button', { name: 'Quitar medicamento' }))
    expect(screen.queryByTestId('medication-fieldset-1')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '+ Otro medicamento' }))
    await user.type(byId('medications.1.name'), 'Jarabe')
    await user.type(byId('medications.1.frequencyHours'), '12')
    await user.type(byId('medications.1.durationDays'), '5')
    await user.type(byId('medications.1.startTime'), '0900')
    await user.click(screen.getByRole('button', { name: EDIT_TEXT.save }))

    expect(await screen.findByText('DETALLE DE CONSULTA')).toBeInTheDocument()
    const meds = putBody(fetchMock).medications
    expect(meds).toHaveLength(2)
    expect(meds[0].id).toBe('m1')
    expect(meds[1]).toMatchObject({ name: 'Jarabe', frequencyHours: 12, durationDays: 5, startTime: '09:00' })
    expect(meds[1]).not.toHaveProperty('id')
  })

  it('the only medication left is not taken out', async () => {
    const one = detail()
    one.medications[0] = { ...one.medications[0], doses: [] }
    stubApi({ detail: one })
    renderPage()
    await screen.findByLabelText('Doctor')
    expect(screen.queryByRole('button', { name: 'Quitar medicamento' })).not.toBeInTheDocument()
  })

  it('the free plan with another treatment running: the plan notice, keeping what was typed', async () => {
    const user = userEvent.setup()
    stubApi({ put: { status: 422, body: { error: 'freemium_consultation_limit_exceeded', reason: 'active_treatment', message: 'x' } } })
    renderPage()
    const doctor = await screen.findByLabelText('Doctor')
    await user.clear(doctor)
    await user.type(doctor, 'Otro')
    await user.click(screen.getByRole('button', { name: EDIT_TEXT.save }))

    expect(await screen.findByRole('dialog')).toHaveTextContent(/plan completo/i)
    expect(screen.getByLabelText('Doctor')).toHaveValue('Otro')
  })

  it('the photo limit: says so and the next save sends no photo', async () => {
    const user = userEvent.setup()
    stubApi({ put: { status: 422, body: { error: 'photo_limit_exceeded', message: 'x' } } })
    renderPage()
    await screen.findByLabelText('Doctor')
    await user.click(screen.getByRole('button', { name: EDIT_TEXT.save }))
    expect(await screen.findByText(/100 recetas con foto/)).toBeInTheDocument()
  })

  it('a Caregiver, or a consultation that is not there, goes back to the consultation', async () => {
    stubApi({ role: 'caregiver' })
    renderPage()
    expect(await screen.findByText('DETALLE DE CONSULTA')).toBeInTheDocument()
  })

  it('a consultation that cannot be read goes back too', async () => {
    stubApi({ detailFails: true })
    renderPage()
    expect(await screen.findByText('DETALLE DE CONSULTA')).toBeInTheDocument()
  })
})
