import { describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExtendTreatmentDialog } from './ExtendTreatmentDialog'

// The last dose of the medication: Oct 6, 16:00 local. Every 8 h, so N doses later is N × 8 h after.
const lastDoseAt = new Date(2026, 9, 6, 16).toISOString()

function renderDialog(props: Partial<Parameters<typeof ExtendTreatmentDialog>[0]> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  const opener = createRef<HTMLButtonElement>()
  const view = render(
    <>
      <button ref={opener} type="button">
        opener
      </button>
      <ExtendTreatmentDialog
        medicationName="Amoxicilina"
        frequencyHours={8}
        lastDoseAt={lastDoseAt}
        proposed={3}
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

const field = () => screen.getByRole('textbox', { name: 'Tomas a agregar' })
const confirm = () => screen.getByRole('button', { name: 'Sí, recorrer' })

describe('ExtendTreatmentDialog (specs/020)', () => {
  it('is a real dialog that asks about the doctor, says it is recorded and cannot be undone, with the safe button focused', () => {
    renderDialog()

    const dialog = screen.getByRole('dialog', { name: '¿Recorrer el tratamiento de Amoxicilina?' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveTextContent('¿Tu médico te indicó reponer las tomas?')
    expect(dialog).toHaveTextContent('Las 3 tomas sin registrar se conservan.')
    expect(dialog).toHaveTextContent('Esto queda registrado en tu cuenta. No se puede deshacer.')
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
  })

  it('proposes the number and says where the treatment would end with it', () => {
    renderDialog()

    expect(field()).toHaveValue('3')
    // Oct 6 16:00 + 3 × 8 h = Oct 7 16:00.
    expect(screen.getByText('Quedaría hasta el 07 oct.')).toBeInTheDocument()
    expect(screen.queryByText(/ingresaste tú manualmente/)).not.toBeInTheDocument()
  })

  it('confirming the proposed number sends it, with no note about typing it', async () => {
    const { onConfirm } = renderDialog()

    await userEvent.click(confirm())

    expect(onConfirm).toHaveBeenCalledWith(3)
  })

  it('a number of the parents own shows the note, moves the date and is what is sent', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog()

    await user.clear(field())
    await user.type(field(), '6')

    expect(screen.getByRole('status')).toHaveTextContent('Cambiaste el número propuesto: quedará registrado que lo ingresaste tú manualmente.')
    // + 6 × 8 h = Oct 8 16:00.
    expect(screen.getByText('Quedaría hasta el 08 oct.')).toBeInTheDocument()
    await user.click(confirm())
    expect(onConfirm).toHaveBeenCalledWith(6)

    // Back to the proposal: the note goes away.
    await user.clear(field())
    await user.type(field(), '3')
    expect(screen.queryByText(/ingresaste tú manualmente/)).not.toBeInTheDocument()
  })

  it.each(['', '0', '61', '-2', '2.5', 'tres', '1000'])('does not accept "%s": says so and cannot confirm', async (value) => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog()

    await user.clear(field())
    if (value) await user.type(field(), value)

    expect(screen.getByRole('alert')).toHaveTextContent('Escribe un número entero de 1 a 60.')
    expect(field()).toHaveAttribute('aria-invalid', 'true')
    expect(confirm()).toBeDisabled()
    await user.click(confirm())
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('accepts the limits 1 and 60', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.clear(field())
    await user.type(field(), '60')
    expect(confirm()).toBeEnabled()
    await user.clear(field())
    await user.type(field(), '1')
    expect(confirm()).toBeEnabled()
  })

  it('says a single unregistered dose in the singular', () => {
    renderDialog({ proposed: 1 })
    expect(screen.getByRole('dialog')).toHaveTextContent('La toma sin registrar se conserva.')
  })

  it('cancels with the button, Escape and the backdrop, not with a click inside', async () => {
    const { onCancel } = renderDialog()

    await userEvent.click(screen.getByRole('dialog'))
    expect(onCancel).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    await userEvent.click(screen.getByRole('dialog').parentElement!)
    expect(onCancel).toHaveBeenCalledTimes(3)
  })

  it('Tab stays inside, going round the field and both buttons', () => {
    renderDialog()
    const cancel = screen.getByRole('button', { name: 'Cancelar' })

    confirm().focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(field()).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(confirm()).toHaveFocus()

    cancel.focus()
    fireEvent.keyDown(document, { key: 'Tab' }) // in the middle: the browser moves it, we do not
    expect(cancel).toHaveFocus()
    fireEvent.keyDown(document, { key: 'a' })
  })

  it('while sending, nothing closes it and the field is locked; the error shows', async () => {
    const { onCancel } = renderDialog({ busy: true, error: 'No pudimos recorrer el tratamiento. Inténtalo de nuevo.' })

    expect(screen.getByRole('button', { name: 'Recorriendo…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    expect(field()).toBeDisabled()
    expect(screen.getByText('No pudimos recorrer el tratamiento. Inténtalo de nuevo.')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    await userEvent.click(screen.getByRole('dialog').parentElement!)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('gives the focus back to the button that opened it when it closes', () => {
    const { opener, hideDialog } = renderDialog()
    const button = opener.current!
    expect(button).not.toHaveFocus()

    hideDialog()

    expect(button).toHaveFocus()
  })
})
