import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ConsultationCard } from './ConsultationCard'
import type { ConsultationSummary } from './types'

const consultation: ConsultationSummary = {
  id: 'c1', doctorName: 'Dra. López', consultDate: '2026-01-15', notes: 'Fiebre y tos', symptomNames: [], medicationCount: 2,
}

function renderCard(isLatest?: boolean, overrides: Partial<ConsultationSummary> = {}, variant?: 'phone' | 'desktop') {
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
    expect(renderCard(false)).toHaveClass('border-hint-edge')
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
  it('shows the marked symptoms instead of the notes', () => {
    renderCard(false, { symptomNames: ['Fiebre'] })
    expect(screen.getByText('Fiebre · 2 medicamentos')).toBeInTheDocument()
  })

  it('shows up to three symptoms and how many more (specs/012 FR-015)', () => {
    renderCard(false, { symptomNames: ['Fiebre', 'Tos', 'Vómito'] })
    expect(screen.getByText('Fiebre, Tos, Vómito · 2 medicamentos')).toBeInTheDocument()
  })

  it('adds "+N" when there are more than three symptoms', () => {
    renderCard(false, { symptomNames: ['Fiebre', 'Tos', 'Vómito', 'Diarrea', 'Náuseas'] })
    expect(screen.getByText('Fiebre, Tos, Vómito +2 · 2 medicamentos')).toBeInTheDocument()
  })

  it('without marked symptoms, shows the notes and how many medications were prescribed', () => {
    renderCard()
    expect(screen.getByText('Fiebre y tos · 2 medicamentos')).toBeInTheDocument()
  })

  it('uses the singular for a single medication', () => {
    renderCard(false, { medicationCount: 1 })
    expect(screen.getByText('Fiebre y tos · 1 medicamento')).toBeInTheDocument()
  })

  it('shows only the medication count when there are no symptoms nor notes', () => {
    renderCard(false, { notes: '  ' })
    expect(screen.getByText('2 medicamentos')).toBeInTheDocument()
  })

  it('reads "sin receta" for a visit with no medication', () => {
    renderCard(false, { notes: 'Control de peso', medicationCount: 0 })
    expect(screen.getByText('Control de peso · sin receta')).toBeInTheDocument()
  })
})

describe('ConsultationCard, record only (specs/024)', () => {
  it('tags a consultation saved only as a record, in both designs', () => {
    renderCard(false, { recordOnly: true })
    expect(screen.getByText('Solo registro')).toBeInTheDocument()
  })

  it('has no tag otherwise, nor when the backend sends no such field', () => {
    renderCard(false, { recordOnly: false })
    expect(screen.queryByText('Solo registro')).not.toBeInTheDocument()
  })

  it('the web card carries it too', () => {
    renderCard(false, { recordOnly: true }, 'desktop')
    expect(screen.getByText('Solo registro')).toBeInTheDocument()
  })
})
