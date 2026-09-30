import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { hasUnsavedWork, markUnsaved, useUnsavedWork } from './unsavedWork'

function Form({ dirty }: { dirty: boolean }) {
  useUnsavedWork(dirty)
  return null
}

describe('unsavedWork (specs/017)', () => {
  it('counts forms with work and releases each only once', () => {
    expect(hasUnsavedWork()).toBe(false)
    const a = markUnsaved()
    const b = markUnsaved()
    a()
    a()
    expect(hasUnsavedWork()).toBe(true)
    b()
    expect(hasUnsavedWork()).toBe(false)
  })

  it('a form registers while dirty and stops when it is clean or gone', () => {
    const { rerender, unmount } = render(<Form dirty={false} />)
    expect(hasUnsavedWork()).toBe(false)

    rerender(<Form dirty />)
    expect(hasUnsavedWork()).toBe(true)

    rerender(<Form dirty={false} />)
    expect(hasUnsavedWork()).toBe(false)

    rerender(<Form dirty />)
    unmount()
    expect(hasUnsavedWork()).toBe(false)
  })
})
