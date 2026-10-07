import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChildrenSidebar } from './ChildrenSidebar'

// specs/033, part 3: the sidebar's «Personal» group, apart from the children and from «Familia».

const account = {
  id: 'a1', firstName: 'Ana', lastName: 'Gómez', email: 'ana@example.com', countryCode: null, stateCode: null, plan: 'paid',
  children: [{ id: 'k1', firstName: 'Luis', lastName: 'Gómez', birthDate: '2021-05-10', height: null, weight: null }],
}

function stub(activeCount: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: string) => ({
      ok: true,
      status: 200,
      json: async () => (String(input).includes('/routines') ? { routines: [], activeCount, limit: 10, paidPlan: true, noticeSeen: true } : account),
    })),
  )
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <ChildrenSidebar />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('ChildrenSidebar — Personal', () => {
  it('has its own group after the children with a link to «Mis suplementos» and how many are active', async () => {
    stub(3)
    renderAt('/home')
    const nav = await screen.findByRole('navigation', { name: 'Personal' })
    const link = nav.querySelector('a') as HTMLAnchorElement
    expect(link).toHaveAttribute('href', '/mis-suplementos')
    expect(link).toHaveTextContent('Mis suplementos')
    expect(await screen.findByText('3 activas')).toBeInTheDocument()
    expect(link).not.toHaveAttribute('aria-current')
  })

  it('says «1 activa» in the singular and shows no count when there are none', async () => {
    stub(1)
    const first = renderAt('/home')
    expect(await screen.findByText('1 activa')).toBeInTheDocument()
    first.unmount()
    stub(0)
    renderAt('/home')
    const nav = await screen.findByRole('navigation', { name: 'Personal' })
    expect(nav).not.toHaveTextContent('activa')
  })

  it('marks the link as the current page inside the section', async () => {
    stub(2)
    renderAt('/mis-suplementos')
    const nav = await screen.findByRole('navigation', { name: 'Personal' })
    expect(nav.querySelector('a')).toHaveAttribute('aria-current', 'page')
  })

  it('is not drawn until the account is known', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    renderAt('/home')
    expect(screen.queryByRole('navigation', { name: 'Personal' })).not.toBeInTheDocument()
  })
})
