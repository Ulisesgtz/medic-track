import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChildrenSidebar } from './ChildrenSidebar'

// specs/033 part 3 and specs/056: the sidebar's «Personal» group, apart from the children and from «Familia», with one entry —
// «Mi día», the person's own page (their supplements and activities together).

const account = {
  id: 'a1', firstName: 'Ana', lastName: 'Gómez', email: 'ana@example.com', countryCode: null, stateCode: null, plan: 'paid',
  children: [{ id: 'k1', firstName: 'Luis', lastName: 'Gómez', birthDate: '2021-05-10', height: null, weight: null }],
}

function stub() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => account }))
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
  it('has its own group after the children with one link, «Mi día»', async () => {
    stub()
    renderAt('/home')
    const nav = await screen.findByRole('navigation', { name: 'Personal' })
    const links = Array.from(nav.querySelectorAll('a'))
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '/mi-dia')
    expect(links[0]).toHaveTextContent('Mi día')
    expect(links[0]).not.toHaveAttribute('aria-current')
  })

  it('marks it on «Mi día»', async () => {
    stub()
    renderAt('/mi-dia')
    const nav = await screen.findByRole('navigation', { name: 'Personal' })
    expect(nav.querySelector('a')).toHaveAttribute('aria-current', 'page')
  })

  it('is not drawn until the account is known', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    renderAt('/home')
    expect(screen.queryByRole('navigation', { name: 'Personal' })).not.toBeInTheDocument()
  })
})
