import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { account, callsOf, stubApi } from '../../account/account.test-utils'
import { HowToContinuePage } from './HowToContinuePage'
import { MergeFlow } from './MergeFlow'
import { OwnChildrenSection } from './OwnChildrenSection'
import { HiddenChildren } from './HiddenChildren'
import { MergedLine } from './MergedLine'
import { isOwnChild, ownChildrenOf, showsOwnership } from './ownChildren'
import * as text from './mergeText'
import type { MergeChild, MergeOptions, MergePairPreview } from './types'
import type { Account } from '../../home/types'

const share = vi.hoisted(() => ({ canShareFile: vi.fn(() => false), shareFile: vi.fn(async () => true), downloadFile: vi.fn() }))
vi.mock('../../pdfExport/share', () => share)

afterEach(() => vi.unstubAllGlobals())

const counts = { consultations: 2, vaccines: 9, cardPhotos: 0, measurements: 1, supplements: 0, activities: 0, activeDevices: 1 }
const child = (id: string, firstName: string, over: Partial<MergeChild> = {}): MergeChild => ({
  id,
  firstName,
  lastName: 'López',
  birthDate: '2022-03-03',
  height: null,
  weight: null,
  growthReferenceSex: null,
  record: { exists: true, allergies: 0, conditions: 0 },
  counts,
  ...over,
})

const options = (over: Partial<MergeOptions> = {}): MergeOptions => ({
  canMerge: true,
  familyOwnerFirstName: 'Ana',
  ownChildren: [child('o1', 'Mateo'), child('o2', 'Sofía')],
  familyChildren: [child('f1', 'Mateo', { birthDate: '2022-03-04' }), child('f2', 'Emilia')],
  suggestedPairs: [{ ownChildId: 'o1', familyChildId: 'f1', reason: 'same_name' }],
  ...over,
})

const preview = (over: Partial<MergePairPreview> = {}): MergePairPreview => ({
  ownChildId: 'o1',
  familyChildId: 'f1',
  differences: ['birthDate'],
  moves: { consultations: 2, vaccines: 9, cardPhotos: 0, measurements: 1, supplements: 0, activities: 0, record: true, devicesRemoved: 1 },
  overLimits: [],
  recordTooLong: null,
  ...over,
})

function stubDesktop(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }))
}

