import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FreemiumBanner } from './FreemiumBanner'

describe('FreemiumBanner', () => {
  it('shows the freemium limit message', () => {
    render(<FreemiumBanner onViewPlans={() => {}} />)

    expect(screen.getByText(/plan gratuito incluye solo un hijo/i)).toBeInTheDocument()
    expect(screen.getByText(/contrata el plan completo/i)).toBeInTheDocument()
  })

  it('calls onViewPlans when "Ver planes" is clicked', async () => {
    const user = userEvent.setup()
    const onViewPlans = vi.fn()
    render(<FreemiumBanner onViewPlans={onViewPlans} />)

    await user.click(screen.getByRole('button', { name: 'Ver planes' }))

    expect(onViewPlans).toHaveBeenCalledOnce()
  })
})
