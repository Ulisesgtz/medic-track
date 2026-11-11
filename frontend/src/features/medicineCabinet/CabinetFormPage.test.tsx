import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CabinetFormPage } from './CabinetFormPage'
import { account, bodyOf, callsOf, item, renderAt, stubApi, stubWeb } from './cabinet.test-utils'

const ocr = vi.hoisted(() => ({ suggestion: null as string | null, isRunning: false, progress: 0, runOcr: vi.fn() }))
vi.mock('../consultations/useOcrSuggestion', () => ({ useOcrSuggestion: () => ocr }))
vi.mock('../consultations/shrinkPhoto', () => ({
  shrinkPhoto: vi.fn(async (f: File) => f),
  blobToBase64: vi.fn(async () => 'BASE64'),
}))

const NEW = '/botiquin/nuevo'

function api(extra: Record<string, unknown> = {}) {
  return stubApi({
    'GET /accounts/me': { body: account() },
    'POST /accounts/a1/medicine-cabinet': { status: 201, body: item({ id: 'new1' }) },
    'GET /accounts/a1/medicine-cabinet/m1': { body: item({ hasPhoto: true, note: 'cajón', expires: { year: 2027, month: 3, day: 12 } }) },
    'GET /accounts/a1/medicine-cabinet/m1/photo': { body: { photoBase64: 'AAA' } },
    'PUT /accounts/a1/medicine-cabinet/m1': { body: item() },
    ...(extra as Record<string, { status?: number; body?: unknown }>),
  })
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Nombre'), 'Zinc')
  await user.type(screen.getByLabelText('Cantidad'), '2')
  await user.click(screen.getByRole('button', { name: 'cajas' }))
  await user.selectOptions(screen.getByLabelText('Mes'), '3')
  await user.selectOptions(screen.getByLabelText('Año'), '2027')
}

