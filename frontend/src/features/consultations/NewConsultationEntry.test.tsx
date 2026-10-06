import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { NewConsultationEntry } from './NewConsultationEntry'

function renderEntry(blocked: boolean) {
  return render(
    <MemoryRouter initialEntries={['/hijo']}>
      <Routes>
        <Route
          path="/hijo"
          element={
            <NewConsultationEntry to="/hijo/nueva" blocked={blocked} className="entry">
              Nueva consulta
            </NewConsultationEntry>
          }
        />
        <Route path="/hijo/nueva" element={<p>FORMULARIO</p>} />
        <Route path="/planes" element={<p>PLANES</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

// specs/030: with a treatment still running on the free plan, the plan pop-up opens right away instead of a form the
// server would refuse after it was filled in.
describe('NewConsultationEntry', () => {
  it('is a link to the form when the plan allows another consultation', async () => {
    const user = userEvent.setup()
    renderEntry(false)

    const link = screen.getByRole('link', { name: 'Nueva consulta' })
    expect(link).toHaveAttribute('href', '/hijo/nueva')
    expect(link).toHaveClass('entry')
    await user.click(link)
    expect(screen.getByText('FORMULARIO')).toBeInTheDocument()
  })

  it('is a button that opens the plan pop-up, not the form, when the free plan has a treatment running', async () => {
    const user = userEvent.setup()
    renderEntry(true)

    expect(screen.queryByRole('link', { name: 'Nueva consulta' })).not.toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Nueva consulta' })
    expect(button).toHaveClass('entry')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(button)

    expect(screen.getByRole('dialog', { name: 'Ya tienes un tratamiento activo' })).toBeInTheDocument()
    expect(screen.queryByText('FORMULARIO')).not.toBeInTheDocument()
  })

  it('"Entendido" closes it and gives the focus back to the button', async () => {
    const user = userEvent.setup()
    renderEntry(true)
    await user.click(screen.getByRole('button', { name: 'Nueva consulta' }))

    await user.click(screen.getByRole('button', { name: 'Entendido' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nueva consulta' })).toHaveFocus()
  })

  it('"Ver planes" goes to the plans screen', async () => {
    const user = userEvent.setup()
    renderEntry(true)
    await user.click(screen.getByRole('button', { name: 'Nueva consulta' }))

    await user.click(screen.getByRole('button', { name: 'Ver planes' }))

    expect(await screen.findByText('PLANES')).toBeInTheDocument()
  })
})
