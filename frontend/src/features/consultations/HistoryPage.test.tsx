import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HistoryPage } from './HistoryPage'
import { HistoryEntry } from './HistoryEntry'

vi.mock('../../shared/catalog/useCatalog', () => ({
  SYMPTOMS_QUERY_KEY: ['catalog', 'symptoms'],
  useSymptoms: () => ({
    data: [
      { code: 'fever', name: 'Fiebre', category: 'General' },
      { code: 'cough', name: 'Tos', category: 'Respiratorio' },
    ],
    isPending: false,
    isError: false,
  }),
}))

// specs/031-historial-busqueda-filtros: the paid plan's history screen, in both designs.

const consultations = [
  { id: 'c2', doctorName: 'Dr. Iván Robles', consultDate: '2026-03-05', notes: 'Control', symptomNames: ['Fiebre'], medicationCount: 1 },
  { id: 'c1', doctorName: 'Dra. López', consultDate: '2026-01-10', notes: 'Fiebre y tos', symptomNames: ['Fiebre', 'Tos'], medicationCount: 2, recordOnly: true },
]
const options = { doctors: ['Dr. Iván Robles', 'Dra. López'], medications: ['Amoxicilina 250 mg', 'Paracetamol'] }

const account = (plan: string) => ({
  id: 'a1', firstName: 'Ana', lastName: 'Morales', email: 'ana@example.com', countryCode: null, stateCode: null, plan,
  children: [{ id: 'child-1', firstName: 'Mateo', lastName: 'Morales', birthDate: '2021-03-14', height: null, weight: null }],
})

interface ApiOptions {
  plan?: string
  list?: unknown[]
  searchStatus?: number
  searchBody?: unknown
  optionsStatus?: number
  /** Answers each search by hand (to hold one back). */
  onSearch?: (body: Record<string, unknown>) => Promise<unknown> | unknown
}

