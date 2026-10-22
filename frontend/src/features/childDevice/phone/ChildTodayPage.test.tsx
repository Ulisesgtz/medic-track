import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PHONE } from '../childText'
import { ChildTodayPage } from './ChildTodayPage'

afterEach(() => window.localStorage.clear())

describe('ChildTodayPage', () => {
  it('without a credential it shows the one sentence of no access and no data', () => {
    render(<ChildTodayPage />)
    expect(screen.getByText(PHONE.noAccess)).toBeInTheDocument()
  })

  it('with a credential it shows the child screen', () => {
    window.localStorage.setItem('hijo-credencial', 'cred')
    render(<ChildTodayPage />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })
})
