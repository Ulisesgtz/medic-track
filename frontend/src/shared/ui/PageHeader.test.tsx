import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { PageHeader, type PageHeaderProps } from './PageHeader'
import { pageHeaderButton } from './pageHeaderButton'
import { PAGE_HEADER, loadFailedTitle } from './pageHeaderText'

const back = { label: '← Mateo', to: '/children/k1' }
const show = (props: Partial<PageHeaderProps> & Pick<PageHeaderProps, 'variant'>) =>
  render(
    <MemoryRouter>
      <PageHeader back={back} title="Vitamina D" {...props} />
    </MemoryRouter>,
  )

describe('PageHeader', () => {
  it.each(['phone', 'desktop'] as const)('%s: «← …», one h1, no dark band (H1)', (variant) => {
    const { container } = show({ variant })
    expect(screen.getByRole('link', { name: '← Mateo' })).toHaveAttribute('href', '/children/k1')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(container.querySelector('.bg-ink')).toBeNull()
  })

  it('the title is 28 px on the phone and 34 px on the web', () => {
    const { unmount } = show({ variant: 'phone' })
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('text-[28px]')
    unmount()
    show({ variant: 'desktop' })
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('text-[34px]')
  })

  it('eyebrow, subtitle, a hint or a line chip and «Editar» (H2, H8)', () => {
    const { unmount } = show({
      variant: 'phone',
      eyebrow: 'Suplemento de Mateo',
      subtitle: 'Todos los días · 08:00',
      chip: { label: 'Activo', tone: 'hint' },
      actions: <button className={pageHeaderButton('edit', 'phone')}>Editar</button>,
    })
    expect(screen.getByText('Suplemento de Mateo')).toHaveClass('uppercase')
    expect(screen.getByText('Todos los días · 08:00')).toBeInTheDocument()
    expect(screen.getByText('Activo')).toHaveClass('bg-hint')
    expect(screen.getByRole('button', { name: 'Editar' })).toHaveClass('min-h-11', 'border-action')
    unmount()
    show({ variant: 'desktop', chip: { label: 'Solo registro', tone: 'line' } })
    expect(screen.getByText('Solo registro')).not.toHaveClass('bg-hint')
  })

  it('the buttons have the design’s sizes: solid primary, outlined secondary', () => {
    expect(pageHeaderButton('primary', 'phone')).toContain('min-h-12')
    expect(pageHeaderButton('primary', 'phone', { tall: true })).toContain('min-h-[52px]')
    expect(pageHeaderButton('primary', 'desktop')).toContain('min-h-[52px]')
    expect(pageHeaderButton('primary', 'phone')).toContain('bg-confirmed')
    expect(pageHeaderButton('secondary', 'phone')).toContain('border-action')
  })

  it('«Solo lectura» and the search field (H6, H7)', () => {
    const { container, unmount } = show({ variant: 'phone', readOnly: true, search: <input aria-label="Buscar en el historial" /> })
    expect(screen.getByRole('note')).toHaveTextContent(`${PAGE_HEADER.readOnlyLead} ${PAGE_HEADER.readOnlyRest}`)
    expect(screen.getByRole('textbox', { name: 'Buscar en el historial' }).parentElement).toHaveClass('sticky')
    expect(container.querySelector('header')).not.toContainElement(screen.getByRole('textbox'))
    unmount()
    show({ variant: 'desktop', readOnly: true, search: <input aria-label="Buscar en el historial" /> })
    expect(screen.getByRole('banner')).toContainElement(screen.getByRole('textbox'))
  })

  it.each(['phone', 'desktop'] as const)('%s loading: «← …» works and a skeleton says it loads (H9)', (variant) => {
    show({ variant, state: 'loading' })
    expect(screen.getByRole('link', { name: '← Mateo' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: PAGE_HEADER.loading })).toBeInTheDocument()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it.each(['phone', 'desktop'] as const)('%s error: «← …» works, the error is neutral and «Reintentar» asks again (H10)', async (variant) => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    show({ variant, state: 'error', errorWhat: 'la cartilla', onRetry })
    expect(screen.getByRole('link', { name: '← Mateo' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(loadFailedTitle('la cartilla'))
    expect(screen.getByRole('alert')).toHaveTextContent(PAGE_HEADER.errorBody)
    await user.click(screen.getByRole('button', { name: PAGE_HEADER.retry }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('an error without a way to retry only says it', () => {
    show({ variant: 'phone', state: 'error' })
    expect(screen.getByRole('alert')).toHaveTextContent(loadFailedTitle('esta pantalla'))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
