import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CabinetPage } from './CabinetPage'
import { CabinetEntry } from './CabinetEntry'
import { AddToCabinetLink } from './AddToCabinetLink'
import { account, caregiver, item, renderAt, stubApi, stubWeb } from './cabinet.test-utils'
import type { Account } from '../home/types'

const MEDS = [
  item({ id: 'm1', name: 'Amoxicilina', strength: '250 mg/5 ml', quantity: 1, expires: { year: 2027, month: 2, day: null }, hasPhoto: true }),
  item({ id: 'm2', name: 'Paracetamol', strength: '500 mg', quantity: 20, unit: 'tablet', expires: { year: 2026, month: 11, day: null } }),
  item({ id: 'm3', name: 'Paracetamol infantil', strength: '160 mg/5 ml' }),
  item({ id: 'm4', name: 'Suero oral', strength: '', quantity: 4, unit: 'box', expires: { year: 2027, month: 9, day: 3 } }),
]

function api(acc: unknown = account(), list: unknown = { items: MEDS, canAdd: true, canEdit: true, limit: 200 }, owner = 'a1') {
  return stubApi({ 'GET /accounts/me': { body: acc }, [`GET /accounts/${owner}/medicine-cabinet`]: { body: list } })
}

describe('CabinetPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lists the family’s medicines with the date as one more datum, and searches without accents', async () => {
    api()
    renderAt('/botiquin', <CabinetPage />, '/botiquin')
    expect(await screen.findByText('4 medicamentos')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Botiquín', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('De toda la familia')).toBeInTheDocument()
    expect(screen.getByText('Caduca: nov 2026')).toBeInTheDocument()
    expect(screen.getByText('Caduca: 3 sep 2027')).toBeInTheDocument()
    expect(screen.getByText('500 mg · 20 tabletas')).toBeInTheDocument()
    expect(screen.getByText('4 cajas')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Agregar al botiquín' })).toHaveAttribute('href', '/botiquin/nuevo')
    const rows = screen.getAllByRole('link').map((a) => a.getAttribute('href')).filter((h) => h?.startsWith('/botiquin/m'))
    expect(rows).toEqual(['/botiquin/m1', '/botiquin/m2', '/botiquin/m3', '/botiquin/m4'])

    const user = userEvent.setup()
    await user.type(screen.getByRole('searchbox', { name: 'Buscar por nombre' }), 'PARACÉT')
    expect(screen.getByText('2 de 4 medicamentos')).toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox'))
    await user.type(screen.getByRole('searchbox'), 'xyz')
    expect(screen.getByText('Ningún medicamento del botiquín se llama «xyz».')).toBeInTheDocument()
  })

  it('has the web design: a row of columns with who added it', async () => {
    stubWeb(true)
    api()
    renderAt('/botiquin', <CabinetPage />, '/botiquin')
    expect(await screen.findByText('4 medicamentos')).toBeInTheDocument()
    expect(screen.getAllByText('Agregado por Ana · 6 nov')).toHaveLength(4)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('empty: the button goes inside the empty state', async () => {
    api(account(), { items: [], canAdd: true, canEdit: true, limit: 200 })
    renderAt('/botiquin', <CabinetPage />, '/botiquin')
    expect(await screen.findByText('Aún no hay medicamentos en el botiquín')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: '+ Agregar al botiquín' })).toHaveLength(1)
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('a Caregiver only sees, with the note, and asks the family owner’s cabinet', async () => {
    const mock = api(caregiver, { items: MEDS, canAdd: false, canEdit: false, limit: 200 }, 'owner')
    renderAt('/botiquin', <CabinetPage />, '/botiquin')
    expect(await screen.findByText('Vista de Cuidadora.')).toBeInTheDocument()
    expect(screen.queryByText('+ Agregar al botiquín')).not.toBeInTheDocument()
    expect(mock.mock.calls.some(([u]) => String(u).includes('/accounts/owner/medicine-cabinet'))).toBe(true)
  })

  it('a Child-role member is told it is the adults’ and nothing is asked', async () => {
    const mock = api(account({ family: { role: 'child', ownerAccountId: 'owner', ownerName: 'Ana', plan: 'paid', readOnly: false } }))
    renderAt('/botiquin', <CabinetPage />, '/botiquin')
    expect(await screen.findByText(/El botiquín lo ven las personas adultas de la familia/)).toBeInTheDocument()
    expect(mock.mock.calls.some(([u]) => String(u).includes('medicine-cabinet'))).toBe(false)
  })

  it('the plan lapsed: what was saved stays and «Agregar» opens the plan notice', async () => {
    api(account({ plan: 'free' }), { items: MEDS, canAdd: false, canEdit: true, limit: 200 })
    renderAt('/botiquin', <CabinetPage />, '/botiquin')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '+ Agregar al botiquín' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getAllByText('Botiquín de la casa').length).toBeGreaterThan(0)
    await user.click(within(dialog).getByRole('link', { name: 'Ver el plan completo' }))
    expect(await screen.findByText('PLANES')).toBeInTheDocument()
  })

  it('says it could not load and retries; shows the skeleton while loading', async () => {
    stubApi({ 'GET /accounts/me': { body: account() }, 'GET /accounts/a1/medicine-cabinet': { status: 500, body: {} } })
    renderAt('/botiquin', <CabinetPage />, '/botiquin')
    expect(await screen.findByText(/No pudimos cargar el botiquín/)).toBeInTheDocument()
    api()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('4 medicamentos')).toBeInTheDocument()

    stubApi({ 'GET /accounts/me': { body: account() }, 'GET /accounts/a1/medicine-cabinet': () => ({ body: new Promise(() => {}) }) })
    vi.stubGlobal('fetch', vi.fn().mockImplementation((u: string) => (String(u).includes('medicine-cabinet') ? new Promise(() => {}) : Promise.resolve({ ok: true, status: 200, json: async () => account() }))))
    renderAt('/botiquin', <CabinetPage />, '/botiquin')
    expect(await screen.findByLabelText('Cargando el botiquín')).toBeInTheDocument()
  })
})

