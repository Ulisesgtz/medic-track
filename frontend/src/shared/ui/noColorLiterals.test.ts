import { describe, it, expect } from 'vitest'

// BACKLOG, "Subir literales a @theme" (feature 028): colors are tokens of `index.css` (`bg-bright-soft`, `text-body`…),
// never a literal in a class (`text-[#67e8f9]`), so a new screen reuses the system instead of inventing another tone.
// An SVG's own `fill="#…"` (the Google logo) is a brand mark, not a class, and is not covered.
const files = import.meta.glob('../../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const LITERAL_COLOR_CLASS = /[a-z0-9:-]+-\[#[0-9a-fA-F]{3,8}\]/g

describe('color tokens', () => {
  it('no class in the app writes a literal color: it is a token of @theme', () => {
    const offenders = Object.entries(files)
      .filter(([path]) => !/\.test\.|test-utils/.test(path))
      .flatMap(([path, source]) => (source.match(LITERAL_COLOR_CLASS) ?? []).map((literal) => `${path}: ${literal}`))

    expect(Object.keys(files).length).toBeGreaterThan(50)
    expect(offenders).toEqual([])
  })

  it('the guard sees a literal color when there is one', () => {
    expect('className="text-[#67e8f9] border-[#fff]"'.match(LITERAL_COLOR_CLASS)).toEqual(['text-[#67e8f9]', 'border-[#fff]'])
    expect('className="text-bright-soft rounded-[14px]"'.match(LITERAL_COLOR_CLASS)).toBeNull()
  })
})
