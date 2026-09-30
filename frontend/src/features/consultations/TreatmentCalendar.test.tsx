import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TreatmentCalendar } from './TreatmentCalendar'
import type { Medication } from './types'

// Local dates, so the tests read the same in any time zone.
const at = (month: number, day: number, hour: number) => new Date(2026, month - 1, day, hour).toISOString()

function med(id: string, name: string, days: [number, number][], hours: number[] = [8], endedAt: string | null = null): Medication {
  return {
    id,
    name,
    frequencyHours: 24,
    durationDays: days.length,
    startTime: null,
    endedAt,
    doses: days.flatMap(([m, d]) =>
      hours.map((h) => ({ id: `${id}-${m}-${d}-${h}`, scheduledAt: at(m, d, h), taken: false, status: 'pending' as const })),
    ),
  }
}

const range = (from: [number, number], to: [number, number]): [number, number][] => {
  const out: [number, number][] = []
  for (let t = new Date(2026, from[0] - 1, from[1]); t <= new Date(2026, to[0] - 1, to[1]); t.setDate(t.getDate() + 1)) {
    out.push([t.getMonth() + 1, t.getDate()])
  }
  return out
}

const amoxicilina = med('m1', 'Amoxicilina', range([9, 30], [10, 6]), [8, 16])
const paracetamol = med('m2', 'Paracetamol', range([9, 30], [10, 2]), [12])

function renderCalendar(props: Partial<Parameters<typeof TreatmentCalendar>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = (p: Partial<Parameters<typeof TreatmentCalendar>[0]>) => (
    <QueryClientProvider client={queryClient}>
      <TreatmentCalendar
        consultationId="c1"
        medications={[amoxicilina, paracetamol]}
        today="2026-09-30"
        variant="phone"
        {...p}
      />
    </QueryClientProvider>
  )
  const result = render(view(props))
  return { ...result, rerenderWith: (p: Partial<Parameters<typeof TreatmentCalendar>[0]>) => result.rerender(view({ ...props, ...p })) }
}

const day = (name: string | RegExp) => screen.getByRole('button', { name })

afterEach(() => vi.unstubAllGlobals())

