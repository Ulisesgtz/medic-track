import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AccountSignupForm } from './AccountSignupForm'

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
}

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/signup']}>
        <Routes>
          <Route path="/signup" element={<AccountSignupForm />} />
          <Route path="/home" element={<div>HOME PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const byId = (id: string) => document.getElementById(id) as HTMLInputElement

const createdAccount = {
  id: 'account-123', firstName: 'Ana', lastName: 'Gómez', email: 'ana@example.com',
  countryCode: null, stateCode: null, plan: 'free', children: [],
}

/** Mocks the API: `post` decides the POST /accounts response, the rest is the catalog. */
function mockApi(post: () => Partial<Response> | Promise<Partial<Response>>, catalog: Record<string, unknown[]> = {}) {
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (init?.method === 'POST') return (await post()) as Response
    const url = String(input)
    const match = Object.keys(catalog).find((key) => url.includes(key))
    return { ok: true, json: async () => (match ? catalog[match] : []) } as Response
  })
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Tu nombre'), 'Ana')
  await user.type(screen.getByLabelText('Tu apellido'), 'Gómez')
  await user.type(screen.getByLabelText('Correo'), 'ana@example.com')
  await user.type(byId('children.0.firstName'), 'Luis')
  await user.type(byId('children.0.lastName'), 'Gómez')
  await user.type(byId('children.0.birthDate'), '2020-01-15')
}

const postCalls = () =>
  vi.mocked(fetch).mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')

