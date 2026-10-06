import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfirmDialog } from './ConfirmDialog'
import { FamilyCounter } from './FamilyCounter'
import { FamilyEntry } from './FamilyEntry'
import { formatInstant, namesText } from './roles'
import { RoleChip } from './RoleChip'

afterEach(() => vi.unstubAllGlobals())

describe('namesText', () => {
  it('names one, two and three children, and falls back while there is nobody to name', () => {
    expect(namesText(['Mateo'])).toBe('Mateo')
    expect(namesText(['Mateo', 'Sofía'])).toBe('Mateo y Sofía')
    expect(namesText(['Mateo', 'Sofía', 'Luis'])).toBe('Mateo, Sofía y Luis')
    expect(namesText([])).toBe('tus hijos')
    expect(namesText([], 'los hijos de Ana')).toBe('los hijos de Ana')
  })
})

describe('formatInstant', () => {
  it('says the day and the local time', () => {
    expect(formatInstant(new Date(2026, 9, 13, 18, 40).toISOString())).toBe('13 oct 2026, 18:40')
  })
})

describe('FamilyCounter', () => {
  it('counts the places in text and draws one bar per place, decoration only', () => {
    const { container } = render(<FamilyCounter people={2} pending={1} max={4} variant="phone" />)
    expect(screen.getByText('3 de 4')).toBeInTheDocument()
    expect(screen.getByText('contando invitaciones pendientes')).toBeInTheDocument()
    const bars = container.querySelectorAll('[aria-hidden="true"] > span')
    expect(bars).toHaveLength(4)
    expect(bars[2].className).toContain('border-dashed')
  })

  it('says nothing about pending invitations when there are none (web card)', () => {
    render(<FamilyCounter people={4} pending={0} max={4} variant="desktop" />)
    expect(screen.getByText('4 de 4')).toBeInTheDocument()
    expect(screen.queryByText(/pendientes/)).not.toBeInTheDocument()
  })
})

describe('RoleChip', () => {
  it('names the family account, the Tutor and the Caregiver', () => {
    render(
      <>
        <RoleChip role="owner" />
        <RoleChip role="tutor" />
        <RoleChip role="caregiver" />
      </>,
    )
    expect(screen.getByText('Cuenta de la familia')).toBeInTheDocument()
    expect(screen.getByText('Tutor')).toBeInTheDocument()
    expect(screen.getByText('Cuidador')).toBeInTheDocument()
  })
})

describe('FamilyEntry', () => {
  const renderEntry = (variant: 'phone' | 'desktop', body: unknown) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body } as Response))
    return render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <FamilyEntry variant={variant} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }
  const family = (invitations: unknown[]) => ({
    role: 'owner', plan: 'paid', readOnly: false, owner: { id: 'o', name: 'Ana' },
    members: [{ id: 'm', name: 'Rosa', role: 'caregiver', childId: null, since: '2026-10-01T10:00:00Z', canRemove: true, you: false }],
    invitations, capacity: { max: 4, used: 2 },
  })

  it('links to «Familia» with the people and the places on the phone', async () => {
    renderEntry('phone', family([{ id: 'i', email: 'carmen@x.com', role: 'caregiver', status: 'pending', expiresAt: '2026-10-13T10:00:00Z', childId: null }]))
    expect(await screen.findByText('3 de 4 personas · 1 pendiente')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Familia/ })).toHaveAttribute('href', '/familia')
  })

  it('says «invitación pendiente» and «Ver familia →» on the web', async () => {
    renderEntry('desktop', family([{ id: 'i', email: 'carmen@x.com', role: 'caregiver', status: 'pending', expiresAt: '2026-10-13T10:00:00Z', childId: null }]))
    expect(await screen.findByText('3 de 4 personas · 1 invitación pendiente')).toBeInTheDocument()
    expect(screen.getByText('Ver familia →')).toBeInTheDocument()
  })

  it('invites the person to share when they are alone', async () => {
    renderEntry('phone', { ...family([]), members: [], capacity: { max: 4, used: 1 } })
    expect(await screen.findByText('Invita a tu pareja o a quien cuida a tus hijos')).toBeInTheDocument()
  })

  it('stays a plain link while the family has not answered, or answers something else', async () => {
    renderEntry('phone', { id: 'a', firstName: 'Ana' })
    expect(screen.getByText('Quién ve y marca las tomas de tus hijos')).toBeInTheDocument()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.getByText('Quién ve y marca las tomas de tus hijos')).toBeInTheDocument()
  })
})

describe('ConfirmDialog', () => {
  const opener = { current: null }
  const dialog = (extra: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) => (
    <ConfirmDialog
      title="¿Quitar a Rosa de la familia?"
      rows={[{ k: 'Deja de ver', v: 'Las consultas.' }]}
      confirmLabel="Quitar a Rosa"
      busyLabel="Quitando…"
      tone="danger"
      busy={false}
      error={null}
      onConfirm={() => {}}
      onCancel={() => {}}
      opener={opener}
      {...extra}
    />
  )

  it('is a real dialog with what happens in rows, a «Cerrar» and focus on «Cancelar»', () => {
    const onCancel = vi.fn()
    render(dialog({ onCancel }))
    const d = screen.getByRole('dialog', { name: '¿Quitar a Rosa de la familia?' })
    expect(within(d).getByText('Deja de ver')).toBeInTheDocument()
    expect(within(d).getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    return userEvent.setup().click(within(d).getByRole('button', { name: 'Cerrar' })).then(() => expect(onCancel).toHaveBeenCalled())
  })

  it('keeps Tab inside, wrapping from the last button to the first and back', async () => {
    const user = userEvent.setup()
    render(dialog())
    const close = screen.getByRole('button', { name: 'Cerrar' })
    const confirm = screen.getByRole('button', { name: 'Quitar a Rosa' })
    confirm.focus()
    await user.tab()
    expect(close).toHaveFocus()
    await user.tab({ shift: true })
    expect(confirm).toHaveFocus()
  })

  it('does not close while it works, and shows the work and the error', async () => {
    const onCancel = vi.fn()
    render(dialog({ busy: true, error: 'No pudimos.', onCancel }))
    expect(screen.getByRole('button', { name: 'Quitando…' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos.')
    await userEvent.setup().keyboard('{Escape}')
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('leaving is ink, not red', () => {
    render(dialog({ tone: 'ink', confirmLabel: 'Salir de la familia' }))
    expect(screen.getByRole('button', { name: 'Salir de la familia' }).className).toContain('bg-ink')
    expect(screen.getByRole('button', { name: 'Salir de la familia' }).className).not.toContain('red')
  })
})
