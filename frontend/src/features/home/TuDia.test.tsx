import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { TuDia } from './TuDia'
import type { Account } from './types'

vi.mock('@clerk/react', () => ({ useAuth: vi.fn() }))

const ana = { id: 'acc', firstName: 'Ana', lastName: 'Morales', plan: 'paid', children: [] } as unknown as Account

const rd = (status: string, at: string) => ({ id: `${status}${at}`, scheduledAt: `2026-11-01T${at}:00`, taken: status === 'taken', status })
const vitamin = { id: 'r-vit', kind: 'supplement', name: 'Vitamina D', status: 'active', doses: [rd('taken', '08:00'), rd('due', '09:00'), rd('pending', '14:00')] }
const walk = { id: 'r-walk', kind: 'activity', name: 'Caminar 30 min', status: 'active', doses: [rd('taken', '07:00'), rd('due', '12:00'), rd('pending', '18:00')] }

let calls: { url: string; method: string }[]
function stub(supplements: unknown[], activities: unknown[], { paidPlan = true, fail = false } = {}) {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, method: init?.method ?? 'GET' })
      if (fail) return { ok: false, status: 500, json: async () => ({ error: 'x', message: 'boom' }) } as Response
      if (init?.method === 'POST') return { ok: true, json: async () => ({ id: 'd', taken: true }) } as Response
      const routines = url.includes('kind=activity') ? activities : supplements
      return { ok: true, json: async () => ({ routines, activeCount: routines.length, limit: 10, paidPlan, noticeSeen: true }) } as Response
    }),
  )
}

function renderTuDia(variant: 'phone' | 'desktop' = 'phone') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route path="/home" element={<TuDia account={ana} variant={variant} />} />
          <Route path="/mi-dia" element={<p>MI DÍA</p>} />
          <Route path="/planes" element={<p>PLANES</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true, getToken: async () => 't' } as unknown as ReturnType<typeof useAuth>)
})
afterEach(() => vi.unstubAllGlobals())

describe('TuDia', () => {
  it('shows a skeleton while it loads', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    const { container } = renderTuDia()
    expect(container.querySelector('[aria-hidden="true"].h-\\[236px\\]')).not.toBeNull()
  })

  it('counts the doses and the activities of today, with the next of each and «Ver todo»', async () => {
    const user = userEvent.setup()
    stub([vitamin], [walk])
    renderTuDia()
    expect(await screen.findByRole('heading', { name: 'Tu día' })).toBeInTheDocument()
    expect(screen.getByText('1 de 3 hoy')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Mis tomas' })).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByText('Próxima: Vitamina D · 09:00')).toBeInTheDocument()
    expect(screen.getByText('1 de 3 hechas')).toBeInTheDocument()
    expect(screen.getByText('Próxima: Caminar 30 min · 18:00')).toBeInTheDocument()
    expect(screen.queryByText('✓ Todo marcado hasta ahora')).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Ver todo' }))
    expect(await screen.findByText('MI DÍA')).toBeInTheDocument()
  })

  it('«✓ Realizado» marks the activity without leaving and then says when', async () => {
    const user = userEvent.setup()
    stub([], [walk])
    renderTuDia()
    await user.click(await screen.findByRole('button', { name: 'Realizado: Caminar 30 min' }))
    expect(calls.find((c) => c.method === 'POST')!.url).toMatch(/\/routines\/r-walk\/done/)
    expect(await screen.findByText(/^✓ Caminar 30 min · \d\d:\d\d$/)).toBeInTheDocument()
  })

  it('says «Todo marcado hasta ahora» when nothing whose time came is unmarked; on the web in two columns', async () => {
    stub([{ ...vitamin, doses: [rd('taken', '08:00'), rd('pending', '21:00')] }], [], {})
    renderTuDia('desktop')
    expect(await screen.findByText('✓ Todo marcado hasta ahora')).toBeInTheDocument()
    expect(document.querySelector('.grid-cols-\\[minmax\\(0\\,1fr\\)_1px_minmax\\(0\\,1fr\\)\\]')).not.toBeNull()
  })

  it('says there is nothing today when the routines have no dose today', async () => {
    stub([{ ...vitamin, doses: [] }], [])
    renderTuDia()
    expect(await screen.findByText('Hoy no tienes tomas ni actividades')).toBeInTheDocument()
  })

  it('is one line with a link when the person created nothing (paid plan)', async () => {
    stub([], [])
    renderTuDia()
    expect(await screen.findByRole('link', { name: 'Agrega tus propios suplementos o actividades' })).toHaveAttribute('href', '/mi-dia')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('on the free plan with nothing created, the line carries «Plan completo» and opens the plan notice', async () => {
    const user = userEvent.setup()
    stub([], [], { paidPlan: false })
    renderTuDia('desktop')
    await user.click(await screen.findByRole('button', { name: /tus suplementos y actividades/ }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Ver el plan completo' }))
    expect(await screen.findByText('PLANES')).toBeInTheDocument()
  })

  it('a failed read says so and can be asked again', async () => {
    const user = userEvent.setup()
    stub([], [], { fail: true })
    renderTuDia()
    expect(await screen.findByText(/no pudimos cargar tus suplementos y actividades/)).toBeInTheDocument()
    const before = calls.length
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(calls.length).toBeGreaterThan(before)
  })
})
