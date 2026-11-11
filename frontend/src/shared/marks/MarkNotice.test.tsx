import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MarkNotice, SavingHint } from './MarkNotice'
import { markNoticesSnapshot, pushMarkNotice, resetMarkNotices } from './markNotices'
import { clearPendingMark, resetPendingMarks, setDesired } from './pendingMarks'
import { SLOW_MS, usePendingMark, useShown, useShownQuery } from './usePendingMarks'

const isDesktop = vi.hoisted(() => ({ value: false }))
vi.mock('../ui/useIsDesktop', () => ({ useIsDesktop: () => isDesktop.value }))

function Go() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate('/otra')}>
      ir
    </button>
  )
}

const renderNotice = () =>
  render(
    <MemoryRouter>
      <MarkNotice />
      <Go />
    </MemoryRouter>,
  )

beforeEach(() => {
  resetMarkNotices()
  resetPendingMarks()
  isDesktop.value = false
})
afterEach(() => vi.useRealTimers())

describe('MarkNotice', () => {
  it.each([false, true])('is a polite region, empty until a mark fails, and «Cerrar» empties it (desktop: %s)', async (desktop) => {
    isDesktop.value = desktop
    const { container } = renderNotice()
    const region = container.querySelector<HTMLElement>('[aria-live="polite"]')!
    expect(region).toBeEmptyDOMElement()

    act(() => pushMarkNotice({ doseId: 'd1', kind: 'not_saved', name: 'Amoxicilina', time: '08:00' }))
    expect(region).toHaveTextContent('No se guardó la marca de Amoxicilina de las 08:00. Revisa tu conexión e inténtalo de nuevo.')
    expect(region.className).toContain(desktop ? 'right-6' : 'inset-x-3')
    expect(document.activeElement).toBe(document.body)

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(region).toBeEmptyDOMElement()
  })

  it('shows the last three and how many more', () => {
    renderNotice()
    act(() => {
      for (const n of [1, 2, 3, 4, 5]) pushMarkNotice({ doseId: `d${n}`, kind: 'not_saved', name: `M${n}`, time: '08:00' })
    })
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    expect(screen.queryByText(/M1 de las/)).not.toBeInTheDocument()
    expect(screen.getByText('y 2 más')).toBeInTheDocument()
  })

  it('leaves on another screen', async () => {
    renderNotice()
    act(() => pushMarkNotice({ doseId: 'd1', kind: 'gone', name: 'A', time: '08:00' }))
    await userEvent.click(screen.getByRole('button', { name: 'ir' }))
    expect(markNoticesSnapshot()).toHaveLength(0)
  })
})

describe('the hooks of a travelling mark', () => {
  it('«guardando…» appears after two seconds and leaves with the answer', () => {
    vi.useFakeTimers()
    render(<SavingHint doseId="d1" />)
    expect(screen.queryByText('guardando…')).not.toBeInTheDocument()

    act(() => setDesired('d1', true, 1))
    act(() => vi.advanceTimersByTime(SLOW_MS - 1))
    expect(screen.queryByText('guardando…')).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByText('guardando…')).toBeInTheDocument()

    act(() => clearPendingMark('d1'))
    expect(screen.queryByText('guardando…')).not.toBeInTheDocument()
  })

  it('usePendingMark says whether the dose waits; with no dose, nothing', () => {
    const { result, rerender } = renderHook(({ id }: { id?: string }) => usePendingMark(id), { initialProps: { id: undefined as string | undefined } })
    expect(result.current).toEqual({ pending: false, slow: false })
    act(() => setDesired('d1', true, 1))
    rerender({ id: 'd1' })
    expect(result.current).toEqual({ pending: true, slow: false })
  })

  it('useShown and useShownQuery apply the marks to the data and keep the object when there are none', () => {
    const data = { doses: [{ id: 'd1', scheduledAt: 's', taken: false }] }
    const query = { data, isPending: false }
    const shown = renderHook(() => useShown(data))
    const shownQuery = renderHook(() => useShownQuery(query))
    expect(shown.result.current).toBe(data)
    expect(shownQuery.result.current).toBe(query)

    act(() => setDesired('d1', true, 1))
    expect(shown.result.current.doses[0].taken).toBe(true)
    expect(shownQuery.result.current.data.doses[0].taken).toBe(true)
    expect(shownQuery.result.current.isPending).toBe(false)
  })
})
