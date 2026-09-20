import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AddChildModal } from './AddChildModal'

function renderModal(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <button>Abrir</button>
      <AddChildModal accountId="account-1" onClose={onClose} />
    </QueryClientProvider>,
  )
  return { onClose, queryClient }
}

const savedAccount = {
  id: 'account-1', firstName: 'Ana', lastName: 'Gómez', email: 'ana@example.com',
  countryCode: null, stateCode: null, plan: 'free',
  children: [{ id: 'child-1', firstName: 'Luis', lastName: 'Gómez', birthDate: '2020-01-15', height: null, weight: null }],
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Nombre'), 'Luis')
  await user.type(screen.getByLabelText('Apellido'), 'Gómez')
  await user.type(screen.getByLabelText('Fecha de nacimiento'), '2020-01-15')
}

const post422 = () =>
  vi.fn().mockResolvedValue({
    ok: false,
    status: 422,
    json: async () => ({ error: 'freemium_child_limit_exceeded', message: 'The free plan includes only one child per account' }),
  })

describe('AddChildModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is built like the mock: title, subtitle, "×", the fields, "Cancelar" and "Guardar"', () => {
    renderModal()

    const dialog = screen.getByRole('dialog', { name: 'Agregar hijo' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Se guarda en tu cuenta, no se comparte.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument()
    for (const label of ['Nombre', 'Apellido', 'Fecha de nacimiento', 'Talla (cm) (opcional)', 'Peso (kg) (opcional)']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument()
    // The old "HIJO 1 / Quitar hijo" block is gone.
    expect(screen.queryByRole('button', { name: /quitar hijo/i })).not.toBeInTheDocument()
  })

  it('focuses the first field when it opens', () => {
    renderModal()

    expect(screen.getByLabelText('Nombre')).toHaveFocus()
  })

  it.each([
    ['the "×" button', async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Cerrar' }))],
    ['"Cancelar"', async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Cancelar' }))],
    ['Escape', async (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
  ])('closes with %s', async (_name, close) => {
    const user = userEvent.setup()
    const { onClose } = renderModal()

    await close(user)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on a click on the backdrop, but not inside the dialog', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()

    await user.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByRole('dialog').parentElement!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps Tab inside the dialog, wrapping from the last control to the first and back', async () => {
    const user = userEvent.setup()
    renderModal()
    const guardar = screen.getByRole('button', { name: 'Guardar' })

    guardar.focus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus()

    // "Cerrar" is the first control: Shift+Tab wraps to the last one.
    await user.tab({ shift: true })
    expect(guardar).toHaveFocus()
  })

  it('returns the focus to the button that opened it', () => {
    const queryClient = new QueryClient()
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <AddChildModal accountId="account-1" onClose={vi.fn()} />
      </QueryClientProvider>,
    )
    expect(opener).not.toHaveFocus()

    unmount()

    expect(opener).toHaveFocus()
    opener.remove()
  })

  it('shows an error for every missing required field and does not send anything', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn())
    renderModal()

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('El nombre del hijo es obligatorio')).toBeInTheDocument()
    expect(screen.getByText('El apellido del hijo es obligatorio')).toBeInTheDocument()
    expect(screen.getByText('La fecha de nacimiento es obligatoria')).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('validates the name format and length, and that height and weight are positive', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn())
    renderModal()

    await user.type(screen.getByLabelText('Nombre'), 'Luis3')
    await user.type(screen.getByLabelText('Apellido'), 'a'.repeat(101))
    await user.type(screen.getByLabelText('Talla (cm) (opcional)'), '0')
    await user.type(screen.getByLabelText('Peso (kg) (opcional)'), '-2')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(
      await screen.findByText('El nombre del hijo solo puede contener letras, espacios, guiones y apóstrofes'),
    ).toBeInTheDocument()
    expect(screen.getByText('El apellido del hijo debe tener máximo 100 caracteres')).toBeInTheDocument()
    expect(screen.getByText('La talla debe ser un número positivo')).toBeInTheDocument()
    expect(screen.getByText('El peso debe ser un número positivo')).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('saves the child (with numeric height/weight), refreshes the account and closes', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => savedAccount }))
    const { onClose, queryClient } = renderModal()

    await fillValid(user)
    await user.type(screen.getByLabelText('Talla (cm) (opcional)'), '95.5')
    await user.type(screen.getByLabelText('Peso (kg) (opcional)'), '14.2')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      firstName: 'Luis', lastName: 'Gómez', birthDate: '2020-01-15', height: 95.5, weight: 14.2,
    })
    expect(queryClient.getQueryData(['account', 'account-1'])).toEqual(savedAccount)
  })

  it('turns "Guardar" into "Guardando…" and disables it while saving', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    renderModal()

    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('button', { name: 'Guardando…' })).toBeDisabled()
  })

  it('shows the server message when the save fails for another reason, keeping the data', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'validation_error', message: 'La fecha no puede ser futura' }) }),
    )
    renderModal()

    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('La fecha no puede ser futura')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('Luis')
  })

  it('shows a generic message when the request itself fails', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')))
    renderModal()

    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Ocurrió un error al agregar al hijo. Intenta de nuevo.')).toBeInTheDocument()
  })

  describe('when the server refuses because of the free-plan limit (422)', () => {
    it('shows the plan pop-up without closing the modal', async () => {
      const user = userEvent.setup()
      vi.stubGlobal('fetch', post422())
      const { onClose } = renderModal()

      await fillValid(user)
      await user.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(await screen.findByText(/Llegaste a un hijo registrado/i)).toBeInTheDocument()
      expect(onClose).not.toHaveBeenCalled()
    })

    it('"Ver planes" goes to /planes', async () => {
      const user = userEvent.setup()
      const assign = vi.fn()
      vi.stubGlobal('location', { ...window.location, assign })
      vi.stubGlobal('fetch', post422())
      renderModal()

      await fillValid(user)
      await user.click(screen.getByRole('button', { name: 'Guardar' }))
      await screen.findByText(/Llegaste a un hijo registrado/i)
      await user.click(screen.getByRole('button', { name: 'Ver planes' }))

      expect(assign).toHaveBeenCalledWith('/planes')
    })

    it('"Entendido" returns to the form with what was typed', async () => {
      const user = userEvent.setup()
      vi.stubGlobal('fetch', post422())
      renderModal()

      await fillValid(user)
      await user.click(screen.getByRole('button', { name: 'Guardar' }))
      await screen.findByText(/Llegaste a un hijo registrado/i)
      await user.click(screen.getByRole('button', { name: 'Entendido' }))

      expect(screen.queryByText(/Llegaste a un hijo registrado/i)).not.toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: 'Agregar hijo' })).toBeInTheDocument()
      expect(screen.getByLabelText('Nombre')).toHaveValue('Luis')
    })
  })
})
