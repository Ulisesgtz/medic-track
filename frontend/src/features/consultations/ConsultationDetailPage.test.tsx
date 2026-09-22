import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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

const at = (h: number, day = 15) => new Date(2026, 0, day, h).toISOString()

const account = {
  id: 'a1', firstName: 'Ana', lastName: 'Morales', email: 'ana@example.com',
  countryCode: null, stateCode: null, plan: 'free',
  children: [{ id: 'child-1', firstName: 'Mateo', lastName: 'Morales', birthDate: '2021-03-14', height: null, weight: null }],
}

function consultation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1', childId: 'child-1', doctorName: 'Dra. López', consultDate: '2026-01-15',
    photoBase64: 'Zm9v', symptoms: 'Tos y fiebre',
    medications: [
      {
        id: 'm1', name: 'Amoxicilina 250 mg', frequencyHours: 8, durationDays: 3, startTime: '08:00',
        doses: [
          { id: 'd1', scheduledAt: at(8), taken: true },
          { id: 'd2', scheduledAt: at(16), taken: false },
          { id: 'd3', scheduledAt: at(23), taken: false },
        ],
      },
    ],
    ...overrides,
  }
}

function stubApi(detail: unknown, overview: unknown = { childId: 'child-1', doses: [], activeTreatment: null }) {
  const fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'PATCH') return { ok: true, json: async () => ({ id: 'd2', scheduledAt: '', taken: true }) }
    if (url.includes('/overview')) return { ok: true, json: async () => overview }
    if (url.includes('/accounts/')) return { ok: true, json: async () => account }
    return { ok: true, json: async () => detail }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function useDesktop() {
  window.localStorage.setItem('peditrack.accountId', 'a1')
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
}

