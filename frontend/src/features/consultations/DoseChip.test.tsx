import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DoseChip } from './DoseChip'
import type { Dose, DoseStatus } from './types'

// The chip of the treatment calendar's day list (specs/022): the design's shapes by the server's status.
const at = (h: number) => new Date(2026, 9, 1, h).toISOString()
const dose = (status: DoseStatus, taken = false): Dose => ({ id: `d-${status}`, scheduledAt: at(8), taken, status })

function renderChip(d: Dose, props: Partial<Parameters<typeof DoseChip>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DoseChip consultationId="c1" dose={d} label="Amoxicilina, 08:00" appearance="calendar" {...props} />
    </QueryClientProvider>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('DoseChip, calendar appearance (specs/022)', () => {
  it.each([
    ['taken', true, '✓ 08:00', 'dada', 'border-[#10b981]'],
    ['due', false, '08:00', 'por marcar', 'border-[#f59e0b]'],
    ['unregistered', false, '08:00', 'sin registrar', 'border-dashed'],
    ['canceled', false, '08:00', 'cancelada', 'border-dashed'],
  ] as const)('%s: its time, its own second line and its look', (status, taken, time, note, cls) => {
    renderChip(dose(status, taken))

    const chip = screen.getByRole('button', { name: 'Amoxicilina, 08:00' })
    expect(chip).toHaveTextContent(time)
    expect(chip).toHaveTextContent(note)
    expect(chip.className).toContain(cls)
  })

  it('a dose still to come says "próxima" only when it is the next one, and nothing otherwise', () => {
    const first = renderChip(dose('pending'), { next: true })
    expect(screen.getByRole('button')).toHaveTextContent('próxima')
    first.unmount()

    renderChip(dose('pending'))
    expect(screen.getByRole('button')).not.toHaveTextContent('próxima')
  })

  it('has the fixed width of each design: 130 px on the phone, 160 on the web', () => {
    const phone = renderChip(dose('pending'))
    expect(screen.getByRole('button').className).toContain('w-[130px]')
    phone.unmount()

    renderChip(dose('pending'), { desktop: true })
    expect(screen.getByRole('button').className).toContain('w-40')
  })

  it('"sin registrar" and "cancelada" are also its accessible description; ambar is only "por marcar", never "sin registrar"', () => {
    const unregistered = renderChip(dose('unregistered'))
    expect(screen.getByRole('button')).toHaveAccessibleDescription('Sin registrar')
    expect(screen.getByRole('button').className).not.toContain('f59e0b')
    unregistered.unmount()

    renderChip(dose('canceled'))
    expect(screen.getByRole('button')).toHaveAccessibleDescription('Cancelada')
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('marks and unmarks the dose like the other chip: a toggle with aria-pressed', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'x', taken: true }) })
    vi.stubGlobal('fetch', fetchMock)
    renderChip(dose('due'))

    await userEvent.click(screen.getByRole('button', { name: 'Amoxicilina, 08:00' }))

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/consultations/c1/doses/d-due')
    expect(JSON.parse(String(init.body))).toEqual({ taken: true })
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false')
  })
})
