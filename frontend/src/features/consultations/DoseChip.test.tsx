import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DoseChip } from './DoseChip'
import type { Dose, DoseStatus } from './types'

const at = (h: number) => new Date(2026, 9, 1, h).toISOString()
const dose = (status: DoseStatus, taken = false): Dose => ({ id: `d-${status}`, scheduledAt: at(8), taken, status })

function renderChip(d: Dose) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DoseChip consultationId="c1" dose={d} />
    </QueryClientProvider>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('DoseChip (specs/013)', () => {
  it('is named after its time and shows the check once taken', () => {
    renderChip(dose('taken', true))

    const chip = screen.getByRole('button', { name: 'Toma de 08:00' })
    expect(chip).toHaveTextContent('08:00 ✓')
    expect(chip).toHaveAttribute('aria-pressed', 'true')
  })

  it('"sin registrar" and "cancelada" are also its accessible description; amber is only "por marcar", never "sin registrar"', () => {
    const unregistered = renderChip(dose('unregistered'))
    expect(screen.getByRole('button')).toHaveTextContent('sin registrar')
    expect(screen.getByRole('button')).toHaveAccessibleDescription('Sin registrar')
    expect(screen.getByRole('button').className).toContain('border-dashed')
    expect(screen.getByRole('button').className).not.toContain('amber')
    unregistered.unmount()

    renderChip(dose('canceled'))
    expect(screen.getByRole('button')).toHaveTextContent('cancelada')
    expect(screen.getByRole('button')).toHaveAccessibleDescription('Cancelada')
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('marks the dose: a toggle with aria-pressed', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'x', taken: true }) })
    vi.stubGlobal('fetch', fetchMock)
    renderChip(dose('due'))

    await userEvent.click(screen.getByRole('button', { name: 'Toma de 08:00' }))

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/consultations/c1/doses/d-due')
    expect(JSON.parse(String(init.body))).toEqual({ taken: true })
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false')
  })
})
