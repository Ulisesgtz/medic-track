import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { RenderErrorBoundary } from './RenderErrorBoundary'
import { ErrorTestPage } from './ErrorTestPage'
import { rememberReload, reloadedRecently } from './reloadMemory'

const report = vi.hoisted(() => vi.fn())
vi.mock('../clientErrors', () => ({ reportClientError: report }))
vi.mock('@clerk/react', () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true }) }))
vi.mock('./navigate', () => ({ reloadPage: vi.fn(), goTo: vi.fn() }))

function Broken(): never {
  throw new Error('boom while drawing')
}

beforeEach(() => {
  sessionStorage.clear()
  report.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => vi.restoreAllMocks())

describe('RenderErrorBoundary', () => {
  it('shows what works while nothing breaks', () => {
    render(
      <MemoryRouter>
        <RenderErrorBoundary frame="shell">
          <p>todo bien</p>
        </RenderErrorBoundary>
      </MemoryRouter>,
    )
    expect(screen.getByText('todo bien')).toBeInTheDocument()
    expect(report).not.toHaveBeenCalled()
  })

  it('shows the error screen and reports the render error', () => {
    render(
      <MemoryRouter initialEntries={['/consultations/c1']}>
        <RenderErrorBoundary frame="shell">
          <Broken />
        </RenderErrorBoundary>
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Algo no cargó bien' }),
    ).toBeInTheDocument()
    expect(report).toHaveBeenCalledWith(
      'render',
      expect.objectContaining({ message: 'boom while drawing' }),
    )
  })

  it('forgets «Volver a cargar» once the frames draw', () => {
    rememberReload()
    render(
      <MemoryRouter>
        <RenderErrorBoundary frame="shell">
          <p>todo bien</p>
        </RenderErrorBoundary>
      </MemoryRouter>,
    )
    expect(reloadedRecently()).toBe(false)
  })

  it('the first screen that breaks again after a reload says «sigue sin cargar»; a later one does not', async () => {
    rememberReload()
    render(
      <MemoryRouter initialEntries={['/roto']}>
        <Link to="/roto2">ir</Link>
        <RenderErrorBoundary frame="page">
          <RenderErrorBoundary frame="shell">
            <Routes>
              <Route path="/roto" element={<Broken />} />
              <Route path="/roto2" element={<Broken />} />
            </Routes>
          </RenderErrorBoundary>
        </RenderErrorBoundary>
      </MemoryRouter>,
    )
    expect(
      screen.getByText('Sigue sin cargar. Intenta más tarde o regresa al inicio.'),
    ).toBeInTheDocument()
    // the frames mounted, so the stamp is gone
    expect(reloadedRecently()).toBe(false)

    await userEvent.click(screen.getByText('ir'))
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(
      screen.queryByText('Sigue sin cargar. Intenta más tarde o regresa al inicio.'),
    ).not.toBeInTheDocument()
  })

  it('starts again when the address changes', async () => {
    render(
      <MemoryRouter initialEntries={['/roto']}>
        <Link to="/bien">ir</Link>
        <RenderErrorBoundary frame="page">
          <Routes>
            <Route path="/roto" element={<Broken />} />
            <Route path="/bien" element={<p>pantalla buena</p>} />
          </Routes>
        </RenderErrorBoundary>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    await userEvent.click(screen.getByText('ir'))
    expect(screen.getByText('pantalla buena')).toBeInTheDocument()
  })

  it('works outside a router using the window address', () => {
    render(
      <RenderErrorBoundary frame="shell">
        <Broken />
      </RenderErrorBoundary>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })
})

describe('ErrorTestPage', () => {
  it('breaks while it draws by default', () => {
    render(
      <MemoryRouter initialEntries={['/__prueba-error']}>
        <RenderErrorBoundary frame="shell">
          <ErrorTestPage />
        </RenderErrorBoundary>
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Algo no cargó bien' }),
    ).toBeInTheDocument()
  })

  it('with ?tipo=asincrono it draws and then throws an error and rejects a promise from its own code', () => {
    const callbacks: (() => void)[] = []
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((cb: () => void) => {
      callbacks.push(cb)
      return 0
    }) as unknown as typeof setTimeout)
    const reject = vi.spyOn(Promise, 'reject').mockReturnValue(Promise.resolve() as never)
    render(
      <MemoryRouter initialEntries={['/__prueba-error?tipo=asincrono']}>
        <ErrorTestPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('Prueba de errores en segundo plano.')).toBeInTheDocument()
    expect(reject).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Prueba de promesa rechazada' }),
    )
    expect(callbacks).toHaveLength(1)
    expect(callbacks[0]).toThrow('Prueba de error asincrono')
  })

  it('adds ?marca=word (letters only) to the messages so each test makes its own report', () => {
    const reject = vi.spyOn(Promise, 'reject').mockReturnValue(Promise.resolve() as never)
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((() => 0) as unknown as typeof setTimeout)
    render(
      <MemoryRouter initialEntries={['/__prueba-error?tipo=asincrono&marca=a1-movil']}>
        <ErrorTestPage />
      </MemoryRouter>,
    )
    expect(reject).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Prueba de promesa rechazada amovil' }),
    )
  })
})
