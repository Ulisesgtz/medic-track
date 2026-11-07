import { vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { CabinetItem } from './types'

// Fixtures and a fetch router for the medicine cabinet's tests (specs/062).

export const account = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  firstName: 'Ana',
  lastName: 'Morales',
  email: 'ana@example.com',
  countryCode: null,
  stateCode: null,
  plan: 'paid',
  disclaimerAccepted: true,
  children: [{ id: 'child-1', firstName: 'Mateo', lastName: 'Morales', birthDate: '2021-03-14', height: null, weight: null }],
  ...over,
})

export const caregiver = account({ plan: 'free', family: { role: 'caregiver', ownerAccountId: 'owner', ownerName: 'Ana', plan: 'paid', readOnly: false } })

export function item(over: Partial<CabinetItem> = {}): CabinetItem {
  return {
    id: 'm1',
    name: 'Paracetamol infantil',
    strength: '160 mg/5 ml',
    quantity: 2,
    unit: 'bottle',
    expires: { year: 2027, month: 3, day: null },
    note: '',
    hasPhoto: false,
    createdBy: 'Ana',
    createdAt: new Date(2026, 10, 6, 10).toISOString(),
    updatedBy: null,
    updatedAt: null,
    canEdit: true,
    ...over,
  }
}

type Reply = { status?: number; body?: unknown }
type Handler = Reply | ((url: URL, init?: RequestInit) => Reply)

export function stubApi(routes: Record<string, Handler>) {
  const mock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const key = `${init?.method ?? 'GET'} ${url.pathname}`
    const handler = routes[key]
    const reply = handler === undefined ? { status: 404, body: { error: 'not_stubbed', message: key } } : typeof handler === 'function' ? handler(url, init) : handler
    const status = reply.status ?? 200
    return { ok: status >= 200 && status < 300, status, json: async () => reply.body }
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

export const callsOf = (mock: ReturnType<typeof vi.fn>) =>
  mock.mock.calls.map((call) => {
    const [input, init] = call as [string, RequestInit | undefined]
    return `${init?.method ?? 'GET'} ${new URL(String(input), 'http://localhost').pathname}`
  })

export const bodyOf = (mock: ReturnType<typeof vi.fn>, key: string) => {
  const call = mock.mock.calls.find((c) => {
    const [input, init] = c as [string, RequestInit | undefined]
    return `${init?.method ?? 'GET'} ${new URL(String(input), 'http://localhost').pathname}` === key
  }) as [string, RequestInit] | undefined
  return call ? JSON.parse(String(call[1].body)) : undefined
}

export function stubWeb(on: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({ matches: on, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
}

export function renderAt(path: string | { pathname: string; state?: unknown }, element: ReactNode, routePath: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={element} />
          <Route path="/botiquin" element={<div>LISTA</div>} />
          <Route path="/botiquin/:itemId" element={<div>DETALLE</div>} />
          <Route path="/botiquin/nuevo" element={<div>NUEVO</div>} />
          <Route path="/consultations/:id" element={<div>CONSULTA</div>} />
          <Route path="/planes" element={<div>PLANES</div>} />
          <Route path="/home" element={<div>HOME</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
