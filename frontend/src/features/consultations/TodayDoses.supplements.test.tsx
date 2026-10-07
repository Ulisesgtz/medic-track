import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TodayDosesBlock } from './TodayDosesBlock'
import { TodayDosesPanel } from './TodayDosesPanel'
import type { OverviewDose } from './types'

// specs/033: today's list mixes a child's medication doses and supplement routine doses; both are marked the same way.

const medication: OverviewDose = { id: 'm1', kind: 'medication', consultationId: 'c1', medicationName: 'Amoxicilina', scheduledAt: new Date(2026, 9, 6, 8).toISOString(), taken: false, status: 'due' }
const supplement: OverviewDose = { id: 's1', kind: 'supplement', routineId: 'r1', consultationId: '', medicationName: 'Vitamina D', scheduledAt: new Date(2026, 9, 6, 9).toISOString(), taken: false, status: 'due' }

function renderIn(ui: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

function stubFetch() {
  const mock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'x', scheduledAt: '', taken: true, status: 'taken' }) })
  vi.stubGlobal('fetch', mock)
  return mock
}
const urls = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls.map((call) => {
    const [url, init] = call as [string, RequestInit]
    return `${init.method} ${String(url).replace('http://localhost:8080', '')}`
  })

afterEach(() => vi.unstubAllGlobals())

describe('TodayDosesPanel with supplements', () => {
  it('labels a supplement dose and marks it through its routine, and a medication through its consultation', async () => {
    const mock = stubFetch()
    renderIn(<TodayDosesPanel doses={[medication, supplement]} status="ready" />)
    expect(screen.getByText('Suplemento')).toBeInTheDocument()
    expect(screen.getAllByText(/Amoxicilina|Vitamina D/)).toHaveLength(2)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Toma de 09:00 Vitamina D' }))
    await waitFor(() => expect(urls(mock)).toContain('PATCH /routines/r1/doses/s1'))
    await user.click(screen.getByRole('button', { name: 'Toma de 08:00 Amoxicilina' }))
    await waitFor(() => expect(urls(mock)).toContain('PATCH /consultations/c1/doses/m1'))
  })

  it('treats a dose from a backend that predates the kind as a medication', async () => {
    const mock = stubFetch()
    const { kind: _kind, ...old } = medication
    void _kind
    renderIn(<TodayDosesPanel doses={[old]} status="ready" />)
    expect(screen.queryByText('Suplemento')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Toma de 08:00 Amoxicilina' }))
    await waitFor(() => expect(urls(mock)).toContain('PATCH /consultations/c1/doses/m1'))
  })
})

describe('TodayDosesBlock with supplements', () => {
  it('"Marcar tomas" marks every unmarked dose, each through its own endpoint', async () => {
    const mock = stubFetch()
    renderIn(<TodayDosesBlock doses={[medication, supplement]} status="ready" />)
    expect(screen.getByText(/2 sin marcar · Amoxicilina, Vitamina D/)).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Marcar tomas' }))
    await waitFor(() => expect(urls(mock).sort()).toEqual(['PATCH /consultations/c1/doses/m1', 'PATCH /routines/r1/doses/s1']))
  })
})