/** Routes every fetch of the screen; `searches` collects the bodies sent to the search. */
function stubApi({ plan = 'paid', list = consultations, searchStatus = 200, searchBody, optionsStatus = 200, onSearch }: ApiOptions = {}) {
  const searches: Record<string, unknown>[] = []
  const urls: string[] = []
  const fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
    const url = String(input)
    urls.push(url)
    if (url.endsWith('/consultations/search')) {
      const body = JSON.parse(String(init?.body))
      searches.push(body)
      if (onSearch) return onSearch(body)
      if (searchStatus !== 200) return { ok: false, status: searchStatus, json: async () => searchBody ?? { error: 'x' } }
      const q = typeof body.q === 'string' ? body.q.toLowerCase() : ''
      const found = q === 'zzz' ? [] : list
      return { ok: true, status: 200, json: async () => ({ childId: 'child-1', consultations: found }) }
    }
    if (url.endsWith('/history-options')) {
      if (optionsStatus !== 200) return { ok: false, status: optionsStatus, json: async () => ({ error: 'x' }) }
      return { ok: true, json: async () => options }
    }
    if (url.includes('/accounts/')) return { ok: true, json: async () => account(plan) }
    return { ok: true, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return { searches, urls, fetchMock }
}

function useWeb() {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/children/child-1/historial']}>
        <Routes>
          <Route path="/children/:childId/historial" element={<HistoryPage />} />
          <Route path="/children/:childId" element={<p>DETALLE DEL HIJO</p>} />
          <Route path="/consultations/:consultationId" element={<p>DETALLE DE CONSULTA</p>} />
          <Route path="/planes" element={<p>PLANES</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return utils
}

const lastSearch = (searches: Record<string, unknown>[]) => searches[searches.length - 1]

beforeEach(() => {
  window.localStorage.setItem('peditrack.accountId', 'a1')
})
afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

describe.each([
  ['phone', () => {}],
  ['web', useWeb],
] as const)('HistoryPage on the %s', (design, setup) => {
  beforeEach(setup)

  const openFilters = async (user: ReturnType<typeof userEvent.setup>) => {
    if (design === 'phone') await user.click(screen.getByRole('button', { name: /^Filtros/ }))
  }

  it('shows every consultation of the child with their count, as the same cards that open the same detail', async () => {
    const { searches, urls } = stubApi()
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Historial' })).toBeInTheDocument()
    expect(await screen.findByText('2 consultas')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Dra. López/ })).toHaveAttribute('href', '/consultations/c1')
    expect(screen.getByRole('link', { name: /Dr. Iván Robles/ })).toHaveAttribute('href', '/consultations/c2')
    expect(searches[0]).toEqual({})
    // The criteria travel in the body: no address of this screen carries them.
    expect(urls.filter((u) => u.includes('/search')).every((u) => !u.includes('?'))).toBe(true)
    expect(screen.getByText('Mateo Morales · 5 años 6 meses', { exact: false })).toBeInTheDocument()
  })

  it('says "1 consulta" in the singular', async () => {
    stubApi({ list: [consultations[0]] })
    renderPage()

    expect(await screen.findByText('1 consulta')).toBeInTheDocument()
  })

  it('searches the text a moment after the last key, shows what is on as a pill and takes it off by itself', async () => {
    const user = userEvent.setup()
    const { searches } = stubApi()
    renderPage()
    await screen.findByText('2 consultas')

    await user.type(screen.getByLabelText('Buscar'), 'amox')

    await waitFor(() => expect(lastSearch(searches)).toEqual({ q: 'amox' }), { timeout: 3000 })
    expect(searches.some((body) => body.q === 'a' || body.q === 'am' || body.q === 'amo')).toBe(false) // not letter by letter
    expect(screen.getByText('Texto: amox')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Quitar Texto: amox' }))

    expect(screen.getByLabelText('Buscar')).toHaveValue('')
    await waitFor(() => expect(lastSearch(searches)).toEqual({}), { timeout: 3000 })
  })

  it('narrows by doctor, medication, dates, kind and symptoms, all at once', async () => {
    const user = userEvent.setup()
    const { searches } = stubApi()
    renderPage()
    await screen.findByText('2 consultas')
    await openFilters(user)

    await user.selectOptions(await screen.findByLabelText('Doctor'), 'Dra. López')
    await user.selectOptions(screen.getByLabelText('Medicamento'), 'Paracetamol')
    await user.type(screen.getByLabelText('Desde'), '2026-01-01')
    await user.type(screen.getByLabelText('Hasta'), '2026-06-30')
    await user.click(screen.getByRole('radio', { name: 'Solo registro' }))
    await user.click(screen.getByRole('button', { name: 'Fiebre' }))
    await user.click(screen.getByRole('button', { name: 'Tos' }))

    await waitFor(() =>
      expect(lastSearch(searches)).toEqual({
        from: '2026-01-01', to: '2026-06-30', doctor: 'Dra. López', medication: 'Paracetamol', symptomCodes: ['fever', 'cough'], kind: 'record',
      }),
    )
    // One pill per criterion; "Limpiar todo" takes them all off.
    const pills = screen.getByRole('group', { name: 'Criterios activos' })
    expect(within(pills).getByText('Dra. López')).toBeInTheDocument()
    expect(within(pills).getByText('Solo registro')).toBeInTheDocument()
    await user.click(within(pills).getByRole('button', { name: 'Limpiar todo' }))
    await waitFor(() => expect(lastSearch(searches)).toEqual({}))
  })

  it('says so when nothing matches and offers to clear; with no consultations at all it says there are none yet', async () => {
    const user = userEvent.setup()
    stubApi()
    renderPage()
    await screen.findByText('2 consultas')

    await user.type(screen.getByLabelText('Buscar'), 'zzz')

    expect(await screen.findByText('Ninguna consulta coincide con tu búsqueda.', undefined, { timeout: 3000 })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(await screen.findByText('2 consultas', undefined, { timeout: 3000 })).toBeInTheDocument()
  })

  it('says there are no consultations yet when the child has none and nothing is asked', async () => {
    stubApi({ list: [] })
    renderPage()

    expect(await screen.findByText('Todavía no hay consultas registradas.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()
  })

  it('tells a range turned around in its field and does not ask the server for it', async () => {
    const user = userEvent.setup()
    const { searches } = stubApi()
    renderPage()
    await screen.findByText('2 consultas')
    await openFilters(user)
    const before = searches.length

    await user.type(screen.getByLabelText('Desde'), '2026-07-01')
    await user.type(screen.getByLabelText('Hasta'), '2026-06-01')

    expect(await screen.findByText('La fecha final no puede ser anterior a la inicial.')).toBeInTheDocument()
    expect(screen.getByLabelText('Hasta')).toBeInvalid()
    // "Desde" alone was asked once; the turned-around range never was.
    expect(searches.slice(before).every((body) => !('to' in body))).toBe(true)
  })

  it('keeps the previous list on screen while the next one loads', async () => {
    const user = userEvent.setup()
    let release: (value: unknown) => void = () => {}
    const pending = new Promise((resolve) => {
      release = resolve
    })
    let calls = 0
    stubApi({
      onSearch: () => {
        calls += 1
        return calls === 1 ? { ok: true, json: async () => ({ consultations }) } : pending
      },
    })
    renderPage()
    await screen.findByText('2 consultas')
    await openFilters(user)

    await user.click(await screen.findByRole('radio', { name: 'Con tratamiento' }))

    await waitFor(() => expect(calls).toBe(2))
    expect(screen.getByRole('link', { name: /Dra. López/ })).toBeInTheDocument()
    expect(screen.getByText('2 consultas')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Resultados' })).toHaveAttribute('aria-busy', 'true')
    release({ ok: true, json: async () => ({ consultations: [consultations[0]] }) })
    expect(await screen.findByText('1 consulta')).toBeInTheDocument()
  })

  it('tells a failure with "Reintentar" that asks again, and keeps what was typed', async () => {
    const user = userEvent.setup()
    let fail = true
    stubApi({
      onSearch: () => (fail ? { ok: false, status: 500, json: async () => ({ error: 'internal_error' }) } : { ok: true, json: async () => ({ consultations }) }),
    })
    renderPage()
    expect(await screen.findByText(/No pudimos cargar el historial/)).toBeInTheDocument()

    fail = false
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('2 consultas')).toBeInTheDocument()
  })

  it('starts from the criteria the tab kept for this child (a back from a detail, a reload) and keeps them on every change', async () => {
    const user = userEvent.setup()
    window.sessionStorage.setItem('historial:child-1', JSON.stringify({ q: 'lopez', kind: 'record', symptomCodes: ['fever'] }))
    const { searches } = stubApi()
    renderPage()

    expect(await screen.findByText('2 consultas')).toBeInTheDocument()
    expect(searches[0]).toEqual({ q: 'lopez', symptomCodes: ['fever'], kind: 'record' })
    expect(screen.getByLabelText('Buscar')).toHaveValue('lopez')
    expect(screen.getByText('Texto: lopez')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Quitar Solo registro' }))
    expect(JSON.parse(window.sessionStorage.getItem('historial:child-1')!)).toMatchObject({ q: 'lopez', kind: 'all' })
  })

  it('goes back to the child from the header link', async () => {
    const user = userEvent.setup()
    stubApi()
    renderPage()
    await screen.findByText('2 consultas')

    await user.click(screen.getByRole('link', { name: /^← Consultas/ }))

    expect(await screen.findByText('DETALLE DEL HIJO')).toBeInTheDocument()
  })

  it('shows the choice lists failing without breaking the screen', async () => {
    const user = userEvent.setup()
    stubApi({ optionsStatus: 500 })
    renderPage()
    await screen.findByText('2 consultas')
    await openFilters(user)

    expect(await screen.findByText('No pudimos cargar las listas de doctores y medicamentos.')).toBeInTheDocument()
    expect(screen.getByLabelText('Doctor')).toBeInTheDocument()
  })

  describe('on the free plan', () => {
    it('shows the plan notice instead of the search, asks the server for nothing, and goes back to the child', async () => {
      const user = userEvent.setup()
      const { searches, urls } = stubApi({ plan: 'free' })
      renderPage()

      const dialog = await screen.findByRole('dialog', { name: 'Búsqueda en el historial' })
      expect(within(dialog).getByText(/la búsqueda y los filtros son del plan completo/)).toBeInTheDocument()
      expect(within(dialog).getByText(/Tu historial se sigue viendo completo/)).toBeInTheDocument()
      expect(screen.queryByLabelText('Buscar')).not.toBeInTheDocument()
      expect(searches).toHaveLength(0)
      expect(urls.some((u) => u.endsWith('/history-options'))).toBe(false)

      await user.click(within(dialog).getByRole('button', { name: 'Ahora no' }))
      expect(await screen.findByText('DETALLE DEL HIJO')).toBeInTheDocument()
    })

    it('"Ver planes" opens the plans screen', async () => {
      const user = userEvent.setup()
      stubApi({ plan: 'free' })
      renderPage()

      await user.click(await screen.findByRole('link', { name: 'Ver el plan completo' }))

      expect(await screen.findByText('PLANES')).toBeInTheDocument()
    })
  })

  it('shows the same notice if the server says it is the paid plan\'s (the plan was not known on the screen)', async () => {
    stubApi({ plan: 'paid', searchStatus: 422, searchBody: { error: 'freemium_consultation_limit_exceeded', reason: 'history_search', message: 'paid plan' } })
    renderPage()

    expect(await screen.findByRole('dialog', { name: 'Búsqueda en el historial' })).toBeInTheDocument()
  })
})

describe('HistoryEntry', () => {
  const renderEntry = (free: boolean) =>
    render(
      <MemoryRouter>
        <HistoryEntry to="/children/child-1/historial" free={free} className="entry">
          Buscar en el historial
        </HistoryEntry>
      </MemoryRouter>,
    )

  it('is a link to the history on the paid plan', () => {
    renderEntry(false)

    expect(screen.getByRole('link', { name: 'Buscar en el historial' })).toHaveAttribute('href', '/children/child-1/historial')
    expect(screen.queryByText('Plan completo')).not.toBeInTheDocument()
  })

  it('is a button marked "Plan completo" that opens the plan notice on the free plan, and gives the focus back', async () => {
    const user = userEvent.setup()
    renderEntry(true)

    const button = screen.getByRole('button', { name: /Buscar en el historial/ })
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(within(button).getByText('Plan completo')).toBeInTheDocument()
    await user.click(button)
    const dialog = screen.getByRole('dialog', { name: 'Búsqueda en el historial' })

    await user.click(within(dialog).getByRole('button', { name: 'Ahora no' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })
})

// The review of the history (specs/031): what the first version got wrong.
describe('HistoryPage, after the review', () => {
  it('draws every field with the form border color, and the red one only for a range turned around', async () => {
    const user = userEvent.setup()
    stubApi()
    renderPage()
    await screen.findByText('2 consultas')
    await user.click(screen.getByRole('button', { name: /^Filtros/ }))

    for (const label of ['Buscar', 'Doctor', 'Medicamento']) {
      expect(screen.getByLabelText(label)).toHaveClass('border-slate-300')
    }
    expect(screen.getByLabelText('Hasta')).toHaveClass('border-slate-300')
    await user.type(screen.getByLabelText('Desde'), '2026-07-01')
    await user.type(screen.getByLabelText('Hasta'), '2026-06-01')
    expect(screen.getByLabelText('Hasta')).toHaveClass('border-red-600')
  })

  it('does not show the previous results while the range is turned around, and brings the list back when it is fixed', async () => {
    const user = userEvent.setup()
    stubApi()
    renderPage()
    await screen.findByText('2 consultas')
    await user.click(screen.getByRole('button', { name: /^Filtros/ }))

    await user.type(screen.getByLabelText('Desde'), '2026-07-01')
    await user.type(screen.getByLabelText('Hasta'), '2026-06-01')

    expect(await screen.findByText('Corrige las fechas para ver los resultados.')).toBeInTheDocument()
    expect(screen.queryByText('2 consultas')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Dra. López/ })).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('Hasta'))
    await user.type(screen.getByLabelText('Hasta'), '2026-08-01')
    expect(await screen.findByText('2 consultas', undefined, { timeout: 3000 })).toBeInTheDocument()
  })

  it('never asks the server for text that was cleared before its pause ended', async () => {
    const user = userEvent.setup()
    const { searches } = stubApi()
    renderPage()
    await screen.findByText('2 consultas')
    const asked = searches.length

    await user.type(screen.getByLabelText('Buscar'), 'amox')
    await user.click(screen.getByRole('button', { name: 'Limpiar todo' }))

    await waitFor(() => expect(screen.getByLabelText('Buscar')).toHaveValue(''))
    await new Promise((resolve) => setTimeout(resolve, 600)) // longer than the pause
    expect(searches.slice(asked).some((body) => body.q === 'amox')).toBe(false)
  })

  it('says a criterion the server refuses is no longer valid, and "Limpiar filtros" (not "Reintentar") clears it', async () => {
    const user = userEvent.setup()
    window.sessionStorage.setItem('historial:child-1', JSON.stringify({ symptomCodes: ['nope'] }))
    const { searches } = stubApi({
      onSearch: (body) =>
        body.symptomCodes
          ? { ok: false, status: 400, json: async () => ({ error: 'validation_error', details: [{ field: 'symptomCodes', message: 'symptom_not_available' }] }) }
          : { ok: true, json: async () => ({ consultations }) },
    })
    renderPage()

    expect(await screen.findByText(/Alguno de los criterios ya no es válido/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))

    expect(await screen.findByText('2 consultas', undefined, { timeout: 3000 })).toBeInTheDocument()
    expect(searches.at(-1)).toEqual({})
  })

  it('only points the phone toggle at the filters while they exist', async () => {
    const user = userEvent.setup()
    stubApi()
    renderPage()
    await screen.findByText('2 consultas')
    const toggle = screen.getByRole('button', { name: /^Filtros/ })

    expect(toggle).not.toHaveAttribute('aria-controls')
    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-controls', 'history-filters')
    expect(document.getElementById('history-filters')).not.toBeNull()
  })
})
