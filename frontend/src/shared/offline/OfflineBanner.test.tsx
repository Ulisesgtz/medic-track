import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { OfflineBanner } from './OfflineBanner'
import { oldestShownAnswer } from './queryView'
import { reportNetworkFailure, reportReachable, resetConnectivity } from './connectivity'

const at = (h: number, m: number, day = 11) => new Date(2026, 10, day, h, m).getTime()

function Screen({ queryKey }: { queryKey: unknown[] }) {
  useQuery({ queryKey, queryFn: () => new Promise(() => {}), enabled: false })
  return null
}

function setup(entries: { key: unknown[]; at: number }[]) {
  const client = new QueryClient()
  for (const e of entries) client.setQueryData(e.key, { ok: true }, { updatedAt: e.at })
  render(
    <QueryClientProvider client={client}>
      {entries.map((e) => (
        <Screen key={JSON.stringify(e.key)} queryKey={e.key} />
      ))}
      <OfflineBanner />
    </QueryClientProvider>,
  )
  return client
}

beforeEach(() => {
  resetConnectivity()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 11, 12, 0))
})
afterEach(() => {
  vi.useRealTimers()
  resetConnectivity()
})

describe('OfflineBanner', () => {
  it('says nothing with a connection', () => {
    setup([{ key: ['consultation', 'k1'], at: at(8, 15) }])
    expect(screen.queryByText(/Sin conexión/)).toBeNull()
  })

  it('says the hour of the oldest data shown, without a connection', () => {
    setup([
      { key: ['consultation', 'k1'], at: at(9, 30) },
      { key: ['accounts', 'me'], at: at(8, 15) },
    ])
    act(() => reportNetworkFailure())
    expect(document.querySelector('[data-offline-banner]')).toHaveTextContent('Sin conexión · datos de las 08:15')
  })

  it('says the day when the data aren’t from today', () => {
    setup([{ key: ['overview', 'c1', 'x'], at: at(21, 40, 10) }])
    act(() => reportNetworkFailure())
    expect(screen.getByText('Sin conexión · datos del 10 nov, 21:40')).toBeInTheDocument()
  })

  it('leaves when the connection is back', () => {
    setup([{ key: ['consultation', 'k1'], at: at(8, 15) }])
    act(() => reportNetworkFailure())
    expect(screen.getByText(/Sin conexión/)).toBeInTheDocument()
    act(() => reportReachable())
    expect(screen.queryByText(/Sin conexión/)).toBeNull()
  })

  it('says nothing without data on the screen', () => {
    setup([])
    act(() => reportNetworkFailure())
    expect(screen.queryByText(/Sin conexión/)).toBeNull()
  })

  it('ignores answers that are never kept and queries not on screen', () => {
    const client = new QueryClient()
    client.setQueryData(['history', 'c1'], [], { updatedAt: at(6, 0) })
    client.setQueryData(['consultation', 'unused'], {}, { updatedAt: at(5, 0) })
    expect(oldestShownAnswer(client)).toBeNull()
  })
})
