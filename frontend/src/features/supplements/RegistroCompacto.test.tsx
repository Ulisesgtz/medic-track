import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RegistroCompacto } from './RegistroCompacto'
import { ACTIVITY_TYPES, TODAY, account, activity, byKind, routine, stubApi, stubWeb } from './supplements.test-utils'

// specs/075: «Actividades» is one segment per type, in the catalog's order; the supplements stay one list.

function renderSection(props: Parameters<typeof RegistroCompacto>[0]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RegistroCompacto {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const activities = [
  activity({ id: 'h1', name: 'Lavarse los dientes', activityType: 'habits' }),
  activity({ id: 's1', name: 'Fut', activityType: 'sports' }),
  activity({ id: 'h2', name: 'Tomar agua', activityType: 'habits' }),
  activity({ id: 'o1', name: 'Natación', activityType: 'old', status: 'paused', pausedAt: new Date(2026, 9, 2).toISOString() }),
]

function api(extra: Parameters<typeof stubApi>[0] = {}) {
  return stubApi({
    'GET /accounts/me': { body: account() },
    'GET /children/child-1/routines': byKind([routine()], activities),
    'GET /accounts/a1/routines': (url) => ({ body: { ...byKind([routine()], activities)(url).body, noticeSeen: true } }),
    'GET /catalog/activity-types': { body: ACTIVITY_TYPES },
    ...extra,
  })
}

describe('RegistroCompacto · segmentos por tipo', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(TODAY)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('makes each type a card titled with its icon and name, the count at the right, in the catalog order, a retired one included', async () => {
    api()
    renderSection({ kind: 'activity', childId: 'child-1', sectionId: 'actividades', variant: 'phone' })
    const sports = await screen.findByRole('region', { name: 'Deportiva' })
    expect(screen.getAllByRole('region').filter((r) => r.tagName === 'SECTION' && r.hasAttribute('aria-labelledby')).map((g) => g.getAttribute('aria-labelledby')!).map((id) => document.getElementById(id)!.textContent)).toEqual([
      'Deportiva',
      'Antigua',
      'Hábitos y cuidado diario',
    ])
    expect(within(sports).getByRole('heading', { level: 3, name: 'Deportiva' })).toHaveClass('text-[17px]')
    expect(within(sports).getByText('1 actividad')).toBeInTheDocument()
    const habits = screen.getByRole('region', { name: 'Hábitos y cuidado diario' })
    expect(within(habits).getByText('2 actividades')).toBeInTheDocument()
    expect(within(habits).getAllByRole('link').map((l) => l.textContent)).toEqual([
      expect.stringContaining('Lavarse los dientes'),
      expect.stringContaining('Tomar agua'),
    ])
  })

  it('draws a decorative icon in a light box beside each title, with no color of its own', async () => {
    api()
    renderSection({ kind: 'activity', childId: 'child-1', sectionId: 'actividades', variant: 'phone' })
    const title = await screen.findByRole('heading', { level: 3, name: 'Deportiva' })
    const box = title.querySelector('span[aria-hidden="true"]')!
    expect(box).toHaveClass('size-[34px]', 'bg-hint', 'text-action')
    expect(box.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    for (const h of screen.getAllByRole('heading', { level: 3 })) {
      expect(h.querySelector('span[aria-hidden="true"]')).toHaveClass('bg-hint', 'text-action')
    }
  })

  it('shows the state as «Activa» (hint chip) and «Pausada» (quiet chip) in uppercase words', async () => {
    api()
    renderSection({ kind: 'activity', childId: 'child-1', sectionId: 'actividades', variant: 'phone' })
    expect(await screen.findAllByText('Activa')).not.toHaveLength(0)
    expect(screen.getAllByText('Activa')[0]).toHaveClass('bg-hint', 'text-action')
    expect(screen.getByText('Pausada')).toHaveClass('bg-slate-100', 'text-muted')
  })

  it('has the add button in the header, in outline, and none of the dashed one below', async () => {
    api()
    renderSection({ kind: 'activity', childId: 'child-1', sectionId: 'actividades', variant: 'phone' })
    const add = await screen.findByRole('link', { name: '+ Agregar actividad' })
    expect(add).toHaveClass('border-2', 'border-action', 'px-3', 'text-[14px]')
    expect(add.closest('div')?.querySelector('h2')).toHaveTextContent('Actividades')
    expect(screen.getAllByRole('link', { name: '+ Agregar actividad' })).toHaveLength(1)
  })

  it('draws the web design with a row in one line: name, frequency, state', async () => {
    stubWeb(true)
    api()
    renderSection({ kind: 'activity', childId: 'child-1', sectionId: 'actividades', variant: 'desktop' })
    const fut = await screen.findByRole('link', { name: /Fut/ })
    expect(fut).toHaveClass('grid', 'grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto]')
    expect(screen.getByRole('heading', { level: 2, name: 'Actividades' })).toHaveClass('text-xl', 'font-black')
    expect(screen.getByRole('link', { name: '+ Agregar actividad' })).toHaveClass('px-[18px]', 'text-[15px]')
  })

  it('groups the own activities of the person too (/yo)', async () => {
    api()
    renderSection({ kind: 'activity', personal: true, sectionId: 'actividades', variant: 'phone' })
    expect(await screen.findByRole('region', { name: 'Deportiva' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Hábitos y cuidado diario' })).toBeInTheDocument()
  })

  it('keeps one segment with its title when there is a single type', async () => {
    api({ 'GET /children/child-1/routines': byKind([], [activity({ id: 's1', name: 'Fut', activityType: 'sports' })]) })
    renderSection({ kind: 'activity', childId: 'child-1', sectionId: 'actividades', variant: 'phone' })
    expect(await screen.findByRole('heading', { level: 3, name: 'Deportiva' })).toBeInTheDocument()
  })

  it('says the section is empty with no segments, and a Caregiver has no add button', async () => {
    api({ 'GET /children/child-1/routines': byKind([], []), 'GET /accounts/me': { body: account({}, { role: 'caregiver', accountId: 'owner', readOnly: true, plan: 'paid' }) } })
    renderSection({ kind: 'activity', childId: 'child-1', sectionId: 'actividades', variant: 'phone' })
    expect(await screen.findByText('Aún no hay actividades')).toBeInTheDocument()
    expect(screen.getByText('Agrega rutinas, deportes, terapias o hábitos de Mateo para llevar su registro.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '+ Agregar actividad' })).not.toBeInTheDocument()
  })

  it('shows the whole list with no segments when the catalog does not load', async () => {
    api({ 'GET /catalog/activity-types': { status: 500, body: {} } })
    renderSection({ kind: 'activity', childId: 'child-1', sectionId: 'actividades', variant: 'phone' })
    expect(await screen.findByText('Fut')).toBeInTheDocument()
    expect(screen.getByText('Natación')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument()
  })

  it('never splits the supplements nor moves their add button', async () => {
    api()
    renderSection({ kind: 'supplement', childId: 'child-1', sectionId: 'suplementos', variant: 'phone' })
    expect(await screen.findByText('Vitamina D')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Agregar suplemento' })).toHaveClass('border-dashed')
  })

  it('says «tu registro» in the empty section of the person’s own', async () => {
    api({ 'GET /accounts/a1/routines': (url) => ({ body: { ...byKind([], [])(url).body, noticeSeen: true } }) })
    renderSection({ kind: 'activity', personal: true, sectionId: 'actividades', variant: 'phone' })
    expect(await screen.findByText('Agrega rutinas, deportes, terapias o hábitos para llevar tu registro.')).toBeInTheDocument()
  })
})
