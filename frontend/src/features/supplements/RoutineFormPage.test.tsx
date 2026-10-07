import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RoutineFormPage } from './RoutineFormPage'
import { TODAY, account, at, callsOf, routine, stubApi, stubWeb } from './supplements.test-utils'

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/children/:childId/suplementos/nueva" element={<RoutineFormPage />} />
          <Route path="/suplementos/:routineId/editar" element={<RoutineFormPage />} />
          <Route path="/suplementos/:routineId" element={<div>DETALLE</div>} />
          <Route path="/children/:childId" element={<div>HIJO</div>} />
          <Route path="/planes" element={<div>PLANES</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const created = routine({ id: 'new1' })
const NEW = '/children/child-1/suplementos/nueva'
const body = (mock: ReturnType<typeof vi.fn>, method = 'POST') => JSON.parse(mock.mock.calls.find(([, init]) => init?.method === method)![1].body)

function api(extra: Parameters<typeof stubApi>[0] = {}, acc: unknown = account()) {
  return stubApi({
    'GET /accounts/me': { body: acc },
    'POST /children/child-1/routines': { status: 201, body: created },
    ...extra,
  })
}

describe('RoutineFormPage — new routine', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(TODAY)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

  it('starts as a daily routine at 08:00 from today, with no example in the fields and the fixed sentence', async () => {
    api()
    renderAt(NEW)
    expect(await screen.findByRole('heading', { name: 'Nueva rutina' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('placeholder', 'Como lo llaman en casa')
    expect(screen.getByLabelText('Hora')).toHaveValue('08:00')
    expect(screen.getByLabelText('Fecha de la primera toma')).toHaveValue('2026-10-06')
    expect(screen.getByRole('radio', { name: /Todos los días/ })).toBeChecked()
    expect(screen.getByText('PediTrack guarda lo que escribas tal cual: no revisa el nombre, la cantidad ni el horario.')).toBeInTheDocument()
    expect(screen.getByText('Se repite hasta que la pauses o la finalices.')).toBeInTheDocument()
    expect(await screen.findByText('Suplemento · Mateo Morales')).toBeInTheDocument()
  })

  it('saves a daily routine exactly as written and goes to its detail', async () => {
    const mock = api()
    renderAt(NEW)
    const user = setup()
    await user.type(await screen.findByLabelText('Nombre'), '  Vitamina D ')
    await user.type(screen.getByLabelText(/Nota/), 'Con la cena')
    await user.click(screen.getByRole('button', { name: 'Guardar rutina' }))

    expect(await screen.findByText('DETALLE')).toBeInTheDocument()
    expect(body(mock)).toMatchObject({
      name: 'Vitamina D',
      note: 'Con la cena',
      period: 'daily',
      times: ['08:00'],
      weekdays: [],
      intervalHours: null,
      firstDate: '2026-10-06',
      firstTime: null,
      endDate: null,
    })
  })

  it('shows the errors next to the fields and sends nothing', async () => {
    const mock = api()
    renderAt(NEW)
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Guardar rutina' }))
    expect(screen.getByText('Escribe el nombre de la rutina.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Nombre')).toHaveFocus()
    expect(callsOf(mock)).not.toContain('POST /children/child-1/routines')
  })

  it('chooses weekdays on a segmented bar and asks for at least one', async () => {
    const mock = api()
    renderAt(NEW)
    const user = setup()
    await user.type(await screen.findByLabelText('Nombre'), 'Hierro')
    await user.click(screen.getByRole('radio', { name: /Ciertos días de la semana/ }))
    await user.click(screen.getByRole('button', { name: 'Guardar rutina' }))
    expect(screen.getByText('Elige al menos un día.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'viernes' }))
    await user.click(screen.getByRole('button', { name: 'lunes' }))
    await user.click(screen.getByRole('button', { name: 'viernes' })) // off again
    expect(screen.getByRole('button', { name: 'lunes' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'miércoles' }))
    await user.click(screen.getByRole('button', { name: 'Guardar rutina' }))
    await screen.findByText('DETALLE')
    expect(body(mock)).toMatchObject({ period: 'weekdays', weekdays: [0, 2] })
  })

  it('previews the hours of "cada N horas" from what was typed', async () => {
    const mock = api()
    renderAt(NEW)
    const user = setup()
    await user.type(await screen.findByLabelText('Nombre'), 'Probiótico')
    await user.click(screen.getByRole('radio', { name: /Cada cierto número de horas/ }))
    expect(screen.getByText('Con esto, cada día las tomas quedan a las 00:00, 08:00 y 16:00.')).toBeInTheDocument()
    const every = screen.getByLabelText('Cada cuántas horas')
    await user.clear(every)
    await user.type(every, '5')
    expect(screen.getByText(/las tomas siguen cada 5 horas desde la primera/)).toBeInTheDocument()
    await user.clear(every)
    await user.type(every, '30')
    await user.click(screen.getByRole('button', { name: 'Guardar rutina' }))
    expect(screen.getByText('Escribe un número de 1 a 24.', { selector: 'span' })).toBeInTheDocument()

    await user.clear(every)
    await user.type(every, '8')
    await user.click(screen.getByRole('button', { name: 'Guardar rutina' }))
    await screen.findByText('DETALLE')
    expect(body(mock)).toMatchObject({ period: 'interval', intervalHours: 8, firstTime: '08:00', times: [] })
  })

  it('adds and removes times, and says when one repeats', async () => {
    api()
    renderAt(NEW)
    const user = setup()
    await user.type(await screen.findByLabelText('Nombre'), 'Zinc')
    await user.click(screen.getByRole('button', { name: '+ Agregar otra hora' }))
    expect(screen.getByLabelText('Hora 1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Guardar rutina' }))
    expect(screen.getByText('Escribe la hora.')).toBeInTheDocument()

    fireTime(screen.getByLabelText('Hora 2'), '08:00')
    await user.click(screen.getByRole('button', { name: 'Guardar rutina' }))
    expect(screen.getByText('Esta hora ya está en la lista.')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: /Quitar la hora/ })[1])
    expect(screen.queryByLabelText('Hora 2')).not.toBeInTheDocument()
    for (let i = 0; i < 6; i++) {
      const add = screen.queryByRole('button', { name: '+ Agregar otra hora' })
      if (add) await user.click(add)
    }
    expect(screen.queryByRole('button', { name: '+ Agregar otra hora' })).not.toBeInTheDocument()
  })

  it('takes an end date and checks it against the first day', async () => {
    const mock = api()
    renderAt(NEW)
    const user = setup()
    await user.type(await screen.findByLabelText('Nombre'), 'Zinc')
    await user.click(screen.getByRole('radio', { name: 'Hasta una fecha' }))
    await user.click(screen.getByRole('button', { name: 'Guardar rutina' }))
    expect(screen.getByText('Elige la fecha de la última toma.')).toBeInTheDocument()
    fireDate(screen.getByLabelText('Última toma el'), '2026-10-01')
    await user.click(screen.getByRole('button', { name: 'Guardar rutina' }))
    expect(screen.getByText('La fecha de fin va después de la primera toma (6 oct 2026).')).toBeInTheDocument()
    fireDate(screen.getByLabelText('Última toma el'), '2026-10-20')
    await user.click(screen.getByRole('button', { name: 'Guardar rutina' }))
    await screen.findByText('DETALLE')
    expect(body(mock).endDate).toBe('2026-10-20')
  })

  it('maps the server field errors under their fields', async () => {
    api({ 'POST /children/child-1/routines': { status: 400, body: { error: 'validation_error', message: 'x', details: [{ field: 'name', message: 'bad' }, { field: 'intervalHours', message: 'bad' }] } } })
    renderAt(NEW)
    const user = setup()
    await user.type(await screen.findByLabelText('Nombre'), 'Zinc')
    await user.click(screen.getByRole('button', { name: 'Guardar rutina' }))
    expect(await screen.findByText('Escribe el nombre de la rutina.')).toBeInTheDocument()
  })

  it('says it could not save when the server complains of something the form has no field for', async () => {
    api({ 'POST /children/child-1/routines': { status: 400, body: { error: 'validation_error', message: 'x', details: [{ field: 'utcOffsetMinutes', message: 'bad' }] } } })
    renderAt(NEW)
    const user = setup()
    await user.type(await screen.findByLabelText('Nombre'), 'Zinc')
    await user.click(screen.getByRole('button', { name: 'Guardar rutina' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar la rutina. Revisa los datos e inténtalo de nuevo.')
  })

  it('opens the plan notice when the server says the plan is not paid, keeping what was typed', async () => {
    api({ 'POST /children/child-1/routines': { status: 422, body: { error: 'freemium_consultation_limit_exceeded', reason: 'supplements', message: 'x' } } })
    renderAt(NEW)
    const user = setup()
    await user.type(await screen.findByLabelText('Nombre'), 'Zinc')
    await user.click(screen.getByRole('button', { name: 'Guardar rutina' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Suplementos con recordatorio')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Entendido' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('Zinc')
    await user.click(screen.getByRole('button', { name: 'Guardar rutina' }))
    await user.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Ver planes' }))
    expect(await screen.findByText('PLANES')).toBeInTheDocument()
  })

  it('tells the cap and a generic failure in words', async () => {
    api({ 'POST /children/child-1/routines': { status: 422, body: { error: 'routine_limit_exceeded', limit: 10, message: 'x' } } })
    renderAt(NEW)
    const user = setup()
    await user.type(await screen.findByLabelText('Nombre'), 'Zinc')
    await user.click(screen.getByRole('button', { name: 'Guardar rutina' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('máximo de rutinas activas')
  })

  it('says a generic failure and a finished routine', async () => {
    api({ 'POST /children/child-1/routines': { status: 500, body: {} } })
    renderAt(NEW)
    const user = setup()
    await user.type(await screen.findByLabelText('Nombre'), 'Zinc')
    await user.click(screen.getByRole('button', { name: 'Guardar rutina' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar la rutina. Inténtalo de nuevo.')
  })

  it('leaves without asking when nothing was typed', async () => {
    api()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    renderAt(NEW)
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(await screen.findByText('HIJO')).toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('keeps the form when leaving is not confirmed and leaves when it is', async () => {
    api()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    renderAt(NEW)
    const user = setup()
    await user.type(await screen.findByLabelText('Nombre'), 'Zinc')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByLabelText('Nombre')).toHaveValue('Zinc')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(await screen.findByText('HIJO')).toBeInTheDocument()
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('tells who is not a Tutor that only a Tutor creates', async () => {
    api({}, account({ plan: 'free' }, { role: 'caregiver', plan: 'paid', readOnly: false, accountId: 'owner' }))
    renderAt(NEW)
    expect(await screen.findByText('Solo un Tutor puede crear o editar rutinas.')).toBeInTheDocument()
  })

  it('has the web design too: a text header and a 640 px column', async () => {
    stubWeb(true)
    api()
    renderAt(NEW)
    expect(await screen.findByRole('heading', { name: 'Nueva rutina', level: 1 })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: '← Mateo' })).toHaveAttribute('href', '/children/child-1')
  })
})

describe('RoutineFormPage — edit', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(TODAY)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const existing = routine({ id: 'r1', name: 'Vitamina D', note: 'con la cena', times: ['08:00', '20:00'] })

  it('fills the form with the routine, says the changes count from the next dose and saves them', async () => {
    const mock = api({
      'GET /routines/r1': { body: existing },
      'PATCH /routines/r1': { body: existing },
    })
    renderAt('/suplementos/r1/editar')
    expect(await screen.findByRole('heading', { name: 'Editar rutina' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Nombre')).toHaveValue('Vitamina D')
    expect(screen.getByText('Los cambios cuentan desde la siguiente toma. Las tomas ya marcadas no cambian.')).toBeInTheDocument()
    expect(screen.getByLabelText('Hora 2')).toHaveValue('20:00')
    expect(screen.getByLabelText('Fecha de la primera toma')).toHaveValue('2026-10-01')

    const user = setup()
    const name = screen.getByLabelText('Nombre')
    await user.clear(name)
    await user.type(name, 'Vitamina D3')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText('DETALLE')).toBeInTheDocument()
    expect(body(mock, 'PATCH')).toMatchObject({ name: 'Vitamina D3', times: ['08:00', '20:00'], firstDate: '2026-10-01' })
  })

  it('does not edit a finished routine', async () => {
    api({ 'GET /routines/r1': { body: routine({ status: 'ended', endedAt: at(9) }) } })
    renderAt('/suplementos/r1/editar')
    expect(await screen.findByText(/Esta rutina ya terminó y no se puede editar/)).toBeInTheDocument()
  })

  it('says the routine was not found', async () => {
    api({ 'GET /routines/r1': { status: 404, body: { error: 'routine_not_found' } } })
    renderAt('/suplementos/r1/editar')
    expect(await screen.findByText('No se encontró esta rutina.')).toBeInTheDocument()
  })

  it('says it is loading', async () => {
    api({ 'GET /routines/r1': { body: existing } })
    renderAt('/suplementos/r1/editar')
    expect(screen.getByText('Cargando…')).toBeInTheDocument()
    await screen.findByLabelText('Nombre')
  })

  it('shows the routine of a weekdays period and an end date as they are', async () => {
    api({
      'GET /routines/r1': {
        body: routine({ period: 'weekdays', weekdays: [0, 2], times: ['09:00'], endDate: '2026-11-30', note: '' }),
      },
    })
    renderAt('/suplementos/r1/editar')
    await waitFor(() => expect(screen.getByRole('button', { name: 'lunes' })).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.getByLabelText('Última toma el')).toHaveValue('2026-11-30')
    expect(screen.getByRole('radio', { name: 'Hasta una fecha' })).toHaveAttribute('aria-checked', 'true')
  })
})

function fireTime(input: HTMLElement, value: string) {
  fireValue(input, value)
}
function fireDate(input: HTMLElement, value: string) {
  fireValue(input, value)
}
function fireValue(input: HTMLElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
