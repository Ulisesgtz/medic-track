import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardPhotos } from './CardPhotos'
import { CHILD_ID, account, dose, renderAt, stubApi } from './vaccinationsApi.test-utils'
import { TEXT, photoLimitText } from './vaccineText'

const ocr = vi.hoisted(() => ({ suggestion: null as string | null, isRunning: false, progress: 0, runOcr: vi.fn() }))
vi.mock('../consultations/useOcrSuggestion', () => ({ useOcrSuggestion: () => ocr }))
const shrink = vi.hoisted(() => ({ same: false }))
vi.mock('../consultations/shrinkPhoto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../consultations/shrinkPhoto')>()),
  shrinkPhoto: async (file: File) => (shrink.same ? file : new Blob(['small'], { type: 'image/jpeg' })),
}))

const PHOTO = { id: 'p1', createdAt: '2026-11-05T12:00:00', createdByName: 'Ana' }
const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ ...PHOTO, id: `p${i + 1}` }))
const PHOTOS = `/children/${CHILD_ID}/vaccine-card-photos`

beforeEach(() => {
  ocr.suggestion = null
  ocr.isRunning = false
  ocr.progress = 0
  ocr.runOcr.mockReset().mockResolvedValue(undefined)
  shrink.same = false
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const show = (canEdit = true) => renderAt(<CardPhotos childId={CHILD_ID} birthDate="2023-01-10" canEdit={canEdit} />, '/x', '/x')
const pick = async (user: ReturnType<typeof userEvent.setup>, container: HTMLElement) =>
  user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, new File(['x'], 'cartilla.jpg', { type: 'image/jpeg' }))

describe('CardPhotos', () => {
  it('offers to save a photo through a hidden input that has no capture, and says there are none yet', async () => {
    stubApi({ account: account(), doses: [] })
    const { container } = show()
    expect(await screen.findByText(TEXT.photos.empty)).toBeInTheDocument()
    const input = container.querySelector('input[type="file"]')!
    expect(input).toHaveAttribute('accept', 'image/*')
    expect(input).not.toHaveAttribute('capture')
    expect(input).toHaveClass('hidden')
    expect(screen.getByRole('button', { name: TEXT.photos.add })).toBeEnabled()
    expect(screen.getByText(TEXT.photos.privacy)).toBeInTheDocument()
  })

  it('saves the scaled-down photo as base64 and reads its text in the phone', async () => {
    const user = userEvent.setup()
    const calls = stubApi({ account: account(), doses: [] })
    const { container } = show()
    await screen.findByText(TEXT.photos.empty)
    await pick(user, container)
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === PHOTOS)).toBe(true))
    const body = calls.find((c) => c.method === 'POST')?.body as { photoBase64: string }
    expect(atob(body.photoBase64)).toBe('small')
    expect(ocr.runOcr).toHaveBeenCalledTimes(1)
    expect(calls.filter((c) => c.method === 'GET' && c.path === PHOTOS).length).toBeGreaterThan(1)
  })

  it('lists who saved each photo and when, and opens one in the viewer with its own label', async () => {
    const user = userEvent.setup()
    stubApi({ account: account(), doses: [], photos: [PHOTO] })
    show()
    await user.click(await screen.findByRole('button', { name: /^Abrir/ }))
    const viewer = await screen.findByRole('dialog', { name: 'Foto de la cartilla en tamaño completo' })
    expect(within(viewer).getByRole('img', { name: 'Foto de la cartilla en tamaño completo' })).toHaveAttribute('src', expect.stringMatching(/^data:image\/jpeg;base64,/))
    await user.click(within(viewer).getByRole('button', { name: 'Cerrar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Guardada por Ana el 05 nov 2026')).toBeInTheDocument()
  })

  it('says so when a photo cannot be opened', async () => {
    const user = userEvent.setup()
    stubApi({ account: account(), doses: [], photos: [PHOTO], writes: { [`GET ${PHOTOS}/p1`]: { status: 500 } } })
    show()
    await user.click(await screen.findByRole('button', { name: /^Abrir/ }))
    expect(await screen.findByText(TEXT.photos.openError)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: TEXT.dialog.close }))
    await waitFor(() => expect(screen.queryByText(TEXT.photos.openError)).not.toBeInTheDocument())
  })

  it('stops at 10 photos without losing anything: the button is off and the sentence says what to do', async () => {
    stubApi({ account: account(), doses: [], photos: photos(10) })
    show()
    expect(await screen.findByText(photoLimitText(10))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: TEXT.photos.add })).toBeDisabled()
  })

  it('tells the parent when the server refuses an eleventh photo', async () => {
    const user = userEvent.setup()
    stubApi({ account: account(), doses: [], photos: photos(3), writes: { [`POST ${PHOTOS}`]: { status: 422, body: { error: 'photo_limit_exceeded', reason: 'vaccine_card' } } } })
    const { container } = show()
    await screen.findAllByRole('button', { name: /^Abrir/ })
    await pick(user, container)
    expect(await screen.findByText(photoLimitText(10))).toBeInTheDocument()
  })

  it('says it could not save, without blaming', async () => {
    const user = userEvent.setup()
    stubApi({ account: account(), doses: [], writes: { [`POST ${PHOTOS}`]: { status: 500 } } })
    const { container } = show()
    await screen.findByText(TEXT.photos.empty)
    await pick(user, container)
    expect(await screen.findByText(TEXT.photos.saveError)).toBeInTheDocument()
  })

  it('notes that the photo was saved as it was when the browser cannot scale it down', async () => {
    const user = userEvent.setup()
    shrink.same = true
    stubApi({ account: account(), doses: [], writes: { [`POST ${PHOTOS}`]: { status: 201, body: PHOTO } } })
    const { container } = show()
    await screen.findByText(TEXT.photos.empty)
    await pick(user, container)
    expect(await screen.findByText(TEXT.photos.notShrunk)).toBeInTheDocument()
  })

  it('does nothing if the picker closes without a file', async () => {
    const calls = stubApi({ account: account(), doses: [] })
    const { container } = show()
    await screen.findByText(TEXT.photos.empty)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    input.dispatchEvent(new Event('change', { bubbles: true }))
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
    expect(ocr.runOcr).not.toHaveBeenCalled()
  })

  it('deletes a photo after a neutral confirmation that says it cannot be undone', async () => {
    const user = userEvent.setup()
    const calls = stubApi({ account: account(), doses: [], photos: [PHOTO] })
    show()
    await user.click(await screen.findByRole('button', { name: /^Borrar/ }))
    const dialog = await screen.findByRole('dialog', { name: TEXT.photos.deleteTitle })
    expect(within(dialog).getByText('No se puede deshacer')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: TEXT.confirmDelete.confirm }))
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === `${PHOTOS}/p1`)).toBe(true))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('keeps the photo and says so when deleting fails, and Cancelar closes', async () => {
    const user = userEvent.setup()
    stubApi({ account: account(), doses: [], photos: [PHOTO], writes: { [`DELETE ${PHOTOS}/p1`]: { status: 500 } } })
    show()
    await user.click(await screen.findByRole('button', { name: /^Borrar/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: TEXT.confirmDelete.confirm }))
    expect(await within(dialog).findByText(TEXT.photos.deleteError)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: TEXT.confirmDelete.cancel }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('lets someone who only sees open the photos, but not save or delete', async () => {
    stubApi({ account: account(), doses: [], photos: [PHOTO] })
    show(false)
    expect(await screen.findByRole('button', { name: /^Abrir/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: TEXT.photos.add })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Borrar/ })).not.toBeInTheDocument()
  })

  it('says so when the photos cannot be read', async () => {
    stubApi({ account: account(), doses: [], writes: { [`GET ${PHOTOS}`]: { status: 500 } } })
    show()
    expect(await screen.findByText(TEXT.photos.loadError)).toBeInTheDocument()
  })

  it('proposes rows from the text it read, saves only what the parent confirms and then lets go of the panel', async () => {
    const user = userEvent.setup()
    ocr.suggestion = 'BCG 15/01/2023\nHepatitis B 02/03/2023'
    const calls = stubApi({ account: account(), doses: [] })
    const { container } = show()
    await screen.findByText(TEXT.photos.empty)
    await pick(user, container)
    const panel = await screen.findByRole('region', { name: TEXT.proposed.title })
    expect(within(panel).getAllByRole('listitem')).toHaveLength(2)
    expect(calls.some((c) => c.method === 'POST' && c.path === `/children/${CHILD_ID}/vaccinations`)).toBe(false)
    await user.click(within(panel).getByRole('button', { name: `${TEXT.proposed.discard} fila 2` }))
    await user.click(within(panel).getByRole('button', { name: `${TEXT.proposed.confirmOne} fila 1` }))
    await waitFor(() => expect(screen.queryByRole('region', { name: TEXT.proposed.title })).not.toBeInTheDocument())
    const saved = calls.filter((c) => c.method === 'POST' && c.path === `/children/${CHILD_ID}/vaccinations`)
    expect(saved).toHaveLength(1)
    expect(saved[0].body).toMatchObject({ vaccineCode: 'bcg', appliedOn: '2023-01-15' })
  })

  it('waits for the vaccine catalog before proposing rows, so the vaccines come from the list and not as «Otra…»', async () => {
    const user = userEvent.setup()
    ocr.suggestion = 'BCG 15/01/2023'
    let open: () => void = () => {}
    const catalogGate = new Promise<void>((resolve) => (open = resolve))
    stubApi({ account: account(), doses: [], catalogGate })
    const { container } = show()
    await screen.findByText(TEXT.photos.empty)
    await pick(user, container)
    await waitFor(() => expect(screen.getByRole('button', { name: TEXT.photos.add })).toBeEnabled())
    expect(screen.queryByRole('region', { name: TEXT.proposed.title })).not.toBeInTheDocument()
    open()
    const panel = await screen.findByRole('region', { name: TEXT.proposed.title })
    expect(within(panel).getByLabelText(TEXT.dialog.vaccine)).toHaveValue('bcg')
  })

  it('says nothing was found, and blocks nothing, when the reading is empty', async () => {
    const user = userEvent.setup()
    ocr.suggestion = null
    stubApi({ account: account(), doses: [] })
    const { container } = show()
    await screen.findByText(TEXT.photos.empty)
    await pick(user, container)
    expect(await screen.findByText(TEXT.proposed.none)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: TEXT.dialog.close }))
    await waitFor(() => expect(screen.queryByText(TEXT.proposed.none)).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: TEXT.photos.add })).toBeEnabled()
  })

  it('shows the reading progress while the text is being read', async () => {
    const user = userEvent.setup()
    let release: () => void = () => {}
    ocr.runOcr.mockImplementation(() => new Promise<void>((resolve) => (release = resolve)))
    ocr.progress = 0.4
    stubApi({ account: account(), doses: [dose()] })
    const { container } = show()
    await screen.findByText(TEXT.photos.empty)
    await pick(user, container)
    const bar = await screen.findByRole('progressbar', { name: TEXT.proposed.reading })
    expect(bar).toHaveAttribute('aria-valuenow', '40')
    release()
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument())
  })
})
