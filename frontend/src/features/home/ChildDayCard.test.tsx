import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { ChildDayCard, MARKED_SHOWN_MS } from './ChildDayCard'
import { markNoticesSnapshot, resetMarkNotices } from '../../shared/marks/markNotices'
import { resetPendingMarks } from '../../shared/marks/pendingMarks'
import type { Child } from './types'

vi.mock('@clerk/react', () => ({ useAuth: vi.fn() }))

const child: Child = { id: 'k1', firstName: 'Mateo', lastName: 'Morales', birthDate: '2021-03-14', height: null, weight: null }

let seq = 0
const dose = (status: string, at: string, extra: Record<string, unknown> = {}) => ({
  id: `d${++seq}`,
  consultationId: 'c1',
  medicationName: 'Amoxicilina',
  scheduledAt: `2026-11-01T${at}:00`,
  taken: status === 'taken',
  status,
  ...extra,
})
const sup = (status: string, at: string) => dose(status, at, { kind: 'supplement', routineId: 'r1', consultationId: '', medicationName: 'Vitamina D' })
const activity = (doses: { status: string; taken: boolean }[]) => ({
  id: 'a1', kind: 'activity', name: 'Leer', status: 'active',
  doses: doses.map((d, i) => ({ id: `ad${i}`, scheduledAt: '2026-11-01T09:00:00', ...d })),
})

let calls: { url: string; method: string; body: unknown }[]

/** The server keeps the mark: what the screens read again after a PATCH is what was saved (specs/066). */
function patched(doses: unknown[], url: string, init?: RequestInit) {
  const saved = (doses as { id: string; taken: boolean; status: string; takenBy?: unknown }[]).find((d) => url.endsWith(`/doses/${d.id}`))
  if (!saved) return { id: 'x', taken: true }
  saved.taken = JSON.parse(String(init?.body)).taken
  saved.status = saved.taken ? 'taken' : 'due'
  saved.takenBy = saved.taken ? { name: 'Ana', at: new Date().toISOString(), mine: true } : null
  return saved
}

function stub({ doses = [] as unknown[], activities = [] as unknown[], fail = false } = {}) {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (fail && url.includes('/overview')) return { ok: false, status: 500, json: async () => ({ error: 'x', message: 'boom' }) } as Response
      const body = url.includes('/overview')
        ? { childId: 'k1', doses, activeTreatment: null }
        : url.includes('/routines') && init?.method !== 'PATCH'
          ? { routines: activities, activeCount: activities.length, limit: 10, paidPlan: true }
          : patched(doses, url, init)
      return { ok: true, json: async () => body } as Response
    }),
  )
}

