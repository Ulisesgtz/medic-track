import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NewConsultationPage } from './NewConsultationPage'

vi.mock('tesseract.js', () => ({
  default: { recognize: vi.fn().mockResolvedValue({ data: { text: '' } }) },
}))

const account = {
  id: 'a1', firstName: 'Ana', lastName: 'Gómez', email: 'ana@example.com',
  countryCode: null, stateCode: null, plan: 'free',
  children: [{ id: 'k1', firstName: 'Mateo', lastName: 'Morales', birthDate: '2021-03-01', height: null, weight: null }],
}

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/children/k1/consultations/new']}>
        <Routes>
          <Route path="/children/:childId/consultations/new" element={<NewConsultationPage />} />
          <Route path="/children/:childId" element={<p>DETALLE DEL HIJO</p>} />
          <Route path="/consultations/:consultationId" element={<p>DETALLE DE CONSULTA</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { invalidate }
}

const saved = {
  id: 'c-9', childId: 'k1', doctorName: 'Dra. López', consultDate: '2026-01-15',
  photoBase64: 'Zm9v', symptoms: '', medications: [],
}

function mockApi() {
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (init?.method === 'POST') return { ok: true, json: async () => saved } as Response
    return { ok: true, json: async () => (String(input).includes('/accounts/') ? account : []) } as Response
  })
}

const byId = (id: string) => document.getElementById(id) as HTMLInputElement

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Doctor'), 'Dra. López')
  await user.type(screen.getByLabelText('Fecha'), '2026-01-15')
  await user.upload(screen.getByLabelText('Foto de la receta'), new File(['x'], 'receta.jpg', { type: 'image/jpeg' }))
  await user.type(byId('medications.0.name'), 'Amoxicilina')
  await user.type(byId('medications.0.frequencyHours'), 'c/8 h')
  await user.type(byId('medications.0.durationDays'), '7 días')
  await user.type(byId('medications.0.startTime'), '0800')
}

describe('NewConsultationPage', () => {
  beforeEach(() => {
    window.localStorage.setItem('peditrack.accountId', 'a1')
    stubMatchMedia(false)
    vi.stubGlobal('fetch', vi.fn())
    mockApi()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('phone (mock 04): the form without the sidebar, and "← Cancelar" back to the child', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'Nueva consulta' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Tus hijos' })).not.toBeInTheDocument()
    expect(screen.queryByText(/^Para Mateo/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: '← Cancelar' }))

    expect(screen.getByText('DETALLE DEL HIJO')).toBeInTheDocument()
  })

  it('web (mock 14): the sidebar plus the form, titled with the child\'s name and age', async () => {
    stubMatchMedia(true)
    renderPage()

    expect(await screen.findByText(/^Para Mateo Morales · \d+ años?/)).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Tus hijos' })).toBeInTheDocument()
    expect(byId('medications.0.name')).toHaveAttribute('placeholder', 'Amoxicilina 250 mg')
  })

  it('leaves without asking when nothing was captured', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm')
    renderPage()

    await user.click(screen.getByRole('link', { name: '← Cancelar' }))

    expect(confirm).not.toHaveBeenCalled()
    expect(screen.getByText('DETALLE DEL HIJO')).toBeInTheDocument()
  })

  it('asks before discarding what was typed, and stays when the parent says no', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPage()

    await user.type(screen.getByLabelText('Doctor'), 'Dra. López')
    await user.click(screen.getByRole('link', { name: '← Cancelar' }))

    expect(confirm).toHaveBeenCalledWith('¿Descartar la consulta? Se perderá lo que capturaste.')
    expect(screen.queryByText('DETALLE DEL HIJO')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Doctor')).toHaveValue('Dra. López')
  })

  it('leaves when the parent accepts to discard what was typed', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()

    await user.type(screen.getByLabelText('Doctor'), 'Dra. López')
    await user.click(screen.getByRole('link', { name: '← Cancelar' }))

    expect(screen.getByText('DETALLE DEL HIJO')).toBeInTheDocument()
  })

  it('saving refreshes the child\'s lists and opens the new consultation without asking to discard', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm')
    const { invalidate } = renderPage()

    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'Guardar consulta' }))

    expect(await screen.findByText('DETALLE DE CONSULTA')).toBeInTheDocument()
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['consultations', 'k1'] })
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['overview'] })
    })
    expect(confirm).not.toHaveBeenCalled()
  })

  it('renders nothing when the route has no child id', () => {
    const queryClient = new QueryClient()
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/nueva']}>
          <Routes>
            <Route path="/nueva" element={<NewConsultationPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
