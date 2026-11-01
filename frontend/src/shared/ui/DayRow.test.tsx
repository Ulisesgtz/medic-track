import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DayIcon, DayRow } from './DayRow'

describe('DayRow', () => {
  it('shows the title and the value, the icon hidden from screen readers', () => {
    const { container } = render(<DayRow kind="med" title="Medicamentos" value="3 tomas hoy · 1 por marcar" />)
    expect(screen.getByText('Medicamentos')).toHaveClass('text-[13px]')
    expect(screen.getByText('3 tomas hoy · 1 por marcar')).toBeInTheDocument()
    expect(container.querySelector('[aria-hidden="true"] svg rect')).not.toBeNull()
  })

  it('draws a drop for a supplement and a check for an activity, and the web title is a size bigger', () => {
    const { container } = render(
      <>
        <DayRow kind="sup" title="Suplementos" value="1 de 2" variant="desktop" />
        <DayIcon kind="act" size="md" />
      </>,
    )
    expect(screen.getByText('Suplementos')).toHaveClass('text-[14px]')
    expect(container.querySelectorAll('svg path')).toHaveLength(2)
    expect(container.querySelector('svg circle')).not.toBeNull()
    expect(container.querySelector('.h-10.w-10')).not.toBeNull()
  })
})
