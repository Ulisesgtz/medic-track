import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProgressBar } from './ProgressBar'
import type { Dose } from './types'

const dose = (taken: boolean, status: Dose['status'] = taken ? 'taken' : 'due'): Dose => ({
  id: Math.random().toString(),
  scheduledAt: '2026-01-15T08:00:00Z',
  taken,
  status,
})

describe('ProgressBar (specs/014)', () => {
  it('shows "N / total tomas" and an accessible bar in that proportion', () => {
    render(<ProgressBar doses={[dose(true), dose(true), dose(true), ...Array.from({ length: 6 }, () => dose(false, 'pending'))]} />)

    expect(screen.getByText('3 / 9 tomas')).toBeInTheDocument()
    const bar = screen.getByRole('progressbar', { name: 'Progreso de las tomas' })
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '9')
    expect(bar).toHaveAttribute('aria-valuenow', '3')
    expect(bar).toHaveAttribute('aria-valuetext', '3 de 9 tomas registradas')
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('33%')
  })

  it('mentions the unregistered doses apart, without counting them', () => {
    render(<ProgressBar doses={[dose(true), dose(false, 'unregistered'), dose(false, 'unregistered'), dose(false, 'pending')]} />)

    expect(screen.getByText(/1 \/ 4 tomas/)).toHaveTextContent('1 / 4 tomas · 2 sin registrar')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
  })

  it('has no mention of unregistered doses when there are none, and is full when all are marked', () => {
    render(<ProgressBar doses={[dose(true)]} />)

    expect(screen.getByText('1 / 1 toma')).toBeInTheDocument()
    expect(screen.queryByText(/sin registrar/)).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '1 de 1 toma registrada')
    expect((screen.getByRole('progressbar').firstElementChild as HTMLElement).style.width).toBe('100%')
  })

  it('shows nothing for a medication without doses', () => {
    const { container } = render(<ProgressBar doses={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
