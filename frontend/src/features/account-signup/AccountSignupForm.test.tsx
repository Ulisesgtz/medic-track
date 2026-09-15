import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AccountSignupForm } from './AccountSignupForm'

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountSignupForm />
    </QueryClientProvider>,
  )
}

describe('AccountSignupForm', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => [] }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows a validation error and does not submit when required fields are empty', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('El nombre es obligatorio')).toBeInTheDocument()
    expect(await screen.findByText('El apellido es obligatorio')).toBeInTheDocument()
    expect(await screen.findByText('El correo es obligatorio')).toBeInTheDocument()

    // POST /accounts must never have been called (only catalog GETs, if any).
    const postCalls = vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
    expect(postCalls).toHaveLength(0)
  })

  it('does not clear already-filled fields when a validation error is shown', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Nombre'), 'Ana')
    await user.type(screen.getByLabelText('Apellido'), 'Gómez')
    // Deliberately leave email empty to trigger a validation error.
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await screen.findByText('El correo es obligatorio')

    // SC-002: the other already-filled fields must still show their values.
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana')
    expect(screen.getByLabelText('Apellido')).toHaveValue('Gómez')
  })

  it('reveals exactly one child fieldset when "Agregar hijo" is pressed the first time', async () => {
    const user = userEvent.setup()
    renderForm()

    expect(screen.queryByTestId('child-fieldset-0')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Agregar hijo' }))

    expect(screen.getByTestId('child-fieldset-0')).toBeInTheDocument()
    expect(screen.queryByTestId('child-fieldset-1')).not.toBeInTheDocument()
  })

  it('shows the freemium banner and does NOT reveal a second child fieldset (FR-007)', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: 'Agregar hijo' }))
    await user.type(document.getElementById('children.0.firstName')!, 'Luis')
    expect(screen.queryByText(/plan gratuito incluye solo un hijo/i)).not.toBeInTheDocument()

    // Second press: banner appears, but no second fieldset is created.
    await user.click(screen.getByRole('button', { name: 'Agregar hijo' }))

    await waitFor(() => {
      expect(screen.getByText(/plan gratuito incluye solo un hijo/i)).toBeInTheDocument()
    })
    expect(screen.queryByTestId('child-fieldset-1')).not.toBeInTheDocument()
    // The first child's already-typed data must not be lost.
    expect(document.getElementById('children.0.firstName')).toHaveValue('Luis')

    // Pressing it again keeps the same state (idempotent block).
    await user.click(screen.getByRole('button', { name: 'Agregar hijo' }))
    expect(screen.queryByTestId('child-fieldset-1')).not.toBeInTheDocument()
  })

  it('shows the state selector once a country with states is chosen', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/catalog/countries/MX/states')) {
        return { ok: true, json: async () => [{ code: 'MX-JAL', name: 'Jalisco' }] } as Response
      }
      if (url.includes('/catalog/countries')) {
        return { ok: true, json: async () => [{ code: 'MX', name: 'México' }] } as Response
      }
      return { ok: true, json: async () => [] } as Response
    })
    renderForm()

    await screen.findByRole('option', { name: 'México' })
    await user.selectOptions(screen.getByLabelText(/País/), 'MX')

    expect(await screen.findByLabelText(/Estado/)).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'Jalisco' })).toBeInTheDocument()
  })

  it('removes a child fieldset when "Quitar hijo" is pressed', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: 'Agregar hijo' }))
    expect(screen.getByTestId('child-fieldset-0')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Quitar hijo' }))
    expect(screen.queryByTestId('child-fieldset-0')).not.toBeInTheDocument()
  })

  it('shows a success message after a successful save', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if (init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            id: '1', firstName: 'Ana', lastName: 'Gómez', email: 'ana@example.com',
            countryCode: null, stateCode: null, plan: 'free', children: [],
          }),
        } as Response
      }
      return { ok: true, json: async () => [] } as Response
    })
    renderForm()

    await user.type(screen.getByLabelText('Nombre'), 'Ana')
    await user.type(screen.getByLabelText('Apellido'), 'Gómez')
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Cuenta creada exitosamente.')).toBeInTheDocument()
  })

  it('shows an inline message when the email is already in use', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (init?.method === 'POST') {
        return {
          ok: false,
          status: 409,
          json: async () => ({ error: 'email_already_exists', message: 'Email is already in use' }),
        } as Response
      }
      return { ok: true, json: async () => [] } as Response
    })
    renderForm()

    await user.type(screen.getByLabelText('Nombre'), 'Ana')
    await user.type(screen.getByLabelText('Apellido'), 'Gómez')
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Este correo ya está en uso.')).toBeInTheDocument()
  })

  it('sends numeric height/weight when provided for a child', async () => {
    const user = userEvent.setup()
    let sentBody: unknown
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (init?.method === 'POST') {
        sentBody = JSON.parse(init.body as string)
        return {
          ok: true,
          json: async () => ({
            id: '1', firstName: 'Ana', lastName: 'Gómez', email: 'ana@example.com',
            countryCode: null, stateCode: null, plan: 'free', children: [],
          }),
        } as Response
      }
      return { ok: true, json: async () => [] } as Response
    })
    renderForm()

    await user.type(screen.getByLabelText('Nombre'), 'Ana')
    await user.type(screen.getByLabelText('Apellido'), 'Gómez')
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.click(screen.getByRole('button', { name: 'Agregar hijo' }))
    await user.type(document.getElementById('children.0.firstName')!, 'Luis')
    await user.type(document.getElementById('children.0.lastName')!, 'Gómez')
    await user.type(document.getElementById('children.0.birthDate')!, '2020-01-15')
    await user.type(document.getElementById('children.0.height')!, '95.5')
    await user.type(document.getElementById('children.0.weight')!, '14.2')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await screen.findByText('Cuenta creada exitosamente.')
    expect(sentBody).toMatchObject({ children: [{ height: 95.5, weight: 14.2 }] })
  })

  it('shows the freemium banner when the server rejects the save with 422, even if the client only sent one child', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (init?.method === 'POST') {
        return {
          ok: false,
          status: 422,
          json: async () => ({
            error: 'freemium_child_limit_exceeded',
            message: 'The free plan includes only one child per account',
          }),
        } as Response
      }
      return { ok: true, json: async () => [] } as Response
    })
    renderForm()

    await user.type(screen.getByLabelText('Nombre'), 'Ana')
    await user.type(screen.getByLabelText('Apellido'), 'Gómez')
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText(/plan gratuito incluye solo un hijo/i)).toBeInTheDocument()
  })
})
