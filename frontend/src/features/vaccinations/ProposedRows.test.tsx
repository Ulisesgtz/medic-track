import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProposedRows } from './ProposedRows'
import { CHILD_ID, account, renderAt, stubApi } from './vaccinationsApi.test-utils'
import { TEXT } from './vaccineText'

afterEach(() => {
  vi.unstubAllGlobals()
})

const CATALOG = [
  { code: 'hepatitis_b', name: 'Hepatitis B' },
  { code: 'bcg', name: 'BCG' },
]
const LIST = `/children/${CHILD_ID}/vaccinations`
const TEXT_READ = 'BCG 15/01/2023\nHepatitis B dosis 2 02/03/2023\nRabia 12/02/2024'

function show(text = TEXT_READ, onDone = vi.fn()) {
  renderAt(<ProposedRows childId={CHILD_ID} birthDate="2023-01-10" text={text} catalog={CATALOG} onDone={onDone} />, '/x', '/x')
  return onDone
}
const row = (n: number) => screen.getAllByRole('listitem')[n - 1]

describe('ProposedRows', () => {
  it('shows what was read as rows to review, with nothing saved yet', () => {
    const calls = stubApi({ account: account(), doses: [] })
    show()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText(TEXT.proposed.help)).toBeInTheDocument()
    expect(within(row(1)).getByLabelText(TEXT.dialog.vaccine)).toHaveValue('bcg')
    expect(within(row(1)).getByLabelText(TEXT.dialog.appliedOn)).toHaveValue('2023-01-15')
    expect(within(row(2)).getByLabelText(TEXT.dialog.doseNumber)).toHaveValue('2')
    expect(within(row(3)).getByLabelText(TEXT.dialog.customName)).toHaveValue('Rabia')
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('says nothing was found, blocks nothing and can be closed', async () => {
    const user = userEvent.setup()
    stubApi({ account: account(), doses: [] })
    const onDone = show('~~ ##')
    expect(screen.getByText(TEXT.proposed.none)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: TEXT.dialog.close }))
    expect(onDone).toHaveBeenCalled()
  })

  it('lets the parent edit a row before saving it, one at a time', async () => {
    const user = userEvent.setup()
    const calls = stubApi({ account: account(), doses: [] })
    show()
    await user.selectOptions(within(row(1)).getByLabelText(TEXT.dialog.vaccine), 'hepatitis_b')
    await user.clear(within(row(1)).getByLabelText(TEXT.dialog.doseNumber))
    await user.type(within(row(1)).getByLabelText(TEXT.dialog.doseNumber), '1')
    await user.click(screen.getByRole('button', { name: `${TEXT.proposed.confirmOne} fila 1` }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ vaccineCode: 'hepatitis_b', appliedOn: '2023-01-15', doseNumber: 1, customName: '' })
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
  })

  it('saves only the checked rows with «Guardar las seleccionadas» and calls onDone when none are left', async () => {
    const user = userEvent.setup()
    const calls = stubApi({ account: account(), doses: [] })
    const onDone = show()
    await user.click(within(row(2)).getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: TEXT.proposed.confirmSelected }))
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2))
    expect(calls.filter((c) => c.method === 'POST').map((c) => (c.body as { vaccineCode: string; customName: string }).vaccineCode || (c.body as { customName: string }).customName)).toEqual(['bcg', 'Rabia'])
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
    expect(onDone).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: `${TEXT.proposed.confirmOne} fila 1` }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('disables the batch button when no row is checked', async () => {
    const user = userEvent.setup()
    stubApi({ account: account(), doses: [] })
    show('BCG 15/01/2023')
    await user.click(within(row(1)).getByRole('checkbox'))
    expect(screen.getByRole('button', { name: TEXT.proposed.confirmSelected })).toBeDisabled()
  })

  it('discards a row, and everything', async () => {
    const user = userEvent.setup()
    stubApi({ account: account(), doses: [] })
    const onDone = show()
    await user.click(screen.getByRole('button', { name: `${TEXT.proposed.discard} fila 1` }))
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: TEXT.proposed.discardAll }))
    expect(onDone).toHaveBeenCalled()
  })

  it('discarding the last row finishes', async () => {
    const user = userEvent.setup()
    stubApi({ account: account(), doses: [] })
    const onDone = show('BCG 15/01/2023')
    await user.click(screen.getByRole('button', { name: `${TEXT.proposed.discard} fila 1` }))
    expect(onDone).toHaveBeenCalled()
  })

  it('marks a row without a date instead of sending it', async () => {
    const user = userEvent.setup()
    const calls = stubApi({ account: account(), doses: [] })
    show('BCG 05/01/2022')
    expect(within(row(1)).getByText(TEXT.proposed.fixDate)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: `${TEXT.proposed.confirmOne} fila 1` }))
    expect(await within(row(1)).findByText(TEXT.errors.appliedOn)).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
    await user.type(within(row(1)).getByLabelText(TEXT.dialog.appliedOn), '2023-02-01')
    expect(within(row(1)).queryByText(TEXT.errors.appliedOn)).not.toBeInTheDocument()
  })

  it('marks a row with no vaccine chosen', async () => {
    const user = userEvent.setup()
    stubApi({ account: account(), doses: [] })
    show('15/01/2023')
    await user.click(screen.getByRole('button', { name: `${TEXT.proposed.confirmOne} fila 1` }))
    expect(await within(row(1)).findByText(TEXT.errors.vaccine)).toBeInTheDocument()
  })

  it('asks before saving a duplicate and sends it only after the confirmation', async () => {
    const user = userEvent.setup()
    const calls = stubApi({ account: account(), doses: [], writes: { [`POST ${LIST}`]: { status: 409, body: { error: 'duplicate_vaccination' } } } })
    show('BCG 15/01/2023')
    await user.click(screen.getByRole('button', { name: `${TEXT.proposed.confirmOne} fila 1` }))
    expect(await within(row(1)).findByText(TEXT.dialog.duplicate)).toBeInTheDocument()
    await user.click(within(row(1)).getByRole('button', { name: TEXT.dialog.saveAnyway }))
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2))
    expect(calls.filter((c) => c.method === 'POST')[1].body).toMatchObject({ allowDuplicate: true })
  })

  it('keeps the row and says so when saving fails', async () => {
    const user = userEvent.setup()
    stubApi({ account: account(), doses: [], writes: { [`POST ${LIST}`]: { status: 500 } } })
    show('BCG 15/01/2023')
    await user.click(screen.getByRole('button', { name: `${TEXT.proposed.confirmOne} fila 1` }))
    expect(await within(row(1)).findByText(TEXT.proposed.saveError)).toBeInTheDocument()
    expect(within(row(1)).getByLabelText(TEXT.dialog.appliedOn)).toHaveValue('2023-01-15')
  })
})
