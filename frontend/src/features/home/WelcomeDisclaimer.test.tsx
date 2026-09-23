import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { WelcomeDisclaimer } from './WelcomeDisclaimer'
import { WELCOME_STATE } from './welcomeState'

function renderAt(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/home', state }]}>
      <Routes>
        <Route path="/home" element={<WelcomeDisclaimer />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('WelcomeDisclaimer', () => {
  it('shows the informative-only notice after an account is created', () => {
    renderAt(WELCOME_STATE)

    const region = screen.getByRole('region', { name: 'Antes de empezar' })
    expect(region).toHaveTextContent('informativa y de seguimiento')
    expect(region).toHaveTextContent('no sustituye una consulta médica')
    expect(region).toHaveTextContent('acude siempre a tu médico')
    expect(region).toHaveTextContent('la foto se guarda solo en tu cuenta y no se comparte con nadie')
  })

  it('is not shown on a normal visit to the home', () => {
    renderAt()
    expect(screen.queryByRole('region', { name: 'Antes de empezar' })).not.toBeInTheDocument()
  })

  it('"Entendido" dismisses it', async () => {
    renderAt(WELCOME_STATE)

    await userEvent.click(screen.getByRole('button', { name: 'Entendido' }))

    expect(screen.queryByRole('region', { name: 'Antes de empezar' })).not.toBeInTheDocument()
  })
})