function renderCard(variant: 'phone' | 'desktop' = 'phone', index = 0) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ChildDayCard child={child} variant={variant} index={index} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const card = async () => (await screen.findByRole('link', { name: 'Ver detalle de Mateo' })).closest('article')!

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true, getToken: async () => 't' } as unknown as ReturnType<typeof useAuth>)
})
afterEach(() => {
  resetPendingMarks()
  resetMarkNotices()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('ChildDayCard', () => {
  it('shows a skeleton of its final height while the day loads', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    const { container } = renderCard()
    expect(container.querySelector('[aria-hidden="true"].h-\\[264px\\]')).not.toBeNull()
  })

  it('with something to mark: the amber chip, one row per kind and the next dose with «Marcar»', async () => {
    stub({ doses: [dose('taken', '08:00'), dose('due', '12:00'), sup('pending', '16:00')], activities: [activity([{ status: 'taken', taken: true }, { status: 'pending', taken: false }])] })
    renderCard()
    const c = await card()
    expect(await within(c).findByText('1 por marcar')).toBeInTheDocument()
    expect(within(c).getByText('2 tomas hoy · 1 por marcar')).toBeInTheDocument()
    expect(within(c).getByText('0 de 1')).toBeInTheDocument()
    expect(within(c).getByText('1 de 2 hechas')).toBeInTheDocument()
    expect(within(c).getByText('Amoxicilina · 12:00')).toBeInTheDocument()
    expect(within(c).getByRole('button', { name: 'Marcar Amoxicilina 12:00 de Mateo' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(c).getByText(/5 años/)).toBeInTheDocument()
  })

  it('all marked so far: the mint chip, and still the next dose that is to come', async () => {
    stub({ doses: [dose('taken', '08:00'), dose('pending', '20:00')] })
    renderCard()
    const c = await card()
    expect(await within(c).findByText('✓ Todo marcado hasta ahora')).toBeInTheDocument()
    expect(within(c).getByText('Amoxicilina · 20:00')).toBeInTheDocument()
  })

  it('nothing today: one grey line, no rows and no footer', async () => {
    stub()
    renderCard()
    const c = await card()
    expect(await within(c).findByText('Hoy no hay tomas ni actividades')).toBeInTheDocument()
    expect(within(c).queryByRole('button')).not.toBeInTheDocument()
  })

  it('a dose «sin registrar»: dashed border and line, never amber', async () => {
    stub({ doses: [dose('unregistered', '08:00', { medicationName: 'Paracetamol' }), dose('due', '12:00')] })
    renderCard()
    const c = await card()
    expect(await within(c).findByText('Paracetamol · 08:00 · sin registrar')).toBeInTheDocument()
    expect(within(c).getByText('sin registrar')).toHaveClass('border-dashed')
    expect(within(c).queryByText(/por marcar$/)).not.toBeInTheDocument()
    expect(c).toHaveClass('border-dashed')
  })

  it('«Marcar» marks a medication dose through its consultation, says «✓ HH:MM», and takes it back', async () => {
    const user = userEvent.setup()
    stub({ doses: [dose('due', '12:00')] })
    renderCard()
    await user.click(await screen.findByRole('button', { name: 'Marcar Amoxicilina 12:00 de Mateo' }))
    const patch = calls.find((c) => c.method === 'PATCH')!
    expect(patch.url).toMatch(/\/consultations\/c1\/doses\/d\d+$/)
    expect(patch.body).toEqual({ taken: true })
    const marked = await screen.findByRole('button', { name: 'Marcar Amoxicilina 12:00 de Mateo', pressed: true })
    expect(marked).toHaveTextContent(/^✓ \d\d:\d\d$/)

    await user.click(marked)
    expect(calls.filter((c) => c.method === 'PATCH').at(-1)!.body).toEqual({ taken: false })
    expect(await screen.findByRole('button', { name: 'Marcar Amoxicilina 12:00 de Mateo', pressed: false })).toBeInTheDocument()
  })

  it('«Marcar» marks a supplement dose through its routine', async () => {
    const user = userEvent.setup()
    stub({ doses: [sup('due', '09:00')] })
    renderCard()
    await user.click(await screen.findByRole('button', { name: 'Marcar Vitamina D 09:00 de Mateo' }))
    expect(calls.find((c) => c.method === 'PATCH')!.url).toMatch(/\/routines\/r1\/doses\/d\d+$/)
  })

  it('after a minute the footer moves on from «✓ HH:MM» to the next dose', async () => {
    stub({ doses: [dose('due', '12:00'), dose('pending', '16:00')] })
    renderCard()
    const button = await screen.findByRole('button', { name: /^Marcar/ })
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await act(async () => button.click())
    await screen.findByRole('button', { name: /^Marcar/, pressed: true })
    await act(async () => vi.advanceTimersByTime(MARKED_SHOWN_MS))
    expect(await screen.findByRole('button', { name: /^Marcar/, pressed: false })).toBeInTheDocument()
  })

  it('a mark that fails says so, in neutral words, and keeps «Marcar»', async () => {
    const user = userEvent.setup()
    stub({ doses: [dose('due', '12:00')] })
    renderCard()
    const button = await screen.findByRole('button', { name: 'Marcar Amoxicilina 12:00 de Mateo' })
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'x', message: 'boom' }) } as Response)
    await user.click(button)
    // specs/066: the footer goes back to «Marcar» and the one notice of the screen says it, in neutral words.
    await waitFor(() => expect(markNoticesSnapshot()).toEqual([{ doseId: expect.any(String), kind: 'not_saved', name: 'Amoxicilina', time: '12:00' }]))
    expect(await screen.findByRole('button', { name: 'Marcar Amoxicilina 12:00 de Mateo', pressed: false })).toHaveTextContent('Marcar')
  })

  it('a failed day says so in the card and can be asked again', async () => {
    const user = userEvent.setup()
    stub({ fail: true })
    renderCard()
    expect(await screen.findByText('No pudimos cargar el día de Mateo')).toBeInTheDocument()
    const before = calls.length
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(calls.length).toBeGreaterThan(before)
  })

  it('the web card has the design’s bigger avatar, and the second child is green', async () => {
    stub()
    renderCard('desktop', 1)
    const link = await screen.findByRole('link', { name: 'Ver detalle de Mateo' })
    expect(link.querySelector('[aria-hidden]')).toHaveClass('h-12', 'bg-confirmed')
  })
})
