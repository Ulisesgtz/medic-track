import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query'
import { account, bodyOf, stubApi, stubWeb } from '../medicineCabinet/cabinet.test-utils'
import { EditChildRecordPage } from './EditChildRecordPage'
import { childRecordKey } from './hooks'
import { emptyRecord, fullRecord } from './recordFixtures'
import type { ChildRecord } from './types'

const mateo = { id: 'child-1', firstName: 'Mateo', lastName: 'Morales', birthDate: '2021-03-14', height: null, weight: null }

function show(seed?: ChildRecord, withAccount = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (seed) queryClient.setQueryData(childRecordKey('child-1'), seed)
  if (withAccount) queryClient.setQueryData(['accounts', 'me'], account({ children: [mateo] }))
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/children/child-1/ficha/editar']}>
        <Routes>
          <Route path="/children/:childId/ficha/editar" element={<EditChildRecordPage />} />
          <Route path="/children/:childId" element={<div>HIJO</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return queryClient
}

type Put = { status?: number; body?: unknown } | (() => { status?: number; body?: unknown })
function api(record: ChildRecord, put: Put = { body: fullRecord }) {
  return stubApi({
    'GET /accounts/me': { body: account({ children: [mateo] }) },
    'GET /children/child-1/record': { body: record },
    'PUT /children/child-1/record': put as never,
  })
}
const many = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Alergia ${i + 1}`, kind: null, note: null }))

for (const web of [false, true]) {
  describe(`EditChildRecordPage (${web ? 'web' : 'phone'})`, () => {
    afterEach(() => vi.unstubAllGlobals())

    it('fills a new record and saves it whole, with the version 0, and goes back to the child (D)', async () => {
      stubWeb(web)
      const mock = api(emptyRecord)
      show()
      const user = userEvent.setup()
      expect(await screen.findByRole('heading', { level: 1, name: 'Editar ficha' })).toBeInTheDocument()
      expect(screen.getByText('Todo es opcional. Escribe lo que quieras guardar.')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '← Mateo' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: '+ Agregar alergia' }))
      await user.type(screen.getByLabelText('Alergia'), 'Penicilina')
      await user.click(screen.getByRole('radio', { name: 'Medicamento' }))
      await user.type(screen.getAllByLabelText('Nota (opcional)')[0], 'le salen ronchas')
      await user.click(screen.getByRole('radio', { name: 'O+' }))
      await user.click(screen.getByRole('button', { name: '+ Agregar padecimiento' }))
      await user.type(screen.getByLabelText('Padecimiento o condición'), 'Asma')
      await user.type(screen.getByLabelText('Nombre'), 'Dra. Ruiz')
      await user.type(screen.getByLabelText('Teléfono'), '33 1234 5678')
      await user.type(screen.getByLabelText('Nota (opcional)', { selector: 'textarea' }), 'Usa lentes')
      expect(screen.getByText('10 de 1000')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(await screen.findByText('HIJO')).toBeInTheDocument()
      expect(bodyOf(mock, 'PUT /children/child-1/record')).toEqual({
        expectedVersion: 0,
        bloodType: 'O+',
        generalNote: 'Usa lentes',
        pediatrician: { name: 'Dra. Ruiz', phone: '33 1234 5678', office: null },
        allergies: [{ name: 'Penicilina', kind: 'medication', note: 'le salen ronchas' }],
        conditions: [{ name: 'Asma', note: null }],
      })
    })

    it('loads a saved record, tapping the chosen pill clears it, and the move and remove buttons have names', async () => {
      stubWeb(web)
      const mock = api(fullRecord)
      show()
      const user = userEvent.setup()
      expect(await screen.findByDisplayValue('Penicilina')).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: 'O+' })).toBeChecked()
      await user.click(screen.getByRole('radio', { name: 'O+' }))
      expect(screen.getByRole('radio', { name: 'O+' })).not.toBeChecked()

      expect(screen.getByRole('button', { name: 'Subir alergia 1' })).toBeDisabled()
      await user.click(screen.getByRole('button', { name: 'Bajar alergia 1' }))
      await user.click(screen.getByRole('button', { name: 'Quitar alergia 3' }))
      expect(screen.queryByDisplayValue('Polen')).toBeNull()
      expect(screen.getByText('2 de 30')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Guardar' }))
      await screen.findByText('HIJO')
      const body = bodyOf(mock, 'PUT /children/child-1/record')
      expect(body.expectedVersion).toBe(3)
      expect(body.bloodType).toBeNull()
      expect(body.allergies.map((a: { name: string }) => a.name)).toEqual(['Cacahuate', 'Penicilina'])
    })

    it('a field that is too long says so with a counter, aria-invalid and the system red, and nothing is sent', async () => {
      stubWeb(web)
      const mock = api(emptyRecord)
      show()
      const user = userEvent.setup()
      await user.click(await screen.findByRole('button', { name: '+ Agregar alergia' }))
      await user.click(screen.getByLabelText('Alergia'))
      await user.paste('x'.repeat(125))
      await user.click(screen.getByRole('button', { name: 'Guardar' }))
      const field = screen.getByLabelText('Alergia')
      expect(field).toHaveAttribute('aria-invalid', 'true')
      expect(field.className).toContain('border-error')
      const message = document.getElementById(field.getAttribute('aria-describedby')!)!
      expect(message).toHaveTextContent('Máximo 120 caracteres. Revisa este campo.')
      expect(message).toHaveTextContent('125 de 120')
      expect(message.className).toContain('text-error')
      expect(mock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')).toBe(false)
    })

    it('an entry with a note but no name asks for the name', async () => {
      stubWeb(web)
      api(emptyRecord)
      show()
      const user = userEvent.setup()
      await user.click(await screen.findByRole('button', { name: '+ Agregar padecimiento' }))
      await user.type(screen.getByLabelText('Nota (opcional)', { selector: 'input' }), 'solo nota')
      await user.click(screen.getByRole('button', { name: 'Guardar' }))
      expect(await screen.findByText(/Escribe el nombre o quita esta entrada/)).toBeInTheDocument()
    })

    it('the server field errors land on the field; another failure says it could not be saved', async () => {
      stubWeb(web)
      let call = 0
      api(fullRecord, () => (call++ === 0 ? { status: 400, body: { error: 'validation_error', message: 'x', details: [{ field: 'allergies[0].name', message: 'm' }] } } : { status: 500, body: {} }))
      show()
      const user = userEvent.setup()
      await user.click(await screen.findByRole('button', { name: 'Guardar' }))
      expect(await screen.findByText('Revisa este campo.')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Guardar' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar la ficha')
    })

    it('a conflict keeps what was typed, says who and when, opens the new version apart and saves on top of it (E)', async () => {
      stubWeb(web)
      const theirs: ChildRecord = { ...fullRecord, version: 4, updated: { at: '2026-11-17T16:42:00Z', by: 'Rafael' }, bloodType: 'A+' }
      let call = 0
      const mock = api(fullRecord, () => (call++ === 0 ? { status: 409, body: { error: 'record_conflict', message: 'c', current: theirs } } : { body: theirs }))
      show()
      const user = userEvent.setup()
      const note = await screen.findByLabelText('Nota (opcional)', { selector: 'textarea' })
      await user.type(note, ' extra')
      await user.click(screen.getByRole('button', { name: 'Guardar' }))

      const notice = await screen.findByRole('status')
      expect(within(notice).getByText('Rafael guardó cambios en la ficha')).toBeInTheDocument()
      expect(notice).toHaveTextContent(/Lo que escribiste sigue aquí\. Si guardas ahora, tus cambios reemplazan los de Rafael de las \d\d:\d\d\./)
      expect(note).toHaveValue('Usa lentes desde los 4 años. extra')

      await user.click(within(notice).getByRole('button', { name: 'Ver la versión nueva' }))
      const dialog = await screen.findByRole('dialog', { name: 'Ver la versión nueva' })
      expect(within(dialog).getByText('A+')).toBeInTheDocument()
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('dialog', { name: 'Ver la versión nueva' })).toBeNull()
      expect(note).toHaveValue('Usa lentes desde los 4 años. extra')

      await user.click(within(notice).getByRole('button', { name: 'Seguir editando' }))
      expect(screen.queryByRole('status')).toBeNull()
      await user.click(screen.getByRole('button', { name: 'Guardar' }))
      await screen.findByText('HIJO')
      const puts = mock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')
      expect(JSON.parse(String((puts[0][1] as RequestInit).body)).expectedVersion).toBe(3)
      expect(JSON.parse(String((puts[1][1] as RequestInit).body)).expectedVersion).toBe(4)
    })

    it('with 30 entries the add button goes, a note explains, and two rows plus «y 28 alergias más» open the whole list (D2)', async () => {
      stubWeb(web)
      api({ ...fullRecord, allergies: many(30) })
      show()
      const user = userEvent.setup()
      expect(await screen.findByText('30 de 30')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '+ Agregar alergia' })).toBeNull()
      expect(screen.getByText(/Llegaste a 30 alergias, el máximo que guarda la ficha/)).toBeInTheDocument()
      expect(screen.getByText('y 28 alergias más')).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: 'Editar' })).toHaveLength(2)
      await user.click(screen.getByRole('button', { name: 'Ver las 30' }))
      expect(screen.getByRole('button', { name: 'Quitar alergia 30' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Quitar alergia 30' }))
      expect(screen.getByRole('button', { name: '+ Agregar alergia' })).toBeInTheDocument()
    })

    it('«Cancelar» leaves at once when nothing changed and asks first when something did', async () => {
      stubWeb(web)
      api(fullRecord)
      show()
      const user = userEvent.setup()
      await screen.findByDisplayValue('Penicilina')
      const cancel = web ? screen.getByRole('button', { name: 'Cancelar' }) : screen.getByRole('button', { name: 'Cancelar' })
      await user.type(screen.getByLabelText('Nombre'), 'x')
      await user.click(cancel)
      expect(await screen.findByText('¿Salir sin guardarlos?')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Seguir editando' }))
      expect(screen.queryByText('HIJO')).toBeNull()
      await user.click(cancel)
      await user.click(await screen.findByRole('button', { name: 'Descartar' }))
      expect(await screen.findByText('HIJO')).toBeInTheDocument()
    })

    it('without permission to edit it shows only the sentence, no form', async () => {
      stubWeb(web)
      api({ ...fullRecord, canEdit: false })
      show()
      expect(await screen.findByText('Solo la familia puede editar la ficha.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Guardar' })).toBeNull()
    })

    it('starts from the server answer, not from the old copy in the cache: the form and the version are the new ones', async () => {
      stubWeb(web)
      const fresh: ChildRecord = { ...fullRecord, version: 7, generalNote: 'Nota nueva del servidor' }
      const mock = api(fresh)
      show(fullRecord)
      const user = userEvent.setup()
      // The old copy (version 3) is never put in the form: the page waits for the answer.
      expect(screen.queryByDisplayValue('Usa lentes desde los 4 años.')).toBeNull()
      expect(await screen.findByDisplayValue('Nota nueva del servidor')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Guardar' }))
      await screen.findByText('HIJO')
      expect(bodyOf(mock, 'PUT /children/child-1/record').expectedVersion).toBe(7)
    })

    it('without a connection it uses the copy that there is', async () => {
      stubWeb(web)
      api(fullRecord)
      onlineManager.setOnline(false)
      try {
        show({ ...fullRecord, generalNote: 'Copia sin conexión' }, true)
        expect(await screen.findByDisplayValue('Copia sin conexión')).toBeInTheDocument()
      } finally {
        onlineManager.setOnline(true)
      }
    })

    it('a newer version that arrives while nothing was typed replaces the form and the base version', async () => {
      stubWeb(web)
      let reads = 0
      const mock = stubApi({
        'GET /accounts/me': { body: account({ children: [mateo] }) },
        'GET /children/child-1/record': () => ({ body: reads++ === 0 ? fullRecord : { ...fullRecord, version: 5, generalNote: 'Cambio de Rafael' } }),
        'PUT /children/child-1/record': { body: fullRecord },
      })
      const queryClient = show()
      const user = userEvent.setup()
      await screen.findByDisplayValue('Usa lentes desde los 4 años.')
      await queryClient.invalidateQueries({ queryKey: childRecordKey('child-1') })
      expect(await screen.findByDisplayValue('Cambio de Rafael')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Guardar' }))
      await screen.findByText('HIJO')
      expect(bodyOf(mock, 'PUT /children/child-1/record').expectedVersion).toBe(5)
    })

    it('a newer version that arrives after the parent typed does not overwrite what was typed', async () => {
      stubWeb(web)
      let reads = 0
      const mock = stubApi({
        'GET /accounts/me': { body: account({ children: [mateo] }) },
        'GET /children/child-1/record': () => ({ body: reads++ === 0 ? fullRecord : { ...fullRecord, version: 5, generalNote: 'Cambio de Rafael' } }),
        'PUT /children/child-1/record': { body: fullRecord },
      })
      const queryClient = show()
      const user = userEvent.setup()
      const note = await screen.findByLabelText('Nota (opcional)', { selector: 'textarea' })
      await user.type(note, ' extra')
      await queryClient.invalidateQueries({ queryKey: childRecordKey('child-1') })
      await waitFor(() => expect(reads).toBe(2))
      expect(note).toHaveValue('Usa lentes desde los 4 años. extra')
      expect(screen.queryByDisplayValue('Cambio de Rafael')).toBeNull()
      await user.click(screen.getByRole('button', { name: 'Guardar' }))
      await screen.findByText('HIJO')
      expect(bodyOf(mock, 'PUT /children/child-1/record').expectedVersion).toBe(3)
    })

    it('says it could not load the record', async () => {
      stubWeb(web)
      stubApi({
        'GET /accounts/me': { body: account({ children: [mateo] }) },
        'GET /children/child-1/record': { status: 500, body: {} },
      })
      show()
      await waitFor(() => expect(screen.getByText('No pudimos cargar la ficha.')).toBeInTheDocument())
    })
  })
}
