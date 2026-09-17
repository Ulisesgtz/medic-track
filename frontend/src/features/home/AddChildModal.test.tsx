import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AddChildModal } from './AddChildModal'

function renderModal(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <AddChildModal accountId="account-1" onClose={onClose} />
    </QueryClientProvider>,
  )
  return { onClose }
}

describe('AddChildModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('closes the modal after a successful submit', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'account-1', firstName: 'Ana', lastName: 'Gómez', email: 'ana@example.com',
          countryCode: null, stateCode: null, plan: 'free',
          children: [{ id: 'child-1', firstName: 'Luis', lastName: 'Gómez', birthDate: '2020-01-15', height: null, weight: null }],
        }),
      }),
    )
    const { onClose } = renderModal()

    await user.type(document.getElementById('children.0.firstName')!, 'Luis')
    await user.type(document.getElementById('children.0.lastName')!, 'Gómez')
    await user.type(document.getElementById('children.0.birthDate')!, '2020-01-15')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('shows the freemium pop-up on a 422 response without closing the modal', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          error: 'freemium_child_limit_exceeded',
          message: 'The free plan includes only one child per account',
        }),
      }),
    )
    const { onClose } = renderModal()

    await user.type(document.getElementById('children.0.firstName')!, 'Luis')
    await user.type(document.getElementById('children.0.lastName')!, 'Gómez')
    await user.type(document.getElementById('children.0.birthDate')!, '2020-01-15')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText(/plan gratuito incluye solo un hijo/i)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('navigates to /planes when "Ver planes" is pressed in the freemium pop-up', async () => {
    const user = userEvent.setup()
    const assignSpy = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign: assignSpy })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({}) }))
    renderModal()

    await user.type(document.getElementById('children.0.firstName')!, 'Luis')
    await user.type(document.getElementById('children.0.lastName')!, 'Gómez')
    await user.type(document.getElementById('children.0.birthDate')!, '2020-01-15')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await screen.findByText(/plan gratuito incluye solo un hijo/i)

    await user.click(screen.getByRole('button', { name: 'Ver planes' }))

    expect(assignSpy).toHaveBeenCalledWith('/planes')
  })

  it('returns to the form when "Quedarme con el plan gratuito" is pressed', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({}) }))
    renderModal()

    await user.type(document.getElementById('children.0.firstName')!, 'Luis')
    await user.type(document.getElementById('children.0.lastName')!, 'Gómez')
    await user.type(document.getElementById('children.0.birthDate')!, '2020-01-15')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await screen.findByText(/plan gratuito incluye solo un hijo/i)

    await user.click(screen.getByRole('button', { name: 'Quedarme con el plan gratuito' }))

    expect(screen.queryByText(/plan gratuito incluye solo un hijo/i)).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
