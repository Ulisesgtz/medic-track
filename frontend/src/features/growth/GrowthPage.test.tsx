import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GrowthPage } from './GrowthPage'
import { GrowthSection } from './GrowthSection'
import { account } from '../medicineCabinet/cabinet.test-utils'
import { bodyOf, callsOf, chart, list, measurement, renderAt, stubApi, stubWeb } from './growth.test-utils'
import type { GrowthChart, GrowthList } from './types'

// specs/065: the screen rebuilt from Claude Design's mock, with the mock's data — Mateo, born 12 Sep 2024, «today» 24 Oct 2026.

const PATH = '/children/child-1/crecimiento'
const ROUTE = '/children/:childId/crecimiento'
const BASE = '/children/child-1'
const BIRTH = '2024-09-12'

const mateo = { id: 'child-1', firstName: 'Mateo', lastName: 'Morales', birthDate: BIRTH, height: 50, weight: 3.3 }
const owner = account({ children: [mateo] })
const caregiver = account({
  id: 'r1',
  firstName: 'Rosa',
  plan: 'free',
  family: { role: 'caregiver', ownerAccountId: 'a1', ownerName: 'Ana', plan: 'paid', readOnly: false },
  children: [{ ...mateo, role: 'caregiver', plan: 'paid', accountId: 'a1' }],
})
const lapsedTutor = account({
  family: { role: 'tutor', ownerAccountId: 'o1', ownerName: 'Ana', plan: 'free', readOnly: true },
  children: [{ ...mateo, role: 'tutor', plan: 'free', readOnly: true, accountId: 'o1' }],
})

const MOCK: [string, number, number | null, string, string?, boolean?][] = [
  ['2024-10-10', 4.4, 54, 'Ana'],
  ['2024-12-12', 6.1, 59.5, 'Ana'],
  ['2025-02-13', 7.2, 64, 'Luis'],
  ['2025-04-14', 8.1, 67.5, 'Ana'],
  ['2025-07-18', 9.0, null, 'Luis', 'Báscula de la farmacia'],
  ['2025-10-15', 9.6, 74.5, 'Ana', 'Con ropa ligera'],
  ['2026-04-10', 10.6, 78.5, 'Ana', undefined, true],
  ['2026-10-12', 11.4, 82, 'Ana'],
]
const months = (d: string) => (Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8)) - Date.UTC(2024, 8, 12)) / 86_400_000 / 30.4375

function mockList(over: Partial<GrowthList> = {}): GrowthList {
  return list({
    measurements: MOCK.slice()
      .reverse()
      .map(([on, kg, cm, by, note, corrected], i) =>
        measurement({
          id: `g${i}`,
          measuredOn: on,
          weightKg: kg,
          heightCm: cm,
          note: note ?? null,
          createdBy: { name: by },
          corrected: corrected ? { at: '2026-10-03T10:00:00Z', by: { name: 'Luis' } } : null,
        }),
      ),
    registered: { weightKg: 3.3, heightCm: 50 },
    birthDate: BIRTH,
    ...over,
  })
}

const curves = (base: number, step: number, until: number) =>
  Array.from({ length: until / 6 + 1 }, (_, i) => {
    const m = i * 6
    const v = base + Math.sqrt(m) * step
    return { months: m, p3: v - 2, p15: v - 1, p50: v, p85: v + 1, p97: v + 2 }
  })

function mockChart(over: Partial<GrowthChart> = {}): GrowthChart {
  return chart({
    birthDate: BIRTH,
    points: {
      weight: MOCK.map(([on, kg]) => ({ measuredOn: on, months: months(on), value: kg })),
      height: MOCK.filter((m) => m[2] != null).map(([on, , cm]) => ({ measuredOn: on, months: months(on), value: cm as number })),
    },
    reference: {
      available: true,
      source: 'OMS',
      weight: { maxMonths: 120, curves: curves(3.3, 1.5, 120) },
      height: { maxMonths: 228, curves: curves(50, 5, 228) },
    },
    ...over,
  })
}

