import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DoseCheckbox } from './DoseCheckbox'
import type { Dose } from './types'

function renderCheckbox(dose: Dose) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <DoseCheckbox consultationId="c1" dose={dose} />
    </QueryClientProvider>,
  )
}

describe('DoseCheckbox', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('marks a dose as taken (FR-011)', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'd1', scheduledAt: '2026-01-15T08:00:00Z', taken: true }) }),
    )
    renderCheckbox({ id: 'd1', scheduledAt: '2026-01-15T08:00:00Z', taken: false })

    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('/consultations/c1/doses/d1'),
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('renders an already-taken dose as checked, regardless of its date (FR-016)', () => {
    renderCheckbox({ id: 'd1', scheduledAt: '2020-01-01T08:00:00Z', taken: true })

    expect(screen.getByRole('checkbox')).toBeChecked()
  })
})
