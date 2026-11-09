import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { account } from '../medicineCabinet/cabinet.test-utils'
import type { GrowthChart, GrowthList, Measurement } from './types'

export { stubApi, stubWeb, bodyOf, callsOf } from '../medicineCabinet/cabinet.test-utils'

// Fixtures for the growth record's tests (specs/063).

export const owner = account({ children: [{ id: 'child-1', firstName: 'Mateo', lastName: 'Morales', birthDate: '2024-06-10', height: 85, weight: 12 }] })

export const caregiverAccount = account({
  plan: 'free',
  children: [{ id: 'child-1', firstName: 'Mateo', lastName: 'Morales', birthDate: '2024-06-10', height: null, weight: null, role: 'caregiver', plan: 'paid', accountId: 'owner' }],
})

export function measurement(over: Partial<Measurement> = {}): Measurement {
  return {
    id: 'g1',
    measuredOn: '2025-11-03',
    weightKg: 10.2,
    heightCm: 76.5,
    note: null,
    createdBy: { name: 'Ana' },
    createdAt: '2025-11-03T18:00:00Z',
    corrected: null,
    ...over,
  }
}

export function list(over: Partial<GrowthList> = {}): GrowthList {
  return {
    measurements: [measurement(), measurement({ id: 'g0', measuredOn: '2025-06-10', weightKg: 8.1, heightCm: 68, note: 'en ayunas' })],
    registered: { weightKg: 12, heightCm: 85 },
    referenceSex: 'male',
    birthDate: '2024-06-10',
    canEdit: true,
    chartAvailable: true,
    ...over,
  }
}

const curve = (base: number, step: number) =>
  Array.from({ length: 25 }, (_, m) => ({ months: m, p3: base + m * step - 2, p15: base + m * step - 1, p50: base + m * step, p85: base + m * step + 1, p97: base + m * step + 2 }))

export function chart(over: Partial<GrowthChart> = {}): GrowthChart {
  return {
    birthDate: '2024-06-10',
    referenceSex: 'male',
    points: {
      weight: [
        { measuredOn: '2025-06-10', months: 11.99, value: 8.1 },
        { measuredOn: '2025-11-03', months: 16.79, value: 10.2 },
      ],
      height: [{ measuredOn: '2025-11-03', months: 16.79, value: 76.5 }],
    },
    reference: {
      available: true,
      source: 'OMS: Patrones de Crecimiento Infantil (2006) y Referencia de Crecimiento 2007',
      weight: { maxMonths: 120, curves: curve(3.3, 0.4) },
      height: { maxMonths: 228, curves: curve(50, 1.5) },
    },
    ...over,
  }
}

export function renderAt(path: string | { pathname: string; state?: unknown }, element: ReactNode, routePath: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={element} />
          <Route path="/children/:childId/crecimiento" element={<div>CRECIMIENTO</div>} />
          <Route path="/children/:childId/crecimiento/nueva" element={<div>NUEVA</div>} />
          <Route path="/children/:childId" element={<div>HIJO</div>} />
          <Route path="/planes" element={<div>PLANES</div>} />
          <Route path="/home" element={<div>HOME</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
