import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  describe('photo viewer', () => {
    function stubConsultation() {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            id: 'c1', childId: 'child-1', doctorName: 'Dra. López', consultDate: '2026-01-15',
            photoBase64: 'Zm9v', symptoms: '', medications: [],
          }),
        }),
      )
    }

    it('opens the photo in an in-app viewer from "Ver completa" (a data: URL in a new tab renders blank)', async () => {
      const user = userEvent.setup()
      stubConsultation()
      renderPage()

      await user.click(await screen.findByRole('button', { name: 'Ver completa' }))

      const dialog = screen.getByRole('dialog', { name: /tamaño completo/i })
      expect(dialog).toBeInTheDocument()
      expect(screen.getByAltText('Foto de la receta médica en tamaño completo')).toHaveAttribute(
        'src',
        expect.stringMatching(/^data:image\/jpeg;base64,/),
      )
    })

    it('opens from the thumbnail too, and toggles between fit and actual size', async () => {
      const user = userEvent.setup()
      stubConsultation()
      renderPage()

      await user.click(await screen.findByRole('button', { name: /abrir la foto/i }))
      const full = screen.getByAltText('Foto de la receta médica en tamaño completo')
      expect(full).toHaveClass('w-full')

      await user.click(full)
      expect(full).toHaveClass('max-w-none')
      expect(screen.getByText(/tamaño real/i)).toBeInTheDocument()

      await user.click(full)
      expect(full).toHaveClass('w-full')
    })

    it('closes with the Cerrar button and with Escape', async () => {
      const user = userEvent.setup()
      stubConsultation()
      renderPage()

      await user.click(await screen.findByRole('button', { name: 'Ver completa' }))
      await user.click(screen.getByRole('button', { name: 'Cerrar' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Ver completa' }))
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('moves focus into the viewer, keeps it there on Tab, and returns it to the opener on close', async () => {
      const user = userEvent.setup()
      stubConsultation()
      renderPage()

      const opener = await screen.findByRole('button', { name: 'Ver completa' })
      await user.click(opener)
      const close = screen.getByRole('button', { name: 'Cerrar' })
      expect(close).toHaveFocus()

      await user.tab()
      expect(close).toHaveFocus()

      await user.click(close)
      expect(opener).toHaveFocus()
    })
  })
})
