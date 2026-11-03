import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConsultationDetailPage } from './ConsultationDetailPage'

// specs/058: the detail of a person's own consultation — for the person, and for a Tutor it is shared with.

const me = {
  id: 'a1',
  firstName: 'Ana',
  lastName: 'Morales',
  email: 'ana@example.com',
  countryCode: null,
  stateCode: null,
  plan: 'paid',
  children: [],
  sharedProfiles: [{ accountId: 'l1', firstName: 'Luis' }],
}

const own = (overrides: Record<string, unknown> = {}) => ({
  id: 'c1',
  childId: null,
  accountId: 'a1',
  doctorName: 'Dr. Paz',
  consultDate: '2026-01-15',
  photoBase64: '',
  notes: '',
  symptoms: [],
  medications: [],
  ...overrides,
})

function stub(detail: unknown) {
  const fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'PUT') return { ok: true, json: async () => ({ on: true }) }
    if (url.includes('/accounts/me')) return { ok: true, json: async () => me }
    if (url.includes('/appointment')) return { ok: true, json: async () => ({ appointment: null, paidPlan: true }) }
    if (url.includes('/overview')) return { ok: true, json: async () => ({ accountId: 'a1', doses: [], activeTreatment: null }) }
    return { ok: true, json: async () => detail }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/consultations/c1']}>
        <Routes>
          <Route path="/consultations/:consultationId" element={<ConsultationDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('ConsultationDetailPage — a person’s own consultation', () => {
  it('for the person: back to their profile, «Editar consulta», no reminders switch', async () => {
    stub(own())
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Dr. Paz' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('link', { name: '← Mi perfil' })).toHaveAttribute('href', '/yo'))
    expect(screen.getByRole('link', { name: 'Editar consulta' })).toHaveAttribute('href', '/consultations/c1/editar')
    expect(screen.queryByRole('switch', { name: 'Tus avisos de esta consulta' })).not.toBeInTheDocument()
  })

  it('for a Tutor it is shared with: back to that profile, nothing to edit, and their own reminders', async () => {
    const fetchMock = stub(own({ accountId: 'l1', myReminders: false }))
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Dr. Paz' })
    await waitFor(() => expect(screen.getByRole('link', { name: '← Luis' })).toHaveAttribute('href', '/personas/l1'))
    expect(screen.queryByRole('link', { name: 'Editar consulta' })).not.toBeInTheDocument()
    const toggle = screen.getByRole('switch', { name: 'Tus avisos de esta consulta' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await userEvent.setup().click(toggle)
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/consultations/c1/my-reminders') && (init as RequestInit)?.method === 'PUT')).toBe(true),
    )
  })
})
