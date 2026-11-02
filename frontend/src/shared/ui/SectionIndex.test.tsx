import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SectionIndex } from './SectionIndex'

const sections = [
  { id: 'consultas', label: 'Consultas' },
  { id: 'cartilla', label: 'Cartilla' },
]

function page(variant: 'phone' | 'desktop' = 'phone') {
  return render(
    <>
      <SectionIndex sections={sections} variant={variant} />
      <section id="consultas">Consultas</section>
      <section id="cartilla">Cartilla</section>
    </>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('SectionIndex', () => {
  it('one pill per section given, pointing to it; on the phone it sticks to the top', () => {
    page()
    const nav = screen.getByRole('navigation', { name: 'Secciones' })
    expect(nav).toHaveClass('sticky', 'top-0')
    expect(screen.getByRole('link', { name: 'Cartilla' })).toHaveAttribute('href', '#cartilla')
    expect(screen.getByRole('link', { name: 'Consultas' })).toHaveAttribute('aria-current', 'true')
  })

  it('a pill scrolls to its section (no motion when asked) and becomes the current one', async () => {
    const user = userEvent.setup()
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    page('desktop')
    await user.click(screen.getByRole('link', { name: 'Cartilla' }))
    expect(scroll).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
    expect(screen.getByRole('link', { name: 'Cartilla' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('navigation')).not.toHaveClass('sticky')
  })

  it('follows the section on screen', () => {
    let callback: IntersectionObserverCallback = () => {}
    const observe = vi.fn()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = observe
        disconnect = vi.fn()
        constructor(cb: IntersectionObserverCallback) {
          callback = cb
        }
      },
    )
    page()
    expect(observe).toHaveBeenCalledTimes(2)
    act(() =>
      callback(
        [{ isIntersecting: true, target: document.getElementById('cartilla')!, boundingClientRect: { top: 10 } } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    )
    expect(screen.getByRole('link', { name: 'Cartilla' })).toHaveAttribute('aria-current', 'true')
  })

  it('no index for a single section', () => {
    render(<SectionIndex sections={[sections[0]]} variant="phone" />)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })
})
