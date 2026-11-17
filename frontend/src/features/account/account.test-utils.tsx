import { vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

// A fetch stub for the account's tests (specs/070): JSON answers plus downloads (`blob()` and the file name header).

export const account = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  firstName: 'Ana',
  lastName: 'Morales',
  email: 'ana@example.com',
  countryCode: null,
  stateCode: null,
  plan: 'paid',
  disclaimerAccepted: true,
  children: [
    {
      id: 'child-1',
      firstName: 'Mateo',
      lastName: 'Morales',
      birthDate: '2021-03-14',
      height: null,
      weight: null,
    },
  ],
  ...over,
})

export type Reply = {
  status?: number
  body?: unknown
  blob?: Blob
  fileName?: string
  reject?: boolean
}
type Handler = Reply | (() => Reply)

export function stubApi(routes: Record<string, Handler>) {
  const mock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const key = `${init?.method ?? 'GET'} ${url.pathname}`
    const handler = routes[key]
    const reply: Reply =
      handler === undefined
        ? { status: 404, body: { error: 'not_stubbed' } }
        : typeof handler === 'function'
          ? handler()
          : handler
    const status = reply.status ?? 200
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (reply.body === undefined) throw new Error('no body')
        return reply.body
      },
      blob: async () => {
        if (reply.reject) throw new Error('cut')
        return reply.blob ?? new Blob(['PK'])
      },
      headers: {
        get: (name: string) =>
          name === 'Content-Disposition' && reply.fileName
            ? `attachment; filename="${reply.fileName}"`
            : null,
      },
    }
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

export const callsOf = (mock: ReturnType<typeof vi.fn>) =>
  mock.mock.calls.map((call) => {
    const [input, init] = call as [string, RequestInit | undefined]
    return `${init?.method ?? 'GET'} ${new URL(String(input), 'http://localhost').pathname}`
  })

export function renderAt(path: string, element: ReactNode, routePath = path) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={element} />
          <Route path="/cuenta" element={<div>CUENTA</div>} />
          <Route path="/cuenta/eliminar" element={<div>ELIMINAR</div>} />
          <Route path="/home" element={<div>HOME</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...utils, queryClient }
}
