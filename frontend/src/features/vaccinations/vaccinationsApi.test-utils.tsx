import { vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import type { Account, Child } from '../home/types'
import type { Vaccination } from './types'

export const CHILD_ID = 'c1'

/** The first bytes of a JPEG: enough for the viewer to name its type. */
export const JPEG_BASE64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/'

export const dose = (extra: Partial<Vaccination> = {}): Vaccination => ({
  id: 'v1',
  vaccineCode: 'hepatitis_b',
  name: 'Hepatitis B',
  customName: null,
  appliedOn: '2024-03-14',
  doseNumber: 2,
  lot: null,
  place: 'Centro de salud',
  notes: null,
  createdByName: 'Ana',
  createdAt: '2026-10-01T10:00:00Z',
  correctedByName: null,
  correctedAt: null,
  ...extra,
})

export const child = (extra: Partial<Child> = {}): Child =>
  ({ id: CHILD_ID, firstName: 'Mateo', lastName: 'G', birthDate: '2023-01-10', ...extra }) as Child

export const account = (children: Child[] = [child()]): Account =>
  ({ id: 'a1', firstName: 'Ana', lastName: 'G', email: 'a@x.com', plan: 'free', children, disclaimerVersion: 'x', disclaimerAccepted: true, reminderDetail: null }) as Account

export type Reply = { status?: number; body?: unknown }

export interface ApiState {
  doses: Vaccination[]
  photos?: { id: string; createdAt: string; createdByName: string }[]
  account: Account
  /** Per "METHOD /path" answers for writes. */
  writes?: Record<string, Reply>
  /** Fail the list read. */
  listFails?: boolean
  /** The vaccine catalog is not answered until this resolves. */
  catalogGate?: Promise<void>
}

/** One stub for everything the card talks to; returns the calls it saw. */
export function stubApi(state: ApiState) {
  const calls: { method: string; path: string; body?: unknown }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname
      const method = init?.method ?? 'GET'
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      const ok = (json: unknown, status = 200) => ({ ok: status < 300, status, json: async () => json }) as Response
      if (path === '/accounts/me') return ok(state.account)
      if (path === '/catalog/vaccines') {
        await state.catalogGate
        return ok([
          { code: 'hepatitis_b', name: 'Hepatitis B' },
          { code: 'bcg', name: 'BCG' },
        ])
      }
      if (method === 'GET' && path === `/children/${CHILD_ID}/vaccinations`) return state.listFails ? ok({}, 500) : ok({ vaccinations: state.doses })
      if (method === 'GET' && path === `/children/${CHILD_ID}/vaccine-card-photos`) return state.writes?.[`GET ${path}`] ? ok({}, state.writes[`GET ${path}`].status) : ok({ photos: state.photos ?? [], limit: 10 })
      if (method === 'GET' && path.startsWith(`/children/${CHILD_ID}/vaccine-card-photos/`) && !state.writes?.[`GET ${path}`])
        return ok({ id: path.split('/').pop(), photoBase64: JPEG_BASE64 })
      const reply = state.writes?.[`${method} ${path}`] ?? { status: 204 }
      return ok(reply.body ?? {}, reply.status ?? 200)
    }),
  )
  return calls
}

export function renderAt(ui: ReactElement, path = `/children/${CHILD_ID}/cartilla`, route = '/children/:childId/cartilla') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={ui} />
          <Route path="*" element={<p>otra pantalla</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

export function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
}
