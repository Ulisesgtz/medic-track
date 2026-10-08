import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChildrenSidebar } from './ChildrenSidebar'

// specs/033 part 3 and specs/035: the sidebar's «Personal» group, apart from the children and from «Familia», with one link for
// the person's supplements and one for their activities.

const account = {
  id: 'a1', firstName: 'Ana', lastName: 'Gómez', email: 'ana@example.com', countryCode: null, stateCode: null, plan: 'paid',
  children: [{ id: 'k1', firstName: 'Luis', lastName: 'Gómez', birthDate: '2021-05-10', height: null, weight: null }],
}

/** How many are active of each kind: the list asks for one kind at a time. */
function stub(supplements: number, activities = 0) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: string) => {
      const url = new URL(String(input), 'http://localhost')
      const activeCount = url.searchParams.get('kind') === 'activity' ? activities : supplements
      return {
        ok: true,
        status: 200,
        json: async () => (url.pathname.includes('/routines') ? { routines: [], activeCount, limit: 10, paidPlan: true, noticeSeen: true } : account),
      }
    }),
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
  it('has its own group after the children with a link to each page and how many are active', async () => {
    stub(3, 2)
    renderAt('/home')
    const nav = await screen.findByRole('navigation', { name: 'Personal' })
    const [supplements, activities] = Array.from(nav.querySelectorAll('a'))
    expect(supplements).toHaveAttribute('href', '/mis-suplementos')
    expect(supplements).toHaveTextContent('Mis suplementos')
    expect(activities).toHaveAttribute('href', '/mis-actividades')
    expect(activities).toHaveTextContent('Mis actividades')
    expect(await screen.findByText('3 activas')).toBeInTheDocument()
    expect(await screen.findByText('2 activas')).toBeInTheDocument()
    expect(supplements).not.toHaveAttribute('aria-current')
    expect(activities).not.toHaveAttribute('aria-current')
  })

  it('says «1 activa» in the singular and shows no count when there are none', async () => {
    stub(1, 1)
    const first = renderAt('/home')
    expect(await screen.findAllByText('1 activa')).toHaveLength(2)
    first.unmount()
    stub(0, 0)
    renderAt('/home')
    const nav = await screen.findByRole('navigation', { name: 'Personal' })
    expect(nav).not.toHaveTextContent('activa')
  })

  it('marks only the link of the page it is on', async () => {
    stub(2, 1)
    renderAt('/mis-suplementos')
    const nav = await screen.findByRole('navigation', { name: 'Personal' })
    const [supplements, activities] = Array.from(nav.querySelectorAll('a'))
    expect(supplements).toHaveAttribute('aria-current', 'page')
    expect(activities).not.toHaveAttribute('aria-current')
  })

  it('marks the activities link inside its section', async () => {
    stub(2, 1)
    renderAt('/mis-actividades/nueva')
    const nav = await screen.findByRole('navigation', { name: 'Personal' })
    const [supplements, activities] = Array.from(nav.querySelectorAll('a'))
    expect(activities).toHaveAttribute('aria-current', 'page')
    expect(supplements).not.toHaveAttribute('aria-current')
  })

  it('is not drawn until the account is known', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    renderAt('/home')
    expect(screen.queryByRole('navigation', { name: 'Personal' })).not.toBeInTheDocument()
  })
})
