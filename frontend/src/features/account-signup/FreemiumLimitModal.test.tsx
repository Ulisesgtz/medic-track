import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FreemiumLimitModal } from './FreemiumLimitModal'

describe('FreemiumLimitModal', () => {
  it('shows the freemium limit message as a dialog', () => {
    render(<FreemiumLimitModal onViewPlans={() => {}} onStayFree={() => {}} />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('El plan gratuito incluye solo un hijo por cuenta')).toBeInTheDocument()
    expect(screen.getByText(/contrata el plan completo/i)).toBeInTheDocument()
  })

  it('calls onViewPlans when "Ver planes" is clicked', async () => {
    const user = userEvent.setup()
    const onViewPlans = vi.fn()
    render(<FreemiumLimitModal onViewPlans={onViewPlans} onStayFree={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Ver planes' }))

    expect(onViewPlans).toHaveBeenCalledOnce()
  })

  it('calls onStayFree when "Quedarme con el plan gratuito" is clicked', async () => {
    const user = userEvent.setup()
    const onStayFree = vi.fn()
    render(<FreemiumLimitModal onViewPlans={() => {}} onStayFree={onStayFree} />)

    await user.click(screen.getByRole('button', { name: 'Quedarme con el plan gratuito' }))

    expect(onStayFree).toHaveBeenCalledOnce()
  })

  it('calls onStayFree when clicking the overlay outside the dialog', async () => {
    const user = userEvent.setup()
    const onStayFree = vi.fn()
    const { container } = render(<FreemiumLimitModal onViewPlans={() => {}} onStayFree={onStayFree} />)

    await user.click(container.firstChild as Element)

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
})
