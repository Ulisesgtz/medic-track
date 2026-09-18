import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Logo } from './Logo'

describe('Logo', () => {
  it('renders the mark with an accessible name', () => {
    render(<Logo />)
    expect(screen.getByRole('img', { name: 'PediTrack' })).toBeInTheDocument()
  })

  it('uses a distinct clip id per instance, even for the same variant', () => {
    const { container } = render(
      <>
        <Logo variant="dark" />
        <Logo variant="dark" />
        <Logo variant="light" />
      </>,
    )
    const ids = Array.from(container.querySelectorAll('clipPath')).map((node) => node.id)
    expect(new Set(ids).size).toBe(3)
    for (const id of ids) expect(id).not.toMatch(/:/)
  })

  it('honors the requested size', () => {
    const { container } = render(<Logo size={48} />)
    expect(container.querySelector('svg')).toHaveAttribute('width', '48')
  })
})
