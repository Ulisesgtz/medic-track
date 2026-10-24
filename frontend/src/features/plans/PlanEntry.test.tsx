import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Account } from '../home/types'
import { PlanEntry } from './PlanEntry'

const show = (account: Pick<Account, 'plan' | 'family'>) =>
  render(
    <MemoryRouter>
      <PlanEntry account={account} />
    </MemoryRouter>,
  )

describe('PlanEntry', () => {
  it('links to the plans and says the account is on the free plan', () => {
    show({ plan: 'free' })
    const link = screen.getByRole('link', { name: /Planes/ })
    expect(link).toHaveAttribute('href', '/planes')
    expect(link).toHaveTextContent('Plan gratuito')
    expect(link).toHaveTextContent('MX$499 al año')
  })

  it('says it is the full plan for an account that pays, with a way to see the subscription', () => {
    show({ plan: 'paid' })
    expect(screen.getByRole('link', { name: /Planes/ })).toHaveTextContent('Plan completo · ver mi suscripción')
  })

  it('says who includes the plan for a guest of a paid family', () => {
    show({ plan: 'free', family: { role: 'tutor', ownerAccountId: 'o', ownerName: 'Ana García', plan: 'paid', readOnly: false } })
    expect(screen.getByRole('link', { name: /Planes/ })).toHaveTextContent('incluido por la familia de Ana')
  })

  it('never writes urgency, discounts or advice', () => {
    show({ plan: 'free' })
    expect(screen.getByRole('link')).not.toHaveTextContent(/oferta|descuento|ahorra|última oportunidad|hoy mismo/i)
  })
})