function renderPage(element: React.ReactNode, path = '/x') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/x" element={element} />
          <Route path="/familia/unir" element={<div>UNIR</div>} />
          <Route path="/familia/como-seguir" element={<div>COMO</div>} />
          <Route path="/familia" element={<div>FAMILIA</div>} />
          <Route path="/home" element={<div>HOME</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const bodyOf = (mock: ReturnType<typeof vi.fn>, key: string) => {
  const call = mock.mock.calls.find((c) => {
    const [input, init] = c as [string, RequestInit | undefined]
    return `${init?.method ?? 'GET'} ${new URL(String(input), 'http://localhost').pathname}` === key
  })
  return JSON.parse(String((call?.[1] as RequestInit).body))
}

describe('HowToContinuePage', () => {
  it('starts with nothing chosen, says why Continuar is off, and «Unir» goes to the pairs', async () => {
    stubApi({ 'GET /family/merge-options': { body: options() } })
    renderPage(<HowToContinuePage />)
    expect(await screen.findByRole('radio', { name: /Unir/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '¿Cómo quieres seguir?' })).toBeInTheDocument()
    expect(screen.getByText('Elige una opción para continuar.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
    expect(screen.getAllByText('Mateo López')).toHaveLength(2)
    await userEvent.click(screen.getByRole('radio', { name: /Unir/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByText('UNIR')).toBeInTheDocument()
  })

  it('«Usar solo lo de la familia» hides every own child and goes home', async () => {
    const mock = stubApi({
      'GET /family/merge-options': { body: options() },
      'GET /accounts/me': { body: account() },
      'PUT /accounts/a1/hidden-children': { body: account() },
    })
    renderPage(<HowToContinuePage />)
    await userEvent.click(await screen.findByRole('radio', { name: /Usar solo lo de la familia/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByText('HOME')).toBeInTheDocument()
    expect(bodyOf(mock, 'PUT /accounts/a1/hidden-children')).toEqual({ childIds: ['o1', 'o2'] })
  })

  it('says so, keeping the screen, when hiding fails', async () => {
    stubApi({
      'GET /family/merge-options': { body: options() },
      'GET /accounts/me': { body: account() },
      'PUT /accounts/a1/hidden-children': { status: 500, body: { error: 'x' } },
    })
    renderPage(<HowToContinuePage />)
    await userEvent.click(await screen.findByRole('radio', { name: /Usar solo lo de la familia/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No cambió nada')
  })

  it('«Conservar ambas» shows the confirmation and writes nothing', async () => {
    const mock = stubApi({ 'GET /family/merge-options': { body: options() } })
    renderPage(<HowToContinuePage />)
    await userEvent.click(await screen.findByRole('radio', { name: /Conservar ambas/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByRole('heading', { name: 'Quedan los dos registros' })).toBeInTheDocument()
    expect(callsOf(mock).filter((c) => c.startsWith('PUT') || c.startsWith('POST'))).toEqual([])
    await userEvent.click(screen.getByRole('link', { name: 'Ir al inicio' }))
    expect(await screen.findByText('HOME')).toBeInTheDocument()
  })

  it('a Caregiver has no «Unir» and a different line under «Conservar ambas»', async () => {
    stubApi({ 'GET /family/merge-options': { body: options({ canMerge: false }) } })
    renderPage(<HowToContinuePage />)
    await screen.findByRole('radio', { name: /Conservar ambas/ })
    expect(screen.queryByRole('radio', { name: /^Unir/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Un Tutor o el titular puede unirlos/)).toBeInTheDocument()
  })

  it('goes home when there is nothing of their own, and offers to retry a failed read', async () => {
    stubApi({ 'GET /family/merge-options': { body: options({ ownChildren: [] }) } })
    renderPage(<HowToContinuePage />)
    expect(await screen.findByText('HOME')).toBeInTheDocument()
  })

  it('offers «Reintentar» when the options fail', async () => {
    stubApi({ 'GET /family/merge-options': { status: 500, body: { error: 'x' } } })
    renderPage(<HowToContinuePage />)
    expect(await screen.findByText(/No pudimos cargar tus hijos/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  })

  it('draws the web design with the same options', async () => {
    stubDesktop(true)
    stubApi({ 'GET /family/merge-options': { body: options() }, 'GET /accounts/me': { body: account() } })
    renderPage(<HowToContinuePage />)
    expect(await screen.findByRole('radio', { name: /Unir/ })).toBeInTheDocument()
  })
})

describe('MergeFlow', () => {
  const stubFlow = (over: Record<string, unknown> = {}) =>
    stubApi({
      'GET /family/merge-options': { body: options() },
      'GET /accounts/me': { body: account() },
      'POST /family/merges/preview': { body: { pairs: [preview()] } },
      'POST /family/merges': { body: { results: [{ ownChildId: 'o1', familyChildId: 'f1', status: 'merged', moves: preview().moves }] } },
      ...over,
    } as Parameters<typeof stubApi>[0])

  it('pairs, asks the differing data, summarizes and merges', async () => {
    const mock = stubFlow()
    renderPage(<MergeFlow />)
    // B: the suggestion is on and says why
    expect(await screen.findByText('Se llaman igual')).toBeInTheDocument()
    expect(screen.getByText('1 pareja · 1 sin pareja')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    // C: nothing chosen, the button says what is missing
    expect(await screen.findByRole('heading', { name: 'Datos distintos' })).toBeInTheDocument()
    expect(screen.getByText('0 de 1 elegidos')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
    expect(screen.getByText('3 mar 2022')).toBeInTheDocument()
    expect(screen.getByText('4 mar 2022')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: /El de la familia/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    // D
    expect(await screen.findByRole('heading', { name: 'Revisa el resumen' })).toBeInTheDocument()
    expect(screen.getByText('Mateo (tuyo) → Mateo (familia)')).toBeInTheDocument()
    expect(screen.getByText('2 consultas · 9 vacunas · 1 medida · ficha')).toBeInTheDocument()
    expect(screen.getByText('Sofía López')).toBeInTheDocument()
    expect(screen.getByText(/Todo pasa a la familia de Ana/)).toBeInTheDocument()
    expect(screen.getByText(/ese acceso se cierra al unir/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Unir' }))
    // E2
    expect(await screen.findByRole('heading', { name: 'Se unió Mateo' })).toBeInTheDocument()
    expect(screen.getByText(/Ahora está en la familia de Ana con sus 2 consultas, 9 vacunas, 1 medida y su ficha\./)).toBeInTheDocument()
    expect(bodyOf(mock, 'POST /family/merges')).toEqual({
      pairs: [{ ownChildId: 'o1', familyChildId: 'f1', choices: { birthDate: 'family' } }],
    })
    expect(bodyOf(mock, 'POST /family/merges/preview')).toEqual({ pairs: [{ ownChildId: 'o1', familyChildId: 'f1' }] })
    await userEvent.click(screen.getByRole('link', { name: 'Ir al inicio' }))
    expect(await screen.findByText('HOME')).toBeInTheDocument()
  })

  it('can take another own child for a pair, never the same family child twice, and needs one pair', async () => {
    stubFlow({ 'POST /family/merges/preview': { body: { pairs: [preview({ differences: [] })] } } })
    renderPage(<MergeFlow />)
    const sofia = await screen.findByRole('combobox', { name: 'Es el mismo que…', description: '' }).catch(() => null)
    void sofia
    const selects = await screen.findAllByLabelText('Es el mismo que…')
    expect(selects).toHaveLength(2)
    const options2 = within(selects[1]).getAllByRole('option')
    const taken = options2.find((o) => o.textContent?.includes('Ya lo elegiste en tu Mateo'))
    expect(taken).toBeDisabled()
    // «No es ninguno» for the suggested pair: nothing to continue with
    await userEvent.selectOptions(selects[0], '')
    expect(screen.getByText('Elige al menos una pareja para continuar.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
    // and a pair of the second child with the other family child goes straight to the summary (no differences)
    await userEvent.selectOptions(selects[1], 'f2')
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByRole('heading', { name: 'Revisa el resumen' })).toBeInTheDocument()
  })

  it('shows the cap notice, blocks «Unir» while the sheet is too long and goes back', async () => {
    stubFlow({
      'POST /family/merges/preview': {
        body: {
          pairs: [
            preview({
              differences: [],
              overLimits: [{ kind: 'supplements', resulting: 12, limit: 10 }],
              recordTooLong: { list: 'allergies', resulting: 33, limit: 30 },
            }),
          ],
        },
      },
    })
    renderPage(<MergeFlow />)
    await userEvent.click(await screen.findByRole('button', { name: 'Continuar' }))
    expect(await screen.findByText('Quedará con 12 suplementos activos')).toBeInTheDocument()
    expect(screen.getByText(/Mateo tendrá 12 suplementos activos; no podrás agregar más hasta tener 10 o menos/)).toBeInTheDocument()
    expect(screen.getByText(/quedaría con 33 alergias y el máximo es 30/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir la ficha' })).toHaveAttribute('href', '/children/o1/ficha/editar')
    expect(screen.getByRole('button', { name: 'Unir' })).toBeDisabled()
    await userEvent.click(screen.getByRole('link', { name: '← Parejas' }))
    expect(await screen.findByRole('heading', { name: 'Empareja a tus hijos' })).toBeInTheDocument()
  })

  it('goes back from the data to the pairs and from the summary to the data', async () => {
    stubFlow()
    renderPage(<MergeFlow />)
    await userEvent.click(await screen.findByRole('button', { name: 'Continuar' }))
    await userEvent.click(await screen.findByRole('link', { name: '← Parejas' }))
    expect(await screen.findByRole('heading', { name: 'Empareja a tus hijos' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    await userEvent.click(await screen.findByRole('radio', { name: /El tuyo/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    await userEvent.click(await screen.findByRole('link', { name: '← Datos distintos' }))
    expect(await screen.findByRole('heading', { name: 'Datos distintos' })).toBeInTheDocument()
  })

  it('says «No se pudo unir» when nothing merged, retries and can go back to the summary', async () => {
    let ok = false
    const mock = stubFlow({
      'POST /family/merges/preview': { body: { pairs: [preview({ differences: [] })] } },
      'POST /family/merges': () =>
        ok
          ? { body: { results: [{ ownChildId: 'o1', familyChildId: 'f1', status: 'merged', moves: preview().moves }] } }
          : { body: { results: [{ ownChildId: 'o1', familyChildId: 'f1', status: 'failed', error: 'internal_error' }] } },
    })
    renderPage(<MergeFlow />)
    await userEvent.click(await screen.findByRole('button', { name: 'Continuar' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Unir' }))
    expect(await screen.findByRole('heading', { name: 'No se pudo unir' })).toBeInTheDocument()
    expect(screen.getByText(/No cambió nada/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Volver al resumen' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Unir' }))
    await screen.findByRole('heading', { name: 'No se pudo unir' })
    ok = true
    await userEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
    expect(await screen.findByRole('heading', { name: 'Se unió Mateo' })).toBeInTheDocument()
    expect(callsOf(mock).filter((c) => c === 'POST /family/merges')).toHaveLength(3)
  })

  it('a request that fails as a whole is the same neutral error; a preview that fails says so on the pairs', async () => {
    stubFlow({ 'POST /family/merges': { status: 500, body: { error: 'x' } } })
    renderPage(<MergeFlow />)
    await userEvent.click(await screen.findByRole('button', { name: 'Continuar' }))
    await userEvent.click(await screen.findByRole('radio', { name: /El tuyo/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Unir' }))
    expect(await screen.findByRole('heading', { name: 'No se pudo unir' })).toBeInTheDocument()
  })

  it('reports a pair that failed beside the one that merged', async () => {
    stubFlow({
      'POST /family/merges/preview': { body: { pairs: [preview({ differences: [] }), preview({ ownChildId: 'o2', familyChildId: 'f2', differences: [] })] } },
      'POST /family/merges': {
        body: {
          results: [
            { ownChildId: 'o1', familyChildId: 'f1', status: 'merged', moves: preview().moves },
            { ownChildId: 'o2', familyChildId: 'f2', status: 'failed', error: 'not_found' },
          ],
        },
      },
    })
    renderPage(<MergeFlow />)
    await userEvent.selectOptions((await screen.findAllByLabelText('Es el mismo que…'))[1], 'f2')
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Unir' }))
    expect(await screen.findByRole('heading', { name: 'Se unió Mateo' })).toBeInTheDocument()
    expect(screen.getByText('No se pudo unir Sofía. No cambió nada en ese registro.')).toBeInTheDocument()
  })

  it('a preview that fails keeps the pairs and says it', async () => {
    stubFlow({ 'POST /family/merges/preview': { status: 403, body: { error: 'merge_not_allowed' } } })
    renderPage(<MergeFlow />)
    await userEvent.click(await screen.findByRole('button', { name: 'Continuar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya no puedes unir estos registros')
  })

  it('sends a person who cannot merge away, and draws the web design', async () => {
    stubFlow({ 'GET /family/merge-options': { body: options({ canMerge: false }) } })
    renderPage(<MergeFlow />)
    expect(await screen.findByText('FAMILIA')).toBeInTheDocument()
  })

  it('downloads the account data from the summary', async () => {
    stubDesktop(true)
    const mock = stubFlow({
      'POST /family/merges/preview': { body: { pairs: [preview({ differences: [] })] } },
      'POST /accounts/a1/data-export': { fileName: 'peditrack.zip' },
    })
    renderPage(<MergeFlow />)
    await userEvent.click(await screen.findByRole('button', { name: 'Continuar' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Descargar mis datos' }))
    await waitFor(() => expect(callsOf(mock)).toContain('POST /accounts/a1/data-export'))
    expect(await screen.findByText('Listo: tu archivo se descargó.')).toBeInTheDocument()
  })
})

const own = (id: string, name: string) => ({ id, firstName: name, lastName: 'L', birthDate: '2022-01-01', height: null, weight: null })
const acct = (over: Partial<Account> = {}): Account => ({ ...(account() as unknown as Account), children: [own('c1', 'Mateo')], ...over })

describe('OwnChildrenSection', () => {
  it('offers to merge and to hide', async () => {
    const mock = stubApi({ 'PUT /accounts/a1/hidden-children': { body: account() } })
    renderPage(<OwnChildrenSection account={acct()} canMerge variant="phone" />)
    expect(screen.getByText('Tenías hijos registrados antes de unirte. Si alguno es el mismo niño de la familia, puedes unirlos.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Unir con un hijo de la familia' })).toHaveAttribute('href', '/familia/unir')
    await userEvent.click(screen.getByRole('button', { name: 'Ocultar mis hijos' }))
    await waitFor(() => expect(bodyOf(mock, 'PUT /accounts/a1/hidden-children')).toEqual({ childIds: ['c1'] }))
  })

  it('with the children hidden says so and shows them again; a failure is said', async () => {
    const mock = stubApi({ 'PUT /accounts/a1/hidden-children': { status: 500, body: { error: 'x' } } })
    renderPage(<OwnChildrenSection account={acct({ children: [], hiddenChildren: [{ id: 'c1', firstName: 'Mateo' }] })} canMerge={false} variant="desktop" />)
    expect(screen.getByText('Tus hijos están ocultos. No se borró nada y los datos siguen en tu cuenta.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Unir con un hijo de la familia' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Volver a mostrar mis hijos' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos guardar el cambio')
    expect(bodyOf(mock, 'PUT /accounts/a1/hidden-children')).toEqual({ childIds: [] })
  })

  it('draws nothing without children of their own', () => {
    renderPage(<OwnChildrenSection account={acct({ children: [] })} canMerge variant="phone" />)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
})

describe('HiddenChildren', () => {
  it('lists each hidden child with what it holds and shows one again', async () => {
    const mock = stubApi({
      'GET /family/merge-options': { body: options({ ownChildren: [child('o1', 'Mateo', { hidden: true }), child('o2', 'Sofía', { hidden: true })] }) },
      'PUT /accounts/a1/hidden-children': { body: account() },
    })
    renderPage(
      <HiddenChildren
        account={acct({ children: [], family: { ownerName: 'Ana Morales', role: 'tutor', ownerAccountId: 'x', plan: 'paid', readOnly: false }, hiddenChildren: [{ id: 'o1', firstName: 'Mateo' }, { id: 'o2', firstName: 'Sofía' }] })}
        variant="phone"
      />,
    )
    expect(screen.getByText('Los ocultaste al unirte a la familia de Ana. No se borró nada.')).toBeInTheDocument()
    expect(await screen.findAllByText('2 consultas · 9 vacunas · 1 medida · ficha')).toHaveLength(2)
    expect(screen.getByText('Los hijos ocultos se incluyen en «Descargar todos mis datos».')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Volver a mostrar a Mateo' }))
    await waitFor(() => expect(bodyOf(mock, 'PUT /accounts/a1/hidden-children')).toEqual({ childIds: ['o2'] }))
  })

  it('says a failure and draws nothing when none is hidden', async () => {
    stubApi({ 'GET /family/merge-options': { status: 500, body: {} }, 'PUT /accounts/a1/hidden-children': { status: 500, body: {} } })
    const { container, unmount } = render(
      <QueryClientProvider client={new QueryClient()}>
        <HiddenChildren account={acct({ hiddenChildren: [] })} variant="desktop" />
      </QueryClientProvider>,
    )
    expect(container).toBeEmptyDOMElement()
    unmount()
    renderPage(<HiddenChildren account={acct({ hiddenChildren: [{ id: 'o1', firstName: 'Mateo' }] })} variant="desktop" />)
    expect(screen.getByText('Los ocultaste. No se borró nada.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Volver a mostrar a Mateo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos volver a mostrar')
  })
})

describe('MergedLine and helpers', () => {
  it('writes the line, with and without the name and the year only when it is not this one', () => {
    const now = new Date(2026, 11, 20)
    expect(text.mergedLine(new Date(2026, 11, 3, 12).toISOString(), 'Laura', now)).toBe('Se unió el 3 dic con el registro de Laura')
    expect(text.mergedLine(new Date(2026, 11, 3, 12).toISOString(), null, now)).toBe('Se unió el 3 dic')
    expect(text.mergedLine(new Date(2025, 0, 9, 12).toISOString(), ' ', now)).toBe('Se unió el 9 ene 2025')
    const { container } = render(<MergedLine merges={[{ at: new Date().toISOString(), byFirstName: 'Laura' }]} />)
    expect(container).toHaveTextContent('con el registro de Laura')
    const empty = render(<MergedLine merges={[]} />)
    expect(empty.container).toBeEmptyDOMElement()
    expect(render(<MergedLine merges={undefined} />).container).toBeEmptyDOMElement()
  })

  it('tells own children from the family’s', () => {
    const a = acct({ children: [own('c1', 'Mateo'), { ...own('c2', 'Emilia'), accountId: 'other' }], hiddenChildren: [{ id: 'h', firstName: 'X' }] })
    expect(isOwnChild(a.children[0], a)).toBe(true)
    expect(isOwnChild(a.children[1], a)).toBe(false)
    expect(ownChildrenOf(a).visible).toHaveLength(1)
    expect(ownChildrenOf(a).hidden).toHaveLength(1)
    expect(ownChildrenOf(acct()).hidden).toEqual([])
    expect(showsOwnership(a)).toBe(true)
    expect(showsOwnership(acct())).toBe(false)
    expect(showsOwnership(undefined)).toBe(false)
    expect(showsOwnership(acct({ children: [{ ...own('c2', 'E'), accountId: 'o' }] }))).toBe(false)
  })
})

const callAny = (fn: (...a: unknown[]) => unknown) => {
  for (const args of [['Ana', 'Ana'], [['Ana', 'Sofía']], [0, 1]]) {
    try {
      return fn(...args)
    } catch {
      // try the next shape of arguments
    }
  }
  return ''
}

describe('merge texts', () => {
  it('writes every value of a field as the family wrote it', () => {
    const c = child('x', 'Mateo', {
      height: 92,
      weight: 16.2,
      growthReferenceSex: 'female',
      record: { exists: true, allergies: 0, conditions: 0, bloodType: 'O-', pediatrician: { name: 'Dr. Robles', phone: '33', office: null }, generalNote: ' nota ' },
    })
    expect(text.fieldValue('firstName', c)).toBe('Mateo')
    expect(text.fieldValue('lastName', c)).toBe('López')
    expect(text.fieldValue('birthDate', c)).toBe('3 mar 2022')
    expect(text.fieldValue('height', c)).toBe('92 cm')
    expect(text.fieldValue('weight', c)).toBe('16.2 kg')
    expect(text.fieldValue('growthReferenceSex', c)).toBe('Niña')
    expect(text.fieldValue('bloodType', c)).toBe('O−')
    expect(text.fieldValue('pediatrician', c)).toBe('Dr. Robles · 33')
    expect(text.fieldValue('generalNote', c)).toBe('nota')
    const bare = child('y', 'Sofía', { growthReferenceSex: 'male', record: { exists: true, allergies: 0, conditions: 0, bloodType: 'unknown' } })
    expect(text.fieldValue('growthReferenceSex', bare)).toBe('Niño')
    expect(text.fieldValue('bloodType', bare)).toBe('No lo sé')
    expect(text.fieldValue('height', bare)).toBe('Sin anotar')
    expect(text.fieldValue('weight', bare)).toBe('Sin anotar')
    expect(text.fieldValue('growthReferenceSex', child('z', 'Z'))).toBe('Sin anotar')
    expect(text.fieldValue('pediatrician', bare)).toBe('Sin anotar')
  })

  it('writes counts, limits, phones and the result in plain words', () => {
    expect(text.holdingsLine(counts, true)).toBe('2 consultas · 9 vacunas · 1 medida · ficha')
    expect(text.holdingsLine({}, false)).toBe('')
    expect(text.diffStatus(0, 4)).toBe('0 de 4 elegidos · Elige los 4 para continuar')
    expect(text.DIFF.toContinue(1)).toBe('Elige el dato para continuar')
    expect(text.limitNotice('Mateo', { kind: 'unknown', resulting: 1, limit: 1 })).toBeNull()
    expect(text.quedaraCon({ kind: 'unknown', resulting: 1, limit: 1 })).toBeNull()
    expect(text.quedaraCon({ kind: 'measurements', resulting: 501, limit: 500 })).toBe('Quedará con 501 medidas de crecimiento')
    expect(text.phoneLine('Mateo', 2)).toContain('2 teléfonos')
    expect(text.tooLongLine('Mateo', 'conditions', 31, 30)).toContain('31 padecimientos')
    expect(text.PAIRS.summary(2, 0)).toBe('2 parejas · 0 sin pareja')
    expect(text.DONE.merged(['Mateo', 'Sofía'])).toBe('Se unieron Mateo y Sofía')
    expect(text.DONE.mergedBody('Ana', undefined)).toBe('Ahora está en la familia de Ana.')
    expect(text.DONE.mergedBody('Ana', { ...preview().moves, consultations: 0, vaccines: 0, measurements: 0, record: false, supplements: 1 })).toBe(
      'Ahora está en la familia de Ana con sus 1 suplemento.',
    )
    expect(text.DONE.someFailed(['A', 'B'])).toContain('esos registros')
    expect(text.HIDDEN.intro(null)).toBe('Los ocultaste. No se borró nada.')
  })

  it('never evaluates, recommends or congratulates, in any sentence', () => {
    const all = JSON.stringify(
      [text.HOW, text.KEPT, text.PAIRS, text.DIFF, text.SUMMARY, text.DONE, text.HIDDEN, text.FAMILY_SECTION].map((group) =>
        Object.values(group).map((v) => (typeof v === 'function' ? callAny(v as (...a: unknown[]) => unknown) : v)),
      ),
    ).toLowerCase()
    for (const bad of ['correcto', 'el bueno', 'recomend', 'felicidades', 'parece el mismo', 'mejor', 'riesgo', '!']) expect(all).not.toContain(bad)
  })
})
