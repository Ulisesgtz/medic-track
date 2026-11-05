import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeleteRoutineDialog } from './DeleteRoutineDialog'

function open(props: Partial<Parameters<typeof DeleteRoutineDialog>[0]> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <DeleteRoutineDialog kind="supplement" name="Zinc" busy={false} error={null} onConfirm={onConfirm} onCancel={onCancel} opener={createRef()} {...props} />,
  )
  return { onConfirm, onCancel, dialog: screen.getByRole('dialog') }
}

describe('DeleteRoutineDialog', () => {
  it('asks in neutral words, with the focus on «Cancelar»', async () => {
    const { onConfirm, onCancel, dialog } = open()
    expect(within(dialog).getByRole('heading', { name: '¿Eliminar Zinc?' })).toBeInTheDocument()
    expect(within(dialog).getByText(/para todas las personas de la familia/)).toBeInTheDocument()
    expect(within(dialog).getByText(/No se puede deshacer/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    const user = userEvent.setup()
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(onCancel).toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('an activity of one’s own names no family; it says when it works and when it failed', () => {
    const { dialog } = open({ kind: 'activity', personal: true, name: 'Caminar', busy: true, error: 'No se pudo eliminar. Inténtalo de nuevo.' })
    expect(within(dialog).getByText('La actividad, todos sus horarios y sus avisos.')).toBeInTheDocument()
    expect(within(dialog).getByText(/«Finalizar actividad»/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Eliminando…' })).toBeDisabled()
    expect(within(dialog).getByRole('alert')).toHaveTextContent('No se pudo eliminar')
  })
})
