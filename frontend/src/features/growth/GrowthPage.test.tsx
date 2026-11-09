import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GrowthPage } from './GrowthPage'
import { GrowthSection } from './GrowthSection'
import { bodyOf, callsOf, caregiverAccount, chart, list, owner, renderAt, stubApi, stubWeb } from './growth.test-utils'

const PATH = '/children/child-1/crecimiento'
const ROUTE = '/children/:childId/crecimiento'
const BASE = '/children/child-1'

function api(over: { acc?: unknown; growth?: unknown; chartReply?: { status?: number; body?: unknown } } = {}) {
  return stubApi({
    'GET /accounts/me': { body: over.acc ?? owner },
    [`GET ${BASE}/growth-measurements`]: { body: over.growth ?? list() },
    [`GET ${BASE}/growth-chart`]: over.chartReply ?? { body: chart() },
    [`PUT ${BASE}/growth-reference`]: { status: 204 },
    [`DELETE ${BASE}/growth-measurements/g1`]: { status: 204 },
  })
}

describe('GrowthPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lists the measurements with the age, the note and who wrote them; the signup’s values apart', async () => {
    api()
    renderAt(PATH, <GrowthPage />, ROUTE)
    expect(await screen.findByText('2 medidas')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Crecimiento', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('10.2 kg · 76.5 cm')).toBeInTheDocument()
    expect(screen.getByText('03 nov 2025 · 16 meses')).toBeInTheDocument()
    expect(screen.getByText('en ayunas')).toBeInTheDocument()
    expect(screen.getAllByText('Anotada por Ana')).toHaveLength(2)
    expect(screen.getByText('Anotado al registrar a Mateo, sin fecha:')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Anotarla con fecha' })).toHaveAttribute('href', '/children/child-1/crecimiento/nueva')
    expect(screen.getByRole('link', { name: 'Anotar medida' })).toHaveAttribute('href', '/children/child-1/crecimiento/nueva')
    expect(screen.getByRole('link', { name: 'Corregir 03 nov 2025' })).toHaveAttribute('href', '/children/child-1/crecimiento/g1/editar')
  })

  it('draws the chart: the points over five grey curves named only P3–P97, a table and the fixed sentence', async () => {
    api()
    renderAt(PATH, <GrowthPage />, ROUTE)
    const section = await screen.findByRole('region', { name: 'Gráfica' })
    await waitFor(() => expect(within(section).getAllByTestId('growth-point')).toHaveLength(2))
    for (const p of ['p3', 'p15', 'p50', 'p85', 'p97']) expect(within(section).getByTestId(`curve-${p}`)).toBeInTheDocument()
    expect(within(section).getByText('P97')).toBeInTheDocument()
    expect(within(section).getByText('Tabla de la OMS: niño')).toBeInTheDocument()
    expect(within(section).getByText(/quien la interpreta es el pediatra/)).toBeInTheDocument()
    expect(within(section).getByText(/OMS: Patrones de Crecimiento Infantil/)).toBeInTheDocument()
    expect(within(section).getByRole('table')).toHaveTextContent('8.1 kg')

    const user = userEvent.setup()
    await user.click(within(section).getAllByTestId('growth-point')[1])
    expect(within(section).getByText('03 nov 2025 · 10.2 kg · 16 meses')).toBeInTheDocument()
    await user.click(within(section).getAllByTestId('growth-point')[1])
    expect(within(section).queryByText('03 nov 2025 · 10.2 kg · 16 meses')).not.toBeInTheDocument()

    await user.click(within(section).getByRole('button', { name: 'Talla' }))
    expect(within(section).getByRole('button', { name: 'Talla' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(section).getAllByTestId('growth-point')).toHaveLength(1)
    expect(within(section).getByRole('table')).toHaveTextContent('76.5 cm')
  })

  it('asks which WHO table to draw the first time, and lets change it', async () => {
    const fetchMock = api({ chartReply: { body: chart({ referenceSex: null, reference: null }) } })
    renderAt(PATH, <GrowthPage />, ROUTE)
    const section = await screen.findByRole('region', { name: 'Gráfica' })
    const user = userEvent.setup()
    await user.click(await within(section).findByRole('button', { name: 'Niña' }))
    await waitFor(() => expect(bodyOf(fetchMock, `PUT ${BASE}/growth-reference`)).toEqual({ sex: 'female' }))
    expect(within(section).queryAllByTestId('curve-p50')).toHaveLength(0)
  })

  it('changing the table shows the choice again', async () => {
    api()
    renderAt(PATH, <GrowthPage />, ROUTE)
    const section = await screen.findByRole('region', { name: 'Gráfica' })
    const user = userEvent.setup()
    await user.click(await within(section).findByRole('button', { name: 'Cambiar' }))
    expect(within(section).getByRole('button', { name: 'Niño' })).toBeInTheDocument()
  })

  it('without WHO’s curves switched on: only the points and a sentence', async () => {
    const c = chart()
    api({ chartReply: { body: { ...c, reference: { ...c.reference, available: false, weight: { maxMonths: 120, curves: [] }, height: { maxMonths: 228, curves: [] } } } } })
    renderAt(PATH, <GrowthPage />, ROUTE)
    expect(await screen.findByText(/aún no está disponible/)).toBeInTheDocument()
    expect(screen.queryByTestId('curve-p50')).not.toBeInTheDocument()
    expect(screen.queryByText(/OMS: Patrones/)).not.toBeInTheDocument()
  })

  it('a measurement past the reference says so', async () => {
    const c = chart()
    api({ chartReply: { body: { ...c, points: { ...c.points, weight: [{ measuredOn: '2035-01-01', months: 130, value: 35 }] } } } })
    renderAt(PATH, <GrowthPage />, ROUTE)
    expect(await screen.findByText('La referencia de la OMS de peso para la edad llega a los 10 años.')).toBeInTheDocument()
  })

  it('the free plan: the list stays, the chart is not asked and opens the plan notice', async () => {
    const fetchMock = api({ growth: list({ chartAvailable: false }) })
    renderAt(PATH, <GrowthPage />, ROUTE)
    const button = await screen.findByRole('button', { name: /Ver la gráfica/ })
    expect(button).toHaveTextContent('Plan completo')
    expect(screen.getByText('2 medidas')).toBeInTheDocument()
    expect(callsOf(fetchMock)).not.toContain(`GET ${BASE}/growth-chart`)
    const user = userEvent.setup()
    await user.click(button)
    expect(await screen.findByRole('dialog')).toHaveTextContent('Gráfica de crecimiento')
    await user.click(screen.getByRole('link', { name: 'Ver el plan completo' }))
    expect(await screen.findByText('PLANES')).toBeInTheDocument()
  })

  it('the server refusing the chart also shows the plan entry', async () => {
    api({ chartReply: { status: 422, body: { error: 'freemium_consultation_limit_exceeded', reason: 'growth_chart' } } })
    renderAt(PATH, <GrowthPage />, ROUTE)
    expect(await screen.findByRole('button', { name: /Ver la gráfica/ })).toBeInTheDocument()
  })

  it('a chart that fails can be asked again', async () => {
    api({ chartReply: { status: 500, body: {} } })
    renderAt(PATH, <GrowthPage />, ROUTE)
    expect(await screen.findByText('No pudimos cargar la gráfica.')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }))
  })

  it('removes a measurement after a neutral confirmation', async () => {
    const fetchMock = api()
    renderAt(PATH, <GrowthPage />, ROUTE)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Quitar 03 nov 2025' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('¿Quitar la medida del 03 nov 2025?')
    expect(dialog).toHaveTextContent('No se puede deshacer.')
    await user.click(within(dialog).getByRole('button', { name: 'Quitar' }))
    await waitFor(() => expect(callsOf(fetchMock)).toContain(`DELETE ${BASE}/growth-measurements/g1`))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('says when removing failed', async () => {
    api()
    stubApi({
      'GET /accounts/me': { body: owner },
      [`GET ${BASE}/growth-measurements`]: { body: list() },
      [`GET ${BASE}/growth-chart`]: { body: chart() },
      [`DELETE ${BASE}/growth-measurements/g1`]: { status: 500, body: {} },
    })
    renderAt(PATH, <GrowthPage />, ROUTE)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Quitar 03 nov 2025' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Quitar' }))
    expect(await screen.findByText('No pudimos quitar la medida. Inténtalo de nuevo.')).toBeInTheDocument()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('a Caregiver sees without buttons, and is told who chooses the WHO table', async () => {
    api({ acc: caregiverAccount, growth: list({ canEdit: false, registered: null }), chartReply: { body: chart({ referenceSex: null, reference: null }) } })
    renderAt(PATH, <GrowthPage />, ROUTE)
    expect(await screen.findByText(/Puedes ver las medidas/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Anotar medida' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Quitar/ })).not.toBeInTheDocument()
    expect(await screen.findByText(/puede elegir la tabla de la OMS/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Niña' })).not.toBeInTheDocument()
  })

  it('the empty record, on the web design', async () => {
    stubWeb(true)
    api({ growth: list({ measurements: [], registered: null }), chartReply: { body: chart({ points: { weight: [], height: [] } }) } })
    renderAt(PATH, <GrowthPage />, ROUTE)
    expect(await screen.findByText('Aún no hay medidas')).toBeInTheDocument()
    expect(await screen.findByText('Aún no hay medidas de peso.')).toBeInTheDocument()
  })

  it('a record that can’t be read offers to try again', async () => {
    stubApi({ 'GET /accounts/me': { body: owner }, [`GET ${BASE}/growth-measurements`]: { status: 500, body: {} } })
    renderAt(PATH, <GrowthPage />, ROUTE)
    expect(await screen.findByRole('button', { name: /Reintentar/ })).toBeInTheDocument()
  })
})

describe('GrowthSection', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('says the last measurement as written, and links to the record', async () => {
    api()
    renderAt('/x', <GrowthSection childId="child-1" variant="phone" />, '/x')
    expect(await screen.findByText('Última: 10.2 kg · 76.5 cm, 03 nov 2025')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/children/child-1/crecimiento')
    expect(screen.getByText('2 medidas')).toBeInTheDocument()
  })

  it('with nothing yet it invites to write one down (web)', async () => {
    api({ growth: list({ measurements: [] }) })
    renderAt('/x', <GrowthSection childId="child-1" variant="desktop" />, '/x')
    expect(await screen.findByText('Aún no hay medidas')).toBeInTheDocument()
    expect(screen.getByText('Anotar medida')).toBeInTheDocument()
  })

  it('keeps standing while it loads or fails', () => {
    stubApi({})
    renderAt('/x', <GrowthSection childId="child-1" variant="phone" />, '/x')
    expect(screen.getByText('Peso y talla')).toBeInTheDocument()
  })
})

