import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setOfflineSession } from '../offline/connectivity'
import { ErrorScreen } from './ErrorScreen'
import { RECENT_RELOAD_MS } from './reloadMemory'

const auth = vi.hoisted(() => ({ isSignedIn: true as boolean | undefined }))
vi.mock('@clerk/react', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: auth.isSignedIn }),
}))
vi.mock('./navigate', () => ({ reloadPage: vi.fn(), goTo: vi.fn() }))

import { goTo, reloadPage } from './navigate'

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi
      .fn()
      .mockImplementation(() => ({
        matches,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
  )
}

beforeEach(() => {
  auth.isSignedIn = true
  sessionStorage.clear()
  stubMatchMedia(false)
  vi.mocked(goTo).mockClear()
  vi.mocked(reloadPage).mockClear()
})

afterEach(() => {
  setOfflineSession(false)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ErrorScreen variants', () => {
  it('A: a signed-in parent inside the shell sees the base text, the note and no frame', () => {
    render(<ErrorScreen frame="shell" pathname="/children/c1" />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Algo no cargó bien' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Lo que ya guardaste sigue en tu cuenta. Vuelve a cargar la pantalla para seguir.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('El aviso del problema se envía solo.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Volver a cargar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ir al inicio' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'PediTrack' })).not.toBeInTheDocument()
  })

  it('B: the whole page for a signed-in parent shows the big logo after the content in the DOM', () => {
    const { container } = render(<ErrorScreen frame="page" pathname="/home" />)
    const main = container.querySelector('main')!
    const frame = container.querySelector('[aria-hidden="true"].order-1')!
    expect(frame).toBeInTheDocument()
    expect(frame.textContent).toContain('PediTrack')
    // The content comes before the frame in the DOM; CSS `order` puts the frame on top.
    expect(main.compareDocumentPosition(frame) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('C: a child phone (/hijo...) has no note and goes back to Hoy, signed in or not', async () => {
    auth.isSignedIn = false
    render(<ErrorScreen frame="page" pathname="/hijo/hoy" />)
    expect(
      screen.getByText(
        'Lo que ya marcaste sigue guardado. Vuelve a cargar la pantalla para seguir.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('El aviso del problema se envía solo.')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ir a Hoy' }))
    expect(goTo).toHaveBeenCalledWith('/hijo/hoy')
  })

  it('C also covers /hijo itself', () => {
    render(<ErrorScreen frame="page" pathname="/hijo" />)
    expect(screen.getByRole('button', { name: 'Ir a Hoy' })).toBeInTheDocument()
  })

  it('D: with no session the way out is the login', async () => {
    auth.isSignedIn = false
    render(<ErrorScreen frame="page" pathname="/login" />)
    expect(
      screen.getByText(/Si ya tenías una cuenta, tus registros siguen ahí/),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ir a iniciar sesión' }))
    expect(goTo).toHaveBeenCalledWith('/login')
  })

  it('a session that has not loaded yet is not taken for «no session»', () => {
    auth.isSignedIn = undefined
    render(<ErrorScreen frame="shell" pathname="/home" />)
    expect(screen.getByRole('button', { name: 'Ir al inicio' })).toBeInTheDocument()
  })

  it('E: «Volver a cargar» pressed 30 s ago or less makes the way out the solid button', () => {
    sessionStorage.setItem('peditrack.errorScreen.reloadedAt', String(Date.now() - 5_000))
    render(<ErrorScreen frame="shell" pathname="/home" />)
    expect(
      screen.getByText('Sigue sin cargar. Intenta más tarde o regresa al inicio.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Lo que ya guardaste sigue en tu cuenta.')).toBeInTheDocument()
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Ir al inicio', 'Volver a cargar'])
    expect(buttons[0]).toHaveClass('bg-confirmed')
    expect(buttons[1]).not.toHaveClass('bg-confirmed')
  })

  it('an old «Volver a cargar» does not count', () => {
    sessionStorage.setItem(
      'peditrack.errorScreen.reloadedAt',
      String(Date.now() - RECENT_RELOAD_MS - 1_000),
    )
    render(<ErrorScreen frame="shell" pathname="/home" />)
    expect(screen.getByText(/Vuelve a cargar la pantalla para seguir/)).toBeInTheDocument()
  })

  it('works when sessionStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    render(<ErrorScreen frame="shell" pathname="/home" />)
    await userEvent.click(screen.getByRole('button', { name: 'Volver a cargar' }))
    expect(reloadPage).toHaveBeenCalledTimes(1)
  })

  it('F: without a connection it says so, with no grey note', () => {
    setOfflineSession(true)
    render(<ErrorScreen frame="shell" pathname="/home" />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Parece que no hay conexión' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Lo que ya guardaste sigue en tu cuenta. Cuando vuelva la señal, vuelve a cargar la pantalla.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('El aviso del problema se envía solo.')).not.toBeInTheDocument()
  })

  it('F on a child phone keeps «Ir a Hoy»', () => {
    setOfflineSession(true)
    render(<ErrorScreen frame="page" pathname="/hijo/hoy" />)
    expect(screen.getByRole('button', { name: 'Ir a Hoy' })).toBeInTheDocument()
  })
})

describe('ErrorScreen behavior', () => {
  it('the h1 gets the focus', () => {
    render(<ErrorScreen frame="shell" pathname="/home" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
  })

  it('has exactly one solid button', () => {
    render(<ErrorScreen frame="shell" pathname="/home" />)
    expect(
      screen.getAllByRole('button').filter((b) => b.className.includes('bg-confirmed')),
    ).toHaveLength(1)
  })

  it('«Volver a cargar» remembers the hour and reloads', async () => {
    render(<ErrorScreen frame="shell" pathname="/home" />)
    await userEvent.click(screen.getByRole('button', { name: 'Volver a cargar' }))
    expect(reloadPage).toHaveBeenCalledTimes(1)
    expect(Number(sessionStorage.getItem('peditrack.errorScreen.reloadedAt'))).toBeGreaterThan(0)
  })

  it('«Ir al inicio» goes to /home', async () => {
    render(<ErrorScreen frame="shell" pathname="/consultations/c1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Ir al inicio' }))
    expect(goTo).toHaveBeenCalledWith('/home')
  })
})

describe('ErrorScreen designs', () => {
  it('phone: buttons stacked at full width, 28 px title', () => {
    render(<ErrorScreen frame="shell" pathname="/home" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('text-[28px]')
    expect(screen.getByRole('button', { name: 'Volver a cargar' })).toHaveClass(
      'w-full',
      'min-h-[52px]',
    )
    expect(screen.getByRole('button', { name: 'Ir al inicio' })).toHaveClass('w-full', 'min-h-12')
  })

  it('web: 34 px title, 52 px buttons in a row, the solid one at least 200 px', () => {
    stubMatchMedia(true)
    render(<ErrorScreen frame="shell" pathname="/home" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('text-[34px]')
    const solid = screen.getByRole('button', { name: 'Volver a cargar' })
    expect(solid).toHaveClass('min-w-[200px]', 'min-h-[52px]')
    expect(solid).not.toHaveClass('w-full')
  })

  it('web: B has its logo block and D its 72 px band', () => {
    stubMatchMedia(true)
    const { container, unmount } = render(<ErrorScreen frame="page" pathname="/home" />)
    expect(container.querySelector('.pt-20')).toBeInTheDocument()
    unmount()
    auth.isSignedIn = false
    const second = render(<ErrorScreen frame="page" pathname="/login" />)
    expect(second.container.querySelector('.h-\\[72px\\]')).toBeInTheDocument()
  })

  it('C has no web design: on a wide window it keeps the phone one, centered', () => {
    stubMatchMedia(true)
    const { container } = render(<ErrorScreen frame="page" pathname="/hijo/hoy" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('text-[30px]')
    expect(container.querySelector('.max-w-\\[430px\\]')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Volver a cargar' })).toHaveClass('min-h-14')
  })

  it('the icon is the signal only without a connection', () => {
    const { container, unmount } = render(<ErrorScreen frame="shell" pathname="/home" />)
    expect(container.querySelector('circle')).toBeNull()
    unmount()
    setOfflineSession(true)
    const offline = render(<ErrorScreen frame="shell" pathname="/home" />)
    expect(offline.container.querySelector('circle')).not.toBeNull()
  })
})
