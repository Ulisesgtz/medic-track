import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StickyActionBar } from './StickyActionBar'

describe('StickyActionBar', () => {
  it('on the phone pins the button to the bottom (sticky, not fixed), full width, over the safe area', () => {
    render(
      <StickyActionBar variant="phone">
        <button>Guardar suplemento</button>
      </StickyActionBar>,
    )
    const bar = screen.getByRole('button', { name: 'Guardar suplemento' }).parentElement!
    expect(bar).toHaveClass('sticky', 'bottom-0', 'border-hint-edge', '[&>*]:w-full')
    expect(bar).not.toHaveClass('fixed')
    expect(bar.style.paddingBottom).toContain('safe-area-inset-bottom')
  })

  it('on the web the button just goes at the end of the form', () => {
    render(
      <StickyActionBar variant="desktop">
        <button>Guardar</button>
      </StickyActionBar>,
    )
    expect(screen.getByRole('button', { name: 'Guardar' }).parentElement).not.toHaveClass('sticky')
  })
})
