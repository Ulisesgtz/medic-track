import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PullIndicator } from './PullIndicator'
import type { PullState } from './usePullToRefresh'

const show = (state: PullState) =>
  render(
    <MemoryRouter>
      <PullIndicator state={state} />
    </MemoryRouter>,
  )

describe('PullIndicator (specs/017)', () => {
  it('shows nothing when idle', () => {
    const { container } = show({ phase: 'idle', distance: 0, ready: false })
    expect(container).toBeEmptyDOMElement()
  })

  it('invites to pull, then to let go, and follows the finger', () => {
    const { unmount } = show({ phase: 'pulling', distance: 30, ready: false })
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Jala para actualizar')
    expect(status.style.transform).toContain('30px')
    unmount()

    show({ phase: 'pulling', distance: 72, ready: true })
    expect(screen.getByRole('status')).toHaveTextContent('Suelta para actualizar')
  })

  it('says it is updating', () => {
    show({ phase: 'refreshing', distance: 72, ready: true })
    expect(screen.getByRole('status')).toHaveTextContent('Actualizando…')
  })

  it('says it could not update, in Spanish and without technical detail', () => {
    show({ phase: 'failed', distance: 0, ready: false })
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos actualizar. Revisa tu conexión.')
  })
})