describe('CabinetFormPage', () => {
  beforeEach(() => {
    ocr.suggestion = null
    ocr.isRunning = false
    ocr.runOcr.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('adds a medicine typed by hand and goes to its detail', async () => {
    const mock = api()
    renderAt(NEW, <CabinetFormPage />, NEW)
    const user = userEvent.setup()
    expect(await screen.findByRole('heading', { name: 'Agregar al botiquín', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Con foto, la app lee el texto de la caja en tu teléfono y te propone los datos.')).toBeInTheDocument()
    await fillRequired(user)
    await user.type(screen.getByLabelText(/Concentración/), '50 mg')
    await user.selectOptions(screen.getByLabelText('Día (opcional)'), '12')
    await user.type(screen.getByLabelText(/Nota/), 'cajón')
    await user.click(screen.getByRole('button', { name: 'Guardar en el botiquín' }))
    expect(await screen.findByText('DETALLE')).toBeInTheDocument()
    expect(bodyOf(mock, 'POST /accounts/a1/medicine-cabinet')).toEqual({
      name: 'Zinc',
      strength: '50 mg',
      quantity: 2,
      unit: 'box',
      expires: { year: 2027, month: 3, day: 12 },
      note: 'cajón',
    })
  })

  it('says what is missing before asking the server, and shows the server’s field messages', async () => {
    const mock = api({ 'POST /accounts/a1/medicine-cabinet': { status: 400, body: { error: 'validation_error', details: [{ field: 'name', message: 'Del servidor.' }] } } })
    renderAt(NEW, <CabinetFormPage />, NEW)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Guardar en el botiquín' }))
    expect(screen.getByText('Escribe el nombre del medicamento.')).toBeInTheDocument()
    expect(screen.getByText('Elige la unidad.')).toBeInTheDocument()
    expect(callsOf(mock)).not.toContain('POST /accounts/a1/medicine-cabinet')
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'cajas' }))
    await user.click(screen.getByRole('button', { name: 'tabletas' }))
    await user.click(screen.getByRole('button', { name: 'Guardar en el botiquín' }))
    expect(await screen.findByText('Del servidor.')).toBeInTheDocument()
  })

  it('opens the plan notice, says the cap, or that it could not save — keeping what was typed', async () => {
    api({ 'POST /accounts/a1/medicine-cabinet': { status: 422, body: { error: 'freemium_consultation_limit_exceeded', reason: 'medicine_cabinet' } } })
    const first = renderAt(NEW, <CabinetFormPage />, NEW)
    const user = userEvent.setup()
    await screen.findByLabelText('Nombre')
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Guardar en el botiquín' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Ahora no' }))
    expect(screen.getByLabelText('Nombre')).toHaveValue('Zinc')
    first.unmount()

    api({ 'POST /accounts/a1/medicine-cabinet': { status: 422, body: { error: 'cabinet_limit_exceeded' } } })
    const second = renderAt(NEW, <CabinetFormPage />, NEW)
    await screen.findByLabelText('Nombre')
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Guardar en el botiquín' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El botiquín ya tiene el máximo de medicamentos')
    second.unmount()

    api({ 'POST /accounts/a1/medicine-cabinet': { status: 500, body: {} } })
    renderAt(NEW, <CabinetFormPage />, NEW)
    await screen.findByLabelText('Nombre')
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Guardar en el botiquín' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar')
  })

  it('a photo is read in the phone and only proposes the empty fields, never the quantity', async () => {
    const mock = api()
    const { rerender } = renderAt(NEW, <CabinetFormPage />, NEW)
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Nombre'), 'Mío')
    expect(screen.getByRole('button', { name: 'Tomar foto' })).toBeInTheDocument()
    const file = new File(['x'], 'caja.jpg', { type: 'image/jpeg' })
    URL.createObjectURL = vi.fn(() => 'blob:caja')
    URL.revokeObjectURL = vi.fn()
    ocr.isRunning = true
    await user.upload(screen.getByTestId('cabinet-gallery'), file)
    expect(ocr.runOcr).toHaveBeenCalledWith(file)
    expect(screen.getByText('Leyendo la foto…')).toBeInTheDocument()
    ocr.isRunning = false
    ocr.suggestion = 'AMOXICILINA\n250 mg/5 ml\nCAD 02/2027'
    rerender(<div />)
    renderAt(NEW, <CabinetFormPage />, NEW)
    // A fresh form: the reading finishes after the photo is chosen.
    ocr.isRunning = true
    ocr.suggestion = null
    await user.upload(await screen.findByTestId('cabinet-gallery'), file)
    ocr.isRunning = false
    ocr.suggestion = 'AMOXICILINA\n250 mg/5 ml\nCAD 02/2027'
    await user.type(screen.getByLabelText('Cantidad'), '1')
    expect(await screen.findByText('Leído de tu foto · revísalo')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('Amoxicilina')
    expect(screen.getByLabelText(/Concentración/)).toHaveValue('250 mg/5 ml')
    expect(screen.getByLabelText('Mes')).toHaveValue('2')
    expect(screen.getByLabelText('Cantidad')).toHaveValue('1')
    expect(screen.getAllByText('Leído de tu foto')).toHaveLength(3)
    // Editing a proposed field takes its mark away.
    await user.type(screen.getByLabelText('Nombre'), 'x')
    expect(screen.getAllByText('Leído de tu foto')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'frascos' }))
    await user.click(screen.getByRole('button', { name: 'Guardar en el botiquín' }))
    await waitFor(() => expect(bodyOf(mock, 'POST /accounts/a1/medicine-cabinet')?.photoBase64).toBe('BASE64'))
  })

  it('a photo with no text says so and keeps the photo', async () => {
    api()
    renderAt(NEW, <CabinetFormPage />, NEW)
    const user = userEvent.setup()
    URL.createObjectURL = vi.fn(() => 'blob:caja')
    ocr.isRunning = true
    await user.upload(await screen.findByTestId('cabinet-camera'), new File(['x'], 'c.jpg', { type: 'image/jpeg' }))
    ocr.isRunning = false
    ocr.suggestion = null
    await user.type(screen.getByLabelText('Nombre'), 'A')
    expect(await screen.findByText('No encontramos texto')).toBeInTheDocument()
  })

  it('from a consultation: the prescription’s name, its origin and the way back to it', async () => {
    api()
    stubWeb(true)
    renderAt({ pathname: NEW, state: { fromConsultation: { consultationId: 'c1', name: 'Amoxicilina', consultDate: '2026-10-18', doctor: 'Dra. Laura Cázares' } } }, <CabinetFormPage />, NEW)
    expect(await screen.findByText('Desde la consulta del 18 oct')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('Amoxicilina')
    expect(screen.getByText('De la receta')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Consulta' })).toHaveAttribute('href', '/consultations/c1')
    expect(screen.getByRole('button', { name: 'Elegir foto' })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(await screen.findByText('CONSULTA')).toBeInTheDocument()
  })

  it('asks before leaving with something typed', async () => {
    api()
    renderAt(NEW, <CabinetFormPage />, NEW)
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Nombre'), 'Zinc')
    await user.click(screen.getByRole('link', { name: '← Botiquín' }))
    let dialog = await screen.findByRole('dialog', { name: '¿Salir de todos modos?' })
    await user.click(within(dialog).getByRole('button', { name: 'Seguir editando' }))
    expect(screen.getByLabelText('Nombre')).toHaveValue('Zinc')
    await user.click(screen.getByRole('link', { name: '← Botiquín' }))
    dialog = await screen.findByRole('dialog', { name: '¿Salir de todos modos?' })
    await user.click(within(dialog).getByRole('button', { name: 'Descartar' }))
    expect(await screen.findByText('LISTA')).toBeInTheDocument()
  })

  it('edits a saved medicine: its values, its photo kept or removed', async () => {
    const mock = api()
    renderAt('/botiquin/m1/editar', <CabinetFormPage />, '/botiquin/:itemId/editar')
    const user = userEvent.setup()
    expect(await screen.findByRole('heading', { name: 'Editar medicamento', level: 1 })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Nombre')).toHaveValue('Paracetamol infantil'))
    expect(screen.getByLabelText('Día (opcional)')).toHaveValue('12')
    expect(await screen.findByAltText('Foto de la caja')).toHaveAttribute('src', 'data:image/jpeg;base64,AAA')
    await user.clear(screen.getByLabelText('Cantidad'))
    await user.type(screen.getByLabelText('Cantidad'), '1')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(bodyOf(mock, 'PUT /accounts/a1/medicine-cabinet/m1')).toMatchObject({ quantity: 1, note: 'cajón' }))
    expect(bodyOf(mock, 'PUT /accounts/a1/medicine-cabinet/m1').photoBase64).toBeUndefined()
  })

  it('removing the saved photo sends it empty', async () => {
    const mock = api()
    renderAt('/botiquin/m1/editar', <CabinetFormPage />, '/botiquin/:itemId/editar')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Quitar foto' }))
    expect(screen.getByRole('button', { name: 'Tomar foto' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(bodyOf(mock, 'PUT /accounts/a1/medicine-cabinet/m1')?.photoBase64).toBe(''))
  })

  it('says when the medicine to edit could not load', async () => {
    stubApi({ 'GET /accounts/me': { body: account() }, 'GET /accounts/a1/medicine-cabinet/m1': { status: 500, body: {} } })
    renderAt('/botiquin/m1/editar', <CabinetFormPage />, '/botiquin/:itemId/editar')
    expect(await screen.findByText(/No pudimos cargar el botiquín/)).toBeInTheDocument()
  })
})
