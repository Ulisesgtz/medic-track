import { describe, expect, it } from 'vitest'

// specs/047: the child's phone and the parents' session are two identities that never meet. The phone's code (childDevice/phone) knows
// nothing of Clerk or of the parents' screens; nothing else imports anything of it (but the route table); the parents' side of the
// feature never imports the phone's; and the rest of the app reads from childDevice only the parents' side and the words.

const sources = import.meta.glob('../../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

// Keyed by the path from src: `features/childDevice/phone/api.ts`.
const all = Object.entries(sources)
  // The glob's keys are relative to this file: resolve them against its place in src.
  .map(([path, source]) => ({ where: new URL(path, 'http://app/src/features/childDevice/isolation.test.ts').pathname.replace('/src/', ''), source }))
  .filter(({ where }) => !/\.test\.tsx?$|test-utils/.test(where))

const imports = (source: string) => [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
const inPhone = ({ where }: { where: string }) => where.startsWith('features/childDevice/phone/')
const inParent = ({ where }: { where: string }) => where.startsWith('features/childDevice/parent/')

describe('the child phone and the parents session are kept apart', () => {
  it('finds the sources it checks', () => {
    expect(all.filter(inPhone).length).toBeGreaterThan(5)
    expect(all.filter(inParent).length).toBeGreaterThan(2)
    expect(all.length).toBeGreaterThan(100)
  })

  it('nothing in childDevice/phone imports Clerk, the account, the parents shell or the parents side of the feature', () => {
    const forbidden = /@clerk\/react|useCurrentAccount|\/auth\/|home\/AppShell|childDevice\/parent|\.\.\/parent/
    for (const file of all.filter(inPhone)) {
      for (const spec of imports(file.source)) expect(spec, `${file.where} imports ${spec}`).not.toMatch(forbidden)
    }
  })

  it('nothing outside childDevice/phone imports anything of it, except the route table', () => {
    for (const file of all) {
      if (inPhone(file) || file.where === 'App.tsx') continue
      for (const spec of imports(file.source)) expect(spec, `${file.where} imports ${spec}`).not.toMatch(/childDevice\/phone\//)
    }
  })

  it('the parents side of the feature never imports the phone', () => {
    for (const file of all.filter(inParent)) {
      for (const spec of imports(file.source)) expect(spec, `${file.where} imports ${spec}`).not.toMatch(/phone/)
    }
  })

  it('the only things a screen of the parents reads from childDevice are the parents side and the words', () => {
    for (const file of all) {
      if (file.where.startsWith('features/childDevice/') || file.where === 'App.tsx') continue
      for (const spec of imports(file.source)) {
        if (/childDevice/.test(spec)) expect(spec, `${file.where} imports ${spec}`).toMatch(/childDevice\/(parent\/|childText)/)
      }
    }
  })
})
