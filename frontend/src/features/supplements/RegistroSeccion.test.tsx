import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RegistroSeccion } from './RegistroSeccion'
import { TODAY, account, activity, at, byKind, callsOf, dose, routine, stubApi } from './supplements.test-utils'
import type { RoutineKind } from './types'

function renderSection(kind: RoutineKind = 'supplement') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/children/child-1']}>
        <Routes>
          <Route path="/children/:childId" element={<RegistroSeccion kind={kind} childId="child-1" childName="Mateo" />} />
          <Route path="/children/:childId/suplementos/nueva" element={<div>NUEVO SUPLEMENTO</div>} />
          <Route path="/children/:childId/actividades/nueva" element={<div>NUEVA ACTIVIDAD</div>} />
          <Route path="/suplementos/:routineId" element={<div>DETALLE SUPLEMENTO</div>} />
          <Route path="/actividades/:routineId" element={<div>DETALLE ACTIVIDAD</div>} />
          <Route path="/planes" element={<div>PLANES</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const ana = account()
const caregiver = account({ plan: 'free' }, { role: 'caregiver', plan: 'paid', readOnly: false, accountId: 'owner' })

function api(supplements: ReturnType<typeof routine>[], activities: ReturnType<typeof routine>[] = [], over: Parameters<typeof byKind>[2] = {}, acc: unknown = ana) {
  return stubApi({
    'GET /accounts/me': { body: acc },
    'GET /children/child-1/routines': byKind(supplements, activities, over),
    'PATCH /routines/r1/doses/d1': { body: { id: 'd1', scheduledAt: at(8), taken: true, status: 'taken' } },
    'PATCH /routines/r1/doses/d2': { body: { id: 'd2', scheduledAt: at(14), taken: true, status: 'taken' } },
    'POST /routines/a1/done': { body: { id: 'x14', scheduledAt: at(14), taken: true, status: 'taken' } },
  })
}

describe('RegistroSeccion · suplementos', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(TODAY)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('lists the active ones first, then the paused and the finished, with the count', async () => {
    api([
      routine({ id: 'r1', name: 'Vitamina D' }),
      routine({ id: 'r2', name: 'Omega 3', status: 'paused', pausedAt: new Date(2026, 9, 2).toISOString(), doses: [] }),
      routine({ id: 'r3', name: 'Zinc', status: 'ended', endedAt: new Date(2026, 8, 30).toISOString(), doses: [], progress: { taken: 12, elapsed: 14, total: 14 } }),
    ])
    renderSection()

    expect(await screen.findByText('1 activo')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Suplementos' })).toBeInTheDocument()
    expect(screen.getByText('Activos')).toBeInTheDocument()
    expect(screen.getByText('Pausados y terminados')).toBeInTheDocument()
    expect(screen.getByText('Pausado desde el 2 oct. Mientras esté pausado no genera tomas ni avisos.')).toBeInTheDocument()
    expect(screen.getByText('Terminado el 30 sep · 12 de 14 tomas')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Agregar suplemento' })).toHaveAttribute('href', '/children/child-1/suplementos/nueva')
    // The dose of today shows who marked it.
    expect(screen.getByRole('button', { name: 'Toma de 08:00' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('por Ana, 08:05')).toBeInTheDocument()
  })

  it('writes «Todos los días · N tomas», the dates and the day count with its bar', async () => {
    api([routine({ times: ['08:00', '14:00', '20:00'], doses: [dose('d1', 8, { taken: true }), dose('d2', 14, { status: 'due' }), dose('d3', 20, { status: 'pending' })] })])
    renderSection()
    expect(await screen.findByText('Todos los días · 3 tomas')).toBeInTheDocument()
    expect(screen.getByText('Desde el 1 oct · sin fecha de fin')).toBeInTheDocument()
    expect(screen.getByText('1 de 3')).toBeInTheDocument()
    expect(screen.getByText('tomas hoy')).toBeInTheDocument()
    const bar = screen.getByRole('progressbar', { name: '1 de 3 tomas hoy' })
    expect(bar).toHaveAttribute('aria-valuenow', '1')
    expect(bar).toHaveAttribute('aria-valuemax', '3')
  })

  it('says when the next dose is for a supplement with nothing today', async () => {
    api([routine({ doses: [], nextDose: dose('d9', 9, { scheduledAt: at(9, 0, 7) }), period: 'weekdays', weekdays: [0, 2, 4], times: ['09:00'] })])
    renderSection()
    expect(await screen.findByText('Hoy no le toca. La siguiente es mañana, mié 7 oct, a las 09:00.')).toBeInTheDocument()
    expect(screen.getByText('Lun, Mié, Vie · 1 toma')).toBeInTheDocument()
  })

  it('marks a dose with the routine endpoint', async () => {
    const mock = api([routine({ doses: [dose('d1', 8), dose('d2', 14, { status: 'pending' })] })])
    renderSection()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.click(await screen.findByRole('button', { name: 'Toma de 08:00' }))
    await waitFor(() => expect(callsOf(mock)).toContain('PATCH /routines/r1/doses/d1'))
  })

  it('asks the server for supplements only and invites a Tutor with none to add the first', async () => {
    const mock = api([])
    renderSection()
    expect(await screen.findByRole('heading', { name: 'Mateo aún no tiene suplementos' })).toBeInTheDocument()
    expect(screen.getByText(/Para lo que Mateo toma a horas fijas/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Agregar suplemento' })).toHaveAttribute('href', '/children/child-1/suplementos/nueva')
    expect(mock.mock.calls.some(([url]) => String(url).includes('kind=supplement'))).toBe(true)
  })

  it('shows the plan notice instead of adding on the free plan, and it goes to the plans', async () => {
    api([], [], { paidPlan: false }, account({ plan: 'free' }))
    renderSection()
    expect(await screen.findByRole('heading', { name: 'Suplementos', level: 3 })).toBeInTheDocument()
    expect(screen.getByText(/Lo que Mateo toma a horas fijas/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Mateo aún no tiene suplementos' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '+ Agregar suplemento' })).not.toBeInTheDocument()
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('link', { name: 'Ver el plan completo →' }))
    expect(await screen.findByText('PLANES')).toBeInTheDocument()
  })

  it('keeps showing and letting mark what was created if the plan lapsed, without offering to add', async () => {
    api([routine()], [], { paidPlan: false }, account({ plan: 'free' }))
    renderSection()
    expect(await screen.findByRole('button', { name: 'Toma de 08:00' })).toBeInTheDocument()
    expect(screen.getByText('Plan completo')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '+ Agregar suplemento' })).not.toBeInTheDocument()
  })

  it('explains the cap of active supplements instead of offering another one', async () => {
    api([routine()], [], { activeCount: 10 })
    renderSection()
    const status = await screen.findByRole('status')
    expect(within(status).getByText('Ya tienes 10 suplementos activos')).toBeInTheDocument()
    expect(within(status).getByText(/Es el máximo para Mateo\. Para agregar otro, pausa o finaliza uno/)).toBeInTheDocument()
    expect(within(status).getByRole('link', { name: 'Ir a los suplementos activos' })).toHaveAttribute('href', '#suplementos-activos')
    expect(screen.queryByRole('link', { name: '+ Agregar suplemento' })).not.toBeInTheDocument()
  })

  it('shows a Caregiver the supplements and says who adds them, without any way to add', async () => {
    api([routine()], [], {}, caregiver)
    renderSection()
    expect(await screen.findByText('Los suplementos los agrega y edita un Tutor. Tú puedes marcar las tomas y elegir tus avisos.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '+ Agregar suplemento' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Toma de 08:00' })).toBeInTheDocument()
  })

  it('does not invite a Caregiver to add when there are none', async () => {
    api([], [], {}, caregiver)
    renderSection()
    expect(await screen.findByRole('heading', { name: 'Mateo aún no tiene suplementos' })).toBeInTheDocument()
    expect(screen.getByText(/Un Tutor puede registrar/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '+ Agregar suplemento' })).not.toBeInTheDocument()
  })

  it('opens the supplement from its name and from «Ver suplemento»', async () => {
    api([routine({ name: 'Omega 3 con vitaminas A, C y E en jarabe sabor naranja' })])
    renderSection()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.click(await screen.findByRole('link', { name: /Ver suplemento Omega 3/ }))
    expect(await screen.findByText('DETALLE SUPLEMENTO')).toBeInTheDocument()
  })

  it('says it could not load, and while loading', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: string) => (String(input).includes('/accounts/me') ? { ok: true, status: 200, json: async () => ana } : { ok: false, status: 500, json: async () => ({}) })))
    renderSection()
    expect(screen.getByText('Cargando…')).toBeInTheDocument()
    expect(await screen.findByText('No se pudieron cargar los suplementos.')).toBeInTheDocument()
  })
})

