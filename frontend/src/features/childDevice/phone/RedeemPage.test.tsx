import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PHONE } from '../childText'
import { RedeemPage } from './RedeemPage'
import { readCredential } from './storage'

function setHash(hash: string) {
  window.history.replaceState(null, '', '/hijo' + hash)
}

function show() {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={['/hijo']}>
        <Routes>
          <Route path="/hijo" element={<RedeemPage />} />
          <Route path="/hijo/hoy" element={<p>pantalla del hijo</p>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  )
}

const okBody = { credential: 'cred-1', childId: 'c', childFirstName: 'Mateo', rotateAfter: '' }

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  setHash('')
})

describe('RedeemPage', () => {
  it('redeems the link once, even under StrictMode, takes the secret out of the address and keeps the credential', async () => {
    setHash('#secreto')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => okBody })
    vi.stubGlobal('fetch', fetchMock)
    show()
    expect(await screen.findByText('pantalla del hijo')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(window.location.hash).toBe('')
    expect(readCredential()).toBe('cred-1')
  })

  it('says only that the link no longer works when it fails', async () => {
    setHash('#vieja')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }))
    show()
    expect(await screen.findByText(PHONE.redeemFailed)).toBeInTheDocument()
    expect(readCredential()).toBeNull()
  })

  it('says so when the phone cannot keep the credential', async () => {
    setHash('#secreto')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => okBody }))
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    show()
    expect(await screen.findByText(PHONE.redeemFailed)).toBeInTheDocument()
  })

  it('without a link but with a credential it just goes in', async () => {
    setHash('')
    window.localStorage.setItem('hijo-credencial', 'ya-estaba')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    show()
    expect(await screen.findByText('pantalla del hijo')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('without a link and without a credential it says what to do', async () => {
    setHash('')
    show()
    await waitFor(() => expect(screen.getByText(PHONE.noLink)).toBeInTheDocument())
  })
})
