import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VaccinationCardPage } from './VaccinationCardPage'
import { CardEntry } from './CardEntry'
import { CHILD_ID, account, child, dose, renderAt, stubApi, stubMatchMedia } from './vaccinationsApi.test-utils'
import { TEXT } from './vaccineText'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const page = () => renderAt(<VaccinationCardPage />)
const LIST = `/children/${CHILD_ID}/vaccinations`

async function fillBcg(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: TEXT.add }))
  const dialog = await screen.findByRole('dialog')
  await waitFor(() => expect(within(dialog).getByRole('option', { name: 'BCG' })).toBeInTheDocument())
  await user.selectOptions(within(dialog).getByLabelText(TEXT.dialog.vaccine), 'bcg')
  await user.type(within(dialog).getByLabelText(TEXT.dialog.appliedOn), '2024-03-14')
  return dialog
}

describe('VaccinationCardPage', () => {
  it('shows the recorded doses grouped by vaccine, the neutral note and the add button to who can add', async () => {
    stubApi({
      account: account(),
      doses: [dose(), dose({ id: 'v2', doseNumber: 1, appliedOn: '2023-02-01' }), dose({ id: 'v3', vaccineCode: null, name: 'Rabia', customName: 'Rabia' })],
    })
    page()

    const list = await screen.findByRole('list', { name: 'Vacunas registradas' })
    expect(within(list).getByRole('heading', { name: 'Hepatitis B' })).toBeInTheDocument()
    expect(within(list).getByRole('heading', { name: 'Rabia' })).toBeInTheDocument()
    expect(within(list).getByText('Dosis 1 · 01 feb 2023 · Centro de salud')).toBeInTheDocument()
    expect(screen.getByText(TEXT.note)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: TEXT.add })).toBeInTheDocument()
  })

  it('says it is empty without suggesting anything, and offers to add', async () => {
    stubApi({ account: account(), doses: [] })
    page()
    expect(await screen.findByText(TEXT.empty.title)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: TEXT.add })).toBeInTheDocument()
  })

  it('offers a retry when the card cannot be read', async () => {
    stubApi({ account: account(), doses: [], listFails: true })
    page()
    expect(await screen.findByText(TEXT.loadError)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: TEXT.retry })).toBeInTheDocument()
  })

  it('only shows, without add, correct or delete, to a caregiver', async () => {
    stubApi({ account: account([child({ role: 'caregiver', readOnly: false })]), doses: [dose()] })
    page()
    await screen.findByRole('list', { name: 'Vacunas registradas' })
    expect(screen.queryByRole('button', { name: TEXT.add })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Corregir/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Borrar/ })).not.toBeInTheDocument()
  })

  it('only shows to a tutor whose family stopped paying (read-only)', async () => {
    stubApi({ account: account([child({ role: 'tutor', readOnly: true })]), doses: [dose()] })
    page()
    await screen.findByRole('list', { name: 'Vacunas registradas' })
    expect(screen.queryByRole('button', { name: TEXT.add })).not.toBeInTheDocument()
  })

  it('records a dose from the dialog and refreshes the list', async () => {
    const user = userEvent.setup()
    const calls = stubApi({ account: account(), doses: [] })
    page()
    const dialog = await fillBcg(user)
    await user.click(within(dialog).getByRole('button', { name: TEXT.dialog.save }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const post = calls.find((c) => c.method === 'POST' && c.path === LIST)
    expect(post?.body).toMatchObject({ vaccineCode: 'bcg', appliedOn: '2024-03-14', customName: '' })
    expect(calls.filter((c) => c.method === 'GET' && c.path === LIST).length).toBeGreaterThan(1)
  })

  it('shows each field error and does not send an invalid dose', async () => {
    const user = userEvent.setup()
    const calls = stubApi({ account: account(), doses: [] })
    page()
    await user.click(await screen.findByRole('button', { name: TEXT.add }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: TEXT.dialog.save }))
    expect(await within(dialog).findByText(TEXT.errors.vaccine)).toBeInTheDocument()
    expect(within(dialog).getByText(TEXT.errors.appliedOn)).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('writes the name of a vaccine that is not in the list', async () => {
    const user = userEvent.setup()
    const calls = stubApi({ account: account(), doses: [] })
    page()
    await user.click(await screen.findByRole('button', { name: TEXT.add }))
    const dialog = await screen.findByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText(TEXT.dialog.vaccine), TEXT.dialog.other)
    await user.type(within(dialog).getByLabelText(TEXT.dialog.customName), 'Rabia')
    await user.type(within(dialog).getByLabelText(TEXT.dialog.appliedOn), '2024-03-14')
    await user.type(within(dialog).getByLabelText(TEXT.dialog.doseNumber), '1')
    await user.click(within(dialog).getByRole('button', { name: TEXT.dialog.save }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ vaccineCode: '', customName: 'Rabia', doseNumber: 1 })
  })

  it('asks before saving a duplicate and sends allowDuplicate only after the confirmation', async () => {
    const user = userEvent.setup()
    const calls = stubApi({
      account: account(),
      doses: [],
      writes: { [`POST ${LIST}`]: { status: 409, body: { error: 'duplicate_vaccination' } } },
    })
    page()
    const dialog = await fillBcg(user)
    await user.click(within(dialog).getByRole('button', { name: TEXT.dialog.save }))
    expect(await within(dialog).findByText(TEXT.dialog.duplicate)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: TEXT.dialog.saveAnyway }))
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2))
    expect(calls.filter((c) => c.method === 'POST')[1].body).toMatchObject({ allowDuplicate: true })
  })

  it('keeps what was typed and says so when saving fails', async () => {
    const user = userEvent.setup()
    stubApi({ account: account(), doses: [], writes: { [`POST ${LIST}`]: { status: 500 } } })
    page()
    const dialog = await fillBcg(user)
    await user.click(within(dialog).getByRole('button', { name: TEXT.dialog.save }))
    expect(await within(dialog).findByText(TEXT.dialog.saveError)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(TEXT.dialog.appliedOn)).toHaveValue('2024-03-14')
  })

  it('shows the server field errors under their fields', async () => {
    const user = userEvent.setup()
    stubApi({
      account: account(),
      doses: [],
      writes: {
        [`POST ${LIST}`]: {
          status: 400,
          body: { error: 'validation_error', details: [{ field: 'appliedOn', message: 'La fecha de aplicación no puede ser futura.' }] },
        },
      },
    })
    page()
    const dialog = await fillBcg(user)
    await user.click(within(dialog).getByRole('button', { name: TEXT.dialog.save }))
    expect(await within(dialog).findByText('La fecha de aplicación no puede ser futura.')).toBeInTheDocument()
  })

  it('corrects a dose with the whole dose sent and its values already in the form', async () => {
    const user = userEvent.setup()
    const calls = stubApi({ account: account(), doses: [dose()], writes: { [`PATCH ${LIST}/v1`]: { body: dose() } } })
    page()
    await user.click(await screen.findByRole('button', { name: 'Corregir Hepatitis B del 14 mar 2024' }))
    const dialog = await screen.findByRole('dialog', { name: TEXT.dialog.editTitle })
    expect(within(dialog).getByLabelText(TEXT.dialog.appliedOn)).toHaveValue('2024-03-14')
    expect(within(dialog).getByLabelText(TEXT.dialog.place)).toHaveValue('Centro de salud')
    await user.clear(within(dialog).getByLabelText(TEXT.dialog.place))
    await user.type(within(dialog).getByLabelText(TEXT.dialog.place), 'Clínica')
    await user.click(within(dialog).getByRole('button', { name: TEXT.dialog.save }))
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true))
    expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({ vaccineCode: 'hepatitis_b', place: 'Clínica', doseNumber: 2 })
  })

  it('asks before leaving a dialog with typed data and stays if the parent says no', async () => {
    const user = userEvent.setup()
    stubApi({ account: account(), doses: [] })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    page()
    await user.click(await screen.findByRole('button', { name: TEXT.add }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(TEXT.dialog.lot), 'A1')
    await user.click(within(dialog).getByRole('button', { name: TEXT.dialog.cancel }))
    expect(confirm).toHaveBeenCalledWith(TEXT.dialog.leave)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    confirm.mockReturnValue(true)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('closes an untouched dialog without asking, keeps Tab inside it and gives the focus back', async () => {
    const user = userEvent.setup()
    stubApi({ account: account(), doses: [] })
    const confirm = vi.spyOn(window, 'confirm')
    page()
    const add = await screen.findByRole('button', { name: TEXT.add })
    await user.click(add)
    const dialog = await screen.findByRole('dialog')
    within(dialog).getByRole('button', { name: TEXT.dialog.close }).focus()
    await user.tab({ shift: true })
    expect(dialog.contains(document.activeElement)).toBe(true)
    within(dialog).getByRole('button', { name: TEXT.dialog.save }).focus()
    await user.tab()
    expect(dialog.contains(document.activeElement)).toBe(true)
    await user.click(within(dialog).getByRole('button', { name: TEXT.dialog.cancel }))
    expect(confirm).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(add).toHaveFocus()
  })

  it('deletes a dose after a neutral confirmation that says it cannot be undone', async () => {
    const user = userEvent.setup()
    const calls = stubApi({ account: account(), doses: [dose()] })
    page()
    await user.click(await screen.findByRole('button', { name: 'Borrar Hepatitis B del 14 mar 2024' }))
    const dialog = await screen.findByRole('dialog', { name: TEXT.confirmDelete.title })
    expect(within(dialog).getByText('No se puede deshacer')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: TEXT.confirmDelete.confirm }))
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === `${LIST}/v1`)).toBe(true))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('keeps the dose and says so when deleting fails, and Cancelar closes', async () => {
    const user = userEvent.setup()
    stubApi({ account: account(), doses: [dose()], writes: { [`DELETE ${LIST}/v1`]: { status: 500 } } })
    page()
    await user.click(await screen.findByRole('button', { name: 'Borrar Hepatitis B del 14 mar 2024' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: TEXT.confirmDelete.confirm }))
    expect(await within(dialog).findByText(TEXT.confirmDelete.error)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: TEXT.confirmDelete.cancel }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Hepatitis B' })).toBeInTheDocument()
  })

  it('draws the web design too', async () => {
    stubMatchMedia(true)
    stubApi({ account: account(), doses: [dose()] })
    page()
    expect(await screen.findByRole('heading', { level: 1, name: TEXT.title })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: '← Mateo' })).toBeInTheDocument()
  })

  it('puts the photos of the card next to the list on the web and under it on the phone', async () => {
    stubApi({ account: account(), doses: [dose()], photos: [{ id: 'p1', createdAt: '2026-11-05T12:00:00', createdByName: 'Ana' }] })
    page()
    expect(await screen.findByRole('region', { name: TEXT.photos.title })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: TEXT.photos.add })).toBeInTheDocument()
    expect(await screen.findByText('Guardada por Ana el 05 nov 2026')).toBeInTheDocument()
  })

  it('shows the corrected line with the first name of who corrected, the lot and the note', async () => {
    stubApi({ account: account(), doses: [dose({ correctedAt: '2026-11-05T12:00:00', correctedByName: 'Luis', lot: 'L9', notes: 'sin reacción' })] })
    page()
    expect(await screen.findByText(/Corregida el 05 nov 2026 por Luis/)).toBeInTheDocument()
    expect(screen.getByText('Lote L9')).toBeInTheDocument()
    expect(screen.getByText('sin reacción')).toBeInTheDocument()
  })
})

describe('CardEntry', () => {
  const entry = () => renderAt(<CardEntry childId={CHILD_ID} />, '/x', '/x')

  it('counts what is recorded and links to the card', async () => {
    stubApi({ account: account(), doses: [dose(), dose({ id: 'v2' })], photos: [{ id: 'p1', createdAt: '2026-10-01T10:00:00Z', createdByName: 'Ana' }] })
    entry()
    expect(await screen.findByText('2 dosis registradas · 1 foto')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: TEXT.entry.link })).toHaveAttribute('href', `/children/${CHILD_ID}/cartilla`)
  })

  it('says nothing was recorded', async () => {
    stubApi({ account: account(), doses: [] })
    entry()
    expect(await screen.findByText(TEXT.entry.empty)).toBeInTheDocument()
  })

  it('draws nothing when the card cannot be read', async () => {
    stubApi({ account: account(), doses: [], listFails: true })
    const { container } = entry()
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})
