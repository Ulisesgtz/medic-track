import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Logo } from './Logo'

describe('Logo', () => {
  it('renders the icon with an accessible name and the wordmark by default', () => {
    render(<Logo />)

    expect(screen.getByRole('img', { name: 'PediTrack' })).toBeInTheDocument()
    expect(screen.getByText('Pedi')).toBeInTheDocument()
    expect(screen.getByText('Track')).toBeInTheDocument()
  })

  it('renders the dark variant with white/bright wordmark colors', () => {
    render(<Logo variant="dark" />)

    expect(screen.getByText('Pedi')).toHaveStyle({ color: '#ffffff' })
    expect(screen.getByText('Track')).toHaveStyle({ color: '#67e8f9' })
  })

  it('renders the light variant with ink/action wordmark colors', () => {
    render(<Logo variant="light" />)

    expect(screen.getByText('Pedi')).toHaveStyle({ color: '#04252b' })
    expect(screen.getByText('Track')).toHaveStyle({ color: '#0e7490' })
  })

  it('omits the wordmark when showWordmark is false', () => {
    render(<Logo showWordmark={false} />)

    expect(screen.getByRole('img', { name: 'PediTrack' })).toBeInTheDocument()
    expect(screen.queryByText('Pedi')).not.toBeInTheDocument()
  })

  it('applies the requested pixel size to the icon', () => {
    render(<Logo size={64} />)

    const icon = screen.getByRole('img', { name: 'PediTrack' })
    expect(icon).toHaveAttribute('width', '64')
    expect(icon).toHaveAttribute('height', '64')
  })
})