describe('RegistroSeccion · actividades', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(TODAY)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('draws the activity as a rule, a count, a bar and «Realizado» — never one chip per hour', async () => {
    api([], [activity()])
    renderSection('activity')
    expect(await screen.findByRole('heading', { name: 'Actividades' })).toBeInTheDocument()
    expect(await screen.findByText('Cada hora, de 08:00 a 20:00')).toBeInTheDocument()
    expect(screen.getByText('Todos los días · desde el 1 oct')).toBeInTheDocument()
    expect(screen.getByText('3 de 5')).toBeInTheDocument()
    expect(screen.getByText('hechas hoy')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '3 de 5 hechas hoy' })).toHaveAttribute('aria-valuenow', '3')
    expect(screen.getByText('Próxima: 16:00')).toBeInTheDocument()
    expect(screen.getByText('Última: por Rosa, 10:04')).toBeInTheDocument()
    expect(screen.getByText('1 activa')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Toma de/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Agregar actividad' })).toHaveAttribute('href', '/children/child-1/actividades/nueva')
  })

  it('«Realizado» asks the server to mark the next one and then the card asks again', async () => {
    const mock = api([], [activity()])
    renderSection('activity')
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.click(await screen.findByRole('button', { name: 'Realizado: Tomar agua' }))
    await waitFor(() => expect(callsOf(mock)).toContain('POST /routines/a1/done'))
    const call = mock.mock.calls.find(([url, init]) => String(url).endsWith('/routines/a1/done') && init?.method === 'POST')!
    const sent = JSON.parse(call[1].body as string)
    expect(Date.parse(sent.to) - Date.parse(sent.from)).toBe(24 * 3600 * 1000)
    await waitFor(() => expect(callsOf(mock).filter((c) => c === 'GET /children/child-1/routines').length).toBeGreaterThan(1))
  })

  it('removes the button and says there are no more reminders once all are marked', async () => {
    api([], [activity({ doses: [dose('x8', 8, { taken: true, takenBy: { name: 'Ana', at: at(8, 5), mine: true } })] })])
    renderSection('activity')
    expect(await screen.findByText('Sin más avisos hoy')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Realizado/ })).not.toBeInTheDocument()
  })

  it('says it is the person’s own without a name: «Última: 10:04»', async () => {
    api([], [activity({ childId: null })])
    renderSection('activity')
    expect(await screen.findByText('Última: 10:04')).toBeInTheDocument()
  })

  it('writes the days and the range, the paused and the finished', async () => {
    api(
      [],
      [
        activity({ id: 'a1', weekdays: [1, 3], firstDate: '2026-10-02', endDate: '2026-10-20' }),
        activity({ id: 'a2', name: 'Caminar', status: 'paused', pausedAt: new Date(2026, 9, 5).toISOString(), doses: [], intervalMinutes: 30, windowStart: '09:00', windowEnd: '18:00' }),
        activity({ id: 'a3', name: 'Estirar', status: 'ended', endedAt: new Date(2026, 8, 30).toISOString(), doses: [] }),
      ],
    )
    renderSection('activity')
    expect(await screen.findByText('Mar, Jue · del 2 al 20 oct')).toBeInTheDocument()
    expect(screen.getByText('Cada 30 min, de 09:00 a 18:00')).toBeInTheDocument()
    expect(screen.getByText('Pausada desde el 5 oct. Mientras esté pausada no llegan avisos. Lo marcado se conserva.')).toBeInTheDocument()
    expect(screen.getByText('Terminada el 30 sep')).toBeInTheDocument()
    expect(screen.getByText('Pausadas y terminadas')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Ver actividad/ })).toHaveLength(3)
  })

  it('says when the next one is for an activity that does not go off today', async () => {
    api([], [activity({ doses: [], nextDose: dose('x', 9, { scheduledAt: at(9, 0, 8) }) })])
    renderSection('activity')
    expect(await screen.findByText('Hoy no le toca. La siguiente es el jue 8 oct, a las 09:00.')).toBeInTheDocument()
  })

  it('invites a Tutor with no activities and explains the cap apart from the supplements', async () => {
    api([routine()], [])
    renderSection('activity')
    expect(await screen.findByRole('heading', { name: 'Mateo aún no tiene actividades' })).toBeInTheDocument()
    expect(screen.getByText(/Para lo que Mateo hace varias veces al día/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Agregar actividad' })).toBeInTheDocument()
  })

  it('shows the cap block with its words', async () => {
    api([], [activity()], { activeCount: 10 })
    renderSection('activity')
    const status = await screen.findByRole('status')
    expect(within(status).getByText('Ya tienes 10 actividades activas')).toBeInTheDocument()
    expect(within(status).getByRole('link', { name: 'Ir a las actividades activas' })).toHaveAttribute('href', '#actividades-activas')
  })

  it('gives a Caregiver «Realizado» and the sentence that a Tutor adds', async () => {
    api([], [activity()], {}, caregiver)
    renderSection('activity')
    expect(await screen.findByText('Las actividades las agrega y edita un Tutor. Tú puedes marcar «Realizado» y elegir tus avisos.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Realizado: Tomar agua' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '+ Agregar actividad' })).not.toBeInTheDocument()
  })

  it('opens the activity detail', async () => {
    api([], [activity()])
    renderSection('activity')
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(await screen.findByRole('link', { name: 'Ver actividad Tomar agua' }))
    expect(await screen.findByText('DETALLE ACTIVIDAD')).toBeInTheDocument()
  })

  it('says it could not load the activities', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: string) => (String(input).includes('/accounts/me') ? { ok: true, status: 200, json: async () => ana } : { ok: false, status: 500, json: async () => ({}) })))
    renderSection('activity')
    expect(await screen.findByText('No se pudieron cargar las actividades.')).toBeInTheDocument()
  })
})
