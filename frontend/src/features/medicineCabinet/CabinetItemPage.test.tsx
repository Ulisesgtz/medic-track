import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CabinetItemPage } from './CabinetItemPage'
import { account, caregiver, callsOf, item, renderAt, stubApi, stubWeb } from './cabinet.test-utils'

const PATH = '/botiquin/m1'
const ROUTE = '/botiquin/:itemId'

describe('CabinetItemPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows the data, the photo in the viewer and who added and edited it', async () => {
    stubApi({
      'GET /accounts/me': { body: account() },
      'GET /accounts/a1/medicine-cabinet/m1': {
        body: item({ hasPhoto: true, note: 'Uno abierto, en el cajón de la cocina.', updatedBy: 'Luis', updatedAt: new Date(2026, 10, 7, 12).toISOString() }),
      },
      'GET /accounts/a1/medicine-cabinet/m1/photo': { body: { photoBase64: 'AAA' } },
    })
    renderAt(PATH, <CabinetItemPage />, ROUTE)
    expect(await screen.findByRole('heading', { name: 'Paracetamol infantil', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('2 frascos')).toBeInTheDocument()
    expect(screen.getByText('mar 2027')).toBeInTheDocument()
    expect(screen.getByText('Uno abierto, en el cajón de la cocina.')).toBeInTheDocument()
    expect(screen.getByText('Agregado por Ana · 6 nov')).toBeInTheDocument()
    expect(screen.getByText('Editado por Luis · 7 nov')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Editar' })).toHaveAttribute('href', '/botiquin/m1/editar')
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByAltText('Foto de la caja')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Ver foto' }))
    const viewer = await screen.findByRole('dialog')
    expect(within(viewer).getByRole('img')).toBeInTheDocument()
  })

  it('removes after the neutral confirmation, and says when it could not', async () => {
    stubWeb(true)
    const mock = stubApi({
      'GET /accounts/me': { body: account() },
      'GET /accounts/a1/medicine-cabinet/m1': { body: item({ strength: '' }) },
      'DELETE /accounts/a1/medicine-cabinet/m1': { status: 500, body: {} },
    })
    renderAt(PATH, <CabinetItemPage />, ROUTE)
    const user = userEvent.setup()
    expect(await screen.findByText('—')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Quitar del botiquín' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: '¿Quitar Paracetamol infantil?' })).toBeInTheDocument()
    expect(within(dialog).getByText('Se quita del botiquín de la familia. No se puede deshacer.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Quitar del botiquín' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('No se pudo quitar')
    stubApi({ 'GET /accounts/me': { body: account() }, 'DELETE /accounts/a1/medicine-cabinet/m1': { status: 204 } })
    await user.click(within(dialog).getByRole('button', { name: 'Quitar del botiquín' }))
    expect(await screen.findByText('LISTA')).toBeInTheDocument()
    expect(callsOf(mock)).toContain('DELETE /accounts/a1/medicine-cabinet/m1')
  })

  it('a Caregiver reads it without actions', async () => {
    stubApi({ 'GET /accounts/me': { body: caregiver }, 'GET /accounts/owner/medicine-cabinet/m1': { body: item({ canEdit: false }) } })
    renderAt(PATH, <CabinetItemPage />, ROUTE)
    expect(await screen.findByText('Vista de Cuidadora.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quitar del botiquín' })).not.toBeInTheDocument()
  })

  it('says when it is not there, or could not load', async () => {
    stubApi({ 'GET /accounts/me': { body: account() }, 'GET /accounts/a1/medicine-cabinet/m1': { status: 404, body: {} } })
    const first = renderAt(PATH, <CabinetItemPage />, ROUTE)
    expect(await screen.findByText('No se encontró este medicamento.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver al botiquín' })).toHaveAttribute('href', '/botiquin')
    first.unmount()
    stubApi({ 'GET /accounts/me': { body: account() }, 'GET /accounts/a1/medicine-cabinet/m1': { status: 500, body: {} } })
    renderAt(PATH, <CabinetItemPage />, ROUTE)
    expect(await screen.findByText(/No pudimos cargar el botiquín/)).toBeInTheDocument()
  })
})
