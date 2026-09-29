import { describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EndTreatmentDialog } from './EndTreatmentDialog'

function renderDialog(props: Partial<Parameters<typeof EndTreatmentDialog>[0]> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  const opener = createRef<HTMLButtonElement>()
  const view = render(
    <>
      <button ref={opener} type="button">
        opener
      </button>
      <EndTreatmentDialog
        medicationName="Amoxicilina"
        busy={false}
        error={null}
        onConfirm={onConfirm}
        onCancel={onCancel}
        opener={opener}
        {...props}
      />
    </>,
  )
  const hideDialog = () =>
    view.rerender(
      <button ref={opener} type="button">
        opener
      </button>,
    )
  return { onConfirm, onCancel, opener, hideDialog }
}

describe('EndTreatmentDialog (specs/016)', () => {
  it('is a real dialog that says what happens, neutrally, and that it cannot be undone', () => {
    renderDialog()

    const dialog = screen.getByRole('dialog', { name: '¿Finalizar el tratamiento de Amoxicilina?' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveTextContent('Se dejarán de avisar las tomas que faltan.')
    expect(dialog).toHaveTextContent('Las tomas registradas se conservan.')
    expect(dialog).toHaveTextContent('No se puede deshacer.')
    // The safe choice has the focus.
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
  })

  it('confirms with the button, cancels with "Cancelar", Escape and the backdrop, not with a click inside', async () => {
    const { onConfirm, onCancel } = renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Finalizar tratamiento' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('dialog'))
    expect(onCancel).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    await userEvent.click(screen.getByRole('dialog').parentElement!)
    expect(onCancel).toHaveBeenCalledTimes(3)
  })

  it('Tab stays inside the dialog', () => {
    renderDialog()
    const cancel = screen.getByRole('button', { name: 'Cancelar' })
    const confirm = screen.getByRole('button', { name: 'Finalizar tratamiento' })

    confirm.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(cancel).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(confirm).toHaveFocus()
    fireEvent.keyDown(document, { key: 'a' })
  })

  it('while ending, nothing closes it: not the buttons, Escape nor the backdrop; the error shows', async () => {
    const { onCancel } = renderDialog({ busy: true, error: 'No pudimos finalizar el tratamiento. Inténtalo de nuevo.' })

    expect(screen.getByRole('button', { name: 'Finalizando…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos finalizar el tratamiento')
    fireEvent.keyDown(document, { key: 'Escape' })
    await userEvent.click(screen.getByRole('dialog').parentElement!)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('gives the focus back to the button that opened it when it closes', () => {
    const { opener, hideDialog } = renderDialog()
    const button = opener.current!
    expect(button).not.toHaveFocus() // the dialog took it

    hideDialog()

    expect(button).toHaveFocus()
  })
})
