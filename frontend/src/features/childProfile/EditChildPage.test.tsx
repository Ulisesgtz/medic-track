import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditChildPage } from './EditChildPage'
import { account, bodyOf, callsOf, stubApi, stubWeb } from '../medicineCabinet/cabinet.test-utils'

const PATH = '/children/child-1/editar'
const mateo = { id: 'child-1', firstName: 'Mateo', lastName: 'Morales', birthDate: '2024-06-10', height: 85, weight: null }

function show() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[PATH]}>
        <Routes>
          <Route path="/children/:childId/editar" element={<EditChildPage />} />
          <Route path="/children/:childId" element={<div>HIJO</div>} />
          <Route path="/planes" element={<div>PLANES</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function api(me: unknown, put: { status?: number; body?: unknown } = { body: mateo }) {
  return stubApi({ 'GET /accounts/me': { body: me }, 'PUT /children/child-1': put })
}

for (const web of [false, true]) {
  describe(`EditChildPage (${web ? 'web' : 'phone'})`, () => {
    afterEach(() => vi.unstubAllGlobals())

    it('corrects the weight and empties the height on the free plan, with the box, and goes back to the child', async () => {
      stubWeb(web)
      const mock = api(account({ plan: 'free', children: [mateo] }))
      show()
      const user = userEvent.setup()
      expect(await screen.findByRole('heading', { name: 'Editar datos', level: 1 })).toBeInTheDocument()
      expect(screen.getByLabelText('Nombre')).toBeDisabled()
      expect(screen.getByLabelText('Fecha de nacimiento')).toBeDisabled()
      expect(screen.getByLabelText(/Talla \(cm\)/)).toHaveValue('85')
      expect(screen.queryByLabelText('Anotarlo también como medida de hoy')).toBeNull()

      await user.type(screen.getByLabelText(/Peso \(kg\)/), '12,4')
      await user.clear(screen.getByLabelText(/Talla \(cm\)/))
      await user.click(screen.getByLabelText('Anotarlo también como medida de hoy'))
      await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
      expect(await screen.findByText('HIJO')).toBeInTheDocument()
      const body = bodyOf(mock, 'PUT /children/child-1')
      expect(body).toMatchObject({ firstName: 'Mateo', lastName: 'Morales', birthDate: '2024-06-10', height: null, weight: 12.4 })
      expect(body.measurement.measuredOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('the free plan’s «Plan completo» opens the plan’s notice, and so does the server’s 422', async () => {
      stubWeb(web)
      api(account({ plan: 'free', children: [mateo] }), { status: 422, body: { error: 'freemium_consultation_limit_exceeded', reason: 'child_identity' } })
      show()
      const user = userEvent.setup()
      await user.click(await screen.findByRole('button', { name: /Plan completo/ }))
      expect(await screen.findByRole('dialog')).toHaveTextContent('Corregir el nombre y la fecha de nacimiento')
      await user.click(screen.getByRole('button', { name: 'Ahora no' }))
      await user.type(screen.getByLabelText(/Peso \(kg\)/), '13')
      await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
      expect(screen.getByLabelText(/Peso \(kg\)/)).toHaveValue('13')
    })

    it('the paid plan corrects the identity; the server’s conflict and field errors show on the form', async () => {
      stubWeb(web)
      const mock = api(account({ children: [mateo] }), {
        status: 409,
        body: { error: 'birth_date_conflict', measurementCount: 1, measurements: ['2024-06-20'], vaccinationCount: 0, vaccinations: [] },
      })
      show()
      const user = userEvent.setup()
      const name = await screen.findByLabelText('Nombre')
      expect(name).toBeEnabled()
      expect(screen.queryByRole('button', { name: /Plan completo/ })).toBeNull()
      await user.clear(name)
      await user.type(name, 'Sofía')
      fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), { target: { value: '2024-07-01' } })
      await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
      expect(await screen.findByRole('alert')).toHaveTextContent(/^Hay 1 medida \(.+\) anotada antes de esa fecha/)
      expect(bodyOf(mock, 'PUT /children/child-1')).toMatchObject({ firstName: 'Sofía', birthDate: '2024-07-01' })
      fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), { target: { value: '2024-06-01' } })
      expect(screen.queryByRole('alert')).toBeNull()

      api(account({ children: [mateo] }), { status: 400, body: { error: 'validation_error', message: 'x', details: [{ field: 'lastName', message: 'Del servidor.' }] } })
      await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
      expect(await screen.findByText('Del servidor.')).toBeInTheDocument()
    })

    it('checks before sending, and the cap and a failure are told', async () => {
      stubWeb(web)
      const mock = api(account({ children: [mateo] }), { status: 422, body: { error: 'growth_limit_exceeded' } })
      show()
      const user = userEvent.setup()
      const name = await screen.findByLabelText('Nombre')
      await user.clear(name)
      await user.type(name, 'Mat3o')
      await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
      expect(screen.getByText(/Escribe el nombre con letras/)).toBeInTheDocument()
      expect(callsOf(mock)).not.toContain('PUT /children/child-1')

      await user.clear(name)
      await user.type(name, 'Mateo')
      await user.type(screen.getByLabelText(/Peso \(kg\)/), '12')
      await user.click(screen.getByLabelText('Anotarlo también como medida de hoy'))
      await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('500 medidas')

      stubApi({ 'GET /accounts/me': { body: account({ children: [mateo] }) }, 'PUT /children/child-1': { status: 500, body: {} } })
      await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
      expect(await screen.findByText(CHILD_SAVE_FAILED)).toBeInTheDocument()
    })

    it('leaving with changes asks first', async () => {
      stubWeb(web)
      api(account({ children: [mateo] }))
      const confirm = vi.fn().mockReturnValue(false)
      vi.stubGlobal('confirm', confirm)
      show()
      const user = userEvent.setup()
      await user.type(await screen.findByLabelText(/Peso \(kg\)/), '12')
      await user.click(screen.getByRole('link', { name: '← Mateo' }))
      if (web) await user.click(screen.getByRole('button', { name: 'Cancelar' }))
      expect(confirm).toHaveBeenCalled()
      expect(screen.queryByText('HIJO')).toBeNull()
    })

    it('a Caregiver and a Tutor of a family that stopped paying see no form', async () => {
      stubWeb(web)
      api(account({ plan: 'free', children: [{ ...mateo, role: 'caregiver', plan: 'paid', accountId: 'owner' }] }))
      show()
      expect(await screen.findByText(/Puedes ver los datos de este hijo/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Guardar cambios' })).toBeNull()
      vi.unstubAllGlobals()

      stubWeb(web)
      api(account({ plan: 'free', children: [{ ...mateo, role: 'tutor', plan: 'free', readOnly: true, accountId: 'owner' }] }))
      show()
      expect((await screen.findAllByText(/Puedes ver los datos de este hijo/)).length).toBeGreaterThan(0)
    })

    it('a Tutor of a paid family edits everything', async () => {
      stubWeb(web)
      api(account({ plan: 'free', children: [{ ...mateo, role: 'tutor', plan: 'paid', accountId: 'owner' }] }))
      show()
      expect(await screen.findByLabelText('Nombre')).toBeEnabled()
      expect(screen.queryByRole('button', { name: /Plan completo/ })).toBeNull()
    })

    it('an unknown child', async () => {
      stubWeb(web)
      api(account({ children: [] }))
      show()
      expect(await screen.findByText('No encontramos a este hijo.')).toBeInTheDocument()
    })
  })
}

const CHILD_SAVE_FAILED = 'No se pudieron guardar los cambios. Inténtalo de nuevo.'
