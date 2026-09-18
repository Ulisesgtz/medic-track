import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConsultationDetailPage } from './ConsultationDetailPage'

function renderPage(consultationId = 'c1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/consultations/${consultationId}`]}>
        <Routes>
          <Route path="/consultations/:consultationId" element={<ConsultationDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ConsultationDetailPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders photo, doctor, date, medications, doses and symptoms (FR-013)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'c1', childId: 'child-1', doctorName: 'Dra. López', consultDate: '2026-01-15',
          photoBase64: 'Zm9v', symptoms: 'Tos y fiebre',
          medications: [
            {
              id: 'm1', name: 'Amoxicilina', frequencyHours: 8, durationDays: 3, startTime: '08:00',
              doses: [{ id: 'd1', scheduledAt: '2026-01-15T08:00:00Z', taken: false }],
            },
          ],
        }),
      }),
    )
    renderPage()

    expect(await screen.findByText('Dra. López')).toBeInTheDocument()
    expect(screen.getByText('Amoxicilina')).toBeInTheDocument()
    expect(screen.getByText(/Cada 8h, por 3 días/)).toBeInTheDocument()
    expect(screen.getByText('Tos y fiebre')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
  })

  it('does not show a dose list for a medication without a start time (FR-010)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'c1', childId: 'child-1', doctorName: 'Dra. López', consultDate: '2026-01-15',
          photoBase64: 'Zm9v', symptoms: '',
          medications: [{ id: 'm1', name: 'Ibuprofeno', frequencyHours: 12, durationDays: 2, startTime: null, doses: [] }],
        }),
      }),
    )
    renderPage()

    expect(await screen.findByText('Ibuprofeno')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('shows a not-found message for a missing consultation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ message: 'Consultation not found' }) }),
    )
    renderPage('missing')

    expect(await screen.findByText(/no se encontró esta consulta/i)).toBeInTheDocument()
  })
})
