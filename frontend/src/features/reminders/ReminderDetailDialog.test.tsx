import { describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReminderDetailDialog } from './ReminderDetailDialog'

function renderDialog(current: 'detailed' | 'generic' | null = null) {
  const onChoose = vi.fn()
  const onCancel = vi.fn()
  const opener = createRef<HTMLButtonElement>()
  const view = render(
    <>
      <button ref={opener} type="button">
        opener
      </button>
      <ReminderDetailDialog
        childName="Mateo"
        current={current}
        onChoose={onChoose}
        onCancel={onCancel}
        opener={opener}
      />
    </>,
  )
  return { onChoose, onCancel, opener, view }
}

describe('ReminderDetailDialog', () => {
  it('is a real dialog with an example of each option', () => {
    renderDialog()
    const dialog = screen.getByRole('dialog', { name: '¿Qué muestran los avisos?' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Amoxicilina · 08:00 · Mateo')).toBeInTheDocument()
    expect(screen.getByText('Hay una toma programada · 08:00')).toBeInTheDocument()
    expect(screen.getByText(/pantalla bloqueada podrá leer/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Mostrar detalle/ })).toHaveFocus()
  })

  it('marks the current choice', () => {
    renderDialog('generic')
    expect(screen.getByRole('button', { name: /Texto genérico/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Mostrar detalle/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('choosing reports the option', async () => {
    const { onChoose } = renderDialog()
    await userEvent.click(screen.getByRole('button', { name: /Texto genérico/ }))
    expect(onChoose).toHaveBeenCalledWith('generic')
  })

  it('Escape, the backdrop and "Cancelar" cancel; a click inside does not', async () => {
    const { onCancel } = renderDialog()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('dialog'))
    expect(onCancel).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('dialog').parentElement!)
    expect(onCancel).toHaveBeenCalledTimes(2)

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onCancel).toHaveBeenCalledTimes(3)
  })

  it('closing gives focus back to the button that opened it, even when that button never got focus', () => {
    const { opener, view } = renderDialog()
    // Safari doesn't focus a clicked button: something else is active when the dialog closes.
    document.body.focus()
    view.rerender(<button ref={opener} type="button">opener</button>)
    expect(opener.current).toHaveFocus()
  })

  it('Tab stays inside the dialog', () => {
    renderDialog()
    const first = screen.getByRole('button', { name: /Mostrar detalle/ })
    const last = screen.getByRole('button', { name: 'Cancelar' })

    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(first).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()

    screen.getByRole('button', { name: /Texto genérico/ }).focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByRole('button', { name: /Texto genérico/ })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'a' })
  })
})