describe('ConsultationDetailPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 0, 15, 12))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    window.localStorage.clear()
  })

  describe('on the phone (mock 03)', () => {
    it('renders the header, photo card, symptoms and the medication with its schedule (FR-013)', async () => {
      stubApi(consultation())
      renderPage()

      expect(await screen.findByRole('heading', { level: 1, name: 'Dra. López' })).toBeInTheDocument()
      expect(screen.getByText('15 enero 2026')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '← Volver al reporte de consultas' })).toHaveAttribute('href', '/children/child-1')
      expect(screen.getByText('Foto de la receta')).toBeInTheDocument()
      expect(screen.getByText('Leída con OCR en el dispositivo')).toBeInTheDocument()
      expect(screen.getByText('Síntomas registrados')).toBeInTheDocument()
      expect(screen.getByText('Tos y fiebre')).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 3, name: 'Amoxicilina 250 mg' })).toBeInTheDocument()
      expect(screen.getByText('Cada 8 horas · 3 días · desde 08:00')).toBeInTheDocument()
    })

    it('is a centered column of at most 430px, as the mock', async () => {
      stubApi(consultation())
      renderPage()

      await screen.findByRole('heading', { level: 1, name: 'Dra. López' })
      expect(screen.getByRole('main')).toHaveClass('mx-auto', 'max-w-[430px]')
    })

    it('names the child in the back link when the account is saved', async () => {
      window.localStorage.setItem('peditrack.accountId', 'a1')
      stubApi(consultation())
      renderPage()

      expect(await screen.findByRole('link', { name: '← Mateo Morales' })).toBeInTheDocument()
    })

    it('omits the symptoms section when there are none', async () => {
      stubApi(consultation({ symptoms: '' }))
      renderPage()

      await screen.findByRole('heading', { level: 1, name: 'Dra. López' })
      expect(screen.queryByText('Síntomas registrados')).not.toBeInTheDocument()
    })

    it("shows the day's doses as time chips: taken, missed (amber) and not yet due (grey)", async () => {
      stubApi(consultation())
      renderPage()

      const taken = await screen.findByRole('button', { name: 'Toma de 08:00' })
      expect(taken).toHaveTextContent('08:00 ✓')
      expect(taken).toHaveAttribute('aria-pressed', 'true')
      expect(taken).toHaveClass('bg-confirmed')
      const later = screen.getByRole('button', { name: 'Toma de 16:00' })
      expect(later).toHaveAttribute('aria-pressed', 'false')
      expect(later).toHaveClass('bg-slate-100') // 16:00 is after the mocked "now" (12:00)
    })

    it('shows a dose whose time already passed without being marked in amber', async () => {
      stubApi(
        consultation({
          medications: [{
            id: 'm1', name: 'Amoxicilina', frequencyHours: 8, durationDays: 1, startTime: '08:00',
            doses: [{ id: 'd1', scheduledAt: at(9), taken: false }],
          }],
        }),
      )
      renderPage()

      expect(await screen.findByRole('button', { name: 'Toma de 09:00' })).toHaveClass('bg-pending-soft')
    })

    it('marks a dose by tapping its chip and unmarks it by tapping again', async () => {
      const user = userEvent.setup()
      const fetchMock = stubApi(consultation())
      renderPage()

      await user.click(await screen.findByRole('button', { name: 'Toma de 16:00' }))
      await user.click(screen.getByRole('button', { name: 'Toma de 08:00' }))

      await waitFor(() => {
        const patches = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')
        expect(patches).toHaveLength(2)
        expect(patches[0][0]).toContain('/consultations/c1/doses/d2')
        expect(JSON.parse(patches[0][1].body)).toEqual({ taken: true })
        expect(JSON.parse(patches[1][1].body)).toEqual({ taken: false })
      })
    })

    it('shows the nearest day with doses when none are left today, and lets you move between days', async () => {
      const user = userEvent.setup()
      stubApi(
        consultation({
          medications: [{
            id: 'm1', name: 'Amoxicilina', frequencyHours: 12, durationDays: 3, startTime: '08:00',
            doses: [
              { id: 'a', scheduledAt: at(8, 13), taken: true },
              { id: 'b', scheduledAt: at(20, 13), taken: true },
              { id: 'c', scheduledAt: at(8, 17), taken: false },
              { id: 'd', scheduledAt: at(20, 17), taken: false },
            ],
          }],
        }),
      )
      renderPage()

      // Jan 15 has no doses: the next day with doses (Jan 17) is shown.
      expect(await screen.findByRole('button', { name: 'Toma de 08:00' })).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByText('17 ene')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Día siguiente →' })).toBeDisabled()

      await user.click(screen.getByRole('button', { name: '← Día anterior' }))

      expect(screen.getByText('13 ene')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Toma de 08:00' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: '← Día anterior' })).toBeDisabled()
      await user.click(screen.getByRole('button', { name: 'Día siguiente →' }))
      expect(screen.getByText('17 ene')).toBeInTheDocument()
    })

    it('says "Hoy" on the day switcher when the shown day is today', async () => {
      stubApi(
        consultation({
          medications: [{
            id: 'm1', name: 'Amoxicilina', frequencyHours: 8, durationDays: 2, startTime: '08:00',
            doses: [
              { id: 'a', scheduledAt: at(8), taken: false },
              { id: 'b', scheduledAt: at(8, 16), taken: false },
            ],
          }],
        }),
      )
      renderPage()

      expect(await screen.findByText('Hoy')).toBeInTheDocument()
    })

    it('does not show chips for a medication without a start time (FR-010)', async () => {
      stubApi(
        consultation({
          medications: [{ id: 'm1', name: 'Ibuprofeno', frequencyHours: 12, durationDays: 1, startTime: null, doses: [] }],
        }),
      )
      renderPage()

      expect(await screen.findByText('Ibuprofeno')).toBeInTheDocument()
      expect(screen.getByText('Cada 12 horas · 1 día')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Toma de/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Día/ })).not.toBeInTheDocument()
    })

    it('says "Cada hora" for a one-hour frequency', async () => {
      stubApi(
        consultation({
          medications: [{ id: 'm1', name: 'Suero', frequencyHours: 1, durationDays: 2, startTime: null, doses: [] }],
        }),
      )
      renderPage()

      expect(await screen.findByText('Cada hora · 2 días')).toBeInTheDocument()
    })
  })

  describe('with the desktop sidebar (mock 13)', () => {
    it("keeps the mock's responsive rule: one column with smaller margins below 1024px, two columns from there", async () => {
      useDesktop()
      stubApi(consultation())
      renderPage()

      await screen.findByRole('heading', { level: 1, name: 'Dra. López' })
      const main = screen.getByRole('main')
      expect(main).toHaveClass('px-6', 'py-8', 'lg:px-12', 'lg:py-11')
      const grid = screen.getByRole('heading', { name: 'Medicamentos' }).closest('.grid')!
      expect(grid).toHaveClass('lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]', 'lg:items-start')
      expect(grid).not.toHaveClass('grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]')
    })

    it('shows the header row with "Nueva consulta", the photo card and the active treatment', async () => {
      useDesktop()
      stubApi(consultation(), {
        childId: 'child-1',
        doses: [],
        activeTreatment: { medicationName: 'Amoxicilina', endsAt: new Date(2026, 0, 19, 8).toISOString(), otherCount: 0 },
      })
      renderPage()

      expect(await screen.findByRole('heading', { level: 1, name: 'Dra. López' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '← Mateo Morales' })).toHaveAttribute('href', '/children/child-1')
      expect(screen.getByRole('link', { name: 'Nueva consulta' })).toHaveAttribute('href', '/children/child-1/consultations/new')
      expect(screen.getByRole('heading', { level: 2, name: 'Foto de la receta' })).toBeInTheDocument()
      expect(screen.getByText('Leída con OCR en el dispositivo. La imagen no salió de tu equipo.')).toBeInTheDocument()
      const treatment = (await screen.findByText('Tratamiento activo')).parentElement!
      expect(within(treatment).getByText('Amoxicilina')).toBeInTheDocument()
      expect(within(treatment).getByText('termina el 19 ene')).toBeInTheDocument()
      expect(screen.getByRole('navigation', { name: 'Tus hijos' })).toBeInTheDocument()
    })

    it('says there is no active treatment when nothing is left ahead', async () => {
      useDesktop()
      stubApi(consultation())
      renderPage()

      expect(await screen.findByText('Ninguno')).toBeInTheDocument()
      expect(screen.getByText('sin tomas pendientes')).toBeInTheDocument()
    })
  })

  it('shows a not-found message for a missing consultation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ message: 'Consultation not found' }) }),
    )
    renderPage('missing')

    expect(await screen.findByText(/no se encontró esta consulta/i)).toBeInTheDocument()
  })

  it('shows a generic error when the consultation fails to load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ message: 'boom' }) }))
    renderPage()

    expect(await screen.findByText(/ocurrió un error al cargar la consulta/i)).toBeInTheDocument()
  })

  describe('photo viewer', () => {
    function stubConsultation() {
      stubApi(consultation({ symptoms: '', medications: [] }))
    }

    it('opens the photo in an in-app viewer from "Ver completa" (a data: URL in a new tab renders blank)', async () => {
      const user = userEvent.setup()
      stubConsultation()
      renderPage()

      await user.click(await screen.findByRole('button', { name: 'Ver completa' }))

      expect(screen.getByRole('dialog', { name: /tamaño completo/i })).toBeInTheDocument()
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