describe('AccountSignupForm', () => {
  beforeEach(() => {
    stubMatchMedia(false)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  describe('phone design (mock 01)', () => {
    it('shows the dark header with the value proposition, then the form with the first child block', () => {
      renderForm()

      expect(
        screen.getByRole('heading', { level: 1, name: 'La bitácora médica de tus hijos, en un solo lugar.' }),
      ).toBeInTheDocument()
      expect(screen.getByText('Registra, nunca interpreta. Tu pediatra sigue siendo la única autoridad médica.')).toBeInTheDocument()
      expect(screen.getByText('El plan gratuito incluye un hijo. Puedes agregar más después.')).toBeInTheDocument()
      expect(screen.getByTestId('child-fieldset-0')).toHaveAccessibleName('Hijo 1')
      expect(screen.getByText('Gratis')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeInTheDocument()
    })

    it('does not use the web split screen: no checklist, no "Crear cuenta" heading', () => {
      renderForm()

      expect(screen.queryByText('El OCR de la receta corre en tu dispositivo.')).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Crear cuenta' })).not.toBeInTheDocument()
    })
  })

  describe('web design (mock 11)', () => {
    beforeEach(() => stubMatchMedia(true))

    it('shows the split screen: dark panel with the checklist, and the form with its own title', () => {
      renderForm()

      expect(
        screen.getByRole('heading', { level: 1, name: 'La bitácora médica de tus hijos, en un solo lugar.' }),
      ).toBeInTheDocument()
      for (const item of [
        'El OCR de la receta corre en tu dispositivo.',
        'Tu pediatra sigue siendo la única autoridad médica.',
        'El plan gratuito incluye un hijo.',
      ]) {
        expect(screen.getByText(item)).toBeInTheDocument()
      }
      expect(screen.getByRole('heading', { level: 2, name: 'Crear cuenta' })).toBeInTheDocument()
      expect(screen.getByText('Empieza con el primer hijo; puedes agregar más después.')).toBeInTheDocument()
      expect(screen.getByTestId('child-fieldset-0')).toBeInTheDocument()
    })

    it('has the phone-only copy nowhere', () => {
      renderForm()

      expect(screen.queryByText('Registra, nunca interpreta. Tu pediatra sigue siendo la única autoridad médica.')).not.toBeInTheDocument()
      expect(screen.queryByText('El plan gratuito incluye un hijo. Puedes agregar más después.')).not.toBeInTheDocument()
    })

    it('validates and submits exactly like the phone form', async () => {
      const user = userEvent.setup()
      mockApi(() => ({ ok: true, json: async () => createdAccount }))
      renderForm()

      await fillRequired(user)
      await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

      expect(await screen.findByText('HOME PAGE')).toBeInTheDocument()
    })
  })

  describe('form (both designs)', () => {
    it('has no password field and no way to add or remove children (deliberate deviations from the mocks)', () => {
      renderForm()

      expect(screen.queryByLabelText(/contraseña/i)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /agregar hijo/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /quitar hijo/i })).not.toBeInTheDocument()
    })

    it('shows a validation error for every required field and does not submit when they are empty', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

      expect(await screen.findByText('El nombre es obligatorio')).toBeInTheDocument()
      expect(screen.getByText('El apellido es obligatorio')).toBeInTheDocument()
      expect(screen.getByText('Escribe un correo válido.')).toBeInTheDocument()
      expect(screen.getByText('El nombre del hijo es obligatorio')).toBeInTheDocument()
      expect(screen.getByText('El apellido del hijo es obligatorio')).toBeInTheDocument()
      expect(screen.getByText('Elige la fecha de nacimiento.')).toBeInTheDocument()
      expect(postCalls()).toHaveLength(0)
    })

    it('does not clear already-filled fields when a validation error is shown', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.type(screen.getByLabelText('Tu nombre'), 'Ana')
      await user.type(screen.getByLabelText('Tu apellido'), 'Gómez')
      // Deliberately leave the email empty to trigger a validation error.
      await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))
      await screen.findByText('Escribe un correo válido.')

      expect(screen.getByLabelText('Tu nombre')).toHaveValue('Ana')
      expect(screen.getByLabelText('Tu apellido')).toHaveValue('Gómez')
    })

    it('shows a format error when a tutor or child name has non-letter characters', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.type(screen.getByLabelText('Tu nombre'), 'Ana123')
      await user.type(screen.getByLabelText('Tu apellido'), '<Gómez>')
      await user.type(byId('children.0.firstName'), 'Luis3')
      await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

      expect(
        await screen.findByText('El nombre solo puede contener letras, espacios, guiones y apóstrofes'),
      ).toBeInTheDocument()
      expect(screen.getByText('El apellido solo puede contener letras, espacios, guiones y apóstrofes')).toBeInTheDocument()
      expect(
        screen.getByText('El nombre del hijo solo puede contener letras, espacios, guiones y apóstrofes'),
      ).toBeInTheDocument()
    })

    it('shows a max-length error when a name exceeds 100 characters', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.type(screen.getByLabelText('Tu nombre'), 'a'.repeat(101))
      await user.type(byId('children.0.lastName'), 'a'.repeat(101))
      await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

      expect(await screen.findByText('El nombre debe tener máximo 100 caracteres')).toBeInTheDocument()
      expect(screen.getByText('El apellido del hijo debe tener máximo 100 caracteres')).toBeInTheDocument()
    })

    it('accepts names with accents, ñ, hyphens and apostrophes', async () => {
      const user = userEvent.setup()
      mockApi(() => ({ ok: true, json: async () => createdAccount }))
      renderForm()

      await user.type(screen.getByLabelText('Tu nombre'), 'María José')
      await user.type(screen.getByLabelText('Tu apellido'), "Núñez-O'Higgins")
      await user.type(screen.getByLabelText('Correo'), 'maria@example.com')
      await user.type(byId('children.0.firstName'), 'Iñaki')
      await user.type(byId('children.0.lastName'), 'Núñez')
      await user.type(byId('children.0.birthDate'), '2020-01-15')
      await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

      expect(await screen.findByText('HOME PAGE')).toBeInTheDocument()
    })

    it('rejects a non-positive height or weight before reaching the server', async () => {
      const user = userEvent.setup()
      renderForm()

      await fillRequired(user)
      await user.type(byId('children.0.height'), '0')
      await user.type(byId('children.0.weight'), '-3')
      await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

      expect(await screen.findByText('La talla debe ser un número positivo')).toBeInTheDocument()
      expect(screen.getByText('El peso debe ser un número positivo')).toBeInTheDocument()
      expect(postCalls()).toHaveLength(0)
    })

    it('saves the account id, sends numeric height/weight and navigates to /home (FR-003)', async () => {
      const user = userEvent.setup()
      mockApi(() => ({ ok: true, json: async () => createdAccount }))
      renderForm()

      await fillRequired(user)
      await user.type(byId('children.0.height'), '95.5')
      await user.type(byId('children.0.weight'), '14.2')
      await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

      expect(await screen.findByText('HOME PAGE')).toBeInTheDocument()
      expect(window.localStorage.getItem('peditrack.accountId')).toBe('account-123')
      const [, init] = postCalls()[0]
      expect(JSON.parse((init as RequestInit).body as string)).toEqual({
        firstName: 'Ana',
        lastName: 'Gómez',
        email: 'ana@example.com',
        children: [{ firstName: 'Luis', lastName: 'Gómez', birthDate: '2020-01-15', height: 95.5, weight: 14.2 }],
      })
    })

    it('turns the button into "Creando cuenta…" and disables it while saving', async () => {
      const user = userEvent.setup()
      mockApi(() => new Promise(() => {}))
      renderForm()

      await fillRequired(user)
      await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

      expect(await screen.findByRole('button', { name: 'Creando cuenta…' })).toBeDisabled()
    })

    it('shows an inline message when the email is already in use', async () => {
      const user = userEvent.setup()
      mockApi(() => ({
        ok: false,
        status: 409,
        json: async () => ({ error: 'email_already_exists', message: 'Email is already in use' }),
      }))
      renderForm()

      await fillRequired(user)
      await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

      expect(await screen.findByText('Este correo ya está en uso.')).toBeInTheDocument()
      expect(screen.getByLabelText('Tu nombre')).toHaveValue('Ana')
    })

    it('shows the server message for a validation error the client did not catch', async () => {
      const user = userEvent.setup()
      mockApi(() => ({
        ok: false,
        status: 400,
        json: async () => ({ error: 'validation_error', message: 'One or more fields are invalid' }),
      }))
      renderForm()

      await fillRequired(user)
      await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

      expect(await screen.findByText('One or more fields are invalid')).toBeInTheDocument()
    })

    it('shows a generic message when the request fails without an API error body', async () => {
      const user = userEvent.setup()
      vi.mocked(fetch).mockImplementation(async (_input, init) => {
        if (init?.method === 'POST') throw new TypeError('network down')
        return { ok: true, json: async () => [] } as Response
      })
      renderForm()

      await fillRequired(user)
      await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

      expect(await screen.findByText('Ocurrió un error al guardar la cuenta. Intenta de nuevo.')).toBeInTheDocument()
    })

    it('shows the state selector once a country with states is chosen', async () => {
      const user = userEvent.setup()
      mockApi(() => ({ ok: true, json: async () => createdAccount }), {
        '/catalog/countries/MX/states': [{ code: 'MX-JAL', name: 'Jalisco' }],
        '/catalog/countries': [{ code: 'MX', name: 'México' }],
      })
      renderForm()

      expect(screen.queryByLabelText(/Estado/)).not.toBeInTheDocument()
      await screen.findByRole('option', { name: 'México' })
      await user.selectOptions(screen.getByLabelText(/País/), 'MX')

      expect(await screen.findByLabelText(/Estado/)).toBeInTheDocument()
      expect(await screen.findByRole('option', { name: 'Jalisco' })).toBeInTheDocument()
    })

    it('clears the selected estado when the país changes', async () => {
      const user = userEvent.setup()
      mockApi(() => ({ ok: true, json: async () => createdAccount }), {
        '/catalog/countries/MX/states': [{ code: 'MX-JAL', name: 'Jalisco' }],
        '/states': [],
        '/catalog/countries': [
          { code: 'MX', name: 'México' },
          { code: 'US', name: 'Estados Unidos' },
        ],
      })
      renderForm()

      await screen.findByRole('option', { name: 'México' })
      await user.selectOptions(screen.getByLabelText(/País/), 'MX')
      await user.selectOptions(await screen.findByLabelText(/Estado/), 'MX-JAL')
      expect(screen.getByLabelText(/Estado/)).toHaveValue('MX-JAL')

      // US has no states in this mock, so the estado select unmounts — the
      // stale "MX-JAL" must not linger in the form state.
      await user.selectOptions(screen.getByLabelText(/País/), 'US')
      expect(screen.queryByLabelText(/Estado/)).not.toBeInTheDocument()

      await user.selectOptions(screen.getByLabelText(/País/), 'MX')
      expect(await screen.findByLabelText(/Estado/)).toHaveValue('')
    })
  })
})
