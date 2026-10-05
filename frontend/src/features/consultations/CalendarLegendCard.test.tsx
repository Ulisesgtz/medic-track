import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { CalendarLegendCard } from './CalendarLegendCard'

describe('CalendarLegendCard (specs/022)', () => {
  it('says how to read the calendar: a filled dot is given, an empty one is not given, the pill is a day of the treatment', () => {
    render(<CalendarLegendCard />)

    const card = screen.getByRole('region', { name: 'Cómo leer el calendario' })
    const items = within(card).getAllByRole('listitem').map((li) => li.textContent)
    expect(items).toEqual(['Punto relleno: dosis dada', 'Punto vacío: dosis sin dar', 'Día dentro del tratamiento'])
  })

  it('does not call an empty dot "sin registrar": a dose still to come is empty too', () => {
    render(<CalendarLegendCard />)
    expect(screen.queryByText(/sin registrar/)).not.toBeInTheDocument()
  })
})
