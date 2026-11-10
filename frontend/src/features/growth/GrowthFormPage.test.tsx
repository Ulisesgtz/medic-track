import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GrowthFormPage } from './GrowthFormPage'
import { GrowthApiError, fetchGrowth } from './api'
import { bodyOf, list, measurement, owner, renderAt, stubApi, stubWeb } from './growth.test-utils'

const BASE = '/children/child-1'
const NEW = '/children/child-1/crecimiento/nueva'
const EDIT = '/children/child-1/crecimiento/g1/editar'

function api(save: { status?: number; body?: unknown } = { status: 201, body: measurement() }, method = 'POST', path = `${BASE}/growth-measurements`) {
  return stubApi({
    'GET /accounts/me': { body: owner },
    [`GET ${BASE}/growth-measurements`]: { body: list() },
    [`${method} ${path}`]: save,
  })
}

describe('GrowthFormPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('writes a measurement down with a comma or a point, then goes back to the record', async () => {
    const fetchMock = api()
    renderAt(NEW, <GrowthFormPage />, '/children/:childId/crecimiento/nueva')
    expect(await screen.findByRole('heading', { name: 'Anotar medida', level: 1 })).toBeInTheDocument()
    const user = userEvent.setup()
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2025-11-03' } })
    await user.type(screen.getByLabelText('Peso'), '12,4')
    await user.type(screen.getByLabelText('Talla'), '86')
    await user.type(screen.getByLabelText(/Nota/), 'medido en la consulta')
    await user.click(screen.getByRole('button', { name: 'Guardar medida' }))
    expect(await screen.findByText('CRECIMIENTO')).toBeInTheDocument()
    expect(bodyOf(fetchMock, `POST ${BASE}/growth-measurements`)).toEqual({ measuredOn: '2025-11-03', weightKg: 12.4, heightCm: 86, note: 'medido en la consulta' })
  })

  it('checks before sending and shows each error under its field', async () => {
    const fetchMock = api()
    renderAt(NEW, <GrowthFormPage />, '/children/:childId/crecimiento/nueva')
    const user = userEvent.setup()
    // A new measurement starts dated today (the mock, G1); emptied, the date is asked for.
    fireEvent.change(await screen.findByLabelText('Fecha'), { target: { value: '' } })
    await user.click(screen.getByRole('button', { name: 'Guardar medida' }))
    expect(screen.getByText('Escribe la fecha de la medida.')).toBeInTheDocument()
    expect(screen.getAllByText('Escribe el peso, la talla o los dos.').length).toBeGreaterThan(0)
    expect(bodyOf(fetchMock, `POST ${BASE}/growth-measurements`)).toBeUndefined()
  })

  it('G2: a future date and a weight that isn’t a number, with the mock’s words; the units are inside the field', async () => {
    api()
    renderAt(NEW, <GrowthFormPage />, '/children/:childId/crecimiento/nueva')
    const user = userEvent.setup()
    const date = await screen.findByLabelText('Fecha')
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    expect(date).toHaveValue(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`)
    expect(screen.getByText('kg')).toBeInTheDocument()
    expect(screen.getByText('cm')).toBeInTheDocument()
    expect(screen.getByText('Puedes anotar solo el peso o solo la talla.')).toBeInTheDocument()
    expect(screen.getByLabelText('Peso')).toHaveAttribute('placeholder', 'Ej. 11.6')
    fireEvent.change(date, { target: { value: '2999-01-01' } })
    await user.type(screen.getByLabelText('Peso'), '1.1.6')
    await user.click(screen.getByRole('button', { name: 'Guardar medida' }))
    expect(screen.getByText('Esa fecha aún no llega. Elige hoy o un día anterior.')).toBeInTheDocument()
    expect(screen.getByText('Escribe el peso en kilos, con punto decimal. Por ejemplo: 11.6')).toBeInTheDocument()
    expect(screen.getByLabelText('Peso')).toHaveAttribute('aria-describedby', 'growth-weight-error')
  })

  it('starts with the signup’s values from «Anotarla con fecha»', async () => {
    api()
    renderAt({ pathname: NEW, state: { registered: { weightKg: 12, heightCm: null } } }, <GrowthFormPage />, '/children/:childId/crecimiento/nueva')
    expect(await screen.findByLabelText('Peso')).toHaveValue('12')
    expect(screen.getByLabelText('Talla')).toHaveValue('')
  })

  it('the server’s field errors, the cap and a failure', async () => {
    api({ status: 400, body: { error: 'validation_error', message: 'x', details: [{ field: 'measuredOn', message: 'La fecha no puede ser futura.' }] } })
    renderAt(NEW, <GrowthFormPage />, '/children/:childId/crecimiento/nueva')
    const user = userEvent.setup()
    fireEvent.change(await screen.findByLabelText('Fecha'), { target: { value: '2025-11-03' } })
    await user.type(screen.getByLabelText('Peso'), '12')
    await user.click(screen.getByRole('button', { name: 'Guardar medida' }))
    expect(await screen.findByText('La fecha no puede ser futura.')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha')).toHaveAttribute('aria-invalid', 'true')

    vi.unstubAllGlobals()
    api({ status: 422, body: { error: 'growth_limit_exceeded' } })
    await user.click(screen.getByRole('button', { name: 'Guardar medida' }))
    expect(await screen.findByText(/ya guarda 500 medidas/)).toBeInTheDocument()

    vi.unstubAllGlobals()
    api({ status: 500, body: {} })
    await user.click(screen.getByRole('button', { name: 'Guardar medida' }))
    expect(await screen.findByText(/No pudimos guardar la medida/)).toBeInTheDocument()
  })

  it('corrects a saved one on the web design, with «Cancelar» asking first when something changed', async () => {
    stubWeb(true)
    const fetchMock = api({ body: measurement({ weightKg: 10.5 }) }, 'PUT', `${BASE}/growth-measurements/g1`)
    renderAt(EDIT, <GrowthFormPage />, '/children/:childId/crecimiento/:measurementId/editar')
    expect(await screen.findByRole('heading', { name: 'Corregir medida', level: 1 })).toBeInTheDocument()
    const weight = await screen.findByLabelText('Peso')
    await waitFor(() => expect(weight).toHaveValue('10.2'))
    const user = userEvent.setup()
    await user.clear(weight)
    await user.type(weight, '10.5')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(confirm).toHaveBeenCalled()
    expect(screen.queryByText('CRECIMIENTO')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Guardar medida' }))
    expect(await screen.findByText('CRECIMIENTO')).toBeInTheDocument()
    expect(bodyOf(fetchMock, `PUT ${BASE}/growth-measurements/g1`)).toEqual({ measuredOn: '2025-11-03', weightKg: 10.5, heightCm: 76.5, note: '' })
  })

  it('a measurement that isn’t there says so', async () => {
    api()
    renderAt('/children/child-1/crecimiento/nope/editar', <GrowthFormPage />, '/children/:childId/crecimiento/:measurementId/editar')
    expect(await screen.findByText('No encontramos esta medida.')).toBeInTheDocument()
  })

  it('«Cancelar» on the web leaves at once when nothing changed', async () => {
    stubWeb(true)
    api()
    renderAt(NEW, <GrowthFormPage />, '/children/:childId/crecimiento/nueva')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(await screen.findByText('CRECIMIENTO')).toBeInTheDocument()
  })
})

describe('growth api', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    [403, {}, 'forbidden'],
    [404, {}, 'not_found'],
    [422, { error: 'freemium_consultation_limit_exceeded' }, 'plan_required'],
    [422, { error: 'growth_limit_exceeded' }, 'limit'],
    [500, {}, 'unknown'],
  ])('maps %s %j to %s', async (status, body, kind) => {
    stubApi({ [`GET ${BASE}/growth-measurements`]: { status, body } })
    const err = await fetchGrowth('child-1', 't').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GrowthApiError)
    expect((err as GrowthApiError).kind).toBe(kind)
  })
})
