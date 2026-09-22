import { createRef } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FreemiumLimitModal } from './FreemiumLimitModal'

describe('FreemiumLimitModal', () => {
  it('shows the plan-limit message from the mockups as a dialog', () => {
    render(<FreemiumLimitModal onViewPlans={() => {}} onStayFree={() => {}} />)

    const dialog = screen.getByRole('dialog', { name: 'Llegaste a un hijo registrado' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Plan gratuito')).toBeInTheDocument()
    expect(screen.getByText(/Para dar de alta a otro hijo necesitas ampliar tu plan/)).toBeInTheDocument()
    expect(screen.getByText(/Tus datos actuales se mantienen intactos\./)).toBeInTheDocument()
  })

  it('names the existing child in the message on wide layouts', () => {
    render(<FreemiumLimitModal onViewPlans={() => {}} onStayFree={() => {}} childName="Mateo" />)

    expect(screen.getByText(/Mateo sigue disponible sin cambios/)).toBeInTheDocument()
  })

  it('renders into <body>, outside whatever opened it', () => {
    const { container } = render(<FreemiumLimitModal onViewPlans={() => {}} onStayFree={() => {}} />)

    expect(container).toBeEmptyDOMElement()
    expect(document.body.contains(screen.getByRole('dialog'))).toBe(true)
  })

  it('calls onViewPlans when "Ver planes" is clicked, and the button reads "Abriendo planes…"', async () => {
    const user = userEvent.setup()
    const onViewPlans = vi.fn()
    render(<FreemiumLimitModal onViewPlans={onViewPlans} onStayFree={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Ver planes' }))

    expect(onViewPlans).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Abriendo planes…' })).toBeInTheDocument()
  })

  it('calls onStayFree when "Entendido" is clicked', async () => {
    const user = userEvent.setup()
    const onStayFree = vi.fn()
    render(<FreemiumLimitModal onViewPlans={() => {}} onStayFree={onStayFree} />)

    await user.click(screen.getByRole('button', { name: 'Entendido' }))

    expect(onStayFree).toHaveBeenCalledOnce()
  })

  it('calls onStayFree when clicking the overlay outside the dialog', async () => {
    const user = userEvent.setup()
    const onStayFree = vi.fn()
    render(<FreemiumLimitModal onViewPlans={() => {}} onStayFree={onStayFree} />)

    await user.click(screen.getByRole('dialog').parentElement as Element)

    expect(onStayFree).toHaveBeenCalledOnce()
  })

  it('does not call onStayFree when clicking inside the dialog content', async () => {
    const user = userEvent.setup()
    const onStayFree = vi.fn()
    render(<FreemiumLimitModal onViewPlans={() => {}} onStayFree={onStayFree} />)

    await user.click(screen.getByRole('dialog'))

    expect(onStayFree).not.toHaveBeenCalled()
  })

  it('calls onStayFree when Escape is pressed', async () => {
    const user = userEvent.setup()
    const onStayFree = vi.fn()
    render(<FreemiumLimitModal onViewPlans={() => {}} onStayFree={onStayFree} />)

    await user.keyboard('{Escape}')

    expect(onStayFree).toHaveBeenCalledOnce()
  })

  it('starts on "Ver planes", traps Tab between the two buttons, and gives focus back to the opener', async () => {
    const user = userEvent.setup()
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const { unmount } = render(<FreemiumLimitModal onViewPlans={() => {}} onStayFree={() => {}} />)

    const stayButton = screen.getByRole('button', { name: 'Entendido' })
    const viewPlansButton = screen.getByRole('button', { name: 'Ver planes' })
    expect(viewPlansButton).toHaveFocus()

    await user.tab() // last -> wraps to the first
    expect(stayButton).toHaveFocus()

    await user.tab({ shift: true }) // first -> wraps to the last
    expect(viewPlansButton).toHaveFocus()

    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it('returns focus to the given `opener` ref instead of document.activeElement, when provided', () => {
    const realOpener = document.createElement('button')
    document.body.append(realOpener)
    const unrelatedFocusedElement = document.createElement('button')
    document.body.append(unrelatedFocusedElement)
    unrelatedFocusedElement.focus()

    const openerRef = createRef<HTMLButtonElement>()
    // @ts-expect-error test-only assignment to a ref created outside React
    openerRef.current = realOpener

    const { unmount } = render(
      <FreemiumLimitModal onViewPlans={() => {}} onStayFree={() => {}} opener={openerRef} />,
    )
    unmount()

    expect(realOpener).toHaveFocus()
    expect(unrelatedFocusedElement).not.toHaveFocus()
    realOpener.remove()
    unrelatedFocusedElement.remove()
  })
})