function renderEntry(acc: unknown) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route path="/home" element={<CabinetEntry account={acc as Account} />} />
          <Route path="/planes" element={<div>PLANES</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CabinetEntry (home)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('opens the cabinet with its count', async () => {
    api()
    renderEntry(account())
    const link = await screen.findByRole('link', { name: /Checa tus medicamentos/ })
    expect(link).toHaveAttribute('href', '/botiquin')
    expect(await within(link).findByText('4 medicamentos en el botiquín')).toBeInTheDocument()
  })

  it('on the free plan with nothing saved it carries «Plan completo» and opens the notice', async () => {
    api(account({ plan: 'free' }), { items: [], canAdd: false, canEdit: true, limit: 200 })
    renderEntry(account({ plan: 'free' }))
    const button = await screen.findByRole('button', { name: /Plan completo/ })
    await waitFor(() => expect(button).toHaveTextContent('Las medicinas que tienen en casa'))
    await userEvent.setup().click(button)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ahora no' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('a Child-role member doesn’t see it', () => {
    api()
    const { container } = renderEntry(account({ family: { role: 'child', ownerAccountId: 'owner', ownerName: 'Ana', plan: 'paid', readOnly: false } }))
    expect(container).toBeEmptyDOMElement()
  })
})

describe('AddToCabinetLink', () => {
  it('opens the form with the prescription in the router’s state', async () => {
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Routes>
            <Route path="/" element={<AddToCabinetLink from={{ consultationId: 'c1', name: 'Amoxicilina', consultDate: '2026-10-18', doctor: 'Dra. Laura' }} />} />
            <Route path="/botiquin/nuevo" element={<div>FORM</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const link = screen.getByRole('link', { name: 'Agregar Amoxicilina al botiquín' })
    expect(link).toHaveAttribute('href', '/botiquin/nuevo')
    await userEvent.setup().click(link)
    expect(screen.getByText('FORM')).toBeInTheDocument()
  })
})
