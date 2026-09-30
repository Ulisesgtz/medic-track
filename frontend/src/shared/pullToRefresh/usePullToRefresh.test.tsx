import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { PULL_FAILED_MS, PULL_THRESHOLD, usePullToRefresh } from './usePullToRefresh'

function setup(options: { enabled?: boolean; fetcher?: () => Promise<string> } = {}) {
  const fetcher = options.fetcher ?? vi.fn().mockResolvedValue('data')
  function Harness() {
    const state = usePullToRefresh(options.enabled ?? true)
    const query = useQuery({ queryKey: ['x'], queryFn: fetcher, retry: false })
    return (
      <div>
        <p data-testid="phase">{state.phase}</p>
        <p data-testid="ready">{String(state.ready)}</p>
        <p data-testid="distance">{state.distance}</p>
        <p data-testid="data">{query.data ?? 'none'}</p>
        <input aria-label="Doctor" />
        <div data-testid="inner" />
      </div>
    )
  }
  const client = new QueryClient()
  const view = render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  )
  return { fetcher: fetcher as ReturnType<typeof vi.fn>, ...view }
}

const touch = (y: number) => ({ touches: [{ clientY: y }], changedTouches: [{ clientY: y }] })
const phase = () => screen.getByTestId('phase').textContent

function pull(to: number, from = 100, target: Element | Document = document) {
  fireEvent.touchStart(target, touch(from))
  fireEvent.touchMove(target, touch(from + to))
  fireEvent.touchEnd(target, touch(from + to))
}

afterEach(() => {
  Reflect.deleteProperty(document, 'scrollingElement')
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('usePullToRefresh (specs/017)', () => {
  it('fetches the data again when let go past the threshold, without reloading the page', async () => {
    const { fetcher } = setup()
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByLabelText('Doctor'), { target: { value: 'Dra. Cázares' } })

    pull(PULL_THRESHOLD + 10)

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(phase()).toBe('idle'))
    expect(screen.getByLabelText('Doctor')).toHaveValue('Dra. Cázares')
  })

  it('follows the finger at half speed, ready only past the threshold, and shows refreshing while it fetches', async () => {
    let resolve: (value: string) => void = () => {}
    const fetcher = vi.fn().mockResolvedValueOnce('first').mockReturnValueOnce(new Promise<string>((r) => (resolve = r)))
    setup({ fetcher })
    await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('first'))

    fireEvent.touchStart(document, touch(100))
    fireEvent.touchMove(document, touch(150))
    expect(phase()).toBe('pulling')
    expect(screen.getByTestId('distance')).toHaveTextContent('25')
    expect(screen.getByTestId('ready')).toHaveTextContent('false')

    fireEvent.touchMove(document, touch(100 + PULL_THRESHOLD))
    expect(screen.getByTestId('ready')).toHaveTextContent('true')
    fireEvent.touchEnd(document, touch(100 + PULL_THRESHOLD))
    await waitFor(() => expect(phase()).toBe('refreshing'))

    // A second pull while one is running does nothing.
    pull(PULL_THRESHOLD + 10)
    expect(fetcher).toHaveBeenCalledTimes(2)

    await act(async () => resolve('second'))
    await waitFor(() => expect(phase()).toBe('idle'))
    expect(screen.getByTestId('data')).toHaveTextContent('second')
  })

  it('does nothing when let go before the threshold', async () => {
    const { fetcher } = setup()
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    pull(PULL_THRESHOLD - 20)

    expect(phase()).toBe('idle')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('gives up when the finger goes back up or the touch is cancelled', async () => {
    const { fetcher } = setup()
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    fireEvent.touchStart(document, touch(100))
    fireEvent.touchMove(document, touch(200))
    fireEvent.touchMove(document, touch(80))
    expect(phase()).toBe('idle')

    fireEvent.touchStart(document, touch(100))
    fireEvent.touchMove(document, touch(300))
    fireEvent.touchCancel(document, touch(300))
    expect(phase()).toBe('idle')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('is not started with the page scrolled, with a dialog open or inside a scrolled box', async () => {
    const { fetcher } = setup()
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    Object.defineProperty(document, 'scrollingElement', { value: { scrollTop: 80 }, configurable: true })
    pull(PULL_THRESHOLD + 50)
    Reflect.deleteProperty(document, 'scrollingElement')

    const dialog = document.createElement('div')
    dialog.setAttribute('aria-modal', 'true')
    document.body.append(dialog)
    pull(PULL_THRESHOLD + 50)
    dialog.remove()

    const inner = screen.getByTestId('inner')
    Object.defineProperty(inner, 'scrollTop', { value: 30, configurable: true })
    pull(PULL_THRESHOLD + 50, 100, inner)

    fireEvent.touchStart(document, { touches: [{ clientY: 100 }, { clientY: 120 }] })
    fireEvent.touchMove(document, touch(300))
    fireEvent.touchEnd(document, touch(300))

    expect(phase()).toBe('idle')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('stops the gesture when the page starts scrolling in the middle of it', async () => {
    const { fetcher } = setup()
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    fireEvent.touchStart(document, touch(100))
    Object.defineProperty(document, 'scrollingElement', { value: { scrollTop: 40 }, configurable: true })
    fireEvent.touchMove(document, touch(300))
    fireEvent.touchEnd(document, touch(300))

    expect(phase()).toBe('idle')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('keeps the data it had and says so when the refresh fails, and the notice goes away by itself', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce('first').mockRejectedValueOnce(new Error('offline'))
    setup({ fetcher })
    await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('first'))

    vi.useFakeTimers({ shouldAdvanceTime: true })
    pull(PULL_THRESHOLD + 10)
    await vi.waitFor(() => expect(phase()).toBe('failed'))
    expect(screen.getByTestId('data')).toHaveTextContent('first')

    await act(async () => vi.advanceTimersByTime(PULL_FAILED_MS + 10))
    expect(phase()).toBe('idle')
  })

  it('a new pull while the failure notice is up is not hidden by the timer of that notice', async () => {
    let resolve: (value: string) => void = () => {}
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce('first')
      .mockRejectedValueOnce(new Error('offline'))
      .mockReturnValueOnce(new Promise<string>((r) => (resolve = r)))
    setup({ fetcher })
    await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('first'))

    vi.useFakeTimers({ shouldAdvanceTime: true })
    pull(PULL_THRESHOLD + 10)
    await vi.waitFor(() => expect(phase()).toBe('failed'))

    pull(PULL_THRESHOLD + 10)
    await vi.waitFor(() => expect(phase()).toBe('refreshing'))
    await act(async () => vi.advanceTimersByTime(PULL_FAILED_MS + 10))
    expect(phase()).toBe('refreshing')

    await act(async () => resolve('second'))
    await vi.waitFor(() => expect(phase()).toBe('idle'))
  })

  it('does nothing when disabled (the web design)', async () => {
    const { fetcher } = setup({ enabled: false })
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    pull(PULL_THRESHOLD + 50)

    expect(phase()).toBe('idle')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('removes its listeners when the screen goes away', async () => {
    const remove = vi.spyOn(document, 'removeEventListener')
    const { unmount } = setup()

    unmount()

    expect(remove.mock.calls.map(([type]) => type)).toEqual(
      expect.arrayContaining(['touchstart', 'touchmove', 'touchend', 'touchcancel']),
    )
  })
})
