import { createRef } from 'react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FreemiumLimitModal, type PlanLimitReason } from './FreemiumLimitModal'
import { LIMIT_MOTIVES } from '../plans/planCopy'

// specs/034: one modal for the seven reasons, with the comparison «Ahora tienes / Con el plan completo» (mock LimiteModal).

function stubDesktop(on: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({ matches: on, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('FreemiumLimitModal', () => {
  it.each(Object.keys(LIMIT_MOTIVES) as PlanLimitReason[])('%s: its title, what was tried and three rows with the first one highlighted', (reason) => {
    render(<FreemiumLimitModal reason={reason} onViewPlans={() => {}} onStayFree={() => {}} />)
    const motive = LIMIT_MOTIVES[reason]

    const dialog = screen.getByRole('dialog', { name: motive.title })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription(motive.line)
    expect(screen.getByText('Plan completo', { selector: 'p' })).toBeInTheDocument()
    const table = within(dialog).getByRole('table', { name: 'Comparación de planes' })
    expect(within(table).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Ahora tienes', 'Con el plan completo'])
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    expect(within(rows[0]).getByText('· lo que intentaste')).toBeInTheDocument()
    expect(within(rows[1]).queryByText('· lo que intentaste')).not.toBeInTheDocument()
    motive.rows.forEach((r, i) => {
      expect(within(rows[i]).getByRole('rowheader')).toHaveTextContent(r.label)
      expect(within(rows[i]).getAllByRole('cell').map((c) => c.textContent)).toEqual([r.free, r.full])
    })
  })

  it('is the second-child reason when none is given, and never mentions a child by name', () => {
    render(<FreemiumLimitModal onViewPlans={() => {}} onStayFree={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Tu plan incluye un hijo' })).toBeInTheDocument()
    expect(screen.getByText('Intentaste agregar a otro hijo. El plan gratuito incluye uno.')).toBeInTheDocument()
  })

  it('says the price, that the plan is for the whole family and that what was registered stays', () => {
    render(<FreemiumLimitModal onViewPlans={() => {}} onStayFree={() => {}} />)
    expect(screen.getByText('MX$499')).toBeInTheDocument()
    expect(screen.getByText('al año · una suscripción para toda la familia')).toBeInTheDocument()
    expect(screen.getByText('Lo que ya registraste se queda igual con cualquier plan.')).toBeInTheDocument()
    // No amber, no urgency, no discount.
    expect(screen.queryByText(/ahorra|descuento|últim|solo hoy/i)).not.toBeInTheDocument()
  })

  it('renders into <body>, outside whatever opened it', () => {
    const { container } = render(<FreemiumLimitModal onViewPlans={() => {}} onStayFree={() => {}} />)

    expect(container).toBeEmptyDOMElement()
    expect(document.body.contains(screen.getByRole('dialog'))).toBe(true)
  })

  it('«Ver el plan completo» is a link to /planes whose click goes to the caller, without a page load', async () => {
    const user = userEvent.setup()
    const onViewPlans = vi.fn()
    render(<FreemiumLimitModal onViewPlans={onViewPlans} onStayFree={() => {}} />)

    const link = screen.getByRole('link', { name: 'Ver el plan completo' })
    expect(link).toHaveAttribute('href', '/planes')
    await user.click(link)

    expect(onViewPlans).toHaveBeenCalledOnce()
  })

  it('«Ahora no» and the X stay on the free plan', async () => {
    const user = userEvent.setup()
    const onStayFree = vi.fn()
    render(<FreemiumLimitModal onViewPlans={() => {}} onStayFree={onStayFree} />)

    await user.click(screen.getByRole('button', { name: 'Ahora no' }))
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))

    expect(onStayFree).toHaveBeenCalledTimes(2)
  })

  it('calls onStayFree when clicking the overlay outside the dialog, not inside it', async () => {
    const user = userEvent.setup()
    const onStayFree = vi.fn()
    render(<FreemiumLimitModal onViewPlans={() => {}} onStayFree={onStayFree} />)

    await user.click(screen.getByRole('dialog'))
    expect(onStayFree).not.toHaveBeenCalled()
    await user.click(screen.getByRole('dialog').parentElement as Element)
    expect(onStayFree).toHaveBeenCalledOnce()
  })

  it('calls onStayFree when Escape is pressed', async () => {
    const user = userEvent.setup()
    const onStayFree = vi.fn()
    render(<FreemiumLimitModal onViewPlans={() => {}} onStayFree={onStayFree} />)

    await user.keyboard('{Escape}')

    expect(onStayFree).toHaveBeenCalledOnce()
  })

  it('starts on «Ahora no» (the exit without pressure), traps Tab inside and gives focus back to the opener', async () => {
    const user = userEvent.setup()
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const { unmount } = render(<FreemiumLimitModal onViewPlans={() => {}} onStayFree={() => {}} />)

    const close = screen.getByRole('button', { name: 'Cerrar' })
    const stay = screen.getByRole('button', { name: 'Ahora no' })
    const link = screen.getByRole('link', { name: 'Ver el plan completo' })
    expect(stay).toHaveFocus()

    await user.tab()
    expect(link).toHaveFocus()
    await user.tab() // last -> wraps to the first
    expect(close).toHaveFocus()
    await user.tab({ shift: true }) // first -> wraps to the last
    expect(link).toHaveFocus()

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
    openerRef.current = realOpener

    const { unmount } = render(<FreemiumLimitModal onViewPlans={() => {}} onStayFree={() => {}} opener={openerRef} />)
    unmount()

    expect(realOpener).toHaveFocus()
    realOpener.remove()
    unrelatedFocusedElement.remove()
  })

  it('on the phone is a sheet from the bottom with the actions stacked; on the web it is centered with them to the right', () => {
    stubDesktop(false)
    const phone = render(<FreemiumLimitModal onViewPlans={() => {}} onStayFree={() => {}} />)
    expect(screen.getByRole('dialog').parentElement).toHaveClass('items-end')
    expect(screen.getByRole('button', { name: 'Ahora no' }).parentElement).toHaveClass('flex-col-reverse')
    phone.unmount()

    stubDesktop(true)
    render(<FreemiumLimitModal onViewPlans={() => {}} onStayFree={() => {}} />)
    expect(screen.getByRole('dialog').parentElement).toHaveClass('items-center')
    expect(screen.getByRole('button', { name: 'Ahora no' }).parentElement).toHaveClass('justify-end')
  })

  it('keeps Tab where it is when something unexpected leaves nothing to focus (no crash)', async () => {
    const user = userEvent.setup()
    render(<FreemiumLimitModal onViewPlans={() => {}} onStayFree={() => {}} />)
    screen.getByRole('dialog').innerHTML = ''
    await user.tab()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