function api(over: { acc?: unknown; growth?: unknown; chartReply?: { status?: number; body?: unknown }; remove?: number; sex?: number } = {}) {
  return stubApi({
    'GET /accounts/me': { body: over.acc ?? owner },
    [`GET ${BASE}/growth-measurements`]: { body: over.growth ?? mockList() },
    [`GET ${BASE}/growth-chart`]: over.chartReply ?? { body: mockChart() },
    [`PUT ${BASE}/growth-reference`]: { status: over.sex ?? 204 },
    [`DELETE ${BASE}/growth-measurements/g0`]: { status: over.remove ?? 204, body: over.remove ? { error: 'x' } : undefined },
  })
}

const reading = () => screen.getByRole('button', { name: 'Medida anterior' }).parentElement as HTMLElement

describe('GrowthPage (spec 065)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 24, 10, 24))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('A on the phone: the header, the newest measurement in large, the chart reading and the list', async () => {
    api()
    renderAt(PATH, <GrowthPage />, ROUTE)
    const latest = await screen.findByRole('region', { name: 'Última medida' })
    expect(within(latest).getByText('11.4 kg · 82 cm')).toBeInTheDocument()
    expect(within(latest).getByText('hace 12 días · 12 oct 2026')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Crecimiento', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Mateo · 2 años 1 mes')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Anotar medida' })).toHaveAttribute('href', '/children/child-1/crecimiento/nueva')

    const chartSection = await screen.findByRole('region', { name: 'Gráfica de crecimiento' })
    expect(await within(chartSection).findByRole('img', { name: 'Gráfica de peso de Mateo. Los mismos datos están en Medidas anotadas.' })).toBeInTheDocument()
    expect(within(chartSection).getByRole('tab', { name: 'Peso' })).toHaveAttribute('aria-selected', 'true')
    expect(within(chartSection).getByRole('button', { name: '0–3 años' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(chartSection).getByRole('button', { name: 'Hasta 10 años' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(reading()).getByText('11.4 kg')).toBeInTheDocument()
    expect(within(reading()).getByText('12 oct 2026 · 2 años 1 mes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Medida siguiente' })).toBeDisabled()
    for (const name of ['P3', 'P15', 'P50', 'P85', 'P97']) expect(within(chartSection).getByText(name)).toBeInTheDocument()
    expect(within(chartSection).getAllByTestId('who-curves')[0].querySelectorAll('path')).toHaveLength(5)
    expect(within(chartSection).getByText('meses')).toBeInTheDocument()
    expect(within(chartSection).getByText('años')).toBeInTheDocument()
    expect(within(chartSection).getByRole('group', { name: 'Tabla de la OMS' })).toBeInTheDocument()
    expect(within(chartSection).getByRole('button', { name: 'Niño' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(chartSection).getByRole('note')).toHaveTextContent('Tu pediatra es quien interpreta la gráfica.')

    const listSection = screen.getByRole('region', { name: 'Medidas anotadas' })
    expect(within(listSection).getByText('8 medidas')).toBeInTheDocument()
    const rows = within(listSection).getAllByRole('listitem')
    expect(rows).toHaveLength(8)
    expect(rows[0]).toHaveTextContent('12 oct 2026')
    expect(rows[0]).toHaveTextContent('2 años 1 mes')
    expect(rows[1]).toHaveTextContent('Corregida el 3 oct 2026 por Luis')
    expect(rows[2]).toHaveTextContent('Nota: Con ropa ligera')
    expect(rows[3]).toHaveTextContent('9.0 kg')
    expect(rows[3]).not.toHaveTextContent('cm')
    expect(rows[7]).toHaveTextContent('4 semanas')
    expect(within(rows[0]).getByRole('link', { name: 'Corregir 12 oct 2026' })).toHaveAttribute('href', '/children/child-1/crecimiento/g0/editar')

    const registered = screen.getByRole('region', { name: 'Medida del registro' })
    expect(registered).toHaveTextContent('Al registrar a Mateo')
    expect(registered).toHaveTextContent('3.3 kg · 50 cm')
    expect(registered).toHaveTextContent('Sin fecha, por eso no aparece en la gráfica.')
    expect(within(registered).getByRole('link', { name: 'Anotarla con fecha' })).toHaveAttribute('href', '/children/child-1/crecimiento/nueva')
  })

  it('‹ › walk the measurements; a tap picks the closest; the tab starts again at the newest; the range keeps the choice', async () => {
    api()
    renderAt(PATH, <GrowthPage />, ROUTE)
    const section = await screen.findByRole('region', { name: 'Gráfica de crecimiento' })
    await within(section).findByRole('img')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Medida anterior' }))
    expect(within(reading()).getByText('10.6 kg')).toBeInTheDocument()
    expect(within(reading()).getByText('10 abr 2026 · 1 año 6 meses')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Medida siguiente' }))
    expect(within(reading()).getByText('11.4 kg')).toBeInTheDocument()

    // A tap at the very left of the plot picks the first measurement.
    fireEvent.click(within(section).getByTestId('chart-hit'), { clientX: 0 })
    expect(within(reading()).getByText('4.4 kg')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Medida anterior' })).toBeDisabled()

    await user.click(within(section).getByRole('button', { name: 'Hasta 10 años' }))
    expect(within(section).getByRole('button', { name: 'Hasta 10 años' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(reading()).getByText('4.4 kg')).toBeInTheDocument()

    await user.click(within(section).getByRole('tab', { name: 'Talla' }))
    expect(within(section).getByRole('tab', { name: 'Talla' })).toHaveAttribute('aria-selected', 'true')
    expect(within(section).getByRole('img', { name: /Gráfica de talla de Mateo/ })).toBeInTheDocument()
    expect(within(reading()).getByText('82 cm')).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'Hasta 19 años' })).toBeInTheDocument()
    expect(within(section).getByTestId('child-points').querySelectorAll('circle')).toHaveLength(6)

    // The arrows of the keyboard move between the tabs.
    within(section).getByRole('tab', { name: 'Talla' }).focus()
    await user.keyboard('{ArrowLeft}')
    expect(within(section).getByRole('tab', { name: 'Peso' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowRight}')
    expect(within(section).getByRole('tab', { name: 'Talla' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Enter}')
    expect(within(section).getByRole('tab', { name: 'Talla' })).toHaveAttribute('aria-selected', 'true')
  })

  it('A on the web: the top row, the table with «—», the reading on one line', async () => {
    stubWeb(true)
    api()
    renderAt(PATH, <GrowthPage />, ROUTE)
    const table = await screen.findByRole('table', { name: 'Medidas anotadas' })
    expect(within(table).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Fecha', 'Edad', 'Peso', 'Talla', 'Anotada por', 'Acciones'])
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(9)
    expect(within(rows[4]).getByRole('cell', { name: 'Sin talla anotada' })).toHaveTextContent('—')
    expect(within(rows[3]).getByText('Nota: Con ropa ligera')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Corregida el 3 oct 2026 por Luis')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Última medida' })).toHaveTextContent('11.4 kg · 82 cm')
    expect(await screen.findByText('12 oct 2026 · 11.4 kg · 2 años 1 mes')).toBeInTheDocument()
  })

  it('choosing another WHO table asks the server; a failure says so', async () => {
    const mock = api({ sex: 500 })
    renderAt(PATH, <GrowthPage />, ROUTE)
    const section = await screen.findByRole('region', { name: 'Gráfica de crecimiento' })
    await within(section).findByRole('img')
    const user = userEvent.setup()
    await user.click(within(section).getByRole('button', { name: 'Niña' }))
    await waitFor(() => expect(bodyOf(mock, `PUT ${BASE}/growth-reference`)).toEqual({ sex: 'female' }))
    expect(await within(section).findByText('No pudimos guardar la tabla. Inténtalo de nuevo.')).toBeInTheDocument()
    await user.click(within(section).getByRole('button', { name: 'Niño' }))
    expect(callsOf(mock).filter((c) => c === `PUT ${BASE}/growth-reference`)).toHaveLength(1)
  })

  it('D: no table yet — the invitation with Niña and Niño, the points alone, no picker under the chart', async () => {
    const mock = api({ chartReply: { body: mockChart({ referenceSex: null, reference: null }) } })
    renderAt(PATH, <GrowthPage />, ROUTE)
    const section = await screen.findByRole('region', { name: 'Gráfica de crecimiento' })
    expect(await within(section).findByText('Elige la tabla de la OMS para ver las curvas de referencia.')).toBeInTheDocument()
    expect(within(section).getByText('Por ahora ves solo las medidas de Mateo.')).toBeInTheDocument()
    expect(within(section).queryByRole('group', { name: 'Tabla de la OMS' })).not.toBeInTheDocument()
    expect(within(section).queryByText('P50')).not.toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'Hasta 10 años' })).toBeInTheDocument()
    await userEvent.setup().click(within(section).getByRole('button', { name: 'Niño' }))
    await waitFor(() => expect(bodyOf(mock, `PUT ${BASE}/growth-reference`)).toEqual({ sex: 'male' }))
  })

  it('D on the web for who can’t write: who chooses the table', async () => {
    stubWeb(true)
    api({ acc: caregiver, growth: mockList({ canEdit: false }), chartReply: { body: mockChart({ referenceSex: null, reference: null }) } })
    renderAt(PATH, <GrowthPage />, ROUTE)
    expect(await screen.findByText('Por ahora ves solo las medidas de Mateo. La tabla de la OMS la elige Ana.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Niño' })).not.toBeInTheDocument()
  })

  it('E: the free plan keeps the list, never asks the chart and opens the plan notice', async () => {
    const mock = api({ growth: mockList({ chartAvailable: false }) })
    renderAt(PATH, <GrowthPage />, ROUTE)
    const locked = await screen.findByRole('region', { name: 'Gráfica de crecimiento' })
    expect(within(locked).getByText('Plan completo')).toBeInTheDocument()
    expect(within(locked).getByText('Con el Plan completo ves las medidas de Mateo sobre las curvas de la OMS.')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('Las curvas son la referencia de la OMS')
    expect(screen.getAllByRole('listitem')).toHaveLength(8)
    const user = userEvent.setup()
    await user.click(within(locked).getByRole('button', { name: 'Ver la gráfica' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Ahora no' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(within(locked).getByRole('button', { name: 'Ver la gráfica' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('link', { name: /Ver el plan completo/ }))
    expect(await screen.findByText('PLANES')).toBeInTheDocument()
    expect(callsOf(mock)).not.toContain(`GET ${BASE}/growth-chart`)
  })

  it('E on the web, and the server refusing the chart shows the same card', async () => {
    stubWeb(true)
    api({ chartReply: { status: 422, body: { error: 'freemium_consultation_limit_exceeded', reason: 'growth_chart', message: 'x' } } })
    renderAt(PATH, <GrowthPage />, ROUTE)
    expect(await screen.findByRole('button', { name: 'Ver la gráfica' })).toBeInTheDocument()
  })

  it('F: a Caregiver sees without any write control and is told who chose the table', async () => {
    api({ acc: caregiver, growth: mockList({ canEdit: false }) })
    renderAt(PATH, <GrowthPage />, ROUTE)
    expect(await screen.findByText('Vista de Cuidadora.')).toBeInTheDocument()
    expect(screen.getByText(/Puedes ver las medidas\. Anotarlas lo hace la familia\./)).toBeInTheDocument()
    expect(await screen.findByText('Curvas de la OMS para niño. La tabla la elige Ana.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '+ Anotar medida' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Corregir/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Quitar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Anotarla con fecha' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Tabla de la OMS' })).not.toBeInTheDocument()
  })

  it('F on the web for a Tutor of a lapsed family: «Solo lectura.»', async () => {
    stubWeb(true)
    api({ acc: lapsedTutor, growth: mockList({ canEdit: false }) })
    renderAt(PATH, <GrowthPage />, ROUTE)
    expect(await screen.findByText('Solo lectura.')).toBeInTheDocument()
    expect(await screen.findByText('Curvas de la OMS para niño. La tabla la elige Ana.')).toBeInTheDocument()
  })

  it('C: nothing written — the empty card with the one solid button, the note and the signup’s values', async () => {
    const mock = api({ growth: mockList({ measurements: [] }) })
    renderAt(PATH, <GrowthPage />, ROUTE)
    expect(await screen.findByText('Aún no hay medidas anotadas')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Anotar la primera medida' })).toHaveAttribute('href', '/children/child-1/crecimiento/nueva')
    expect(screen.queryByRole('link', { name: '+ Anotar medida' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Gráfica de crecimiento' })).not.toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('Tu pediatra es quien interpreta la gráfica.')
    expect(screen.getByRole('region', { name: 'Medida del registro' })).toBeInTheDocument()
    expect(callsOf(mock)).not.toContain(`GET ${BASE}/growth-chart`)
  })

  it('C on the web, without the signup’s values and for who can’t write', async () => {
    stubWeb(true)
    api({ acc: caregiver, growth: mockList({ measurements: [], registered: null, canEdit: false }) })
    renderAt(PATH, <GrowthPage />, ROUTE)
    expect(await screen.findByText('Aún no hay medidas anotadas')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Anotar la primera medida' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Medida del registro' })).not.toBeInTheDocument()
  })

  it('without WHO’s curves switched on: only the points and a sentence, no invitation nor picker', async () => {
    api({ chartReply: { body: mockChart({ reference: { available: false, source: '', weight: { maxMonths: 0, curves: [] }, height: { maxMonths: 0, curves: [] } } }) } })
    renderAt(PATH, <GrowthPage />, ROUTE)
    expect(await screen.findByText(/La referencia de la OMS aún no está disponible/)).toBeInTheDocument()
    expect(screen.queryByText('P50')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Tabla de la OMS' })).not.toBeInTheDocument()
    expect(screen.queryByText('Elige la tabla de la OMS para ver las curvas de referencia.')).not.toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  // Spec 076: Mateo, born 2014-01-01, is 12 years old «today» (24 Oct 2026): the weight curve ended at 10, the height curve at 19.
  const OLD = '2014-01-01'
  const oldChart = (over: Partial<GrowthChart> = {}) =>
    mockChart({
      birthDate: OLD,
      points: {
        weight: [
          { measuredOn: '2022-10-10', months: 105.3, value: 24 },
          { measuredOn: '2023-10-10', months: 117.3, value: 27 },
          { measuredOn: '2024-01-01', months: 120, value: 29.5 },
        ],
        height: [
          { measuredOn: '2022-10-10', months: 105.3, value: 125 },
          { measuredOn: '2026-10-12', months: 153.4, value: 150 },
        ],
      },
      limits: { weight: { maxMonths: 120, later: 2 }, height: { maxMonths: 228, later: 0 } },
      ...over,
    })
  const oldApi = (body: GrowthChart) =>
    api({ acc: account({ children: [{ ...mateo, birthDate: OLD }] }), growth: mockList({ birthDate: OLD }), chartReply: { body } })

  it('A: the weight axis ends at 10 years with the fixed note between the references; the reading counts only what is drawn', async () => {
    oldApi(oldChart())
    renderAt(PATH, <GrowthPage />, ROUTE)
    await screen.findByRole('img', { name: /Gráfica de peso/ })
    // An older child starts in the whole curve; «0–3 años» is not offered without measurements there.
    expect(screen.getByRole('button', { name: 'Hasta 10 años' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: '0–3 años' })).not.toBeInTheDocument()
    const note = screen.getByRole('note')
    const paragraphs = within(note).getAllByText(/./)
    expect(paragraphs.map((p) => p.textContent)).toEqual([
      'Las curvas son la referencia de la OMS para niñas y niños nacidos a término.',
      'La curva de peso de la OMS llega a los 10 años. Las medidas de después están en Medidas anotadas.',
      'Tu pediatra es quien interpreta la gráfica.',
    ])
    expect(within(reading()).getByText('29.5 kg')).toBeInTheDocument()
    expect(within(reading()).getByText('Medida 3 de 3 en la gráfica de peso')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Medida siguiente' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Medida anterior' })).toBeEnabled()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Medida anterior' }))
    await user.click(screen.getByRole('button', { name: 'Medida anterior' }))
    expect(within(reading()).getByText('Medida 1 de 3 en la gráfica de peso')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Medida anterior' })).toBeDisabled()
  })

  it('A2: the other tab keeps its own age and has no fixed note nor counter', async () => {
    oldApi(oldChart())
    renderAt(PATH, <GrowthPage />, ROUTE)
    await screen.findByRole('img', { name: /Gráfica de peso/ })
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: 'Talla' }))
    expect(screen.getByRole('button', { name: 'Hasta 19 años' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/Medida \d de \d en la gráfica/)).not.toBeInTheDocument()
    expect(within(screen.getByRole('note')).queryByText(/llega a los/)).not.toBeInTheDocument()
    expect(screen.queryByText('Ir a Medidas anotadas ↓')).not.toBeInTheDocument()
  })

  it('D on the web: the counter sits under the one-line reading', async () => {
    stubWeb(true)
    oldApi(oldChart())
    renderAt(PATH, <GrowthPage />, ROUTE)
    expect(await screen.findByText('Medida 3 de 3 en la gráfica de peso')).toBeInTheDocument()
    expect(await screen.findByText('1 ene 2024 · 29.5 kg · 10 años')).toBeInTheDocument()
    expect(within(screen.getByRole('note')).getByText(/llega a los 10 años/)).toBeInTheDocument()
  })

  it('«0–3 años» is offered when there are drawn measurements in the first 36 months', async () => {
    oldApi(oldChart({ points: { weight: [{ measuredOn: '2015-06-01', months: 17, value: 10 }, { measuredOn: '2023-10-10', months: 117, value: 27 }], height: [] } }))
    renderAt(PATH, <GrowthPage />, ROUTE)
    await screen.findByRole('img', { name: /Gráfica de peso/ })
    expect(screen.getByRole('button', { name: 'Hasta 10 años' })).toHaveAttribute('aria-pressed', 'true')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '0–3 años' }))
    expect(screen.getByRole('button', { name: '0–3 años' })).toHaveAttribute('aria-pressed', 'true')
    // The range chosen in one tab that the other doesn't offer falls back to its own start.
    await user.click(screen.getByRole('tab', { name: 'Talla' }))
    expect(screen.queryByRole('button', { name: '0–3 años' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hasta 19 años' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('B: a tab whose curve ended before every measurement is one sentence and a link; the tabs stay', async () => {
    oldApi(
      oldChart({
        points: { weight: [], height: [{ measuredOn: '2026-10-12', months: 153.4, value: 150 }] },
        limits: { weight: { maxMonths: 120, later: 3 }, height: { maxMonths: 228, later: 0 } },
      }),
    )
    renderAt(PATH, <GrowthPage />, ROUTE)
    expect(await screen.findByText('La curva de peso de la OMS llega a los 10 años. Las medidas de Mateo están en Medidas anotadas.')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Peso', selected: true })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Gráfica/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Rango de edad' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Medida anterior' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Tabla de la OMS' })).not.toBeInTheDocument()
    expect(screen.queryByText('Tu pediatra es quien interpreta la gráfica.')).not.toBeInTheDocument()
    const scrolled = vi.fn()
    const section = screen.getByRole('region', { name: 'Medidas anotadas' })
    section.scrollIntoView = scrolled
    const user = userEvent.setup()
    await user.click(screen.getByRole('link', { name: 'Ir a Medidas anotadas ↓' }))
    expect(scrolled).toHaveBeenCalled()
    expect(section).toHaveFocus()
    // The other tab still has its chart.
    await user.click(screen.getByRole('tab', { name: 'Talla' }))
    expect(screen.getByRole('img', { name: /Gráfica de talla/ })).toBeInTheDocument()
  })

  it('B2 on the web: the same sentence with the name of the child', async () => {
    stubWeb(true)
    oldApi(oldChart({ points: { weight: [], height: [{ measuredOn: '2026-10-12', months: 153.4, value: 150 }] }, limits: { weight: { maxMonths: 120, later: 1 }, height: { maxMonths: 228, later: 0 } } }))
    renderAt(PATH, <GrowthPage />, ROUTE)
    expect(await screen.findByText(/Las medidas de Mateo están en Medidas anotadas/)).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Medidas anotadas' })).toBeInTheDocument()
  })

  it('C: nothing the curves cover — no tabs, a title, the sentence of both curves and the link', async () => {
    oldApi(oldChart({ points: { weight: [], height: [] }, limits: { weight: { maxMonths: 120, later: 2 }, height: { maxMonths: 228, later: 1 } } }))
    renderAt(PATH, <GrowthPage />, ROUTE)
    expect(await screen.findByRole('heading', { name: 'Gráfica de crecimiento' })).toBeInTheDocument()
    expect(screen.getByText('Las curvas de la OMS llegan a los 10 años en peso y a los 19 en talla. Sus medidas están en Medidas anotadas.')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir a Medidas anotadas ↓' })).toBeInTheDocument()
  })

  it('C on the web', async () => {
    stubWeb(true)
    oldApi(oldChart({ points: { weight: [], height: [] }, limits: { weight: { maxMonths: 120, later: 2 }, height: { maxMonths: 228, later: 1 } } }))
    renderAt(PATH, <GrowthPage />, ROUTE)
    expect(await screen.findByRole('heading', { name: 'Gráfica de crecimiento' })).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('US3: a measurement written after the curve is in the list and in «Última medida», not in the chart', async () => {
    // The newest of the list is 11.4 kg · 82 cm (12 Oct 2026), 12 years after birth: the server leaves it out of the chart's weight.
    oldApi(oldChart())
    renderAt(PATH, <GrowthPage />, ROUTE)
    await screen.findByRole('img', { name: /Gráfica de peso/ })
    expect(screen.getByRole('region', { name: 'Última medida' })).toHaveTextContent('11.4 kg · 82 cm')
    expect(screen.getAllByText('12 oct 2026').length).toBeGreaterThan(0)
    expect(within(reading()).getByText('29.5 kg')).toBeInTheDocument()
    expect(within(reading()).queryByText('11.4 kg')).not.toBeInTheDocument()
  })

  it('without the WHO curves an older child still gets the fixed note and the whole range', async () => {
    oldApi(oldChart({ reference: { available: false, source: '', weight: { maxMonths: 0, curves: [] }, height: { maxMonths: 0, curves: [] } } }))
    renderAt(PATH, <GrowthPage />, ROUTE)
    await screen.findByRole('img', { name: /Gráfica de peso/ })
    expect(screen.getByText(/La referencia de la OMS aún no está disponible/)).toBeInTheDocument()
    expect(screen.getByText('La curva de peso de la OMS llega a los 10 años. Las medidas de después están en Medidas anotadas.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Todo' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('a tab with no values and nothing after the curve still says so', async () => {
    api({ chartReply: { body: mockChart({ points: { weight: [{ measuredOn: '2026-10-12', months: 25, value: 11.4 }], height: [] } }) } })
    renderAt(PATH, <GrowthPage />, ROUTE)
    await screen.findByRole('img', { name: /Gráfica de peso/ })
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: 'Talla' }))
    expect(screen.getByText('Aún no hay medidas de talla.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Medida anterior' })).not.toBeInTheDocument()
  })

  it('two measurements of the same day are walked one by one', async () => {
    const pts = [
      { measuredOn: '2026-10-12', months: 25, value: 11.2 },
      { measuredOn: '2026-10-12', months: 25, value: 11.4 },
    ]
    api({ chartReply: { body: mockChart({ points: { weight: pts, height: [] } }) } })
    renderAt(PATH, <GrowthPage />, ROUTE)
    await screen.findByRole('img', { name: /Gráfica de peso/ })
    expect(within(reading()).getByText('11.4 kg')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Medida anterior' }))
    expect(within(reading()).getByText('11.2 kg')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Medida siguiente' }))
    expect(within(reading()).getByText('11.4 kg')).toBeInTheDocument()
  })

  it('a chart that fails can be asked again; one alone has no line', async () => {
    let fail = true
    stubApi({
      'GET /accounts/me': { body: owner },
      [`GET ${BASE}/growth-measurements`]: { body: mockList() },
      [`GET ${BASE}/growth-chart`]: () =>
        fail ? { status: 500, body: { error: 'x' } } : { body: mockChart({ points: { weight: [{ measuredOn: '2026-10-12', months: 25, value: 11.4 }], height: [] } }) },
    })
    renderAt(PATH, <GrowthPage />, ROUTE)
    expect(await screen.findByText('No pudimos cargar la gráfica.')).toBeInTheDocument()
    fail = false
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }))
    const img = await screen.findByRole('img', { name: /Gráfica de peso/ })
    expect(img.querySelector('polyline')).toBeNull()
    expect(screen.getByRole('button', { name: 'Medida anterior' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Medida siguiente' })).toBeDisabled()
  })

  it('removes a measurement after a neutral confirmation, and says when it failed', async () => {
    const mock = api({ remove: 500 })
    renderAt(PATH, <GrowthPage />, ROUTE)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Quitar 12 oct 2026' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('¿Quitar la medida del 12 oct 2026?')
    await user.click(within(dialog).getByRole('button', { name: 'Quitar' }))
    expect(await within(dialog).findByText('No pudimos quitar la medida. Inténtalo de nuevo.')).toBeInTheDocument()
    expect(callsOf(mock)).toContain(`DELETE ${BASE}/growth-measurements/g0`)
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('removes and closes on success', async () => {
    api()
    renderAt(PATH, <GrowthPage />, ROUTE)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Quitar 12 oct 2026' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Quitar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('a record that can’t be read offers to try again; an unknown child goes back home', async () => {
    stubApi({ 'GET /accounts/me': { body: account({ children: [] }) }, [`GET ${BASE}/growth-measurements`]: { status: 500, body: { error: 'x' } } })
    renderAt(PATH, <GrowthPage />, ROUTE)
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Inicio' })).toHaveAttribute('href', '/home')
  })
})

describe('GrowthSection', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('says the last measurement as written, and links to the record', async () => {
    stubApi({ [`GET ${BASE}/growth-measurements`]: { body: list() } })
    renderAt('/x', <GrowthSection childId="child-1" variant="phone" />, '/x')
    expect(await screen.findByText('Última: 10.2 kg · 76.5 cm, 03 nov 2025')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/children/child-1/crecimiento')
    expect(screen.getByText('2 medidas')).toBeInTheDocument()
  })

  it('with nothing yet it invites to write one down (web)', async () => {
    stubApi({ [`GET ${BASE}/growth-measurements`]: { body: list({ measurements: [] }) } })
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
