import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ConsultationCard } from './ConsultationCard'

const consultation = { id: 'c1', doctorName: 'Dra. López', consultDate: '2026-01-15' }

function renderCard(isLatest?: boolean) {
  render(
    <MemoryRouter>
      <ConsultationCard consultation={consultation} isLatest={isLatest} />
    </MemoryRouter>,
  )
}

describe('ConsultationCard', () => {
  it('links to the consultation detail with doctor and date', () => {
    renderCard()

    const link = screen.getByRole('link', { name: /Dra. López/ })
    expect(link).toHaveAttribute('href', '/consultations/c1')
    expect(screen.getByText('15 ene 2026')).toBeInTheDocument()
  })

  it('uses the bright accent bar only for the most recent consultation', () => {
    renderCard(true)
    expect(document.querySelector('span[aria-hidden="true"]')).toHaveClass('bg-bright')
  })

  it('uses the soft accent bar for earlier consultations', () => {
    renderCard(false)
    expect(document.querySelector('span[aria-hidden="true"]')).toHaveClass('bg-cyan-100')
  })
})
