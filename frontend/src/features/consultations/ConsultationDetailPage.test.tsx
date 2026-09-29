import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConsultationDetailPage } from './ConsultationDetailPage'

function renderPage(consultationId = 'c1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
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
    photoBase64: 'Zm9v', notes: 'Comió poco el domingo',
    symptoms: [
      { code: 'fever', name: 'Fiebre', category: 'General' },
      { code: 'cough', name: 'Tos', category: 'Respiratorio' },
    ],
    medications: [
      {
        id: 'm1', name: 'Amoxicilina 250 mg', frequencyHours: 8, durationDays: 3, startTime: '08:00',
        doses: [
          { id: 'd1', scheduledAt: at(8), taken: true, status: 'taken' },
          { id: 'd2', scheduledAt: at(16), taken: false, status: 'pending' },
          { id: 'd3', scheduledAt: at(23), taken: false, status: 'pending' },
        ],
      },
    ],
    ...overrides,
  }
}

function stubApi(detail: unknown, overview: unknown = { childId: 'child-1', doses: [], activeTreatment: null }) {
  const fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'PATCH') return { ok: true, json: async () => ({ id: 'd2', scheduledAt: '', taken: true, status: 'taken' }) }
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
    it('renders the header, photo card, symptoms, notes and the medication with its schedule (FR-013)', async () => {
      stubApi(consultation())
      renderPage()

      expect(await screen.findByRole('heading', { level: 1, name: 'Dra. López' })).toBeInTheDocument()
      expect(screen.getByText('15 enero 2026')).toBeInTheDocument()
      expect(await screen.findByRole('link', { name: '← Mateo Morales' })).toHaveAttribute('href', '/children/child-1')
      expect(screen.getByText('Foto de la receta')).toBeInTheDocument()
      expect(screen.getByText('Leída en tu equipo')).toBeInTheDocument()
      const symptoms = screen.getByRole('heading', { level: 2, name: 'Síntomas' }).parentElement!
      expect(within(symptoms).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Fiebre', 'Tos'])
      expect(screen.getByRole('heading', { level: 2, name: 'Notas previas a la consulta' })).toBeInTheDocument()
      expect(screen.getByText('Comió poco el domingo')).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 3, name: 'Amoxicilina 250 mg' })).toBeInTheDocument()
      expect(screen.getByText('Cada 8 horas · 3 días · primera toma 08:00')).toBeInTheDocument()
    })

    it('is a centered column of at most 430px, as the mock', async () => {
      stubApi(consultation())
      renderPage()

      await screen.findByRole('heading', { level: 1, name: 'Dra. López' })
      expect(screen.getByRole('main')).toHaveClass('mx-auto', 'max-w-[430px]')
    })

    it('falls back to a generic back link when the session has no linked account yet', async () => {
      const fetchMock = vi.fn().mockImplementation(async (input: string) => {
        const url = String(input)
        if (url.includes('/overview')) return { ok: true, json: async () => ({ childId: 'child-1', doses: [], activeTreatment: null }) }
        if (url.includes('/accounts/')) return { ok: false, status: 404, json: async () => ({ message: 'no account' }) }
        return { ok: true, json: async () => consultation() }
      })
      vi.stubGlobal('fetch', fetchMock)
      renderPage()

      expect(await screen.findByRole('link', { name: '← Volver al reporte de consultas' })).toBeInTheDocument()
    })

    it('omits the symptoms and notes sections when there are none (notes of only spaces count as none)', async () => {
      stubApi(consultation({ symptoms: [], notes: '  \n ' }))
      renderPage()

      await screen.findByRole('heading', { level: 1, name: 'Dra. López' })
      expect(screen.queryByRole('heading', { name: 'Síntomas' })).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Notas previas a la consulta' })).not.toBeInTheDocument()
      expect(screen.queryByRole('list')).not.toBeInTheDocument()
    })

    it("shows an earlier consultation's old symptoms text, whole, as its notes (FR-013)", async () => {
      stubApi(consultation({ symptoms: [], notes: 'Fiebre y tos desde el lunes' }))
      renderPage()

      expect(await screen.findByText('Fiebre y tos desde el lunes')).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 2, name: 'Notas previas a la consulta' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Síntomas' })).not.toBeInTheDocument()
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
      expect(later).toHaveClass('bg-slate-100') // the server says it hasn't come yet
    })

    it('groups the doses of the day by moment of the day, skipping the empty ones, and marking still works (specs/015)', async () => {
      const user = userEvent.setup()
      stubApi(
        consultation({
          medications: [{
            id: 'm1', name: 'Amoxicilina', frequencyHours: 8, durationDays: 1, startTime: '00:00',
            doses: [
              { id: 'd1', scheduledAt: at(0), taken: false, status: 'pending' },
              { id: 'd2', scheduledAt: at(8), taken: false, status: 'pending' },
              { id: 'd3', scheduledAt: at(16), taken: false, status: 'pending' },
            ],
          }],
        }),
      )
      renderPage()

      const morning = await screen.findByRole('group', { name: 'Mañana, Amoxicilina' })
      expect(within(morning).getByRole('button', { name: 'Toma de 08:00' })).toBeInTheDocument()
      expect(within(screen.getByRole('group', { name: 'Tarde, Amoxicilina' })).getByRole('button', { name: 'Toma de 16:00' })).toBeInTheDocument()
      expect(within(screen.getByRole('group', { name: 'Noche, Amoxicilina' })).getByRole('button', { name: 'Toma de 00:00' })).toBeInTheDocument()
      expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Mañana, Amoxicilina', 'Tarde, Amoxicilina', 'Noche, Amoxicilina'])

      await user.click(within(morning).getByRole('button', { name: 'Toma de 08:00' }))
      await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true))
    })

    it('shows only the moments that have doses', async () => {
      stubApi(
        consultation({
          medications: [{
            id: 'm1', name: 'Amoxicilina', frequencyHours: 24, durationDays: 1, startTime: '09:00',
            doses: [{ id: 'd1', scheduledAt: at(9), taken: false, status: 'due' }],
          }],
        }),
      )
      renderPage()

      await screen.findByRole('group', { name: 'Mañana, Amoxicilina' })
      expect(screen.queryByRole('group', { name: 'Tarde, Amoxicilina' })).not.toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'Noche, Amoxicilina' })).not.toBeInTheDocument()
    })

    it('shows the medication progress above its doses and updates it when a dose is marked (specs/014)', async () => {
      const user = userEvent.setup()
      let taken = false
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
          const url = String(input)
          if (init?.method === 'PATCH') {
            taken = true
            return { ok: true, json: async () => ({ id: 'd2', scheduledAt: '', taken: true, status: 'taken' }) }
          }
          if (url.includes('/overview')) return { ok: true, json: async () => ({ childId: 'child-1', doses: [], activeTreatment: null }) }
          if (url.includes('/accounts/')) return { ok: true, json: async () => account }
          const base = consultation()
          base.medications[0].doses[1] = { id: 'd2', scheduledAt: at(16), taken, status: taken ? 'taken' : 'pending' }
          return { ok: true, json: async () => base }
        }),
      )
      renderPage()

      const bar = await screen.findByRole('progressbar', { name: 'Progreso de las tomas' })
      expect(screen.getByText('1 / 3 tomas')).toBeInTheDocument()
      expect(bar).toHaveAttribute('aria-valuenow', '1')

      await user.click(screen.getByRole('button', { name: 'Toma de 16:00' }))

      expect(await screen.findByText('2 / 3 tomas')).toBeInTheDocument()
      expect(screen.getByRole('progressbar', { name: 'Progreso de las tomas' })).toHaveAttribute('aria-valuenow', '2')
    })

    it('shows a dose "sin registrar" with a dashed border and those words, announced as its description (specs/013)', async () => {
      stubApi(
        consultation({
          medications: [{
            id: 'm1', name: 'Amoxicilina', frequencyHours: 8, durationDays: 1, startTime: '08:00',
            doses: [{ id: 'd1', scheduledAt: at(8), taken: false, status: 'unregistered' }],
          }],
        }),
      )
      renderPage()

      const chip = await screen.findByRole('button', { name: 'Toma de 08:00' })
      expect(chip).toHaveClass('border-dashed', 'border-slate-400')
      expect(chip).not.toHaveClass('bg-pending-soft')
      expect(chip).toHaveAttribute('aria-pressed', 'false')
      expect(chip).toHaveTextContent('sin registrar')
      expect(chip).toHaveAccessibleDescription('Sin registrar')
      expect(chip).toHaveAccessibleName('Toma de 08:00')
    })

    it('follows the server, not the phone clock: a dose the server says has not come stays grey even if it is past locally', async () => {
      stubApi(
        consultation({
          medications: [{
            id: 'm1', name: 'Amoxicilina', frequencyHours: 8, durationDays: 1, startTime: '08:00',
            doses: [{ id: 'd1', scheduledAt: at(9), taken: false, status: 'pending' }],
          }],
        }),
      )
      renderPage()

      expect(await screen.findByRole('button', { name: 'Toma de 09:00' })).toHaveClass('bg-slate-100')
    })

    it('shows a dose whose time already passed without being marked in amber', async () => {
      stubApi(
        consultation({
          medications: [{
            id: 'm1', name: 'Amoxicilina', frequencyHours: 8, durationDays: 1, startTime: '08:00',
            doses: [{ id: 'd1', scheduledAt: at(9), taken: false, status: 'due' }],
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
              { id: 'a', scheduledAt: at(8, 13), taken: true, status: 'taken' },
              { id: 'b', scheduledAt: at(20, 13), taken: true, status: 'taken' },
              { id: 'c', scheduledAt: at(8, 17), taken: false, status: 'pending' },
              { id: 'd', scheduledAt: at(20, 17), taken: false, status: 'pending' },
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
              { id: 'a', scheduledAt: at(8), taken: false, status: 'due' },
              { id: 'b', scheduledAt: at(8, 16), taken: false, status: 'pending' },
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
      expect(screen.getByText('El texto se leyó en tu equipo; la foto se guarda solo en tu cuenta.')).toBeInTheDocument()
      const treatment = (await screen.findByText('Tratamiento activo')).parentElement!
      expect(within(treatment).getByText('Amoxicilina')).toBeInTheDocument()
      expect(within(treatment).getByText('termina el 19 ene')).toBeInTheDocument()
      expect(screen.getByRole('navigation', { name: 'Tus hijos' })).toBeInTheDocument()
    })

    it('shows the symptoms and the notes in one card on the left, and each only when it has something', async () => {
      useDesktop()
      stubApi(consultation())
      const { unmount } = renderPage()

      const card = (await screen.findByRole('heading', { level: 2, name: 'Síntomas' })).parentElement!.parentElement!
      expect(within(card).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Fiebre', 'Tos'])
      expect(within(card).getByText('Comió poco el domingo')).toBeInTheDocument()
      unmount()

      stubApi(consultation({ notes: '' }))
      renderPage()
      expect(await screen.findByRole('heading', { level: 2, name: 'Síntomas' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Notas previas a la consulta' })).not.toBeInTheDocument()
    })

    it('shows only the notes when a consultation has no symptoms, and no card when it has neither', async () => {
      useDesktop()
      stubApi(consultation({ symptoms: [] }))
      const { unmount } = renderPage()
      expect(await screen.findByRole('heading', { level: 2, name: 'Notas previas a la consulta' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Síntomas' })).not.toBeInTheDocument()
      unmount()

      stubApi(consultation({ symptoms: [], notes: ' \n ' }))
      renderPage()
      await screen.findByRole('heading', { level: 1, name: 'Dra. López' })
      expect(screen.queryByRole('heading', { name: 'Notas previas a la consulta' })).not.toBeInTheDocument()
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
      stubApi(consultation({ symptoms: [], notes: '', medications: [] }))
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
