import { describe, expect, it } from 'vitest'
import { PARENT, PHONE } from './childText'

function every(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (typeof value === 'function') {
    const call = value as (...args: unknown[]) => unknown
    return every(call('Mateo', 3))
  }
  if (value && typeof value === 'object') return Object.values(value).flatMap(every)
  return []
}

// Principio I: no advice, no alarms and nothing about what is late or missing.
const FORBIDDEN = /\bdebes\b|\btoca\b|atras|completa|alerta|urgente|recomend|pendiente|falta|sem[aá]foro|\brojo\b/i

describe('the words of the child access (Principio I)', () => {
  const sentences = [...every(PARENT), ...every(PHONE)]

  it('has sentences to check', () => {
    expect(sentences.length).toBeGreaterThan(20)
  })

  it('never advises, evaluates, alarms or says what is late or missing', () => {
    for (const text of sentences) expect(text.normalize('NFD').replace(/\p{M}/gu, ''), text).not.toMatch(FORBIDDEN)
  })

  it('tells the parent that giving a child a phone is their decision, and that the access can be removed', () => {
    const text = PARENT.responsibility('Mateo')
    expect(text).toMatch(/decisión tuya/)
    expect(text).toMatch(/Mateo/)
    expect(text).toMatch(/quitar/)
  })

  it('has a way out in every failure the child can meet', () => {
    expect(PHONE.redeemFailed).toMatch(/papá o mamá/)
    expect(PHONE.noAccess).toMatch(/papá o mamá/)
    expect(PHONE.retry).toBeTruthy()
  })
})
