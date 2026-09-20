import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ConsultationCard } from './ConsultationCard'

const consultation = {
  id: 'c1', doctorName: 'Dra. López', consultDate: '2026-01-15', symptoms: 'Fiebre y tos', medicationCount: 2,
}

function renderCard(isLatest?: boolean, overrides: Partial<typeof consultation> = {}, variant?: 'phone' | 'desktop') {
  render(
    <MemoryRouter>
      <ConsultationCard consultation={{ ...consultation, ...overrides }} isLatest={isLatest} variant={variant} />
    </MemoryRouter>,
  )
  return screen.getByRole('link', { name: /Dra. López/ })
}

describe('ConsultationCard', () => {
  it('links to the consultation detail with doctor and date', () => {
    const link = renderCard()

    expect(link).toHaveAttribute('href', '/consultations/c1')
    expect(screen.getByText('15 ene 2026')).toBeInTheDocument()
  })

  it('uses the bright accent bar only for the most recent consultation', () => {
    expect(renderCard(true)).toHaveClass('border-bright')
  })

  it('uses the soft accent bar for earlier consultations', () => {
    expect(renderCard(false)).toHaveClass('border-[#cffafe]')
  })

  it('shows "Ver →" on the web design only', () => {
    renderCard(false, {}, 'desktop')
    expect(screen.getByText('Ver →')).toBeInTheDocument()
  })

  it('has no "Ver →" on the phone design', () => {
    renderCard(false, {}, 'phone')
    expect(screen.queryByText('Ver →')).not.toBeInTheDocument()
  })
})

describe('ConsultationCard subtitle', () => {
  it('shows the symptoms and how many medications were prescribed', () => {
    renderCard()
    expect(screen.getByText('Fiebre y tos · 2 medicamentos')).toBeInTheDocument()
  })

  it('uses the singular for a single medication', () => {
    renderCard(false, { medicationCount: 1 })
    expect(screen.getByText('Fiebre y tos · 1 medicamento')).toBeInTheDocument()
  })

  it('shows only the medication count when there are no symptoms', () => {
    renderCard(false, { symptoms: '  ' })
    expect(screen.getByText('2 medicamentos')).toBeInTheDocument()
  })

  it('reads "sin receta" for a visit with no medication', () => {
    renderCard(false, { symptoms: 'Control de peso', medicationCount: 0 })
    expect(screen.getByText('Control de peso · sin receta')).toBeInTheDocument()
  })
})