describe('TreatmentCalendar (specs/019)', () => {
  it('is one calendar for the consultation, with a legend of its medications in order', () => {
    renderCalendar()

    expect(screen.getAllByRole('heading', { name: 'Calendario del tratamiento' })).toHaveLength(1)
    const legend = screen.getByRole('list', { name: 'Medicamentos del calendario' })
    expect(within(legend).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['1Amoxicilina', '2Paracetamol'])
    expect(screen.getByText('septiembre 2026')).toBeInTheDocument()
  })

  it('marks every day of each range with its number — both on a shared day — and no day outside it', () => {
    renderCalendar()

    expect(day('30 de septiembre · 1 Amoxicilina, 2 Paracetamol')).toBeInTheDocument()
    // The day before the treatment is plain.
    expect(day('29 de septiembre')).toBeInTheDocument()
    // Another month, only the longer medication.
    expect(screen.queryByRole('button', { name: /1 de octubre/ })).not.toBeInTheDocument() // not on this month's grid
  })

  it('pages through the months of the treatment and no further', async () => {
    const user = userEvent.setup()
    renderCalendar()
    const previous = screen.getByRole('button', { name: 'Mes anterior' })
    const next = screen.getByRole('button', { name: 'Mes siguiente' })
    expect(previous).toBeDisabled()

    await user.click(next)

    expect(screen.getByText('octubre 2026')).toBeInTheDocument()
    expect(next).toBeDisabled()
    expect(day('1 de octubre · 1 Amoxicilina, 2 Paracetamol')).toBeInTheDocument()
    expect(day('3 de octubre · 1 Amoxicilina')).toBeInTheDocument()
    expect(day('7 de octubre')).toBeInTheDocument() // past the end: no mark
    await user.click(screen.getByRole('button', { name: 'Mes anterior' }))
    expect(screen.getByText('septiembre 2026')).toBeInTheDocument()
  })

  it('has no arrows to go to when the treatment is inside one month', () => {
    renderCalendar({ medications: [med('m1', 'Amoxicilina', range([10, 1], [10, 3]))], today: '2026-10-02' })

    expect(screen.getByRole('button', { name: 'Mes anterior' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled()
  })

  it('starts on today when it is inside the treatment, with today marked and its doses listed', () => {
    renderCalendar({ today: '2026-10-01' })

    expect(screen.getByText('octubre 2026')).toBeInTheDocument()
    const today = day(/^1 de octubre/)
    expect(today).toHaveAttribute('aria-current', 'date')
    expect(today).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Tomas de hoy' })).toBeInTheDocument()
  })

  it('starts on the first day when today is outside the treatment', () => {
    renderCalendar({ today: '2026-12-25' })

    expect(screen.getByText('septiembre 2026')).toBeInTheDocument()
    expect(day(/^30 de septiembre/)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Tomas del 30 de septiembre' })).toBeInTheDocument()
  })

  it('tapping a day selects it and lists its doses, of every medication, by time', async () => {
    const user = userEvent.setup()
    renderCalendar({ today: '2026-12-25' })

    await user.click(day(/^30 de septiembre/))

    const list = screen.getByRole('list', { name: 'Tomas del día' })
    expect(within(list).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Amoxicilina, 08:00',
      'Paracetamol, 12:00',
      'Amoxicilina, 16:00',
    ])
  })

  it('says there are no doses on a day outside every range, and selecting moves the selection', async () => {
    const user = userEvent.setup()
    renderCalendar({ today: '2026-12-25' })

    await user.click(day('29 de septiembre'))

    expect(screen.getByRole('heading', { name: 'Tomas del 29 de septiembre' })).toBeInTheDocument()
    expect(screen.getByText('Ese día no hay tomas.')).toBeInTheDocument()
    expect(day('29 de septiembre')).toHaveAttribute('aria-pressed', 'true')
    expect(day(/^30 de septiembre/)).toHaveAttribute('aria-pressed', 'false')
  })

  it('marks a dose from the day list exactly like the chip of its medication', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'x', scheduledAt: '', taken: true, status: 'taken' }) })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderCalendar({ today: '2026-12-25' })

    await user.click(screen.getByRole('button', { name: 'Amoxicilina, 08:00' }))

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/consultations\/c1\/doses\/m1-9-30-8$/)
    expect(init).toMatchObject({ method: 'PATCH' })
    expect(JSON.parse(String(init.body))).toEqual({ taken: true })
  })

  it('a treatment ended early stops marking the days after the day it ended', () => {
    const ended = med('m1', 'Amoxicilina', range([9, 30], [10, 6]), [8], at(10, 1, 9))
    renderCalendar({ medications: [ended], today: '2026-10-01' })

    expect(day('1 de octubre · 1 Amoxicilina')).toBeInTheDocument()
    expect(day('2 de octubre')).toBeInTheDocument() // no mark: it ended the day before
    expect(day('6 de octubre')).toBeInTheDocument()
  })

  it('draws nothing when no medication has a day to show', () => {
    const { container } = renderCalendar({ medications: [med('m1', 'Amoxicilina', [])] })
    expect(container).toBeEmptyDOMElement()
  })

  it('numbers past the sixth medication keep counting while the colors start over', () => {
    const many = Array.from({ length: 7 }, (_, i) => med(`m${i}`, `Medicina ${i + 1}`, [[10, 1]]))
    renderCalendar({ medications: many, today: '2026-10-01' })

    const legend = screen.getByRole('list', { name: 'Medicamentos del calendario' })
    const numbers = within(legend).getAllByRole('listitem').map((li) => li.firstElementChild!)
    expect(numbers.map((n) => n.textContent)).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(numbers[0]).toHaveClass('bg-med-1')
    expect(numbers[5]).toHaveClass('bg-med-6')
    expect(numbers[6]).toHaveClass('bg-med-1')
    expect(day(/^1 de octubre · 1 Medicina 1, 2 Medicina 2/)).toBeInTheDocument()
  })

  it('keeps the chosen day when the detail is refreshed', async () => {
    const user = userEvent.setup()
    const { rerenderWith } = renderCalendar({ today: '2026-12-25' })
    await user.click(day('29 de septiembre'))

    rerenderWith({ medications: [{ ...amoxicilina }, { ...paracetamol }] })

    expect(day('29 de septiembre')).toHaveAttribute('aria-pressed', 'true')
  })

  it('has its own sizes on the web (a taller day) than on the phone', () => {
    const phone = renderCalendar()
    expect(day(/^30 de septiembre/).className).toContain('min-h-[52px]')
    phone.unmount()

    renderCalendar({ variant: 'desktop' })
    expect(day(/^30 de septiembre/).className).toContain('min-h-16')
  })
})
