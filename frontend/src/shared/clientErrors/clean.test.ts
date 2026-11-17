import { describe, expect, it } from 'vitest'
import { cleanMessage } from './clean'

// The same table the server tests (backend/internal/clienterror): one file of cases, two implementations.
const files = import.meta.glob(
  '../../../../specs/072-monitoreo-errores-frontend/contracts/clean-cases.json',
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
) as Record<string, string>
const table = JSON.parse(Object.values(files)[0]) as {
  cases: { name: string; input: string; want: string }[]
}

describe('cleanMessage', () => {
  it('reads the shared table of cases', () => {
    expect(table.cases.length).toBeGreaterThanOrEqual(20)
  })

  it.each(table.cases.map((c) => [c.name, c.input, c.want]))('%s', (_name, input, want) => {
    expect(cleanMessage(input)).toBe(want)
  })

  it('is idempotent on what it already cleaned', () => {
    const once = cleanMessage("Unexpected token 'Ana López' en https://x.com/a 12345 ana@x.com")
    expect(cleanMessage(once)).toBe(once)
  })
})
