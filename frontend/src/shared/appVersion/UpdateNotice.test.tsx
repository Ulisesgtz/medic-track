import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UpdateNotice, UPDATE_CONFIRM_BODY, UPDATE_CONFIRM_TITLE } from './UpdateNotice'
import { reloadApp } from './reload'
import { markUnsaved } from './unsavedWork'
import { resetNewVersion } from './useNewVersion'

vi.mock('./reload', () => ({ reloadApp: vi.fn() }))

function publish(version: string) {
  vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ version }) } as Response)
}

function stubDesktop(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  vi.mocked(reloadApp).mockClear()
})
afterEach(() => {
  resetNewVersion()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('UpdateNotice (specs/017)', () => {
  it('shows nothing when there is no new version', async () => {
    publish(__APP_VERSION__)
    const { container } = render(<UpdateNotice />)
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('offers the update on the phone and reloads only when the button is tapped', async () => {
    publish('otra')
    render(<UpdateNotice />)

    expect(await screen.findByRole('status')).toHaveTextContent('Hay una versión nueva')
    expect(reloadApp).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    expect(reloadApp).toHaveBeenCalledTimes(1)
  })

  it('has its own design on the web', async () => {
    stubDesktop(true)
    publish('otra')
    render(<UpdateNotice />)

    const bar = await screen.findByRole('status')
    expect(bar).toHaveClass('right-6')
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    expect(reloadApp).toHaveBeenCalledTimes(1)
  })

  it('asks before reloading when a form holds work, and keeps everything if the tutor says no', async () => {
    publish('otra')
    const release = markUnsaved()
    render(<UpdateNotice />)
    await screen.findByRole('status')

    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    // specs/066: the app's own dialog, «Seguir editando» and «Actualizar».
    let dialog = await screen.findByRole('dialog', { name: UPDATE_CONFIRM_TITLE })
    expect(within(dialog).getByText(UPDATE_CONFIRM_BODY)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Seguir editando' }))
    expect(reloadApp).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    dialog = await screen.findByRole('dialog', { name: UPDATE_CONFIRM_TITLE })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Actualizar' }))
    expect(reloadApp).toHaveBeenCalledTimes(1)
    release()
  })

  it('does not ask when there is nothing to lose', async () => {
    publish('otra')
    render(<UpdateNotice />)
    await screen.findByRole('status')

    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(reloadApp).toHaveBeenCalledTimes(1)
  })
})
