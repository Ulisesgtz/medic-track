import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
          consultations: [{ id: 'c1', doctorName: 'Dra. López', consultDate: '2026-01-15' }],
        }),
      }),
    )
    renderPage()

    expect(await screen.findByText('Dra. López')).toBeInTheDocument()
    expect(screen.getByText('2026-01-15')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Dra. López/ })).toHaveAttribute('href', '/consultations/c1')
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

    await user.click(await screen.findByRole('button', { name: 'Registrar consulta' }))
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

    await user.click(await screen.findByRole('button', { name: 'Registrar consulta' }))
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
