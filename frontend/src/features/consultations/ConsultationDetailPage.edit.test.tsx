import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConsultationDetailPage } from './ConsultationDetailPage'
import { EDIT_TEXT } from './editText'

// specs/051: «Editar consulta» for who can do everything, and «Editada el … por …» under the title, in both designs.

type Role = 'owner' | 'tutor' | 'caregiver'

function stubApi(role: Role, readOnly: boolean, edited: { at: string; by: string } | null) {
  const account = {
    id: 'a1', firstName: 'Ana', lastName: 'Morales', email: 'ana@example.com', countryCode: null, stateCode: null, plan: 'paid',
    children: [{ id: 'child-1', firstName: 'Mateo', lastName: 'Morales', birthDate: '2021-03-14', height: null, weight: null, role, readOnly, plan: 'paid' }],
  }
  const detail = {
    id: 'c1', childId: 'child-1', doctorName: 'Dra. López', consultDate: '2026-01-15', photoBase64: 'Zm9v', notes: '', symptoms: [],
    medications: [], createdAt: '2026-01-15T15:00:00Z', edited,
  }
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: string) => {
    const url = String(input)
    if (url.includes('/overview')) return { ok: true, json: async () => ({ childId: 'child-1', doses: [], activeTreatment: null }) }
    if (url.includes('/accounts/')) return { ok: true, json: async () => account }
    if (url.includes('/appointment')) return { ok: true, json: async () => ({ appointment: null, paidPlan: true }) }
    return { ok: true, json: async () => detail }
  }))
}

function renderPage(desktop: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({ matches: desktop, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/consultations/c1']}>
        <Routes>
          <Route path="/consultations/:consultationId" element={<ConsultationDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ConsultationDetailPage — editing (specs/051)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    ['phone', false],
    ['web', true],
  ])('%s: the owner and a Tutor see «Editar consulta» and the last edit', async (_, desktop) => {
    stubApi('tutor', false, { at: '2026-01-20T17:05:00Z', by: 'Ana' })
    renderPage(desktop)

    expect(await screen.findByRole('link', { name: EDIT_TEXT.open })).toHaveAttribute('href', '/consultations/c1/editar')
    expect(screen.getByText(/^Editada el 20 ene 2026 por Ana$/)).toBeInTheDocument()
  })

  it.each([
    ['a Caregiver', 'caregiver' as Role, false],
    ['a Tutor of a family that stopped paying', 'tutor' as Role, true],
  ])('%s sees no «Editar consulta»; a consultation never edited says nothing', async (_, role, readOnly) => {
    stubApi(role, readOnly, null)
    renderPage(false)

    await screen.findByRole('heading', { level: 1, name: 'Dra. López' })
    expect(screen.queryByRole('link', { name: EDIT_TEXT.open })).not.toBeInTheDocument()
    expect(screen.queryByText(/^Editada el/)).not.toBeInTheDocument()
  })
})
