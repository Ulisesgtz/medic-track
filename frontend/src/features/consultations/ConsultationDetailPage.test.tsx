import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom'
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
      // The lists left are the calendar's (specs/019, both named); the symptom chips' list is unnamed.
      expect(screen.queryAllByRole('list').filter((l) => !l.getAttribute('aria-label'))).toHaveLength(0)
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

      const morning = await screen.findByRole('group', { name: 'Mañana, Amoxicilina, hoy' })
      expect(within(morning).getByRole('button', { name: 'Toma de 08:00' })).toBeInTheDocument()
      expect(within(screen.getByRole('group', { name: 'Tarde, Amoxicilina, hoy' })).getByRole('button', { name: 'Toma de 16:00' })).toBeInTheDocument()
      expect(within(screen.getByRole('group', { name: 'Noche, Amoxicilina, hoy' })).getByRole('button', { name: 'Toma de 00:00' })).toBeInTheDocument()
      expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Mañana, Amoxicilina, hoy', 'Tarde, Amoxicilina, hoy', 'Noche, Amoxicilina, hoy'])

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

      await screen.findByRole('group', { name: 'Mañana, Amoxicilina, hoy' })
      expect(screen.queryByRole('group', { name: 'Tarde, Amoxicilina, hoy' })).not.toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'Noche, Amoxicilina, hoy' })).not.toBeInTheDocument()
    })

    describe('ending the treatment early (specs/016)', () => {
      const ended = (endedAt: string | null, doses: unknown[]) =>
        consultation({
          medications: [{ id: 'm1', name: 'Amoxicilina', frequencyHours: 8, durationDays: 3, startTime: '08:00', endedAt, doses }],
        })

      it('offers "Finalizar tratamiento" while doses are ahead; Cancelar changes nothing', async () => {
        const user = userEvent.setup()
        const fetchMock = stubApi(consultation())
        renderPage()

        await user.click(await screen.findByRole('button', { name: 'Finalizar tratamiento' }))
        expect(screen.getByRole('dialog', { name: '¿Finalizar el tratamiento de Amoxicilina 250 mg?' })).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Cancelar' }))

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/end'))).toBe(false)
        expect(screen.getByRole('button', { name: 'Finalizar tratamiento' })).toHaveFocus()
      })

      it('confirming calls the endpoint and closes the dialog', async () => {
        const user = userEvent.setup()
        const fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
          const url = String(input)
          if (url.endsWith('/end')) return { ok: true, json: async () => ({ id: 'm1', endedAt: '2026-01-15T12:00:00Z', doses: [] }) }
          if (url.includes('/overview')) return { ok: true, json: async () => ({ childId: 'child-1', doses: [], activeTreatment: null }) }
          if (url.includes('/accounts/')) return { ok: true, json: async () => account }
          void init
          return { ok: true, json: async () => consultation() }
        })
        vi.stubGlobal('fetch', fetchMock)
        renderPage()

        await user.click(await screen.findByRole('button', { name: 'Finalizar tratamiento' }))
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Finalizar tratamiento' }))

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/end'))!
        expect(String(call[0])).toContain('/consultations/c1/medications/m1/end')
        expect(call[1].method).toBe('POST')
      })

      it('a failure says so in Spanish and keeps the dialog open', async () => {
        const user = userEvent.setup()
        vi.stubGlobal(
          'fetch',
          vi.fn().mockImplementation(async (input: string) => {
            const url = String(input)
            if (url.endsWith('/end')) return { ok: false, status: 500, json: async () => ({}) }
            if (url.includes('/overview')) return { ok: true, json: async () => ({ childId: 'child-1', doses: [], activeTreatment: null }) }
            if (url.includes('/accounts/')) return { ok: true, json: async () => account }
            return { ok: true, json: async () => consultation() }
          }),
        )
        renderPage()

        await user.click(await screen.findByRole('button', { name: 'Finalizar tratamiento' }))
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Finalizar tratamiento' }))

        expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos finalizar el tratamiento')
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      it('an ended treatment says when and how many of the doses that corresponded were marked, with canceled doses unmarkable', async () => {
        stubApi(
          ended('2026-01-15T12:00:00Z', [
            { id: 'd1', scheduledAt: at(8), taken: true, status: 'taken' },
            { id: 'd2', scheduledAt: at(16), taken: false, status: 'canceled' },
            { id: 'd3', scheduledAt: at(23), taken: false, status: 'canceled' },
          ]),
        )
        renderPage()

        expect(await screen.findByText('Terminado el 15 ene · 1 de 1 toma')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Finalizar tratamiento' })).not.toBeInTheDocument()
        const canceled = screen.getByRole('button', { name: 'Toma de 16:00' })
        expect(canceled).toBeDisabled()
        expect(canceled).toHaveAccessibleDescription('Cancelada')
        expect(canceled).toHaveClass('border-dashed', 'disabled:opacity-100')
        expect(screen.getByText('1 / 1 toma')).toBeInTheDocument() // the bar leaves the canceled ones out
      })

      it('offers nothing when no dose is left ahead', async () => {
        stubApi(ended(null, [{ id: 'd1', scheduledAt: at(8), taken: false, status: 'unregistered' }]))
        renderPage()

        await screen.findByRole('button', { name: 'Toma de 08:00' })
        expect(screen.queryByRole('button', { name: 'Finalizar tratamiento' })).not.toBeInTheDocument()
      })
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

    it('opens on today even when the medication has no doses that day, and says so; tapping another day shows its doses (specs/023)', async () => {
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
      const user = userEvent.setup()
      renderPage()

      // Jan 15 is inside the treatment but this medication has no doses that day.
      expect(await screen.findByText('Tomas de hoy')).toBeInTheDocument()
      expect(screen.getByText('Este día no tiene tomas.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Toma de/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Día (anterior|siguiente)/ })).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /^17 de enero/ }))

      expect(screen.getByText('Tomas del 17 de enero')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Toma de 08:00' })).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByRole('button', { name: 'Toma de 20:00' })).toBeInTheDocument()
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

  describe('extending the treatment (specs/020)', () => {
    const withExtension = (extra: Record<string, unknown>) =>
      consultation({
        medications: [
          {
            id: 'm1', name: 'Amoxicilina', frequencyHours: 8, durationDays: 3, startTime: '08:00', endedAt: null,
            doses: [
              { id: 'd1', scheduledAt: at(8, 13), taken: false, status: 'unregistered' },
              { id: 'd2', scheduledAt: at(16, 13), taken: false, status: 'unregistered' },
              { id: 'd3', scheduledAt: at(23, 20), taken: false, status: 'pending' },
            ],
            extendableDoses: 2,
            extensions: [],
            ...extra,
          },
        ],
      })

    function stubExtend(extendResponse: { ok: boolean; status?: number; body?: unknown }) {
      const fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/extend')) {
          return { ok: extendResponse.ok, status: extendResponse.status ?? 200, json: async () => extendResponse.body ?? {} }
        }
        if (url.includes('/overview')) return { ok: true, json: async () => ({ childId: 'child-1', doses: [], activeTreatment: null }) }
        if (url.includes('/accounts/')) return { ok: true, json: async () => account }
        void init
        return { ok: true, json: async () => withExtension({}) }
      })
      vi.stubGlobal('fetch', fetchMock)
      return fetchMock
    }

    const extendCalls = (fetchMock: ReturnType<typeof vi.fn>) =>
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/extend'))

    it('offers "Recorrer tratamiento" only with unregistered doses still to cover, never on its own', async () => {
      const fetchMock = stubExtend({ ok: true })
      renderPage()

      expect(await screen.findByRole('button', { name: 'Recorrer tratamiento' })).toBeInTheDocument()
      expect(extendCalls(fetchMock)).toHaveLength(0)
    })

    it('offers nothing without doses to cover, when ended, or from a backend that predates the feature', async () => {
      stubApi(withExtension({ extendableDoses: 0 }))
      const first = renderPage()
      await screen.findByRole('heading', { level: 3, name: 'Amoxicilina' })
      expect(screen.queryByRole('button', { name: 'Recorrer tratamiento' })).not.toBeInTheDocument()
      first.unmount()

      stubApi(withExtension({ endedAt: at(9, 14), extendableDoses: 0 }))
      const second = renderPage()
      await screen.findByText(/^Terminado el/)
      expect(screen.queryByRole('button', { name: 'Recorrer tratamiento' })).not.toBeInTheDocument()
      second.unmount()

      stubApi(withExtension({ extendableDoses: undefined, extensions: undefined }))
      renderPage()
      await screen.findByRole('heading', { level: 3, name: 'Amoxicilina' })
      expect(screen.queryByRole('button', { name: 'Recorrer tratamiento' })).not.toBeInTheDocument()
    })

    it('asks first: cancelling changes nothing and gives the focus back', async () => {
      const user = userEvent.setup()
      const fetchMock = stubExtend({ ok: true })
      renderPage()

      await user.click(await screen.findByRole('button', { name: 'Recorrer tratamiento' }))
      const dialog = screen.getByRole('dialog', { name: '¿Recorrer el tratamiento de Amoxicilina?' })
      expect(within(dialog).getByRole('textbox', { name: 'Tomas a agregar' })).toHaveValue('2')
      await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(extendCalls(fetchMock)).toHaveLength(0)
      expect(screen.getByRole('button', { name: 'Recorrer tratamiento' })).toHaveFocus()
    })

    it('confirming sends the proposed number and closes the dialog', async () => {
      const user = userEvent.setup()
      const fetchMock = stubExtend({ ok: true, body: withExtension({}).medications[0] })
      renderPage()

      await user.click(await screen.findByRole('button', { name: 'Recorrer tratamiento' }))
      await user.click(screen.getByRole('button', { name: 'Sí, recorrer' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      const [url, init] = extendCalls(fetchMock)[0]
      expect(String(url)).toContain('/consultations/c1/medications/m1/extend')
      expect(JSON.parse(String(init.body))).toEqual({ doses: 2 })
    })

    it('sends a number the parent typed', async () => {
      const user = userEvent.setup()
      const fetchMock = stubExtend({ ok: true, body: withExtension({}).medications[0] })
      renderPage()

      await user.click(await screen.findByRole('button', { name: 'Recorrer tratamiento' }))
      const field = screen.getByRole('textbox', { name: 'Tomas a agregar' })
      await user.clear(field)
      await user.type(field, '5')
      expect(screen.getByRole('status')).toHaveTextContent('lo ingresaste tú manualmente')
      await user.click(screen.getByRole('button', { name: 'Sí, recorrer' }))

      await waitFor(() => expect(extendCalls(fetchMock)).toHaveLength(1))
      expect(JSON.parse(String(extendCalls(fetchMock)[0][1].body))).toEqual({ doses: 5 })
    })

    it('if it was already done (another tap or device) the dialog closes without an error', async () => {
      const user = userEvent.setup()
      stubExtend({
        ok: false,
        status: 400,
        body: { error: 'validation_error', message: 'One or more fields are invalid', details: [{ field: 'medicationId', message: 'nothing_to_extend' }] },
      })
      renderPage()

      await user.click(await screen.findByRole('button', { name: 'Recorrer tratamiento' }))
      await user.click(screen.getByRole('button', { name: 'Sí, recorrer' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(screen.queryByText(/No pudimos recorrer/)).not.toBeInTheDocument()
    })

    it('if another device extends it while the dialog is open, the dialog closes and does not come back', async () => {
      const user = userEvent.setup()
      let extendable = 2
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (input: string) => {
          const url = String(input)
          if (url.includes('/overview')) return { ok: true, json: async () => ({ childId: 'child-1', doses: [], activeTreatment: null }) }
          if (url.includes('/accounts/')) return { ok: true, json: async () => account }
          return { ok: true, json: async () => withExtension({ extendableDoses: extendable }) }
        }),
      )
      renderPage()
      await user.click(await screen.findByRole('button', { name: 'Recorrer tratamiento' }))
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      // The next refresh says there is nothing left to cover.
      extendable = 0
      window.dispatchEvent(new Event('visibilitychange')) // coming back to the app refetches the detail
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      // Later new doses turn unregistered: the button is offered again, the dialog is not open by itself.
      extendable = 3
      window.dispatchEvent(new Event('visibilitychange')) // coming back to the app refetches the detail
      expect(await screen.findByRole('button', { name: 'Recorrer tratamiento' })).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('a server failure says so in Spanish and keeps the dialog open', async () => {
      const user = userEvent.setup()
      stubExtend({ ok: false, status: 500, body: { error: 'internal_error', message: 'Could not extend the treatment' } })
      renderPage()

      await user.click(await screen.findByRole('button', { name: 'Recorrer tratamiento' }))
      await user.click(screen.getByRole('button', { name: 'Sí, recorrer' }))

      expect(await screen.findByText('No pudimos recorrer el tratamiento. Inténtalo de nuevo.')).toBeInTheDocument()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('says it was extended and when, and that the number was typed by the parent when it was', async () => {
      stubApi(
        withExtension({
          extendableDoses: 0,
          extensions: [
            { createdAt: at(10, 14), proposedDoses: 2, addedDoses: 2, manual: false },
            { createdAt: at(11, 15), proposedDoses: 1, addedDoses: 4, manual: true },
          ],
        }),
      )
      renderPage()

      // The latest one: 15 ene, 4 doses, typed by the parent.
      expect(await screen.findByText('Se recorrió el 15 ene · +4 tomas · número ingresado manualmente')).toBeInTheDocument()
    })

    it('the line of an extension with the proposed number and a single dose has no note', async () => {
      stubApi(withExtension({ extendableDoses: 0, extensions: [{ createdAt: at(10, 14), proposedDoses: 1, addedDoses: 1, manual: false }] }))
      renderPage()

      expect(await screen.findByText('Se recorrió el 14 ene · +1 toma')).toBeInTheDocument()
    })
  })

  describe('treatment calendar (specs/019)', () => {
    it('sits before the medications on the phone, with no list of its own: today is chosen and marking is on the card', async () => {
      const fetchMock = stubApi(consultation())
      const user = userEvent.setup()
      renderPage()

      const heading = await screen.findByRole('heading', { name: 'Calendario del tratamiento' })
      const medicationsHeading = screen.getByRole('heading', { level: 2, name: 'Medicamentos' })
      expect(heading.compareDocumentPosition(medicationsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(screen.queryByRole('list', { name: 'Tomas del día' })).not.toBeInTheDocument()
      expect(screen.getByText('Tomas de hoy')).toBeInTheDocument()
      // Each dose is on screen once: only the card of its medication shows it (specs/023).
      expect(screen.getAllByRole('button', { name: 'Toma de 16:00' })).toHaveLength(1)

      await user.click(screen.getByRole('button', { name: 'Toma de 16:00' }))

      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')
      expect(String(patch?.[0])).toContain('/consultations/c1/doses/d2')
    })

    describe('the calendar chooses the day of every medication (specs/023)', () => {
      const twoMedications = () =>
        consultation({
          medications: [
            {
              id: 'm1', name: 'Amoxicilina', frequencyHours: 24, durationDays: 3, startTime: '08:00',
              doses: [
                { id: 'a15', scheduledAt: at(8, 15), taken: false, status: 'due' },
                { id: 'a16', scheduledAt: at(8, 16), taken: false, status: 'pending' },
                { id: 'a17', scheduledAt: at(8, 17), taken: false, status: 'pending' },
              ],
            },
            {
              id: 'm2', name: 'Paracetamol', frequencyHours: 24, durationDays: 1, startTime: '12:00',
              doses: [{ id: 'p15', scheduledAt: at(12, 15), taken: false, status: 'due' }],
            },
          ],
        })
      const card = (name: string) => within(screen.getByRole('heading', { level: 3, name }).closest('article')!)

      it('opens on today for both cards', async () => {
        stubApi(twoMedications())
        renderPage()

        await screen.findByRole('heading', { level: 3, name: 'Amoxicilina' })
        expect(screen.getAllByText('Tomas de hoy')).toHaveLength(2)
        expect(card('Amoxicilina').getByRole('button', { name: 'Toma de 08:00' })).toBeInTheDocument()
        expect(card('Paracetamol').getByRole('button', { name: 'Toma de 12:00' })).toBeInTheDocument()
      })

      it('tapping a day changes both cards at once, and a medication without doses that day says so', async () => {
        stubApi(twoMedications())
        const user = userEvent.setup()
        renderPage()
        await screen.findByRole('heading', { level: 3, name: 'Amoxicilina' })

        await user.click(screen.getByRole('button', { name: /^16 de enero/ }))

        expect(screen.getAllByText('Tomas del 16 de enero')).toHaveLength(2)
        expect(card('Amoxicilina').getByRole('button', { name: 'Toma de 08:00' })).toBeInTheDocument()
        expect(card('Paracetamol').queryByRole('button')).not.toBeInTheDocument()
        expect(card('Paracetamol').getByText('Este día no tiene tomas.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /^16 de enero/ })).toHaveAttribute('aria-pressed', 'true')
      })

      it('marking a dose of another day updates the card and keeps that day chosen', async () => {
        const fetchMock = stubApi(twoMedications())
        const user = userEvent.setup()
        renderPage()
        await screen.findByRole('heading', { level: 3, name: 'Amoxicilina' })
        await user.click(screen.getByRole('button', { name: /^16 de enero/ }))

        await user.click(card('Amoxicilina').getByRole('button', { name: 'Toma de 08:00' }))

        const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')
        expect(String(patch?.[0])).toContain('/consultations/c1/doses/a16')
        expect(screen.getByRole('button', { name: /^16 de enero/ })).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getAllByText('Tomas del 16 de enero')).toHaveLength(2)
      })

      it('progress and the end button count the whole medication, whatever day is chosen', async () => {
        stubApi(twoMedications())
        const user = userEvent.setup()
        renderPage()
        await screen.findByRole('heading', { level: 3, name: 'Amoxicilina' })

        await user.click(screen.getByRole('button', { name: /^17 de enero/ }))

        expect(card('Amoxicilina').getByText('0 / 3 tomas')).toBeInTheDocument()
        expect(card('Amoxicilina').getByRole('button', { name: 'Finalizar tratamiento' })).toBeInTheDocument()
      })

      it('names the day in the groups of doses, so a screen reader knows which day they belong to', async () => {
        stubApi(twoMedications())
        const user = userEvent.setup()
        renderPage()
        await screen.findByRole('heading', { level: 3, name: 'Amoxicilina' })
        expect(screen.getByRole('group', { name: 'Mañana, Amoxicilina, hoy' })).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: /^16 de enero/ }))

        expect(screen.getByRole('group', { name: 'Mañana, Amoxicilina, 16 de enero' })).toBeInTheDocument()
      })

      it('on the phone, tapping a day brings the first card into view; on the web it does not move the page', async () => {
        const scrollIntoView = vi.fn()
        Element.prototype.scrollIntoView = scrollIntoView
        stubApi(twoMedications())
        const user = userEvent.setup()
        const phone = renderPage()
        await screen.findByRole('heading', { level: 3, name: 'Amoxicilina' })

        await user.click(screen.getByRole('button', { name: /^16 de enero/ }))

        expect(scrollIntoView).toHaveBeenCalledTimes(1)
        expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' })
        expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByRole('heading', { level: 3, name: 'Amoxicilina' }).closest('article'))
        phone.unmount()
        vi.unstubAllGlobals()

        scrollIntoView.mockClear()
        useDesktop()
        stubApi(twoMedications())
        renderPage()
        await screen.findByRole('heading', { level: 3, name: 'Amoxicilina' })
        await user.click(screen.getByRole('button', { name: /^16 de enero/ }))

        expect(scrollIntoView).not.toHaveBeenCalled()
      })

      it('does not carry the tapped day over to another consultation', async () => {
        const other = { ...twoMedications(), id: 'c2' }
        vi.stubGlobal(
          'fetch',
          vi.fn().mockImplementation(async (input: string) => {
            const url = String(input)
            if (url.includes('/overview')) return { ok: true, json: async () => ({ childId: 'child-1', doses: [], activeTreatment: null }) }
            if (url.includes('/accounts/')) return { ok: true, json: async () => account }
            return { ok: true, json: async () => (url.includes('/consultations/c2') ? other : twoMedications()) }
          }),
        )
        const user = userEvent.setup()
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        render(
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/consultations/c1']}>
              <Link to="/consultations/c2">otra consulta</Link>
              <Routes>
                <Route path="/consultations/:consultationId" element={<ConsultationDetailPage />} />
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>,
        )
        await screen.findByRole('heading', { level: 3, name: 'Amoxicilina' })
        await user.click(screen.getByRole('button', { name: /^16 de enero/ }))
        expect(screen.getAllByText('Tomas del 16 de enero')).toHaveLength(2)

        await user.click(screen.getByRole('link', { name: 'otra consulta' }))

        await waitFor(() => expect(screen.getAllByText('Tomas de hoy')).toHaveLength(2))
        expect(screen.getByRole('button', { name: /^15 de enero/ })).toHaveAttribute('aria-pressed', 'true')
      })

      it('a treatment ended before its first dose (every dose canceled) still shows those doses', async () => {
        stubApi(
          consultation({
            medications: [{
              id: 'm1', name: 'Amoxicilina', frequencyHours: 24, durationDays: 2, startTime: '16:00', endedAt: at(9, 15),
              doses: [
                { id: 'c1', scheduledAt: at(16, 15), taken: false, status: 'canceled' },
                { id: 'c2', scheduledAt: at(16, 16), taken: false, status: 'canceled' },
              ],
            }],
          }),
        )
        renderPage()

        // No calendar (it has no day to mark), but the card shows the first day's canceled dose, disabled.
        expect(await screen.findByText('Tomas de hoy')).toBeInTheDocument()
        expect(screen.queryByRole('heading', { name: 'Calendario del tratamiento' })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Toma de 16:00' })).toBeDisabled()
      })

      it('a finished treatment opens on its first day', async () => {
        vi.setSystemTime(new Date(2026, 1, 20, 12))
        stubApi(twoMedications())
        renderPage()

        await screen.findByRole('heading', { level: 3, name: 'Amoxicilina' })

        expect(screen.getAllByText('Tomas del 15 de enero')).toHaveLength(2)
        expect(screen.getByRole('button', { name: /^15 de enero/ })).toHaveAttribute('aria-pressed', 'true')
      })
    })

    it('leaves no gap when no medication has a day to show (no start time, so no doses)', async () => {
      stubApi(consultation({ medications: [{ id: 'm1', name: 'Ibuprofeno', frequencyHours: 12, durationDays: 1, startTime: null, doses: [] }] }))
      renderPage()

      await screen.findByRole('heading', { level: 2, name: 'Medicamentos' })
      expect(screen.queryByRole('heading', { name: 'Calendario del tratamiento' })).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 2, name: 'Medicamentos' }).closest('section')?.previousElementSibling?.tagName).not.toBe('DIV')
    })

    it('shows "Cómo leer el calendario" in the web design only, in the right column', async () => {
      stubApi(consultation())
      const phone = renderPage()
      await screen.findByRole('heading', { name: 'Calendario del tratamiento' })
      expect(screen.queryByRole('region', { name: 'Cómo leer el calendario' })).not.toBeInTheDocument()
      phone.unmount()
      vi.unstubAllGlobals()

      useDesktop()
      stubApi(consultation())
      renderPage()
      const legend = await screen.findByRole('region', { name: 'Cómo leer el calendario' })
      expect(legend.closest('aside')).not.toBeNull()
    })

    it('has no key when there is nothing on the calendar (no medication has doses)', async () => {
      useDesktop()
      stubApi(consultation({ medications: [{ id: 'm1', name: 'Ibuprofeno', frequencyHours: 12, durationDays: 1, startTime: null, doses: [] }] }))
      renderPage()

      await screen.findByRole('heading', { level: 2, name: 'Medicamentos' })
      expect(screen.queryByRole('region', { name: 'Cómo leer el calendario' })).not.toBeInTheDocument()
    })

    it('has its own place on the web: on top of the left column, above the medications', async () => {
      useDesktop()
      stubApi(consultation())
      renderPage()

      const heading = await screen.findByRole('heading', { name: 'Calendario del tratamiento' })
      const medicationsHeading = screen.getByRole('heading', { level: 2, name: 'Medicamentos' })
      expect(heading.compareDocumentPosition(medicationsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(heading.closest('aside')).toBeNull()
    })
  })
})
