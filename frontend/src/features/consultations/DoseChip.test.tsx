import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DoseChip } from './DoseChip'
import type { Dose, DoseStatus } from './types'

const at = (h: number) => new Date(2026, 9, 1, h).toISOString()
const dose = (status: DoseStatus, taken = false): Dose => ({ id: `d-${status}`, scheduledAt: at(8), taken, status })

function renderChip(d: Dose, canManage?: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DoseChip consultationId="c1" dose={d} canManage={canManage} />
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

// specs/032: who marked a dose, as a line under the time ("por Ana, 08:05"), recorded and never judged.
describe('DoseChip, who marked it (specs/032)', () => {
  const taken = (takenBy?: Dose['takenBy']): Dose => ({ id: 'd-taken', scheduledAt: at(8), taken: true, status: 'taken', takenBy })

  it('says who marked it and when, under the time, and keeps its fixed name', () => {
    renderChip(taken({ name: 'Ana', at: at(8) }))

    const chip = screen.getByRole('button', { name: 'Toma de 08:00' })
    expect(chip).toHaveTextContent('08:00 ✓')
    expect(chip).toHaveTextContent('por Ana, 08:00')
    expect(chip).toHaveAccessibleDescription('Marcada por Ana, 08:00')
  })

  it('says nothing about who when the dose has no author (marked before the family could share)', () => {
    renderChip(taken(null))

    const chip = screen.getByRole('button', { name: 'Toma de 08:00' })
    expect(chip).not.toHaveTextContent('por ')
    expect(chip).not.toHaveAccessibleDescription()
  })

  it('says nothing about who on a dose that is not marked, even if an author were sent', () => {
    renderChip({ id: 'd-due', scheduledAt: at(8), taken: false, status: 'due', takenBy: { name: 'Ana', at: at(8) } })

    expect(screen.getByRole('button')).not.toHaveTextContent('por Ana')
  })
})

// specs/032: a mark somebody else made is only taken back by who can do everything; one's own always.
describe('DoseChip, taking a mark back (specs/032)', () => {
  const marked = (mine?: boolean): Dose => ({
    ...dose('taken', true),
    takenBy: { name: 'Ana', at: at(8), ...(mine === undefined ? {} : { mine }) },
  })

  it('locks a mark from somebody else for a Caregiver, with the reason', () => {
    renderChip(marked(false), false)
    const chip = screen.getByRole('button', { name: 'Toma de 08:00' })
    expect(chip).toBeDisabled()
    expect(chip).toHaveAttribute('title', 'Solo quien la marcó o un Tutor puede quitar esta marca')
  })

  it('locks a mark from before the family could share (no author) for a Caregiver', () => {
    renderChip(dose('taken', true), false)
    expect(screen.getByRole('button', { name: 'Toma de 08:00' })).toBeDisabled()
  })

  it('lets the author take their own mark back', () => {
    renderChip(marked(true), false)
    expect(screen.getByRole('button', { name: 'Toma de 08:00' })).toBeEnabled()
  })

  it('lets who can do everything take any mark back, and everybody mark an unmarked dose', () => {
    const tutor = renderChip(marked(false), true)
    expect(screen.getByRole('button', { name: 'Toma de 08:00' })).toBeEnabled()
    tutor.unmount()
    renderChip(dose('due'), false)
    expect(screen.getByRole('button', { name: 'Toma de 08:00' })).toBeEnabled()
  })
})
