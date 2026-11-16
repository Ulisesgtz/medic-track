import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as clerk from '@clerk/react'
import { account, callsOf, renderAt, stubApi } from './account.test-utils'
import { AccountPage } from './AccountPage'
import { DeleteAccountPage } from './DeleteAccountPage'
import { DeletionPendingScreen } from './DeletionPendingScreen'
import { PausedAccountGate } from './PausedAccountGate'
import { FamilyDeletionNotice } from './FamilyDeletionNotice'
import { markCanceled } from './canceledNotice'
import { ACCOUNT_PAUSED_EVENT } from '../../shared/accountPause'
import type { Account } from '../home/types'

const share = vi.hoisted(() => ({
  canShareFile: vi.fn(() => false),
  shareFile: vi.fn(async () => true),
  downloadFile: vi.fn(),
}))
vi.mock('../pdfExport/share', () => share)

const logout = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('../auth/useLogout', () => ({ useLogout: () => logout }))

const scheduled = new Date(2026, 11, 12, 10).toISOString()

beforeEach(() => {
  share.canShareFile.mockReturnValue(false)
  share.shareFile.mockReset().mockResolvedValue(true)
  share.downloadFile.mockReset()
  logout.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('AccountPage', () => {
  it('shows the account, downloads and links to deleting', async () => {
    const mock = stubApi({
      'GET /accounts/me': { body: account({ family: { ownerName: 'Luis', role: 'tutor' } }) },
      'POST /accounts/a1/data-export': { fileName: 'peditrack.zip' },
    })
    renderAt('/cuenta/x', <AccountPage />, '/cuenta/x')
    expect(
      await screen.findByText(/ana@example.com · Plan completo · Familia de Luis/),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Descargar mis datos' }))
    expect(await screen.findByText('Listo: tu archivo se descargó.')).toBeInTheDocument()
    expect(share.downloadFile).toHaveBeenCalledWith(expect.any(Blob), 'peditrack.zip')
    expect(callsOf(mock)).toContain('POST /accounts/a1/data-export')
    await userEvent.click(screen.getByRole('link', { name: 'Eliminar mi cuenta…' }))
    expect(screen.getByText('ELIMINAR')).toBeInTheDocument()
  })

  it('says Gratis for the free plan and offers sharing where files can be shared', async () => {
    share.canShareFile.mockReturnValue(true)
    stubApi({
      'GET /accounts/me': { body: account({ plan: 'free' }) },
      'POST /accounts/a1/data-export': {},
    })
    renderAt('/cuenta/x', <AccountPage />, '/cuenta/x')
    expect(await screen.findByText('ana@example.com · Gratis')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Descargar mis datos' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Compartir' }))
    expect(share.shareFile).toHaveBeenCalled()
    share.shareFile.mockRejectedValueOnce(new Error('no'))
    await userEvent.click(screen.getByRole('button', { name: 'Compartir' }))
    await waitFor(() => expect(share.downloadFile).toHaveBeenCalledTimes(1))
    await userEvent.click(screen.getByRole('button', { name: 'Descargar' }))
    expect(share.downloadFile).toHaveBeenCalledTimes(2)
  })

  it('says when the download fails', async () => {
    stubApi({
      'GET /accounts/me': { body: account() },
      'POST /accounts/a1/data-export': { status: 500 },
    })
    renderAt('/cuenta/x', <AccountPage />, '/cuenta/x')
    await userEvent.click(await screen.findByRole('button', { name: 'Descargar mis datos' }))
    expect(
      await screen.findByText('No se pudo descargar. Vuelve a intentarlo.'),
    ).toBeInTheDocument()
  })
})

describe('DeleteAccountPage', () => {
  const typeWord = async (word: string) =>
    userEvent.type(await screen.findByLabelText('Escribe ELIMINAR para confirmar'), word)

  it('asks only after the word is written, then reads the account again', async () => {
    let deleted = false
    const mock = stubApi({
      'GET /accounts/me': () => ({
        body: deleted ? account({ deletion: { scheduledFor: scheduled } }) : account(),
      }),
      'POST /accounts/a1/deletion': () => {
        deleted = true
        return { status: 201, body: { status: 'pending' } }
      },
    })
    renderAt('/x', <DeleteAccountPage />)
    expect(await screen.findByText(/Si compartes tus hijos/)).toBeInTheDocument()
    const submit = screen.getByRole('button', { name: 'Eliminar mi cuenta' })
    expect(submit).toBeDisabled()
    await typeWord('eliminar')
    expect(submit).toBeEnabled()
    await userEvent.click(submit)
    await waitFor(() =>
      expect(callsOf(mock).filter((c) => c === 'GET /accounts/me')).toHaveLength(2),
    )
    const asked = mock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
    expect(JSON.parse(String((asked?.[1] as RequestInit).body))).toEqual({ confirm: 'ELIMINAR' })
  })

  it('on a phone that takes files, offers to share or save the file', async () => {
    share.canShareFile.mockReturnValue(true)
    stubApi({
      'GET /accounts/me': { body: account() },
      'POST /accounts/a1/data-export': {},
    })
    renderAt('/x', <DeleteAccountPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Descargar mis datos primero' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Compartir' }))
    expect(share.shareFile).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Descargar' }))
    expect(share.downloadFile).toHaveBeenCalled()
  })

  it('says when the download fails', async () => {
    stubApi({
      'GET /accounts/me': { body: account() },
      'POST /accounts/a1/data-export': { status: 500 },
    })
    renderAt('/x', <DeleteAccountPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Descargar mis datos primero' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('says it for a family member and downloads first', async () => {
    stubApi({
      'GET /accounts/me': { body: account({ family: { ownerName: 'Luis' } }) },
      'POST /accounts/a1/data-export': {},
    })
    renderAt('/x', <DeleteAccountPage />)
    expect(await screen.findByText(/Saldrás de la familia de Luis/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Descargar mis datos primero' }))
    await waitFor(() => expect(share.downloadFile).toHaveBeenCalled())
  })

  it.each([
    [502, 'No pudimos cancelar tu suscripción.'],
    [500, 'No se pudo pedir la eliminación. Intenta de nuevo.'],
  ])('shows the failure of a %i', async (status, text) => {
    stubApi({
      'GET /accounts/me': { body: account() },
      'POST /accounts/a1/deletion': { status },
    })
    renderAt('/x', <DeleteAccountPage />)
    await typeWord('ELIMINAR')
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar mi cuenta' }))
    expect(await screen.findByText(new RegExp(text))).toBeInTheDocument()
  })

  it('reads the account again when it was already pending', async () => {
    const mock = stubApi({
      'GET /accounts/me': { body: account() },
      'POST /accounts/a1/deletion': { status: 409 },
    })
    renderAt('/x', <DeleteAccountPage />)
    await typeWord('ELIMINAR')
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar mi cuenta' }))
    await waitFor(() =>
      expect(callsOf(mock).filter((c) => c === 'GET /accounts/me')).toHaveLength(2),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('stays quiet when the person closes the verification', async () => {
    vi.spyOn(clerk, 'useReverification').mockImplementation(
      () => (async () => Promise.reject(new Error('cancelled'))) as never,
    )
    stubApi({ 'GET /accounts/me': { body: account() } })
    renderAt('/x', <DeleteAccountPage />)
    await typeWord('ELIMINAR')
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar mi cuenta' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Eliminar mi cuenta' })).toBeEnabled(),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it('goes back with Cancelar', async () => {
    stubApi({ 'GET /accounts/me': { body: account() } })
    renderAt('/x', <DeleteAccountPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(screen.getByText('CUENTA')).toBeInTheDocument()
  })
})

describe('DeletionPendingScreen', () => {
  const paused = account({ deletion: { scheduledFor: scheduled } }) as unknown as Account

  it('cancels and remembers to say it', async () => {
    const mock = stubApi({ 'POST /accounts/a1/deletion/cancel': { status: 200, body: {} } })
    renderAt('/x', <DeletionPendingScreen account={paused} scheduledFor={scheduled} />)
    expect(screen.getByRole('heading', { name: /12 de diciembre de 2026/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar la eliminación' }))
    await waitFor(() => expect(callsOf(mock)).toContain('POST /accounts/a1/deletion/cancel'))
    expect(sessionStorage.getItem('eliminacion-cancelada')).toBe('1')
    expect(await screen.findByText('HOME')).toBeInTheDocument()
  })

  it('says when canceling fails and signs out', async () => {
    stubApi({ 'POST /accounts/a1/deletion/cancel': { status: 500 } })
    renderAt('/x', <DeletionPendingScreen account={paused} scheduledFor={scheduled} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar la eliminación' }))
    expect(await screen.findByText('No se pudo cancelar. Intenta de nuevo.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(logout).toHaveBeenCalled()
  })
})

describe('PausedAccountGate', () => {
  it('shows only the paused screen for a pending account', async () => {
    stubApi({ 'GET /accounts/me': { body: account({ deletion: { scheduledFor: scheduled } }) } })
    renderAt(
      '/x',
      <PausedAccountGate>
        <div>APP</div>
      </PausedAccountGate>,
    )
    expect(screen.getByText('APP')).toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new Event(ACCOUNT_PAUSED_EVENT))
    })
    expect(
      await screen.findByRole('button', { name: 'Cancelar la eliminación' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('APP')).not.toBeInTheDocument()
  })

  it('never reads the account on its own (a read before POST /accounts finishes would cache a 404 over the signup)', async () => {
    const mock = stubApi({ 'GET /accounts/me': { body: account() } })
    renderAt(
      '/x',
      <PausedAccountGate>
        <div>APP</div>
      </PausedAccountGate>,
    )
    expect(screen.getByText('APP')).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 50))
    expect(callsOf(mock)).toHaveLength(0)
  })

  it('shows the app, the canceled notice and reads the account again on a pause', async () => {
    markCanceled()
    const mock = stubApi({ 'GET /accounts/me': { body: account() } })
    renderAt(
      '/x',
      <PausedAccountGate>
        <div>APP</div>
      </PausedAccountGate>,
    )
    expect(screen.getByText('APP')).toBeInTheDocument()
    expect(screen.getByText(/Listo, tu cuenta sigue igual\./)).toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new Event(ACCOUNT_PAUSED_EVENT))
    })
    await waitFor(() => expect(callsOf(mock)).toHaveLength(1))
  })
})

describe('PausedAccountGate, the canceled notice', () => {
  it('closes with the button and does not come back on a reload', async () => {
    markCanceled()
    stubApi({ 'GET /accounts/me': { body: account() } })
    const view = renderAt(
      '/x',
      <PausedAccountGate>
        <div>APP</div>
      </PausedAccountGate>,
    )
    expect(screen.getByText(/Listo, tu cuenta sigue igual\./)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByText(/Listo, tu cuenta sigue igual\./)).not.toBeInTheDocument()
    view.unmount()
    renderAt(
      '/x',
      <PausedAccountGate>
        <div>APP</div>
      </PausedAccountGate>,
    )
    expect(screen.queryByText(/Listo, tu cuenta sigue igual\./)).not.toBeInTheDocument()
  })
})

describe('PausedAccountGate, canceled while mounted', () => {
  it('shows the notice when markCanceled runs after the gate is already mounted', async () => {
    sessionStorage.clear()
    stubApi({ 'GET /accounts/me': { body: account() } })
    renderAt(
      '/x',
      <PausedAccountGate>
        <div>APP</div>
      </PausedAccountGate>,
    )
    expect(screen.queryByText(/Listo, tu cuenta sigue igual\./)).not.toBeInTheDocument()
    act(() => markCanceled())
    expect(await screen.findByText(/Listo, tu cuenta sigue igual\./)).toBeInTheDocument()
  })
})

describe('FamilyDeletionNotice', () => {
  const member = (deletionScheduledFor: string | null) =>
    account({
      children: [
        { id: 'c1', firstName: 'Mateo', accountId: 'owner' },
        { id: 'c2', firstName: 'Sofía', accountId: 'owner' },
        { id: 'c3', firstName: 'Pablo', accountId: 'other' },
      ],
      family: { ownerAccountId: 'owner', ownerName: 'Luis', deletionScheduledFor },
    }) as unknown as Account

  it('says nothing without a pending deletion', () => {
    const { container } = renderAt(
      '/x',
      <FamilyDeletionNotice account={member(null)} variant="phone" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('names the owner children and downloads them', async () => {
    const mock = stubApi({ 'POST /family/children-export': {} })
    renderAt('/x', <FamilyDeletionNotice account={member(scheduled)} variant="desktop" />)
    expect(
      screen.getByText(/Luis pidió eliminar su cuenta. Mateo y Sofía dejarán/),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Descargar sus datos' }))
    await waitFor(() => expect(callsOf(mock)).toEqual(['POST /family/children-export']))
  })
})
