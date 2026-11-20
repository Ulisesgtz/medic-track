import { describe, it, expect } from 'vitest'
import { selectedCard, selectedDot, selectedDotRing, selectedFill } from './selection'

describe('selection classes (spec 078)', () => {
  it('draw the chosen option in the action blue, white text on a fill', () => {
    expect(selectedFill).toBe('border-action bg-action text-white')
    expect(selectedCard).toBe('border-action')
    expect(selectedDotRing).toBe('border-action')
    expect(selectedDot).toBe('bg-action')
  })

  it('never use ink', () => {
    for (const classes of [selectedFill, selectedCard, selectedDotRing, selectedDot]) expect(classes).not.toMatch(/ink/)
  })
})
