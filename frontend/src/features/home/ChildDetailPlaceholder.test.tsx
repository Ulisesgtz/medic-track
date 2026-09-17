import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ChildDetailPlaceholder } from './ChildDetailPlaceholder'

describe('ChildDetailPlaceholder', () => {
  it('shows the child id and a link back to the home page (FR-005)', () => {
    render(
      <MemoryRouter initialEntries={['/children/child-42']}>
        <Routes>
          <Route path="/children/:childId" element={<ChildDetailPlaceholder />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText(/child-42/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver a mi home' })).toHaveAttribute('href', '/home')
  })
})
