import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConsultationDetailPage } from './ConsultationDetailPage'

// specs/033, part 2: when «Nueva consulta» saved the consultation but not its next appointment, the detail says so.

const account = {
  id: 'a1', firstName: 'Ana', lastName: 'Morales', email: 'ana@example.com', countryCode: null, stateCode: null, plan: 'paid',
  children: [{ id: 'child-1', firstName: 'Mateo', lastName: 'Morales', birthDate: '2021-03-14', height: null, weight: null }],
}
const detail = { id: 'c1', childId: 'child-1', doctorName: 'Dra. López', consultDate: '2026-01-15', photoBase64: 'Zm9v', notes: '', symptoms: [], medications: [], recordOnly: true }

function renderWithState(state: unknown, desktop: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({ matches: desktop, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: string) => {
      const url = String(input)
      if (url.includes('/appointment')) return { ok: true, status: 200, json: async () => ({ appointment: null, paidPlan: true }) }
      if (url.includes('/overview')) return { ok: true, status: 200, json: async () => ({ childId: 'child-1', doses: [], activeTreatment: null }) }
      if (url.includes('/accounts/')) return { ok: true, status: 200, json: async () => account }
      return { ok: true, status: 200, json: async () => detail }
    }),
  )
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: '/consultations/c1', state }]}>
        <Routes>
          <Route path="/consultations/:consultationId" element={<ConsultationDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const sentence = 'La consulta se guardó, pero no se pudo guardar la próxima cita. Agrégala desde aquí.'

describe('ConsultationDetailPage, next appointment that was not saved', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    ['phone', false],
    ['web', true],
  ])('%s: says the consultation was saved and where to add the appointment', async (_name, desktop) => {
    renderWithState({ appointmentFailed: true }, desktop)
    expect(await screen.findByText(sentence)).toBeInTheDocument()
  })

  it.each([
    ['phone', false],
    ['web', true],
  ])('%s: says nothing when it did not fail', async (_name, desktop) => {
    renderWithState(null, desktop)
    expect(await screen.findAllByText('Dra. López')).not.toHaveLength(0)
    expect(screen.queryByText(sentence)).not.toBeInTheDocument()
  })
})
