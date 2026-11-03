import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SharedProfilePage } from './SharedProfilePage'
import { SharedProfilesLinks } from './SharedProfilesLinks'
import { TODAY, account, at, stubApi, stubWeb } from '../supplements/supplements.test-utils'
import type { Account } from '../home/types'

// specs/058 (US2): somebody's own consultations, shared with the session.

const shared = account({ sharedProfiles: [{ accountId: 'l1', firstName: 'Luis' }] })

function api(over: Parameters<typeof stubApi>[0] = {}) {
  return stubApi({
    'GET /accounts/me': { body: shared },
    'GET /accounts/l1/overview': {
      body: {
        accountId: 'l1',
        doses: [
          {
            id: 'm1',
            kind: 'medication',
            consultationId: 'k1',
            medicationName: 'Losartán',
            scheduledAt: at(8),
            taken: true,
            status: 'taken',
            takenBy: { name: 'Luis', at: at(8, 5), mine: false },
          },
        ],
        activeTreatment: { medicationName: 'Losartán', endsAt: '2026-10-20T20:00:00Z', otherCount: 0 },
      },
    },
    'GET /accounts/l1/consultations': {
      body: { accountId: 'l1', consultations: [{ id: 'k1', doctorName: 'Dra. Ruiz', consultDate: '2026-10-01', notes: '', symptomNames: [], medicationCount: 1 }] },
    },
    'GET /accounts/l1/appointments': { body: { next: null, history: [], paidPlan: true } },
    ...over,
  })
}

function renderAt(path = '/personas/l1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/personas/:accountId" element={<SharedProfilePage />} />
          <Route path="/home" element={<div>HOME</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('SharedProfilePage', () => {
  for (const web of [false, true]) {
    it(`${web ? 'web' : 'phone'}: their doses of today, treatment and consultations — nothing to add, edit or export`, async () => {
      stubWeb(web)
      api()
      renderAt()
      expect(await screen.findByRole('heading', { level: 1, name: 'Luis' })).toBeInTheDocument()
      expect(screen.getByText('Te compartió sus consultas')).toBeInTheDocument()
      const today = await screen.findByRole('region', { name: 'Hoy' })
      expect(await within(today).findByText('Losartán')).toBeInTheDocument()
      // A mark somebody else made is never taken back from here.
      expect(within(today).getByRole('button', { name: /Losartán/ })).toBeDisabled()
      expect(screen.getByRole('region', { name: 'Tratamiento activo' })).toBeInTheDocument()
      const consultations = await screen.findByRole('region', { name: 'Consultas' })
      expect(within(consultations).getByRole('link', { name: /Dra. Ruiz/ })).toHaveAttribute('href', '/consultations/k1')
      expect(within(consultations).getByRole('link', { name: 'Buscar en el historial' })).toHaveAttribute('href', '/personas/l1/historial')
      expect(screen.queryByRole('button', { name: /Exportar a PDF/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Nueva consulta' })).not.toBeInTheDocument()
    })
  }

  it('says so when the consultations are no longer shared', async () => {
    stubWeb(false)
    api({ 'GET /accounts/me': { body: account({ sharedProfiles: [] }) } })
    renderAt()
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya no puedes ver estas consultas.')
    expect(screen.getByRole('link', { name: '← Inicio' })).toHaveAttribute('href', '/home')
  })

  it('and when the server stops answering for them', async () => {
    stubWeb(false)
    api({ 'GET /accounts/l1/overview': { status: 403, body: { error: 'forbidden' } } })
    renderAt()
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya no puedes ver estas consultas.')
  })
})

describe('SharedProfilesLinks', () => {
  it('a row per person who shares, to their profile; nothing when nobody does', () => {
    const { container, rerender } = render(
      <MemoryRouter>
        <SharedProfilesLinks account={shared as unknown as Account} variant="phone" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /Consultas de Luis/ })).toHaveAttribute('href', '/personas/l1')
    rerender(
      <MemoryRouter>
        <SharedProfilesLinks account={account() as unknown as Account} variant="desktop" />
      </MemoryRouter>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
