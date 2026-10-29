import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PHONE } from '../childText'
import { RedeemPage } from './RedeemPage'
import { readCredential } from './storage'
import { tokenFromPasted } from './pastedLink'
import userEvent from '@testing-library/user-event'

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
  Reflect.deleteProperty(navigator, 'clipboard')
})

function clipboard(readText: () => Promise<string>) {
  Object.defineProperty(navigator, 'clipboard', { value: { readText: vi.fn(readText), writeText: vi.fn() }, configurable: true })
}

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

  it('without a link and without a credential it offers to paste the link, and the pasted link gets in', async () => {
    setHash('')
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => okBody })
    vi.stubGlobal('fetch', fetchMock)
    show()
    const field = await screen.findByLabelText(PHONE.paste.label)
    expect(screen.getByRole('button', { name: PHONE.paste.submit })).toBeDisabled()
    await user.type(field, '  https://dev.pedi-track.com/hijo#secreto-pegado  ')
    await user.click(screen.getByRole('button', { name: PHONE.paste.submit }))
    expect(await screen.findByText('pantalla del hijo')).toBeInTheDocument()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: 'secreto-pegado' })
    expect(readCredential()).toBe('cred-1')
  })

  it('a pasted link that no longer works says so and keeps the field', async () => {
    setHash('')
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }))
    show()
    await user.type(await screen.findByLabelText(PHONE.paste.label), 'vieja')
    await user.click(screen.getByRole('button', { name: PHONE.paste.submit }))
    expect(await screen.findByText(PHONE.redeemFailed)).toBeInTheDocument()
    expect(screen.getByLabelText(PHONE.paste.label)).toHaveValue('vieja')
  })

  describe('«Pegar mi liga»', () => {
    it('reads the copied link with one tap and gets in', async () => {
      setHash('')
      const user = userEvent.setup()
      clipboard(async () => '  https://dev.pedi-track.com/hijo#Secreto_copiado-1234567  ')
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => okBody })
      vi.stubGlobal('fetch', fetchMock)
      show()
      await user.click(await screen.findByRole('button', { name: PHONE.paste.pasteButton }))
      expect(await screen.findByText('pantalla del hijo')).toBeInTheDocument()
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: 'Secreto_copiado-1234567' })
      expect(readCredential()).toBe('cred-1')
    })

    it('says so when what was copied is not a link, and asks nothing of the server', async () => {
      setHash('')
      const user = userEvent.setup()
      clipboard(async () => 'hola qué tal')
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      show()
      await user.click(await screen.findByRole('button', { name: PHONE.paste.pasteButton }))
      expect(await screen.findByText(PHONE.paste.pasteEmpty)).toBeInTheDocument()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('says how to paste by hand when the phone does not let it read', async () => {
      setHash('')
      const user = userEvent.setup()
      clipboard(async () => {
        throw new Error('denied')
      })
      vi.stubGlobal('fetch', vi.fn())
      show()
      await user.click(await screen.findByRole('button', { name: PHONE.paste.pasteButton }))
      expect(await screen.findByText(PHONE.paste.pasteFailed)).toBeInTheDocument()
      expect(screen.getByText(PHONE.paste.orByHand)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: PHONE.paste.submit })).toBeDisabled()
    })
  })

  describe('on an iPhone outside the installed app', () => {
    beforeEach(() => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'))

    it('does not spend the link: it says to install first, takes the secret out of the address and copies the link', async () => {
      setHash('#secreto')
      const user = userEvent.setup()
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
      show()
      expect(await screen.findByRole('heading', { name: PHONE.installFirst.title })).toBeInTheDocument()
      // Five illustrated steps, each with its title; the drawings are hidden from screen readers.
      const steps = screen.getAllByRole('listitem')
      expect(steps).toHaveLength(5)
      PHONE.installFirst.steps.forEach((step, i) => expect(steps[i]).toHaveTextContent(step.title))
      for (const art of document.querySelectorAll('svg')) expect(art).toHaveAttribute('aria-hidden', 'true')
      expect(window.location.hash).toBe('')
      expect(fetchMock).not.toHaveBeenCalled()
      expect(screen.getByLabelText(PHONE.installFirst.linkLabel)).toHaveValue(`${window.location.origin}/hijo#secreto`)
      await user.click(screen.getByRole('button', { name: PHONE.installFirst.copy }))
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/hijo#secreto`)
      expect(await screen.findByRole('button', { name: PHONE.installFirst.copied })).toBeInTheDocument()
    })

    it('says how to copy it by hand when the clipboard refuses', async () => {
      setHash('#secreto')
      const user = userEvent.setup()
      vi.stubGlobal('fetch', vi.fn())
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('no')) }, configurable: true })
      show()
      await user.click(await screen.findByRole('button', { name: PHONE.installFirst.copy }))
      expect(await screen.findByText(PHONE.installFirst.copyFailed)).toBeInTheDocument()
    })

    it('can still use the link right here', async () => {
      setHash('#secreto')
      const user = userEvent.setup()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => okBody }))
      show()
      await user.click(await screen.findByRole('button', { name: PHONE.installFirst.useHere }))
      expect(await screen.findByText('pantalla del hijo')).toBeInTheDocument()
      expect(readCredential()).toBe('cred-1')
    })
  })
})

describe('tokenFromPasted', () => {
  it('takes what comes after the # of a link, or the whole text', () => {
    expect(tokenFromPasted(' https://x/hijo#abc ')).toBe('abc')
    expect(tokenFromPasted('abc')).toBe('abc')
    expect(tokenFromPasted('  ')).toBe('')
  })
})
