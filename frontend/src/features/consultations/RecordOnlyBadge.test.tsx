import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RecordOnlyBadge } from './RecordOnlyBadge'

describe('RecordOnlyBadge (specs/024)', () => {
  it('says "Solo registro" and nothing else', () => {
    render(<RecordOnlyBadge />)

    expect(screen.getByText('Solo registro')).toBeInTheDocument()
  })

  it('is neutral: a thin slate border, ink text, never red or amber (Principio I)', () => {
    render(<RecordOnlyBadge />)

    const badge = screen.getByText('Solo registro')
    expect(badge).toHaveClass('border-slate-300', 'text-ink-soft')
    expect(badge.className).not.toMatch(/red|amber|pending/)
  })

  it('takes extra classes from its place', () => {
    render(<RecordOnlyBadge className="ml-2" />)

    expect(screen.getByText('Solo registro')).toHaveClass('ml-2')
  })
})
