import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { useBodyScrollLock } from './useBodyScrollLock'

function Overlay() {
  useBodyScrollLock()
  return <div role="dialog" />
}

describe('useBodyScrollLock', () => {
  it('stops the page from scrolling while the overlay is open and gives it back when it closes', () => {
    document.body.style.overflow = 'auto'
    const { unmount } = render(<Overlay />)
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.documentElement.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('auto')
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('keeps the page locked until the LAST of several overlays closes', () => {
    const first = render(<Overlay />)
    const second = render(<Overlay />)
    first.unmount()
    expect(document.body.style.overflow).toBe('hidden')
    second.unmount()
    expect(document.body.style.overflow).not.toBe('hidden')
  })
})
