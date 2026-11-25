import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Los colores del sitio salen de los tokens de @theme (src/theme.css), nunca de un literal en una clase o un atributo (specs/080).
// Un color que el diseño usa y no es un token se agrega a theme.css y a sync.test.ts, no se escribe aquí.

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(tsx|ts)$/.test(name) && !name.includes('.test.') && name !== 'test-utils.tsx' ? [path] : []
  })
}

describe('colores literales', () => {
  const files = sourceFiles(resolve(process.cwd(), 'src'))

  it('hay archivos que revisar', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('ninguna clase ni atributo escribe un color hexadecimal, rgb() o hsl()', () => {
    const offenders = files.flatMap((file) => {
      const text = readFileSync(file, 'utf8')
      return [...text.matchAll(/(#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\()/g)].map((match) => `${file}: ${match[0]}`)
    })
    expect(offenders).toEqual([])
  })
})
