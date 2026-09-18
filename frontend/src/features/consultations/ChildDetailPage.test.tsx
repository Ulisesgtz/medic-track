import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChildDetailPage } from './ChildDetailPage'

vi.mock('tesseract.js', () => ({
  default: { recognize: vi.fn().mockResolvedValue({ data: { text: '' } }) },
}))

function renderPage(childId = 'child-1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/children/${childId}`]}>
        <Routes>
          <Route path="/children/:childId" element={<ChildDetailPage />} />
          <Route path="/consultations/:consultationId" element={<div>CONSULTATION DETAIL</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ChildDetailPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    window.localStorage.clear()
  })

  describe('with a saved account', () => {
    const account = {
      id: 'a1', firstName: 'Ana', lastName: 'Morales', email: 'ana@example.com',
      countryCode: null, stateCode: null, plan: 'free',
      children: [
        { id: 'child-1', firstName: 'Mateo', lastName: 'Morales', birthDate: '2021-03-14', height: null, weight: null },
      ],
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 8, 16, 12))
      window.localStorage.setItem('peditrack.accountId', 'a1')
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (input: string) => ({
          ok: true,
          json: async () =>
            String(input).includes('/accounts/')
              ? account
              : { childId: 'child-1', consultations: [{ id: 'c1', doctorName: 'Dra. López', consultDate: '2026-09-15', symptoms: '', medicationCount: 1 }] },
        })),
      )
    })

    it("titles the screen with the child's age and shows their name and birth date", async () => {
      renderPage()

      expect(await screen.findByRole('heading', { level: 1, name: '5 años 6 meses' })).toBeInTheDocument()
      expect(screen.getByText('Mateo Morales · 14 mar 2021')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Volver a mi home/ })).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 2, name: 'Consultas' })).toBeInTheDocument()
    })

    it('drops the back link and moves the register button beside the title when the sidebar is on screen', async () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
      )
      renderPage()

      await screen.findByRole('heading', { level: 1, name: '5 años 6 meses' })
      expect(screen.queryByRole('link', { name: /Volver a mi home/ })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Nueva consulta' })).toBeInTheDocument()
      expect(screen.getByRole('navigation', { name: 'Tus hijos' })).toBeInTheDocument()
    })
  })

  it('shows an empty state when the child has no consultations (FR-002)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ childId: 'child-1', consultations: [] }) }),
    )
    renderPage()

    expect(await screen.findByText(/todavía no hay consultas/i)).toBeInTheDocument()
  })

  it('lists a card per consultation with doctor and date (FR-001)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          childId: 'child-1',
          consultations: [{ id: 'c1', doctorName: 'Dra. López', consultDate: '2026-01-15', symptoms: '', medicationCount: 1 }],
        }),
      }),
    )
    renderPage()

    expect(await screen.findByText('Dra. López')).toBeInTheDocument()
    const card = screen.getByRole('link', { name: /Dra. López/ })
    expect(card).toHaveAttribute('href', '/consultations/c1')
    expect(within(card).getByText('15 ene 2026')).toBeInTheDocument()
  })

  describe('summary row and today panel', () => {
    const consultations = [
      { id: 'c2', doctorName: 'Dra. López', consultDate: '2026-03-01', symptoms: 'Fiebre y tos', medicationCount: 2 },
      { id: 'c0', doctorName: 'Dra. López', consultDate: '2024-11-02', symptoms: '', medicationCount: 1 },
    ]
    const dose = (id: string, at: string, name: string, taken: boolean) => ({
      id, consultationId: 'c2', medicationName: name, scheduledAt: at, taken,
    })

    function stubApi(overview: unknown, overviewOk = true) {
      const fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
        const url = String(input)
        if (init?.method === 'PATCH') return { ok: true, json: async () => ({ id: 'd2', scheduledAt: '', taken: true }) }
        if (url.includes('/overview')) return { ok: overviewOk, status: overviewOk ? 200 : 500, json: async () => overview }
        return { ok: true, json: async () => ({ childId: 'child-1', consultations }) }
      })
      vi.stubGlobal('fetch', fetchMock)
      return fetchMock
    }

    it("shows today's unmarked doses, the consultation count since the first one, and the running treatment", async () => {
      stubApi({
        childId: 'child-1',
        doses: [
          dose('d1', new Date(2026, 8, 18, 8).toISOString(), 'Amoxicilina', true),
          dose('d2', new Date(2026, 8, 18, 16).toISOString(), 'Amoxicilina', false),
          dose('d3', new Date(2026, 8, 18, 21).toISOString(), 'Paracetamol', false),
        ],
        activeTreatment: { medicationName: 'Amoxicilina', endsAt: new Date(2026, 8, 19, 8).toISOString(), otherCount: 0 },
      })
      renderPage()

      const tomas = (await screen.findByText('Tomas de hoy', { selector: 'p' })).parentElement!
      expect(within(tomas).getByText('2')).toBeInTheDocument()
      expect(within(tomas).getByText('sin marcar')).toBeInTheDocument()
      const consultas = screen.getByText('Consultas', { selector: 'p' }).parentElement!
      expect(within(consultas).getByText('2')).toBeInTheDocument()
      expect(within(consultas).getByText('desde 2024')).toBeInTheDocument()
      const tratamiento = screen.getByText('Tratamiento activo').parentElement!
      expect(within(tratamiento).getByText('Amoxicilina')).toBeInTheDocument()
      expect(within(tratamiento).getByText('termina el 19 sep')).toBeInTheDocument()
    })

    it('lists the consultations with their symptoms and medication count', async () => {
      stubApi({ childId: 'child-1', doses: [], activeTreatment: null })
      renderPage()

      expect(await screen.findByText('Fiebre y tos · 2 medicamentos')).toBeInTheDocument()
      expect(screen.getByText('1 medicamento')).toBeInTheDocument()
    })

    it('lists today\'s doses with a chip each: "Tomada" or "Marcar"', async () => {
      stubApi({
        childId: 'child-1',
        doses: [
          dose('d1', new Date(2026, 8, 18, 8).toISOString(), 'Amoxicilina', true),
          dose('d2', new Date(2026, 8, 18, 16).toISOString(), 'Amoxicilina', false),
        ],
        activeTreatment: null,
      })
      renderPage()

      const panel = (await screen.findByRole('heading', { name: 'Tomas de hoy' })).closest('section')!
      expect(within(panel).getByText('08:00 Amoxicilina')).toBeInTheDocument()
      expect(within(panel).getByText('16:00 Amoxicilina')).toBeInTheDocument()
      expect(within(panel).getByRole('button', { name: /Tomada: 08:00 Amoxicilina/ })).toHaveAttribute('aria-pressed', 'true')
      expect(within(panel).getByRole('button', { name: 'Marcar como tomada: 16:00 Amoxicilina' })).toHaveAttribute('aria-pressed', 'false')
    })

    it('marks a dose from the panel and reloads the overview', async () => {
      const user = userEvent.setup()
      const fetchMock = stubApi({
        childId: 'child-1',
        doses: [dose('d2', new Date(2026, 8, 18, 16).toISOString(), 'Amoxicilina', false)],
        activeTreatment: null,
      })
      renderPage()

      await user.click(await screen.findByRole('button', { name: 'Marcar como tomada: 16:00 Amoxicilina' }))

      await waitFor(() => {
        const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')
        expect(patch![0]).toContain('/consultations/c2/doses/d2')
        expect(JSON.parse(patch![1].body)).toEqual({ taken: true })
      })
      await waitFor(() =>
        expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/overview')).length).toBeGreaterThan(1),
      )
    })

    it('unmarks a dose that is already taken', async () => {
      const user = userEvent.setup()
      const fetchMock = stubApi({
        childId: 'child-1',
        doses: [dose('d1', new Date(2026, 8, 18, 8).toISOString(), 'Amoxicilina', true)],
        activeTreatment: null,
      })
      renderPage()

      await user.click(await screen.findByRole('button', { name: /Tomada: 08:00 Amoxicilina/ }))

      await waitFor(() => {
        const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')
        expect(JSON.parse(patch![1].body)).toEqual({ taken: false })
      })
    })

    it('sends the parent\'s local day as the overview window', async () => {
      const fetchMock = stubApi({ childId: 'child-1', doses: [], activeTreatment: null })
      renderPage()

      await screen.findByText('No hay tomas programadas para hoy.')
      const url = new URL(String(fetchMock.mock.calls.find(([u]) => String(u).includes('/overview'))![0]))
      const from = new Date(url.searchParams.get('from')!)
      const to = new Date(url.searchParams.get('to')!)
      expect(from.getHours()).toBe(0)
      expect(to.getTime() - from.getTime()).toBeGreaterThanOrEqual(23 * 3600 * 1000)
    })

    it('says so when there are no doses today, and when every dose is already marked', async () => {
      stubApi({ childId: 'child-1', doses: [], activeTreatment: null })
      const first = renderPage()

      expect(await screen.findByText('sin tomas hoy')).toBeInTheDocument()
      expect(screen.getByText('Ninguno')).toBeInTheDocument()
      expect(screen.getByText('sin tomas pendientes')).toBeInTheDocument()
      first.unmount()

      stubApi({
        childId: 'child-1',
        doses: [dose('d1', new Date(2026, 8, 18, 8).toISOString(), 'Amoxicilina', true)],
        activeTreatment: null,
      })
      renderPage()
      expect(await screen.findByText('todas marcadas')).toBeInTheDocument()
    })

    it('adds "+N" to the running treatment when more medications still have doses ahead', async () => {
      stubApi({
        childId: 'child-1',
        doses: [],
        activeTreatment: { medicationName: 'Amoxicilina', endsAt: new Date(2026, 8, 23, 8).toISOString(), otherCount: 2 },
      })
      renderPage()

      expect(await screen.findByText('Amoxicilina +2')).toBeInTheDocument()
    })

    it('shows placeholders, without breaking the page, when the overview fails to load', async () => {
      stubApi({ message: 'boom' }, false)
      renderPage()

      expect(await screen.findByText('No se pudieron cargar las tomas de hoy.')).toBeInTheDocument()
      expect(screen.getAllByText('no disponible')).toHaveLength(2)
      expect(screen.getAllByText('Dra. López', { selector: 'p' })).toHaveLength(2)
    })
  })

  it('shows the empty state and "sin consultas" when there are no consultations yet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: string) => ({
        ok: true,
        json: async () =>
          String(input).includes('/overview')
            ? { childId: 'child-1', doses: [], activeTreatment: null }
            : { childId: 'child-1', consultations: [] },
      })),
    )
    renderPage()

    await screen.findByText(/todavía no hay consultas/i)
    expect(screen.getByText('sin consultas')).toBeInTheDocument()
  })

  it('opens the registration modal, submits, and navigates to the new consultation detail', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_input, init) => {
        if (init?.method === 'POST') {
          return {
            ok: true,
            json: async () => ({
              id: 'new-consultation', childId: 'child-1', doctorName: 'Dra. López', consultDate: '2026-01-15',
              photoBase64: 'Zm9v', symptoms: '', medications: [],
            }),
          } as Response
        }
        return { ok: true, json: async () => ({ childId: 'child-1', consultations: [] }) } as Response
      }),
    )
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Nueva consulta' }))
    expect(await screen.findByRole('heading', { name: 'Registrar consulta' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Doctor'), 'Dra. López')
    await user.type(screen.getByLabelText('Fecha de la consulta'), '2026-01-15')
    await user.upload(screen.getByLabelText('Foto de la receta'), new File(['x'], 'r.jpg', { type: 'image/jpeg' }))
    await user.type(document.getElementById('medications.0.name')!, 'Amoxicilina')
    await user.type(document.getElementById('medications.0.frequencyHours')!, '8')
    await user.type(document.getElementById('medications.0.durationDays')!, '3')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('CONSULTATION DETAIL')).toBeInTheDocument()
  })

  it('closes the modal when clicking Cancelar', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ childId: 'child-1', consultations: [] }) }))
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Nueva consulta' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Registrar consulta' })).not.toBeInTheDocument())
  })

  it('shows a not-found message when the child does not exist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ message: 'Child not found' }) }),
    )
    renderPage('missing-child')

    expect(await screen.findByText(/no se encontró este hijo/i)).toBeInTheDocument()
  })
})
