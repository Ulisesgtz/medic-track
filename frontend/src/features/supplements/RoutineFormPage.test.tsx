import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RoutineFormPage } from './RoutineFormPage'
import { TODAY, account, activity, at, callsOf, routine, stubApi, stubWeb } from './supplements.test-utils'
import { pickTime } from '../../shared/ui/timeField.test-utils'

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/children/:childId/suplementos/nueva" element={<RoutineFormPage kind="supplement" />} />
          <Route path="/children/:childId/actividades/nueva" element={<RoutineFormPage kind="activity" />} />
          <Route path="/mis-actividades/nueva" element={<RoutineFormPage kind="activity" personal />} />
          <Route path="/suplementos/:routineId/editar" element={<RoutineFormPage />} />
          <Route path="/actividades/:routineId/editar" element={<RoutineFormPage />} />
          <Route path="/suplementos/:routineId" element={<div>DETALLE SUPLEMENTO</div>} />
          <Route path="/actividades/:routineId" element={<div>DETALLE ACTIVIDAD</div>} />
          <Route path="/children/:childId" element={<div>HIJO</div>} />
          <Route path="/mis-actividades" element={<div>MIS ACTIVIDADES</div>} />
          <Route path="/planes" element={<div>PLANES</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const created = routine({ id: 'new1' })
const NEW = '/children/child-1/suplementos/nueva'
const NEW_ACTIVITY = '/children/child-1/actividades/nueva'
const body = (mock: ReturnType<typeof vi.fn>, method = 'POST') => JSON.parse(mock.mock.calls.find(([, init]) => init?.method === method)![1].body)

function api(extra: Parameters<typeof stubApi>[0] = {}, acc: unknown = account()) {
  return stubApi({
    'GET /accounts/me': { body: acc },
    'POST /children/child-1/routines': { status: 201, body: created },
    'POST /accounts/a1/routines': { status: 201, body: created },
    ...extra,
  })
}

describe('RoutineFormPage — nuevo suplemento', () => {
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

  it('starts daily from today with the hour EMPTY, no example in the fields and the fixed sentence', async () => {
    api()
    renderAt(NEW)
    expect(await screen.findByRole('heading', { name: 'Agregar suplemento' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).not.toHaveAttribute('placeholder')
    expect(screen.getByLabelText('Hora')).toHaveTextContent('Elegir hora')
    expect(screen.getByText('De una a seis horas.')).toBeInTheDocument()
    expect(screen.getByLabelText('Primera toma')).toHaveValue('2026-10-06')
    expect(screen.getByRole('radio', { name: /Todos los días/ })).toBeChecked()
    expect(screen.queryByRole('radio', { name: /Cada cierto número de horas/ })).not.toBeInTheDocument()
    expect(screen.getByText('PediTrack guarda lo que escribas tal cual: no revisa el nombre, la cantidad ni el horario.')).toBeInTheDocument()
    expect(screen.getByText('Se repite hasta que la pauses o la finalices.')).toBeInTheDocument()
    expect(await screen.findByText('Suplemento · Mateo Morales')).toBeInTheDocument()
    expect(screen.queryByText(/rutina/i)).not.toBeInTheDocument()
  })

  it('saves a daily supplement exactly as written and goes to its detail', async () => {
    const mock = api()
    renderAt(NEW)
    const user = setup()
    await user.type(await screen.findByLabelText('Nombre'), '  Vitamina D ')
    await pickTime(user, 'Hora', '08:00')
    await user.type(screen.getByLabelText(/Nota/), 'Con la cena')
    await user.click(screen.getByRole('button', { name: 'Guardar suplemento' }))

    expect(await screen.findByText('DETALLE SUPLEMENTO')).toBeInTheDocument()
    expect(body(mock)).toMatchObject({
      kind: 'supplement',
      name: 'Vitamina D',
      note: 'Con la cena',
      period: 'daily',
      times: ['08:00'],
      weekdays: [],
      windowStart: null,
      windowEnd: null,
      intervalMinutes: null,
      firstDate: '2026-10-06',
      endDate: null,
    })
  })

  it('shows the errors next to the fields and sends nothing', async () => {
    const mock = api()
    renderAt(NEW)
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Guardar suplemento' }))
    expect(screen.getByText('Escribe el nombre del suplemento.')).toBeInTheDocument()
    expect(screen.getByText('Elige la hora.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Nombre')).toHaveFocus()
    expect(callsOf(mock)).not.toContain('POST /children/child-1/routines')
  })

  it('chooses weekdays on a segmented bar and asks for at least one', async () => {
    const mock = api()
    renderAt(NEW)
    const user = setup()
    await user.type(await screen.findByLabelText('Nombre'), 'Hierro')
    await pickTime(user, 'Hora', '09:00')
    await user.click(screen.getByRole('radio', { name: /Ciertos días de la semana/ }))
    await user.click(screen.getByRole('button', { name: 'Guardar suplemento' }))
    expect(screen.getByText('Elige al menos un día.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'viernes' }))
    await user.click(screen.getByRole('button', { name: 'lunes' }))
    await user.click(screen.getByRole('button', { name: 'viernes' })) // off again
    expect(screen.getByRole('button', { name: 'lunes' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'miércoles' }))
    await user.click(screen.getByRole('button', { name: 'Guardar suplemento' }))
    await screen.findByText('DETALLE SUPLEMENTO')
    expect(body(mock)).toMatchObject({ period: 'weekdays', weekdays: [0, 2] })
  })

  it('adds and removes hours, says when one repeats and stops at six', async () => {
    api()
    renderAt(NEW)
    const user = setup()
    await user.type(await screen.findByLabelText('Nombre'), 'Zinc')
    await pickTime(user, 'Hora', '08:00')
    await user.click(screen.getByRole('button', { name: '+ Agregar otra hora' }))
    expect(screen.getByLabelText('Hora 1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Guardar suplemento' }))
    expect(screen.getByText('Elige la hora.')).toBeInTheDocument()

    await pickTime(user, 'Hora 2', '08:00')
    await user.click(screen.getByRole('button', { name: 'Guardar suplemento' }))
    expect(screen.getByText('Esta hora ya está en la lista.')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: /Quitar la hora/ })[1])
    expect(screen.queryByLabelText('Hora 2')).not.toBeInTheDocument()
    for (let i = 0; i < 6; i++) {
      const add = screen.queryByRole('button', { name: '+ Agregar otra hora' })
      if (add) await user.click(add)
    }
    expect(screen.queryByRole('button', { name: '+ Agregar otra hora' })).not.toBeInTheDocument()
    expect(screen.getByText('Ya son seis horas, el máximo.')).toBeInTheDocument()
  })

  it('takes an end date and checks it against the first day', async () => {
    const mock = api()
    renderAt(NEW)
    const user = setup()
    await user.type(await screen.findByLabelText('Nombre'), 'Zinc')
    await pickTime(user, 'Hora', '08:00')
    await user.click(screen.getByRole('radio', { name: 'Hasta una fecha' }))
    await user.click(screen.getByRole('button', { name: 'Guardar suplemento' }))
    expect(screen.getByText('Elige la fecha de la última toma.')).toBeInTheDocument()
    fireValue(screen.getByLabelText('Última toma el'), '2026-10-01')
    await user.click(screen.getByRole('button', { name: 'Guardar suplemento' }))
    expect(screen.getByText('La fecha de fin va después de la primera toma (6 oct 2026).')).toBeInTheDocument()
    fireValue(screen.getByLabelText('Última toma el'), '2026-10-20')
    await user.click(screen.getByRole('button', { name: 'Guardar suplemento' }))
    await screen.findByText('DETALLE SUPLEMENTO')
    expect(body(mock).endDate).toBe('2026-10-20')
  })

  it('maps the server field errors under their fields', async () => {
    api({ 'POST /children/child-1/routines': { status: 400, body: { error: 'validation_error', message: 'x', details: [{ field: 'name', message: 'bad' }, { field: 'times', message: 'bad' }] } } })
    renderAt(NEW)
    const user = setup()
    await user.type(await screen.findByLabelText('Nombre'), 'Zinc')
    await pickTime(user, 'Hora', '08:00')
    await user.click(screen.getByRole('button', { name: 'Guardar suplemento' }))
    expect(await screen.findByText('Escribe el nombre del suplemento.')).toBeInTheDocument()
    expect(screen.getByText('Revisa las horas: de 1 a 6, sin repetir.')).toBeInTheDocument()
  })

  it('says it could not save when the server complains of something the form has no field for', async () => {
    api({ 'POST /children/child-1/routines': { status: 400, body: { error: 'validation_error', message: 'x', details: [{ field: 'utcOffsetMinutes', message: 'bad' }] } } })
    renderAt(NEW)
    const user = setup()
    await user.type(await screen.findByLabelText('Nombre'), 'Zinc')
    await pickTime(user, 'Hora', '08:00')
    await user.click(screen.getByRole('button', { name: 'Guardar suplemento' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar el suplemento. Revisa los datos e inténtalo de nuevo.')
  })

  it('opens the plan notice when the server says the plan is not paid, keeping what was typed', async () => {
    api({ 'POST /children/child-1/routines': { status: 422, body: { error: 'freemium_consultation_limit_exceeded', reason: 'supplements', message: 'x' } } })
    renderAt(NEW)
    const user = setup()
    await user.type(await screen.findByLabelText('Nombre'), 'Zinc')
    await pickTime(user, 'Hora', '08:00')
    await user.click(screen.getByRole('button', { name: 'Guardar suplemento' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Suplementos y actividades' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Ahora no' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('Zinc')
    await user.click(screen.getByRole('button', { name: 'Guardar suplemento' }))
    await user.click(await within(await screen.findByRole('dialog')).findByRole('link', { name: 'Ver el plan completo' }))
    expect(await screen.findByText('PLANES')).toBeInTheDocument()
  })

  it('tells the cap and a generic failure in words', async () => {
    api({ 'POST /children/child-1/routines': { status: 422, body: { error: 'routine_limit_exceeded', limit: 10, message: 'x' } } })
    renderAt(NEW)
    const user = setup()
    await user.type(await screen.findByLabelText('Nombre'), 'Zinc')
    await pickTime(user, 'Hora', '08:00')
    await user.click(screen.getByRole('button', { name: 'Guardar suplemento' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Este hijo ya tiene el máximo de suplementos activos. Pausa o finaliza uno para poder agregar otro.')
  })

  it('says a generic failure', async () => {
    api({ 'POST /children/child-1/routines': { status: 500, body: {} } })
    renderAt(NEW)
    const user = setup()
    await user.type(await screen.findByLabelText('Nombre'), 'Zinc')
    await pickTime(user, 'Hora', '08:00')
    await user.click(screen.getByRole('button', { name: 'Guardar suplemento' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar el suplemento. Inténtalo de nuevo.')
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
    expect(confirm).toHaveBeenLastCalledWith('¿Descartar el suplemento? Se perderá lo que capturaste.')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(await screen.findByText('HIJO')).toBeInTheDocument()
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('tells who is not a Tutor that only a Tutor adds', async () => {
    api({}, account({ plan: 'free' }, { role: 'caregiver', plan: 'paid', readOnly: false, accountId: 'owner' }))
    renderAt(NEW)
    expect(await screen.findByText('Solo un Tutor puede agregar o editar suplementos.')).toBeInTheDocument()
  })

  it('has the web design too: a text header and a 640 px column', async () => {
    stubWeb(true)
    api()
    renderAt(NEW)
    expect(await screen.findByRole('heading', { name: 'Agregar suplemento', level: 1 })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: '← Mateo' })).toHaveAttribute('href', '/children/child-1')
  })
})

describe('RoutineFormPage — nueva actividad', () => {
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
  const fill = async (user: ReturnType<typeof setup>, every = '1') => {
    await user.type(await screen.findByLabelText('Nombre'), 'Tomar agua')
    await pickTime(user, 'Desde las', '08:00')
    await pickTime(user, 'Hasta las', '20:00')
    await user.type(screen.getByLabelText('Cantidad'), every)
  }

  it('asks «Desde las / Hasta las» and «Cada [n] minutos u horas», all empty, with the fixed sentence', async () => {
    api()
    renderAt(NEW_ACTIVITY)
    expect(await screen.findByRole('heading', { name: 'Agregar actividad' })).toBeInTheDocument()
    expect(screen.getByLabelText('Desde las')).toHaveTextContent('Elegir hora')
    expect(screen.getByLabelText('Hasta las')).toHaveTextContent('Elegir hora')
    expect(screen.getByLabelText('Cantidad')).toHaveValue(null)
    expect(screen.getByRole('radio', { name: 'horas' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Todos los días' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByLabelText('Fecha de inicio')).toHaveValue('2026-10-06')
    expect(screen.getByText('PediTrack guarda lo que escribas tal cual: no revisa el nombre, el horario ni cada cuánto.')).toBeInTheDocument()
    expect(screen.getByText('La ve toda la familia.')).toBeInTheDocument()
    expect(await screen.findByText('Actividad · Mateo Morales')).toBeInTheDocument()
    expect(screen.queryByText('+ Agregar otra hora')).not.toBeInTheDocument()
  })

  it('counts the reminders of the day without listing them', async () => {
    api()
    renderAt(NEW_ACTIVITY)
    const user = setup()
    await fill(user, '1')
    expect(screen.getByText('Con esto, cada día hay 13 avisos: el primero a las 08:00 y el último a las 20:00.')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'minutos' }))
    await user.clear(screen.getByLabelText('Cantidad'))
    await user.type(screen.getByLabelText('Cantidad'), '30')
    expect(screen.getByText(/hay 25 avisos/)).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Ciertos días' }))
    await user.click(screen.getByRole('button', { name: 'martes' }))
    await user.click(screen.getByRole('button', { name: 'jueves' }))
    expect(screen.getByText(/cada martes y jueves hay 25 avisos/)).toBeInTheDocument()
  })

  it('«A una hora fija» asks for the hours like a supplement and saves them with its days', async () => {
    const mock = api()
    renderAt(NEW_ACTIVITY)
    const user = setup()
    await user.type(await screen.findByLabelText('Nombre'), 'Práctica de fut')
    await user.click(screen.getByRole('radio', { name: 'A una hora fija' }))
    expect(screen.queryByLabelText('Desde las')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Cantidad')).not.toBeInTheDocument()
    expect(screen.getByText('De una a seis horas.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Guardar actividad' }))
    expect(screen.getByText('Elige la hora.')).toBeInTheDocument()

    await pickTime(user, 'Hora', '17:00')
    await user.click(screen.getByRole('radio', { name: 'Ciertos días' }))
    await user.click(screen.getByRole('button', { name: 'martes' }))
    await user.click(screen.getByRole('button', { name: 'jueves' }))
    await user.click(screen.getByRole('button', { name: 'Guardar actividad' }))
    expect(await screen.findByText('DETALLE ACTIVIDAD')).toBeInTheDocument()
    expect(body(mock)).toMatchObject({ kind: 'activity', period: 'weekdays', times: ['17:00'], weekdays: [1, 3], windowStart: null, windowEnd: null, intervalMinutes: null })
  })

  it('saves it as a window in minutes and goes to the detail of an activity', async () => {
    const mock = api()
    renderAt(NEW_ACTIVITY)
    const user = setup()
    await fill(user, '2')
    await user.click(screen.getByRole('button', { name: 'Guardar actividad' }))
    expect(await screen.findByText('DETALLE ACTIVIDAD')).toBeInTheDocument()
    expect(body(mock)).toMatchObject({
      kind: 'activity',
      name: 'Tomar agua',
      period: 'window',
      times: [],
      weekdays: [],
      windowStart: '08:00',
      windowEnd: '20:00',
      intervalMinutes: 120,
      firstDate: '2026-10-06',
      endDate: null,
    })
  })

  it('sends the chosen days and an end date', async () => {
    const mock = api()
    renderAt(NEW_ACTIVITY)
    const user = setup()
    await fill(user)
    await user.click(screen.getByRole('radio', { name: 'Ciertos días' }))
    await user.click(screen.getByRole('button', { name: 'viernes' }))
    await user.click(screen.getByRole('button', { name: 'lunes' }))
    await user.click(screen.getByRole('radio', { name: 'Hasta una fecha' }))
    fireValue(screen.getByLabelText('Último día'), '2026-10-30')
    await user.click(screen.getByRole('button', { name: 'Guardar actividad' }))
    await screen.findByText('DETALLE ACTIVIDAD')
    expect(body(mock)).toMatchObject({ weekdays: [0, 4], endDate: '2026-10-30' })
  })

  it('shows the errors next to the fields and sends nothing', async () => {
    const mock = api()
    renderAt(NEW_ACTIVITY)
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Guardar actividad' }))
    expect(screen.getByText('Escribe el nombre de la actividad.')).toBeInTheDocument()
    expect(screen.getByText('Elige la hora en que empieza.')).toBeInTheDocument()
    expect(screen.getByText('Elige la hora en que termina.')).toBeInTheDocument()
    expect(screen.getByText('Elige cuánto tiempo pasa entre avisos.')).toBeInTheDocument()
    expect(callsOf(mock)).not.toContain('POST /children/child-1/routines')

    await user.type(screen.getByLabelText('Nombre'), 'Tomar agua')
    await pickTime(user, 'Desde las', '10:00')
    await pickTime(user, 'Hasta las', '09:00')
    await user.type(screen.getByLabelText('Cantidad'), '1')
    await user.click(screen.getByRole('radio', { name: 'Ciertos días' }))
    await user.click(screen.getByRole('button', { name: 'Guardar actividad' }))
    expect(screen.getByText('La hora de fin va después de la de inicio.')).toBeInTheDocument()
    expect(screen.getByText('Elige al menos un día.')).toBeInTheDocument()
  })

  it('maps the server errors under their fields, in the words of an activity', async () => {
    api({
      'POST /children/child-1/routines': {
        status: 400,
        body: { error: 'validation_error', message: 'x', details: [{ field: 'intervalMinutes', message: 'bad' }, { field: 'windowEnd', message: 'bad' }, { field: 'endDate', message: 'bad' }] },
      },
    })
    renderAt(NEW_ACTIVITY)
    const user = setup()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Guardar actividad' }))
    expect(await screen.findByText('Elige cuánto tiempo pasa entre avisos.')).toBeInTheDocument()
    expect(screen.getByText('La hora de fin va después de la de inicio.')).toBeInTheDocument()
  })

  it('tells the cap of activities and the plan', async () => {
    api({ 'POST /children/child-1/routines': { status: 422, body: { error: 'routine_limit_exceeded', limit: 10, message: 'x' } } })
    renderAt(NEW_ACTIVITY)
    const user = setup()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Guardar actividad' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Este hijo ya tiene el máximo de actividades activas. Pausa o finaliza una para poder agregar otra.')
  })

  it('opens the plan notice on 422 reason supplements', async () => {
    api({ 'POST /children/child-1/routines': { status: 422, body: { error: 'freemium_consultation_limit_exceeded', reason: 'supplements', message: 'x' } } })
    renderAt(NEW_ACTIVITY)
    const user = setup()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Guardar actividad' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('creates the person’s own through their account, with its own words', async () => {
    const mock = api()
    renderAt('/mis-actividades/nueva')
    expect(await screen.findByText('Es una actividad personal: solo tú la ves y solo a ti te llegan sus avisos.')).toBeInTheDocument()
    expect(screen.getByText('Solo la ves tú.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Mis actividades' })).toHaveAttribute('href', '/mis-actividades')
    const user = setup()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Guardar actividad' }))
    expect(await screen.findByText('DETALLE ACTIVIDAD')).toBeInTheDocument()
    expect(callsOf(mock)).toContain('POST /accounts/a1/routines')
  })

  it('asks before discarding an activity with the right words', async () => {
    api()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderAt(NEW_ACTIVITY)
    const user = setup()
    await user.type(await screen.findByLabelText('Nombre'), 'Agua')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(confirm).toHaveBeenCalledWith('¿Descartar la actividad? Se perderá lo que capturaste.')
  })

  it('says only a Tutor adds activities', async () => {
    api({}, account({ plan: 'free' }, { role: 'caregiver', plan: 'paid', readOnly: false, accountId: 'owner' }))
    renderAt(NEW_ACTIVITY)
    expect(await screen.findByText('Solo un Tutor puede agregar o editar actividades.')).toBeInTheDocument()
  })
})

describe('RoutineFormPage — editar', () => {
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

  it('fills the form with the supplement, says the changes count from the next dose and saves them', async () => {
    const mock = api({
      'GET /routines/r1': { body: existing },
      'PATCH /routines/r1': { body: existing },
    })
    renderAt('/suplementos/r1/editar')
    expect(await screen.findByRole('heading', { name: 'Editar suplemento' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Nombre')).toHaveValue('Vitamina D')
    expect(screen.getByText('Los cambios cuentan desde la siguiente toma. Las tomas ya marcadas no cambian.')).toBeInTheDocument()
    expect(screen.getByLabelText('Hora 2')).toHaveTextContent('20:00')
    expect(screen.getByLabelText('Primera toma')).toHaveValue('2026-10-01')

    const user = setup()
    const name = screen.getByLabelText('Nombre')
    await user.clear(name)
    await user.type(name, 'Vitamina D3')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText('DETALLE SUPLEMENTO')).toBeInTheDocument()
    expect(body(mock, 'PATCH')).toMatchObject({ kind: 'supplement', name: 'Vitamina D3', times: ['08:00', '20:00'], firstDate: '2026-10-01' })
  })

  it('fills the form with the activity, in hours, and saves it as an activity', async () => {
    const act = activity({ id: 'a1', intervalMinutes: 120, weekdays: [1, 3] })
    const mock = api({ 'GET /routines/a1': { body: act }, 'PATCH /routines/a1': { body: act } })
    renderAt('/actividades/a1/editar')
    expect(await screen.findByRole('heading', { name: 'Editar actividad' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Nombre')).toHaveValue('Tomar agua')
    expect(screen.getByText('Los cambios cuentan desde el siguiente aviso. Lo ya marcado no cambia.')).toBeInTheDocument()
    expect(screen.getByLabelText('Desde las')).toHaveTextContent('08:00')
    expect(screen.getByLabelText('Hasta las')).toHaveTextContent('20:00')
    expect(screen.getByLabelText('Cantidad')).toHaveValue(2)
    expect(screen.getByRole('radio', { name: 'horas' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Ciertos días' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: 'martes' })).toHaveAttribute('aria-pressed', 'true')
    await setup().click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText('DETALLE ACTIVIDAD')).toBeInTheDocument()
    expect(body(mock, 'PATCH')).toMatchObject({ kind: 'activity', period: 'window', intervalMinutes: 120, weekdays: [1, 3] })
  })

  it('fills the form with an activity at fixed hours and saves it as one', async () => {
    const fixed = activity({ id: 'a1', period: 'weekdays', times: ['17:00'], weekdays: [1, 3], windowStart: null, windowEnd: null, intervalMinutes: null })
    const mock = api({ 'GET /routines/a1': { body: fixed }, 'PATCH /routines/a1': { body: fixed } })
    renderAt('/actividades/a1/editar')
    expect(await screen.findByRole('radio', { name: 'A una hora fija' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByLabelText('Hora')).toHaveTextContent('17:00')
    expect(screen.getByRole('button', { name: 'martes' })).toHaveAttribute('aria-pressed', 'true')
    await setup().click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText('DETALLE ACTIVIDAD')).toBeInTheDocument()
    expect(body(mock, 'PATCH')).toMatchObject({ kind: 'activity', period: 'weekdays', times: ['17:00'], weekdays: [1, 3] })
  })

  it('does not edit a finished one', async () => {
    api({ 'GET /routines/r1': { body: routine({ status: 'ended', endedAt: at(9) }) } })
    renderAt('/suplementos/r1/editar')
    expect(await screen.findByText(/Este suplemento ya terminó y no se puede editar\. Para volver a registrarlo, agrega un suplemento nuevo\./)).toBeInTheDocument()
    api({ 'GET /routines/a1': { body: activity({ status: 'ended', endedAt: at(9) }) } })
    renderAt('/actividades/a1/editar')
    expect(await screen.findByText(/Esta actividad ya terminó y no se puede editar\. Para volver a registrarla, agrega una actividad nueva\./)).toBeInTheDocument()
  })

  it('says it was not found', async () => {
    api({ 'GET /routines/r1': { status: 404, body: { error: 'routine_not_found' } } })
    renderAt('/suplementos/r1/editar')
    expect(await screen.findByText('No se encontró este suplemento.')).toBeInTheDocument()
  })

  it('says it is loading', async () => {
    api({ 'GET /routines/r1': { body: existing } })
    renderAt('/suplementos/r1/editar')
    expect(screen.getByText('Cargando…')).toBeInTheDocument()
    await screen.findByLabelText('Nombre')
  })

  it('shows a weekdays period and an end date as they are', async () => {
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

  it('takes an activity opened through the supplements’ address to its own', async () => {
    api({ 'GET /routines/a1': { body: activity({ id: 'a1' }) } })
    renderAt('/suplementos/a1/editar')
    expect(await screen.findByRole('heading', { name: 'Editar actividad' })).toBeInTheDocument()
  })
})

function fireValue(input: HTMLElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
